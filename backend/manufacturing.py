"""Parametric printable parts, in mm. All cut/union operations use Manifold.

The UI sends the exact displayed fuselage loft and shared panel descriptors.
Physical fit and flight strength still require calibration/loads testing.
"""
import io
import itertools
import json
import math
import struct
import zipfile
from dataclasses import dataclass

import manifold3d as md
import numpy as np


class ManufacturingError(ValueError):
    pass


def number(options, key, default, lo, hi):
    v = float(options.get(key, default))
    if not math.isfinite(v) or not lo <= v <= hi:
        raise ManufacturingError(f'{key}: {lo}–{hi} aralığında bir değer girin.')
    return v


@dataclass
class Part:
    name: str
    solid: object
    axis: int = 0
    frame: object = None
    family: str = 'body'
    assembled: object = None
    print_to_world: object = None


def box(lo, hi):
    lo, hi = np.array(lo), np.array(hi)
    return md.Manifold.cube((hi - lo).tolist()).translate(lo.tolist())


def cylinder(radius, length, origin=(0, 0, 0), axis=(0, 0, 1), sides=48):
    z = np.array(axis, dtype=float); z /= np.linalg.norm(z)
    x = np.cross([0, 1, 0] if abs(z[1]) < .9 else [1, 0, 0], z); x /= np.linalg.norm(x)
    y = np.cross(z, x)
    mat = np.column_stack([x, y, z, origin])
    return md.Manifold.cylinder(length, radius, circular_segments=sides).transform(mat.tolist())


def mesh_solid(rings, planar):
    rings = np.asarray(rings, dtype=float)
    n, k, _ = rings.shape
    faces = []
    for i in range(n - 1):
        for j in range(k):
            a, b, c, d = i*k+j, i*k+(j+1)%k, (i+1)*k+j, (i+1)*k+(j+1)%k
            faces += [[a,c,b],[b,c,d]]
    cap = md.triangulate([np.asarray(planar, dtype=float)])
    for tri in cap:
        faces.append(tri.tolist())
        faces.append((tri[::-1] + (n-1)*k).tolist())
    vertices = rings.reshape(-1, 3)
    faces = np.asarray(faces, dtype=np.uint32)
    tri = vertices[faces]
    vol = np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])).sum()/6
    if vol < 0: faces = faces[:, ::-1].copy()
    out = md.Manifold(md.Mesh(np.asarray(vertices,dtype=np.float32), faces))
    if out.status() != md.Error.NoError or out.is_empty():
        raise ManufacturingError('Gövde kesitleri kapalı, geçerli bir hacim oluşturmuyor. Kesit konumlarını kontrol edin.')
    return out


def printable_precision(solid,name):
    """Weld sub-micron CSG slivers that collapse in float32 STL coordinates."""
    mesh=solid.to_mesh();v=np.asarray(mesh.vert_properties)[:,:3];f=np.asarray(mesh.tri_verts)
    t=v[f];area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)
    if np.min(area)>=1e-10:return solid
    # One micron is well below the declared 0.02 mm mesh tolerance.
    vertices,inverse=np.unique(np.round(v.astype(float),3),axis=0,return_inverse=True)
    faces=inverse[f];t=vertices[faces]
    area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)
    collapsed=faces[area<1e-10];faces=faces[area>=1e-10].tolist()
    for tri in collapsed:
        if len(set(tri))<3:continue
        # A zero-width triangle may leave a T-junction on a neighboring edge.
        # Split that neighboring face at the existing middle vertex.
        a,b=max(((int(tri[i]),int(tri[(i+1)%3])) for i in range(3)),
                key=lambda pair:np.linalg.norm(vertices[pair[0]]-vertices[pair[1]]))
        middle=next(int(v) for v in tri if v not in [a,b])
        matches=[i for i,face in enumerate(faces) if a in face and b in face]
        if len(matches)!=1:raise ManufacturingError(f'{name}: çöken yüzeyin komşuluğu doğrulanamadı.')
        index=matches[0];face=faces[index]
        k=next(k for k in range(3) if {face[k],face[(k+1)%3]}=={a,b})
        first,last,third=face[k],face[(k+1)%3],face[(k+2)%3]
        faces[index]=[first,middle,third];faces.append([middle,last,third])
    fixed=md.Manifold(md.Mesh(vertices.astype(np.float32),np.array(faces,dtype=np.uint32)))
    if fixed.status()!=md.Error.NoError or abs(fixed.volume()-solid.volume())>max(.1,solid.surface_area()*.001):
        raise ManufacturingError(f'{name}: STL hassasiyeti onarımı doğrulanamadı.')
    check(fixed,name)
    return fixed


def check(solid, name, connected=True):
    if solid.status() != md.Error.NoError or solid.is_empty() or solid.volume() <= .001:
        raise ManufacturingError(f'{name}: geçerli baskı hacmi oluşturulamadı.')
    mesh=solid.to_mesh();v=np.asarray(mesh.vert_properties)[:,:3];f=np.asarray(mesh.tri_verts)
    p=v[f];area=np.linalg.norm(np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]),axis=1)
    if not np.isfinite(v).all() or np.min(area) < 1e-10:
        raise ManufacturingError(f'{name}: bozuk veya sıfır alanlı yüzey bulundu.')
    edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]])
    _,count=np.unique(np.sort(edges,axis=1),axis=0,return_counts=True)
    if not np.all(count==2): raise ManufacturingError(f'{name}: açık kenar bulundu.')
    # Decompose also returns negatively oriented enclosed cavities. They are
    # not detached material islands; only positive-volume components count.
    if connected and sum(p.volume() > .001 for p in solid.decompose()) != 1:
        raise ManufacturingError(f'{name}: birbirinden kopuk parçalar var; bu ölçülerde montaj üretilemedi.')
    return v,f


def profile(coords, chord):
    if len(coords)<8 or len(coords)>600: raise ManufacturingError('Profil koordinatları eksik.')
    half=len(coords)//2
    upper=sorted([(float(p['x']),float(p['y_upper'])) for p in coords[:half]])
    lower=sorted([(float(p['x']),float(p['y_lower'])) for p in coords[half:]])
    xs=(1-np.cos(np.linspace(0,math.pi,49)))/2
    yu=np.interp(xs,*np.array(upper).T);yl=np.interp(xs,*np.array(lower).T)
    # Finite trailing-edge thickness removes duplicate vertices and knife edges.
    yt=(yu[-1]+yl[-1])/2;te=max(.25/chord,(yu[-1]-yl[-1])/2)
    yu[-1]=yt+te;yl[-1]=yt-te
    pts=np.column_stack([np.r_[xs[::-1],xs[1:]],np.r_[yu[::-1],yl[1:]]])*chord
    return md.CrossSection([pts.tolist()])


def panel_frame(spec):
    root=np.array(spec['root'],dtype=float)*1000;tip=np.array(spec['tip'],dtype=float)*1000
    up=np.array(spec['up'],dtype=float);up/=np.linalg.norm(up)
    vec=tip-root;length=np.linalg.norm(vec);axis=vec/length
    mat=np.column_stack([[1,0,0],up,axis,root])
    if abs(np.linalg.det(mat[:,:3])) < .1: raise ManufacturingError('Yüzey eksenleri geçersiz.')
    return mat,length


def local_transform(solid,mat):
    return solid.transform(mat.tolist())


def nut_cut(x,y,z,flat,height):
    # Hexagonal pocket in local XY; bolt axis is Y (turn extrusion Z -> Y).
    r=flat/math.sqrt(3)
    poly=[[r*math.cos(t),r*math.sin(t)] for t in np.arange(6)*math.pi/3]
    return md.CrossSection([poly]).extrude(height).rotate([90,0,0]).translate([x,y,z])


def make_fuselage(data, wall, clearance, screw, nutflat, nuth):
    rings=np.asarray(data['fuselage'],dtype=float)
    if rings.ndim!=3 or not 3<=len(rings)<=300 or not 16<=rings.shape[1]<=128 or rings.shape[2]!=3 or not np.isfinite(rings).all():
        raise ManufacturingError('Gövde kesitleri geçersiz.')
    if np.max(np.abs(rings))>6000 or np.any(np.diff(rings[:,0,0])<=0): raise ManufacturingError('Gövde boyu veya kesit sırası geçersiz.')
    outer=mesh_solid(rings, rings[0][:,[1,2]])
    inner=rings.copy()
    # Polygon-normal inset, with a capped offset at narrow nose/tail stations.
    for i,ring in enumerate(rings):
        yz=ring[:,1:];c=yz.mean(axis=0);radius=np.linalg.norm(yz-c,axis=1).min()
        dist=min(wall,radius*.4)
        tangent=np.roll(yz,-1,axis=0)-np.roll(yz,1,axis=0)
        normal=np.column_stack([-tangent[:,1],tangent[:,0]])
        normal/=np.linalg.norm(normal,axis=1)[:,None]
        # Determine the outward normal from the centroid.
        if np.mean(np.sum(normal*(yz-c),axis=1))<0: normal=-normal
        inner[i,:,1:]=yz-normal*dist
    length=rings[-1,0,0]-rings[0,0,0]
    inner[:,:,0]=rings[0,0,0]+wall+(rings[:,:,0]-rings[0,0,0])*(length-2*wall)/length
    cavity=mesh_solid(inner,inner[0][:,[1,2]])
    shell=outer-cavity
    xmin=rings[0,0,0];x0=xmin+.13*length;x1=xmin+.43*length
    selected=rings[(rings[:,0,0]>=x0)&(rings[:,0,0]<=x1)]
    width=float(np.min(np.max(selected[:,:,2],axis=1)-np.min(selected[:,:,2],axis=1)))
    if width<35 or length<200: raise ManufacturingError('Kapak ve vida yuvaları için gövde çok küçük (en az 35 mm en / 200 mm boy).')
    hz=width*.26
    # Seat plane stays under the upper skin along every edge of the rectangular hatch.
    tops=[]
    for ring in selected:
        top=ring[ring[:,1]>ring[:,1].mean()]
        for z in [-hz,hz]:
            order=np.argsort(top[:,2]);tops.append(float(np.interp(z,top[order,2],top[order,1])))
    seat=min(tops)-max(3,wall*2)
    cutter=box([x0-clearance,seat,-hz-clearance],[x1+clearance,10000,hz+clearance])
    lid_region=box([x0+clearance,seat+clearance,-hz+clearance],[x1-clearance,10000,hz-clearance])
    body=shell-cutter;lid=shell^lid_region
    # Lugs below the opening, with corresponding thickened lid bosses above.
    holes=[];boss= max(6,nutflat/2+2)
    for x in [x0+boss+2,x1-boss-2]:
        for z in [-hz+boss+2,hz-boss-2]:
            lug=cylinder(boss,10,[x,seat-10,z],[0,1,0])
            arm=box([x-boss,seat-9,-width if z<0 else z-boss],[x+boss,seat-3,z+boss if z<0 else width])
            body=body+((lug+arm)^outer)
            lid=lid+(cylinder(boss,100,[x,seat+clearance,z],[0,1,0])^outer^lid_region)
            bore=cylinder((screw+clearance)/2,200,[x,seat-100,z],[0,1,0])
            body=body-bore-nut_cut(x,seat-7,z,nutflat+clearance,nuth+clearance)
            lid=lid-bore
            holes.append([x,seat,z])
    check(body,'body');check(lid,'hatch')
    return body,lid,outer,rings,holes,cutter,inner


def generate(data):
    options=data.get('options',{});g=data['geometry']
    wall=number(options,'wall',1.2,.8,4)
    gap=number(options,'clearance',.3,.1,.8)
    screw=number(options,'screw',3,2,5)
    nf=number(options,'nutFlat',5.5,4,10);nh=number(options,'nutHeight',2.4,1.5,5)
    bed=[number(options,k,v,80,1000) for k,v in [('bedX',220),('bedY',220),('bedZ',250)]]
    main=number(options,'sparMain',6.2,2,16);rear=number(options,'sparRear',4.2,2,12)
    rib=number(options,'ribSpacing',60,20,150);rt=number(options,'ribThickness',1.6,1,4)
    body,lid,outer,rings,hatch_holes,hatch_opening,cavity_rings=make_fuselage(data,wall,gap,screw,nf,nh)
    specs=data['panels']
    if not 3<=len(specs)<=10: raise ManufacturingError('Kanat / kuyruk yüzeyleri eksik.')
    assemblies={};frames={};notes=[];interfaces=[];spar_channels=[];cuts={'body':[hatch_opening]};body_obstacles=[]
    booms=[]
    if g.get('tail_booms'):
        from backend.twin_boom import prepare_booms
        booms=prepare_booms(g,assemblies,frames,cuts,wall,gap,screw,nf,nh)
    # Vertical fins first: T-tail horizontal sockets are fused to their parent fin.
    specs=sorted(specs,key=lambda p: ('horizontal' in p['name'],p['kind']!='wing'))
    for spec in specs:
        name=spec['name']
        if not name.replace('_','').isalnum() or len(name)>50: raise ManufacturingError('Parça adı geçersiz.')
        chord=float(spec['chord'])*1000;tip=float(spec['tipChord'])*1000
        if not 20<=tip<=chord<=1500: raise ManufacturingError(f'{name}: veter ölçüleri geçersiz.')
        mat,length=panel_frame(spec);section=profile(spec['coords'],chord)
        panel=section.extrude(length,scale_top=[tip/chord]*2)
        parent=spec.get('parent','body')
        fin_parent=parent.startswith('tail_vertical')
        # Wing panels start at the actual body side instead of overlapping at z=0.
        trim=0
        if spec['kind']=='wing':
            x=mat[0,3]+chord*.4
            ring=rings[np.argmin(np.abs(rings[:,0,0]-x))]
            trim=float(np.max(np.abs(ring[:,2])))+1
        elif (parent=='body' or fin_parent or parent=='tail_bridge') and abs(mat[2,2])>.5:
            # A short central tail saddle prevents the two insertion tabs colliding.
            trim=20
        elif parent.startswith('boom_'):trim=float(g['tail_booms']['diameter'])*500+3
        if trim:
            panel=panel.trim_by_plane([0,0,1],trim)
        mating_envelope=section.offset(gap/2,circular_segments=24).extrude(length,scale_top=[tip/chord]*2)
        if trim: mating_envelope=mating_envelope.trim_by_plane([0,0,1],trim-gap/2)
        # Hollow surfaces with bonded ribs; finite tip plate closes the end.
        inset=section.offset(-wall/(tip/chord),circular_segments=24)
        if inset.area()>.01:
            cavity=inset.extrude(length,scale_top=[tip/chord]*2)^box([-10000,-10000,trim+wall],[10000,10000,length-wall])
            shell=panel-cavity
            for z in np.arange(trim+8,length-wall,rib):
                shell=shell+(panel^box([-10000,-10000,z], [10000,10000,min(z+rt,length)]))
            panel=shell
        # Root beam carries a rectangular male key; socket/nut holder belong to the parent.
        cx=chord*float(spec.get('mountChordFraction',.25 if fin_parent and g.get('tail_booms') else .85 if fin_parent else .4))
        keyw=min(chord*(.13 if fin_parent else .22),20 if fin_parent else 32)
        keyh=max(6,screw+3)
        depth=14 if spec['kind']=='wing' else 10
        root=trim
        key=box([cx-keyw/2,-keyh/2,root-depth],[cx+keyw/2,keyh/2,root+8])
        beam=box([cx-keyw/2,-keyh/2,root],[cx+keyw/2,keyh/2,root+9])
        panel=panel+key+beam
        sleeve=box([cx-keyw/2-3,-keyh/2-3,root-depth-3],[cx+keyw/2+3,keyh/2+3,root])
        female=box([cx-keyw/2-gap/2,-keyh/2-gap/2,root-depth-gap],[cx+keyw/2+gap/2,keyh/2+gap/2,root+gap])
        # Flared mouth guides insertion without loosening the deeper seating faces.
        lead=1.5
        mouth=md.CrossSection.square([keyw+gap,keyh+gap],center=True).extrude(
            lead,scale_top=[(keyw+gap+1.2)/(keyw+gap),(keyh+gap+1.2)/(keyh+gap)]
        ).translate([cx,0,root-lead])
        female=female+mouth
        screw_z=root-depth*.55
        drill=cylinder((screw+gap)/2,500,[cx,-250,screw_z],[0,1,0])
        nut=nut_cut(cx,-keyh/2-1,screw_z,nf+gap,nh+gap)
        panel=panel-drill
        world_sleeve=local_transform(sleeve,mat);world_female=local_transform(female,mat)
        world_drill=local_transform(drill,mat);world_nut=local_transform(nut,mat)
        cuts.setdefault(name,[]).append(world_drill)
        # The fixed center saddle completes the tail outline between removable roots.
        # Leave the same half-clearance at its edge as at the mating-envelope cut.
        saddle=md.Manifold()
        if spec['kind']=='tail' and trim and (parent=='body' or parent in assemblies):
            saddle_length=trim-gap/2
            saddle_scale=1+(tip/chord-1)*saddle_length/length
            saddle=local_transform(section.extrude(saddle_length,scale_top=[saddle_scale]*2),mat)
        cuts.setdefault(parent,[]).extend([world_female,world_drill,world_nut,local_transform(mating_envelope,mat)])
        world_panel=local_transform(panel,mat)
        if parent=='body':
            # Local support beam connects the socket housing to the fuselage skin.
            support=sleeve
            if trim and spec['kind']=='tail':
                support=box([cx-keyw/2-3,-keyh/2-3,0],[cx+keyw/2+3,keyh/2+3,root])
            center_x=float(mat[0,3]+cx)
            bridge=outer^box([center_x-2,-10000,-10000],[center_x+2,10000,10000])
            nearest=rings[np.argmin(abs(rings[:,0,0]-center_x))]
            yc=float(nearest[:,1].mean());half_h=float(np.ptp(nearest[:,1]))*.32;half_w=float(np.ptp(nearest[:,2]))*.32
            if spec['kind']=='wing':
                bridge=bridge-box([center_x-3,yc-half_h,-half_w],[center_x+3,yc+half_h,half_w])
            body=(body+bridge+local_transform(support,mat)+world_sleeve+saddle)-world_female-world_drill-world_nut
            body_obstacles.append(bridge+local_transform(support,mat)+world_sleeve+saddle)
        elif parent in assemblies:
            support=box([cx-keyw/2-3,-keyh/2-3,0],[cx+keyw/2+3,keyh/2+3,root]) if trim else sleeve
            assemblies[parent]=(assemblies[parent]+local_transform(support,mat)+world_sleeve+saddle)-world_female-world_drill-world_nut
        elif parent=='boom' or parent=='fin':
            # Dedicated carrier rails for twin-boom arrangements.
            carrier=world_sleeve
            b=g.get('tail_booms',{});by=float(b.get('y',.1))*1000
            for sign in [1,-1]:
                rail=box([mat[0,3]-10,mat[1,3]-10,sign*by-12],[mat[0,3]+chord*.65,mat[1,3]+10,sign*by+12])
                bore=cylinder(float(b.get('diameter',.012))*500+gap/2,chord,[mat[0,3]-15,mat[1,3],sign*by],[1,0,0])
                carrier=carrier+(rail-bore)
            assemblies[f'{name}_carrier']=(carrier-world_female-world_drill-world_nut)
            frames[f'{name}_carrier']=(np.column_stack([np.eye(3),[0,0,0]]),0,'tail')
        else: raise ManufacturingError(f'{name}: kuyruk taşıyıcısı bulunamadı.')
        # Continuous carbon-tube channels through both wing halves and their body saddle.
        if spec['kind']=='wing':
            for pos,dia in [(0.28,main),(0.62,rear)]:
                # A straight tube cannot track taper. Stop at the last station
                # where the bore still has skin clearance, before it exits the TE.
                coordinates=spec['coords'];half=len(coordinates)//2
                upper=np.array(sorted((float(c['x']),float(c['y_upper'])) for c in coordinates[:half]))
                lower=np.array(sorted((float(c['x']),float(c['y_lower'])) for c in coordinates[half:]))
                reach=0
                for z in np.linspace(0,length,301):
                    local_chord=chord+(tip-chord)*z/length
                    u=chord*pos/local_chord
                    if u>=1:break
                    high=float(np.interp(u,*upper.T))*local_chord
                    low=float(np.interp(u,*lower.T))*local_chord
                    if min(high,-low)<dia/2+wall:break
                    reach=float(z)
                reach=min(reach,length-wall*2)
                if reach < trim+10:
                    raise ManufacturingError(f'{name}: Ø{dia:g} mm boru için kanat çok ince. Boru çapını azaltın veya veteri artırın.')
                channel=cylinder(dia/2,reach+20,[chord*pos,0,-20],[0,0,1])
                panel_cut=local_transform(channel,mat)
                world_panel=world_panel-panel_cut
                body=body-panel_cut
                cuts['body'].append(panel_cut)
                cuts.setdefault(name,[]).append(panel_cut)
                spar_channels.append({'part':name,'chord_position':pos,'hole_diameter_mm':dia,'reach_from_center_mm':reach,'wing_insertion_length_mm':reach-trim})
        if parent=='body': body=body-local_transform(mating_envelope,mat)
        elif parent in assemblies: assemblies[parent]=assemblies[parent]-local_transform(mating_envelope,mat)
        assemblies[name]=world_panel;frames[name]=(mat,trim,spec['kind'])
        interfaces.append({'part':name,'parent':parent,'key_mm':[keyw,keyh,depth], 'bolt_axis':mat[:,1].tolist(),'bolt_point_mm':(mat[:,:3]@np.array([cx,0,screw_z])+mat[:,3]).tolist(),'diametral_clearance_mm':gap,'entry_lead_mm':lead,'entry_flare_per_side_mm':.6})
    from backend.motor_mounts import install_motor_mounts
    if booms:
        from backend.twin_boom import install_boom_sockets
        install_boom_sockets(assemblies,cuts,booms,gap,screw,nf,nh)
    motor_service_parts=[]
    body,motor_obstacles,motor_cuts,motors=install_motor_mounts(body,lid,assemblies,data,outer,wall,gap,motor_service_parts)
    body_obstacles.extend(motor_obstacles);cuts['body'].extend(motor_cuts)
    # Adding the next socket/rib or motor pod must never fill existing bores.
    for owner,tools in cuts.items():
        if owner=='body':
            for tool in tools:body=body-tool
        elif owner in assemblies:
            for tool in tools:assemblies[owner]=assemblies[owner]-tool
    parts=[Part('body',body,0,family='body'),Part('hatch',lid,0,family='hatch')]+motor_service_parts
    for name,solid in assemblies.items():
        mat,trim,kind=frames[name]
        parts.append(Part(name,solid,0 if name.startswith('boom_') else 2,mat,kind))
    for p in parts:
        p.solid=p.solid.as_original().set_tolerance(.02).simplify(.02)
        if motor_service_parts or booms:p.solid=printable_precision(p.solid,p.name)
        check(p.solid,p.name)
    notes += ['Ölçüler örnek ayarlardır. Yazıcı / malzeme için tolerans kuponunu basın.',
              'Vida: metrik geçme delik + altıgen somun cebi; basılı diş veya ısı inserti kullanılmaz.',
              'Kanat karbon boruları ve bağlantı vidaları satın alınan parçalardır; pakete dahil değildir. Her yarı kendi ekseninde boru kullanır; dihedral nedeniyle iki kanada tek düz boru geçirilmez.',
              'Gövde dilimleri iç bilezikle hizalanır. Dilim birleştirmeleri yapıştırılır; uçuş öncesi yük testi gerekir.',
              'Kapak ve yüzey dilimleri kesit boyunca yapıştırılarak birleştirilir. Kanatta boru kanalları hizalamayı sağlar.',
              'Kontrol yüzeyleri bu pakette bütünleşik kabuktur; servo/menteşe mekanizması ayrıca tasarlanmalıdır.',
              'Bu kontrol uçuşa elverişlilik veya malzeme dayanımı onayı değildir.']
    if motors:notes+=['Motorlar ve pervaneler satın alınır; STL yalnız bağlantı taşıyıcılarını içerir. Vida boyunu motor üreticisine göre seçin; sargılara değmemelidir. Girilen ölçüleri gerçek motorla doğrulayın. Motor vidaları motorun metal dişlerine girer; plastik plakada geçme delikleri vardır.']
    if booms:notes+=['Savaşan İHA: bom kökleri kanat soketlerine girer ve enine vida/somunla tutulur. Bom dilimlerinin iç geçmelerini hizalayıp yapıştırın. Ayrı kuyruk köklerini yuvalarına takıp vidalayın. Yatay kuyruk köprüsünü iki bom üzerindeki vida/somunla sabitleyin. İtici motor arka gövde plakası üzerinden monte edilir; gövde dilimlerini yapıştırmadan önce vidalarını içeriden takın.']
    return parts,{'bed_mm':bed,'wall_mm':wall,'clearance_mm':gap,'mesh_tolerance_mm':.02,'screw_mm':screw,'nut_flat_mm':nf,'nut_height_mm':nh,'hatch_bolts_mm':hatch_holes,'interfaces':interfaces,'spar_channels':spar_channels,'motors':motors,'booms':booms,'notes':notes},{'outer':rings,'cavity':cavity_rings,'cuts':cuts['body'],'part_cuts':cuts,'obstacles':body_obstacles}


def orthogonal_print(solid,bed,with_transform=False):
    bbox=np.array(solid.bounding_box());size=bbox[3:]-bbox[:3]
    fits=[]
    for perm in itertools.permutations(range(3)):
        dims=size[list(perm)]
        if np.all(dims<=np.array(bed)+.001): fits.append((dims[2],perm))
    if not fits:
        # Long thin panels can fit diagonally even when no axis permutation fits.
        candidates=[]
        for axis in range(3):
            for angle in [15,30,45,60,75]:
                angles=[0,0,0];angles[axis]=angle
                tilted=solid.rotate(angles)
                radians=math.radians(angle);c=math.cos(radians);s=math.sin(radians)
                tilt=[np.array([[1,0,0],[0,c,-s],[0,s,c]]),np.array([[c,0,s],[0,1,0],[-s,0,c]]),np.array([[c,-s,0],[s,c,0],[0,0,1]])][axis]
                for perm in itertools.permutations(range(3)):
                    rot=np.eye(3)[list(perm)]
                    if np.linalg.det(rot)<0:rot[0]*=-1
                    candidate=tilted.transform(np.column_stack([rot,[0,0,0]]).tolist())
                    bounds=np.array(candidate.bounding_box());dims=bounds[3:]-bounds[:3]
                    if np.all(dims<=np.array(bed)+.001):candidates.append((dims[2],candidate,rot@tilt))
        if candidates:
            _,out,rotation=min(candidates,key=lambda c:c[0]);b=np.array(out.bounding_box())
            printed=out.translate((-b[:3]).tolist())
            return (printed,np.column_stack([rotation,-b[:3]])) if with_transform else printed
        # Broad combat wings can use all three bed dimensions. Evaluate rigid
        # compound rotations on vertices before transforming the actual solid.
        vertices=np.asarray(solid.to_mesh().vert_properties)[:,:3].astype(float)
        rotations=[]
        for axis in range(3):
            family=[]
            for angle in [15,30,40,45,50,60,75,90]:
                c=math.cos(math.radians(angle));s=math.sin(math.radians(angle))
                family.append([np.array([[1,0,0],[0,c,-s],[0,s,c]]),np.array([[c,0,s],[0,1,0],[-s,0,c]]),np.array([[c,-s,0],[s,c,0],[0,0,1]])][axis])
            rotations.append(family)
        best=None
        for first,second in [(0,1),(0,2),(1,2)]:
            for a,b in itertools.product(rotations[first],rotations[second]):
                rotation=b@a
                points=vertices@rotation.T;low=points.min(axis=0);dims=points.max(axis=0)-low
                for perm in itertools.permutations(range(3)):
                    arranged=dims[list(perm)]
                    if np.all(arranged<=np.array(bed)+.001) and (best is None or arranged[2]<best[0]):
                        permute=np.eye(3)[list(perm)]
                        if np.linalg.det(permute)<0:permute[0]*=-1
                        best=(arranged[2],permute@rotation)
        if best:
            rotation=best[1];out=solid.transform(np.column_stack([rotation,[0,0,0]]).tolist())
            low=np.array(out.bounding_box())[:3];printed=out.translate((-low).tolist())
            return (printed,np.column_stack([rotation,-low])) if with_transform else printed
        raise ManufacturingError(f'Parça {np.round(size,1).tolist()} mm: {bed} mm yazıcı hacmine sığmıyor. Yazıcı ölçüsünü veya model boyutunu değiştirin.')
    _,perm=min(fits)
    rot=np.eye(3)[list(perm)]
    if np.linalg.det(rot)<0:rot[0]*=-1
    out=solid.transform(np.column_stack([rot,[0,0,0]]).tolist());b=out.bounding_box()
    printed=out.translate([-b[0],-b[1],-b[2]])
    return (printed,np.column_stack([rot,-np.array(b[:3])])) if with_transform else printed


def printable_parts(parts,manifest,rings):
    part_cuts=rings.get('part_cuts',{})
    obstacles=rings.get('obstacles',[])
    cavity_rings=rings['cavity'];cutters=rings['cuts'];rings=rings['outer']
    bed=manifest['bed_mm'];wall=manifest['wall_mm'];gap=manifest['clearance_mm'];result=[]
    # Conservative segment length also reserves room for the fuselage joining sleeve.
    maxlen=min(max(bed)-12,200)
    for p in parts:
        local=p.solid
        if p.frame is not None:
            mat=p.frame; inv=np.linalg.inv(mat[:,:3]);local=local.transform(np.column_stack([inv,-inv@mat[:,3]]).tolist())
        b=local.bounding_box();start=b[p.axis];end=b[p.axis+3]
        count=max(1,math.ceil((end-start)/maxlen));step=(end-start)/count
        for i in range(count):
            # Shared, quantized cut planes avoid float32 slivers at fractional cuts.
            lo=start if i==0 else round(start+i*step,2)
            hi=end if i==count-1 else round(start+(i+1)*step,2)
            low=[-10000]*3;high=[10000]*3;low[p.axis]=lo;high[p.axis]=hi
            piece=local^box(low,high)
            if p.name=='body' and i<count-1:
                # Hollow internal spigot overlaps the next shell without occupying the cavity.
                ring=rings[np.argmin(abs(rings[:,0,0]-hi))]
                poly=ring[:,[1,2]]
                area=np.sum(poly[:,0]*np.roll(poly[:,1],-1)-np.roll(poly[:,0],-1)*poly[:,1])
                if area<0:poly=poly[::-1]
                cs=md.CrossSection([poly.tolist()])
                # Follow the actual cavity taper: a straight cylindrical lip can
                # collide with the next slice on the narrowing aft fuselage.
                lip_outer=[];lip_inner=[]
                # A small overlap avoids float32 rounding separating the lip
                # from the flange when a slice lands at a fractional millimeter.
                for x in [hi-.25,hi+2,hi+4,hi+6]:
                    j=max(1,min(len(cavity_rings)-1,int(np.searchsorted(cavity_rings[:,0,0],x))))
                    a,b=cavity_rings[j-1],cavity_rings[j]
                    ring=a+(b-a)*((x-a[0,0])/(b[0,0]-a[0,0]));ring[:,0]=x
                    center=ring[:,1:].mean(axis=0)
                    direction=ring[:,1:]-center;norm=np.linalg.norm(direction,axis=1)[:,None];direction/=norm
                    outside=ring.copy();outside[:,1:]-=direction*(gap/2+.04)
                    inside=ring.copy();inside[:,1:]-=direction*(gap/2+2.04)
                    lip_outer.append(outside);lip_inner.append(inside)
                sleeve=mesh_solid(lip_outer,lip_outer[0][:,[1,2]])-mesh_solid(lip_inner,lip_inner[0][:,[1,2]])
                # Saddles and internal brackets occupy some of the original cavity.
                # Reserve their real material in the receiving slice as well.
                for obstacle in obstacles:
                    sleeve=sleeve-obstacle
                    for direction in ([0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]):
                        sleeve=sleeve-obstacle.translate(direction)
                flange=(cs-cs.offset(-wall-2,circular_segments=32)).extrude(4).transform([[0,0,1,hi-4],[1,0,0,0],[0,1,0,0]])
                # Entire flange/sleeve is one solid with the outgoing body slice.
                piece=piece+flange+ sleeve
                for tool in cutters:piece=piece-tool
            if p.name.startswith('boom_') and i<count-1:
                boom=next(b for b in manifest['booms'] if b['part']==p.name)
                _,y,z=boom['center_mm'];r=boom['outer_diameter_mm']/2
                lip_r=r-wall-gap/2;inner=max(1,lip_r-wall)
                collar=cylinder(r,3,[hi-3,y,z],[1,0,0])-cylinder(inner,3,[hi-3,y,z],[1,0,0])
                lip=cylinder(lip_r,12.5,[hi-.5,y,z],[1,0,0])-cylinder(inner,12.5,[hi-.5,y,z],[1,0,0])
                # Tail mounting saddles can enter the next tube's cavity.
                following=local^box([hi,-10000,-10000],[hi+13,10000,10000])
                lip=lip-following
                for shift in [[gap/2,0,0],[-gap/2,0,0],[0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]]:
                    lip=lip-following.translate(shift)
                piece=piece+collar+lip
                for tool in part_cuts.get(p.name,[]):piece=piece-tool
            name=p.name if count==1 else f'{p.name}_{i+1:02d}of{count:02d}'
            piece=piece.as_original().set_tolerance(.02).simplify(.02)
            piece=printable_precision(piece,name)
            check(piece,name)
            # Panel frames include sweep/dihedral shear. Restore the physical
            # shape before choosing a rigid print orientation, without scaling it.
            assembled=piece if p.frame is None else local_transform(piece,p.frame)
            assembled=printable_precision(assembled,name)
            printpiece,print_transform=orthogonal_print(assembled,bed,True)
            printpiece=printable_precision(printpiece,name)
            check(printpiece,name)
            inverse=print_transform[:,:3].T
            world=np.column_stack([inverse,-inverse@print_transform[:,3]])
            result.append(Part(name,printpiece,family=p.family,assembled=assembled,print_to_world=world))
    return result


def binary_stl(solid):
    v,f=check(solid,'STL');tri=v[f]
    normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);normals/=np.linalg.norm(normals,axis=1)[:,None]
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    arr=np.zeros(len(f),dtype=dtype);arr['normal']=normals;arr['vertices']=tri
    return b'ZETA mm manifold validated'.ljust(80,b'\0')+struct.pack('<I',len(f))+arr.tobytes()


def preview(parts,manifest,rings):
    printed=printable_parts(parts,manifest,rings)
    meshes=[]
    for part in printed:
        mesh=part.solid.to_mesh()
        vertices=np.asarray(mesh.vert_properties)[:,:3]@part.print_to_world[:,:3].T+part.print_to_world[:,3]
        meshes.append({'name':part.name,'vertices':vertices.reshape(-1).tolist(),'faces':np.asarray(mesh.tri_verts).reshape(-1).tolist()})
    return {'parts':meshes,'manifest':manifest,'summary':f'{len(printed)} STL parçası montaj konumunda gösteriliyor; delikler, kapaklar ve dilim bağlantıları dahil.'}


def package(parts,manifest,rings,filter='all'):
    selected=[p for p in parts if filter=='all' or (filter=='fuselage' and p.family in ['body','hatch']) or p.family==filter]
    if not selected: raise ManufacturingError('İstenen parça bulunamadı.')
    printed=printable_parts(selected,manifest,rings)
    manifest=dict(manifest)
    manifest['motors']=[m for m in manifest.get('motors',[]) if m['parent'] in {p.name for p in selected}]
    manifest['parts']=[]
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        for p in printed:
            filename=p.name+'.stl';z.writestr(filename,binary_stl(p.solid))
            b=np.array(p.solid.bounding_box());manifest['parts'].append({'file':filename,'bounds_mm':b.tolist(),'size_mm':(b[3:]-b[:3]).tolist(),'volume_mm3':p.solid.volume(),'closed':True,'connected':True})
        # Matching calibration key/socket: print these before the full aircraft.
        gap=manifest['clearance_mm']
        key=box([0,0,0],[12,6,20])+box([-4,-2,0],[16,8,3])
        socket=box([0,0,0],[18,12,24])-box([3-gap/2,3-gap/2,4],[15+gap/2,9+gap/2,25])
        z.writestr('fit_test_key.stl',binary_stl(orthogonal_print(key,manifest['bed_mm'])))
        z.writestr('fit_test_socket.stl',binary_stl(orthogonal_print(socket,manifest['bed_mm'])))
        z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        text='ZETA MONTAJ VE BASKI\n\n'+ '\n'.join(manifest['notes'])+'\n\n'
        for motor in manifest['motors']:
            label=('Gövde arkası / itici motor' if motor['axis'][0]<0 else 'Gövde burnu') if motor['parent']=='body' else {'wing_right':'Sağ kanat','wing_left':'Sol kanat'}.get(motor['parent'],motor['parent'])
            text+=f"{label} motor montajı: motor Ø{motor['motor_diameter_mm']:g} × {motor['motor_length_mm']:g} mm; plaka {motor['plate_thickness_mm']:g} mm; vida geçme deliği Ø{motor['hole_diameter_mm']:g} mm; orta delik Ø{motor['center_bore_mm']:g} mm.\n"
            text+='Motor vidalarını gövdenin/taşıyıcının içinden plakaya geçirin. Gövde motorunu dilimleri yapıştırmadan önce monte edin. Ayrı kablo deliğinden kabloları geçirin; motor metal dişine giren vida boyunu üretici ölçüsüyle kontrol edin.\n'
            if motor.get('service_cover'):text+='Kanat motoru: alt servis kapağını çıkarın, içeriden motor vidalarını takıp sıkın. Kapak yuvalarına iki M3 altıgen somun yerleştirin; kapağı iki M3 vida ile sabitleyin. Kapak ayrı STL parçasıdır. Vida boyunu basılan kapağa göre seçin.\n'
        text+='1. fit_test_key ve fit_test_socket dosyalarını basın. Sıkı/geçmeyen veya gevşek sonuçta uygulamadaki geçme boşluğunu değiştirin.\n2. STL dosyaları mm birimindedir; her parça Z=0 tabanına yerleştirilmiştir. Destek, brim ve katman ayarlarını dilimleyicide kontrol edin.\n3. Gövde numaraları burundan kuyruğa ilerler. İç bilezikler sonraki parçada hizalama sağlar; bu birleşimleri yapıştırın.\n4. Kapakta dört vida deliği vardır; karşı somunlar gövde içinden erişilir.\n5. Kanat/kuyruk anahtarlarını karşı soketlerine takın. Aynı eksendeki vida deliklerinden bağlantı yapın. Somun ceplerine seçtiğiniz somunu yerleştirin.\n6. Menteşe, servo montajı, motor yatağı ve yapısal yük doğrulaması tamamlanmadan uçuşa geçmeyin.\n'
        z.writestr('MONTAJ.txt',text)
    return buf.getvalue()
