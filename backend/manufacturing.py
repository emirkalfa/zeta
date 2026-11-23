"""Parametric printable parts, in mm. All cut/union operations use Manifold.

The UI sends the exact displayed fuselage loft and shared panel descriptors.
Physical fit and flight strength still require calibration/loads testing.
"""
from base64 import b64encode
import io
import itertools
import json
import math
import re
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


def welded_mesh_closed(vertices,faces):
    _,inverse=np.unique(vertices,axis=0,return_inverse=True)
    faces=inverse[faces]
    edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    low=edges.min(axis=1).astype(np.uint64);high=edges.max(axis=1).astype(np.uint64)
    _,counts=np.unique(low*np.uint64(len(vertices))+high,return_counts=True)
    return np.all(counts==2)


def printable_precision(solid,name):
    """Weld sub-micron CSG slivers that collapse in float32 STL coordinates."""
    if solid.status()!=md.Error.NoError or solid.is_empty():
        raise ManufacturingError(f'{name}: geçerli baskı hacmi oluşturulamadı.')
    mesh=solid.to_mesh();v=np.asarray(mesh.vert_properties)[:,:3];f=np.asarray(mesh.tri_verts)
    t=v[f];area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)
    if np.min(area)>=1e-10 and welded_mesh_closed(v,f):return solid
    volume_limit=max(.1,solid.surface_area()*.001)
    for tolerance in (.001,.005,.01,.02):
        simplified=solid.simplify(tolerance)
        if simplified.is_empty() or abs(simplified.volume()-solid.volume())>volume_limit:
            continue
        try:
            check(simplified,name,connected=False)
        except ManufacturingError:
            continue
        return simplified
    normalized=solid
    for attempt in range(4):
        source_mesh=normalized.to_mesh();source_v=np.asarray(source_mesh.vert_properties)[:,:3];source_f=np.asarray(source_mesh.tri_verts)
        unique,inverse=np.unique(source_v,axis=0,return_inverse=True)
        normalized=md.Manifold(md.Mesh(unique,inverse[source_f].astype(np.uint32),tolerance=.001))
        if normalized.status()!=md.Error.NoError or normalized.is_empty():break
        mesh2=normalized.to_mesh();v2=np.asarray(mesh2.vert_properties)[:,:3];f2=np.asarray(mesh2.tri_verts)
        t2=v2[f2];a2=np.linalg.norm(np.cross(t2[:,1]-t2[:,0],t2[:,2]-t2[:,0]),axis=1)
        if a2.min()>=1e-10 and welded_mesh_closed(v2,f2) and abs(normalized.volume()-solid.volume())<=volume_limit:
            check(normalized,name,connected=False)
            return normalized
    vertices,inverse=np.unique(np.round(v.astype(float),3),axis=0,return_inverse=True)
    faces=inverse[f];t=vertices[faces]
    area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)
    collapsed=faces[area<1e-10];faces=faces[area>=1e-10].tolist()
    for tri in collapsed:
        if len(set(tri))<3:continue
        a,b=max(((int(tri[i]),int(tri[(i+1)%3])) for i in range(3)),
                key=lambda pair:np.linalg.norm(vertices[pair[0]]-vertices[pair[1]]))
        middle=next(int(v) for v in tri if v not in [a,b])
        matches=[i for i,face in enumerate(faces) if a in face and b in face]
        for index in matches:
            face=faces[index]
            k=next(k for k in range(3) if {face[k],face[(k+1)%3]}=={a,b})
            first,last,third=face[k],face[(k+1)%3],face[(k+2)%3]
            faces[index]=[first,middle,third];faces.append([middle,last,third])
    fixed=md.Manifold(md.Mesh(vertices.astype(np.float32),np.array(faces,dtype=np.uint32)))
    if fixed.status()!=md.Error.NoError or abs(fixed.volume()-solid.volume())>volume_limit:
        raise ManufacturingError(f'{name}: STL hassasiyeti onarımı doğrulanamadı.')
    check(fixed,name,connected=False)
    return fixed


def check(solid, name, connected=True):
    if solid.status() != md.Error.NoError or solid.is_empty() or solid.volume() <= .001:
        raise ManufacturingError(f'{name}: geçerli baskı hacmi oluşturulamadı.')
    mesh=solid.to_mesh();v=np.asarray(mesh.vert_properties)[:,:3];f=np.asarray(mesh.tri_verts)
    p=v[f];area=np.linalg.norm(np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]),axis=1)
    if not np.isfinite(v).all() or np.min(area) < 1e-10:
        raise ManufacturingError(f'{name}: bozuk veya sıfır alanlı yüzey bulundu.')
    if not welded_mesh_closed(v,f): raise ManufacturingError(f'{name}: STL koordinatlarında açık veya çoklu kenar bulundu.')
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


def curved_wingtip(section, chord, tip, frame, length):
    """Loft a glue-on tip from the wing panel's actual end profile."""
    outline, = section.to_polygons()
    outline = np.asarray(outline) / chord
    reach = length * .055
    angle = math.radians(70)
    rings = []
    for theta in np.linspace(0, angle, 25):
        travel = math.sin(theta) / math.sin(angle)
        bend = (1-math.cos(theta)) / (1-math.cos(angle))
        nominal = tip*math.exp((tip-chord)/tip*reach*travel/length)
        width = nominal*(1-.5*bend)
        x = outline[:,0]*width + .30*(nominal-width)
        y = outline[:,1]*width + reach*.72*bend
        z = np.full_like(x,length+reach*travel)
        rings.append(np.column_stack([x,y,z]))
    return local_transform(mesh_solid(rings, outline), frame)


def rounded_tail_panel(section, chord, tip, length, *, extension=0):
    from backend.geometry import TAIL_TIP_ETA, TAIL_TIP_SCALE

    outline, = section.to_polygons()
    outline = np.asarray(outline)/chord
    rings = []
    for eta, scale in zip(TAIL_TIP_ETA, TAIL_TIP_SCALE):
        nominal = chord + (tip-chord)*eta
        x = nominal*(outline[:,0]*scale + 1-scale)
        y = nominal*outline[:,1]*scale
        rings.append(np.column_stack([x, y, np.full(len(x),length*eta)]))
    if extension:
        rings.append(rings[-1] + [0, 0, extension])
    return mesh_solid(rings, outline)


def local_transform(solid,mat):
    return solid.transform(mat.tolist())


def nut_cut(x,y,z,flat,height):
    r=flat/math.sqrt(3)
    poly=[[r*math.cos(t),r*math.sin(t)] for t in np.arange(6)*math.pi/3]
    return md.CrossSection([poly]).extrude(height).rotate([90,0,0]).translate([x,y,z])


def rounded_hatch_prism(front, rear, half_width, radius, bottom, top):
    radius = min(radius, (rear - front) * .24, half_width * .48)
    section = md.CrossSection.square(
        [rear - front - 2 * radius, 2 * (half_width - radius)], center=True
    ).offset(radius, circular_segments=32)
    return section.extrude(top - bottom).transform(
        [[1, 0, 0, (front + rear) / 2], [0, 0, 1, bottom], [0, 1, 0, 0]]
    )


def make_fuselage(data, wall, clearance, screw, nutflat, nuth, shared_outer=None):
    rings=np.asarray(data['fuselage'],dtype=float)
    if rings.ndim!=3 or not 3<=len(rings)<=300 or not 16<=rings.shape[1]<=128 or rings.shape[2]!=3 or not np.isfinite(rings).all():
        raise ManufacturingError('Gövde kesitleri geçersiz.')
    if np.max(np.abs(rings))>6000 or np.any(np.diff(rings[:,0,0])<=0): raise ManufacturingError('Gövde boyu veya kesit sırası geçersiz.')
    outer=mesh_solid(rings, rings[0][:,[1,2]]) if shared_outer is None else shared_outer
    inner=rings.copy()
    for i,ring in enumerate(rings):
        yz=ring[:,1:];c=yz.mean(axis=0);radius=np.linalg.norm(yz-c,axis=1).min()
        dist=min(wall,radius*.4)
        tangent=np.roll(yz,-1,axis=0)-np.roll(yz,1,axis=0)
        normal=np.column_stack([-tangent[:,1],tangent[:,0]])
        normal/=np.linalg.norm(normal,axis=1)[:,None]
        if np.mean(np.sum(normal*(yz-c),axis=1))<0: normal=-normal
        inner[i,:,1:]=yz-normal*dist
    length=rings[-1,0,0]-rings[0,0,0]
    inner[:,:,0]=rings[0,0,0]+wall+(rings[:,:,0]-rings[0,0,0])*(length-2*wall)/length
    cavity=mesh_solid(inner,inner[0][:,[1,2]])
    shell=outer-cavity
    preset=data['geometry'].get('fuse_preset')
    hatch_start = .16 if preset in ('vtol5','akin') else .13
    xmin = 0. if preset=='vtol' else rings[0,0,0]
    hatch_length=rings[-1,0,0]-xmin
    x0, x1 = xmin + hatch_start*hatch_length, xmin + (hatch_start+.30)*hatch_length
    selected=rings[(rings[:,0,0]>=x0)&(rings[:,0,0]<=x1)]
    width=float(np.min(np.max(selected[:,:,2],axis=1)-np.min(selected[:,:,2],axis=1)))
    if width<35 or length<200: raise ManufacturingError('Kapak ve vida yuvaları için gövde çok küçük (en az 35 mm en / 200 mm boy).')
    middle=(x0+x1)/2;bridge=max(8,wall*4)
    body=shell;lid=md.Manifold();cutter=md.Manifold();holes=[]
    clip_caps = data.get("options",{}).get("hatchFastening") == "clip"
    clips=[]
    boss=max(6,nutflat/2+2)
    rear_shift=.0125*hatch_length if preset=='vtol' else 0
    for index,(a,b) in enumerate([(x0,middle-bridge/2),(middle+bridge/2+rear_shift,x1+rear_shift)]):
        hz = width * (.30 if index == 0 and preset in ('seyir','vtol') else .26)
        local_tops=[]
        for ring in rings[(rings[:,0,0]>=a)&(rings[:,0,0]<=b)]:
            top=ring[ring[:,1]>ring[:,1].mean()];order=np.argsort(top[:,2])
            local_tops.extend(float(np.interp(z,top[order,2],top[order,1])) for z in [-hz,hz])
        seat=min(local_tops)-max(3,wall*2)
        if b-a<24:raise ManufacturingError('İki servis kapağı için gövde boyunu artırın.')
        radius = min(12., hz * .34, (b - a) * .20)
        opening = rounded_hatch_prism(a - clearance, b + clearance, hz + clearance,
                                       radius + clearance, seat, 10000)
        region = rounded_hatch_prism(a + clearance, b - clearance, hz - clearance,
                                     radius - clearance, seat + clearance, 10000)
        cap=shell^region;body-=opening;cutter+=opening
        def collar(y0, y1):
            outer_edge = rounded_hatch_prism(a - 3, b + 3, hz + 3, radius + 3, y0, y1)
            inner_edge = rounded_hatch_prism(a + 3, b - 3, hz - 3, max(0, radius - 3), y0 - 1, y1 + 1)
            return outer_edge - inner_edge

        body += collar(seat - 3, seat) ^ outer
        lip_depth=max(2.,wall*2)
        band = collar(seat - 4, 10000)
        lower_cavity=cavity.translate([0,-clearance-lip_depth,0])
        curved_lip=(cavity.translate([0,-clearance,0])-lower_cavity)^band
        anchor=(outer-lower_cavity)^band-opening
        if clip_caps:
            from backend.hatch_latches import latch_cover
            body+=curved_lip+anchor
            cutter-=curved_lip
            roof=lambda x: np.interp(x,rings[:,0,0],rings[:,:,1].max(axis=1))
            body,cap,notches,locations=latch_cover(body,cap,outer,(a,b),roof,wall,clearance)
            cutter+=notches
            clips.append(locations)
            holes.extend([[x,seat,z] for x in [a+boss+2,b-boss-2] for z in [-hz+boss+2,hz-boss-2]])
        else:
            for px in [a+boss+2,b-boss-2]:
                for pz in [-hz+boss+2,hz-boss-2]:
                    curved_lip-=cylinder(boss+clearance/2,200,[px,seat-100,pz],[0,1,0])
            body+=curved_lip+anchor
            cutter-=curved_lip
            for x in [a+boss+2,b-boss-2]:
                for z in [-hz+boss+2,hz-boss-2]:
                    lug=cylinder(boss,10,[x,seat-10,z],[0,1,0])
                    arm=box([x-boss,seat-9,-width if z<0 else z-boss],[x+boss,seat-3,z+boss if z<0 else width])
                    body+=((lug+arm)^outer)
                    cap+=(cylinder(boss,100,[x,seat+clearance,z],[0,1,0])^outer^region)
                    bore=cylinder((screw+clearance)/2,200,[x,seat-100,z],[0,1,0])
                    body=body-bore-nut_cut(x,seat-7,z,nutflat+clearance,nuth+clearance)
                    cap-=bore;cutter+=bore;holes.append([x,seat,z])
        cap_name='hatch_front' if index==0 else 'hatch_rear'
        try:
            cap=printable_precision(cap,cap_name)
        except ManufacturingError:
            if shared_outer is None:raise
            clean=cap.as_original().set_tolerance(.02).simplify(.02)
            if abs(clean.volume()-cap.volume())>max(.1,cap.surface_area()*.001):raise
            cap=printable_precision(clean,cap_name)
        lid+=cap
    body=printable_precision(body,'body')
    check(body,'body')
    return body,lid,outer,rings,holes,cutter,inner,clips


def smooth_nose_sections(rings):
    """Replace the tip with a rounded loft tangent to the original shoulder."""
    xs = rings[:,0,0]
    start = xs[0]
    shoulder = min(len(xs)-2, int(np.searchsorted(xs, start + .065 * (xs[-1]-start))))
    span = xs[shoulder] - start
    if span <= 0:
        return rings
    length_next = xs[shoulder+1] - xs[shoulder]
    if length_next <= 0:
        return rings

    def center(ring):
        return (ring[:,1:].min(axis=0) + ring[:,1:].max(axis=0)) / 2

    c0, c1, c2 = (center(rings[i]) for i in (0, shoulder, shoulder+1))
    end = rings[shoulder,:,1:] - c1
    following = rings[shoulder+1,:,1:] - c2
    initial = .035 * end
    tangent = 2 * span * (following-end) / length_next
    count = min(32, 300 - (len(rings)-shoulder))
    front = []
    for u in np.linspace(0,1,count,endpoint=False):
        x = u*u
        radial = ((2*u**3-3*u*u+1)*initial + (u**3-2*u*u+u)*end
                  + (-2*u**3+3*u*u)*end + (u**3-u*u)*tangent)
        mid = (1-3*x*x+2*x**3)*c0 + (3*x*x-2*x**3)*c1 + (x**3-x*x)*span*(c2-c1)/length_next
        front.append(np.column_stack([np.full(len(end),start+span*x),radial+mid]))
    return np.concatenate([np.asarray(front),rings[shoulder:]],axis=0)


def generate(data):
    if data.get('geometry',{}).get('fuse_preset') in ('vtol','vtol5'):
        from backend.fixed_vtol import normalize
        data=normalize(data)
    if data.get('geometry',{}).get('fuse_preset')=='vtol5':
        if not data['geometry'].get('tail_booms'):
            raise ManufacturingError('Beş motorlu VTOL için çift bom geometrisi gerekli; Penta VTOL modelini seçip yeniden hesaplayın.')
        data={**data,'options':{**data.get('options',{}),'motorLayout':'single'}}
    if data['geometry'].get('fuse_preset')=='akin':
        data={**data,'options':{**data.get('options',{}),'motorLayout':'rear'}}
    from backend.motor_mounts import motor_sized_fuselage
    data=motor_sized_fuselage(data)
    rings = np.asarray(data['fuselage'], dtype=float).copy()
    atlas = data['geometry'].get('fuse_preset') == 'atlas' and data['geometry'].get('fuse_type') != 'manual'
    gimbal_mode=data.get('options',{}).get('cameraMount')==3
    goliath_gimbal=atlas and gimbal_mode
    if rings.ndim == 3 and len(rings) >= 3 and rings.shape[1] >= 16 and rings.shape[2] == 3:
        nose_start = rings[0, 0, 0]
        nose_length = .10 * (rings[-1, 0, 0] - nose_start)
        if nose_length > 0 and not (data['geometry'].get('fuse_preset')=='vtol' and data.get('options',{}).get('cameraMount')!=3):
            offset = rings[:, :, 0] - nose_start
            progress = np.clip(offset / nose_length, 0, 1)
            if not atlas:
                rings[:, :, 0] -= .65 * offset * (1 - progress)**2
            rings = smooth_nose_sections(rings)
        data = {**data, 'fuselage': rings.tolist()}
    from backend.wing_placement import place_wing_assembly
    data=place_wing_assembly(data)
    options=data.get('options',{});g=data['geometry']
    wall=number(options,'wall',1.2,.8,4)
    gap=number(options,'clearance',.3,.1,.8)
    screw=number(options,'screw',3,2,5)
    nf=number(options,'nutFlat',5.5,4,10);nh=number(options,'nutHeight',2.4,1.5,5)
    bed=[number(options,k,v,80,1000) for k,v in [('bedX',220),('bedY',220),('bedZ',250)]]
    main=number(options,'sparMain',6.2,0,50);rear=number(options,'sparRear',4.2,0,50)
    main_position=number(options,'sparMainPosition',28,15,45)/100
    rear_position=number(options,'sparRearPosition',55,35,62)/100
    rib=number(options,'ribSpacing',60,20,150);rt=number(options,'ribThickness',1.6,1,4)
    hinge_pin=number(options,'hingePin',2,1.5,3);control_travel=number(options,'controlTravel',25,10,30)
    wing_pin=number(options,'wingPin',3,2,5)
    wing_seat=number(options,'wingSeatDepth',8,4,12)
    wing_join=options.get('wingJoinMode','bonded')
    if wing_join not in ('bolted','bonded'):raise ManufacturingError('Kanat dilim bağlantısı türü geçersiz.')
    body,lid,outer,rings,hatch_holes,hatch_opening,cavity_rings,hatch_clips=make_fuselage(data,wall,gap,screw,nf,nh)
    specs=[dict(p) for p in data['panels']]
    data={**data,'panels':specs}
    from backend.geometry import TAIL_TIP_START, tail_tip_is_free
    if not 3<=len(specs)<=10: raise ManufacturingError('Kanat / kuyruk yüzeyleri eksik.')
    assemblies={};frames={};notes=[];interfaces=[];spar_channels=[];root_fairings=[];root_fairing_union=md.Manifold();root_outer_union=md.Manifold();cuts={'body':[hatch_opening]};body_obstacles=[]
    simulation_envelopes=[]
    wingtip_parts=[]
    booms=[]
    carbon_boom=None
    if g.get('fuse_preset')=='vtol':
        from backend.carbon_boom import prepare_carbon_boom
        body,carbon_boom=prepare_carbon_boom(body,outer,data,assemblies,frames,cuts)
    if g.get('fuse_preset')=='akin':
        from backend.akin_boom import prepare_akin_boom
        body,carbon_boom=prepare_akin_boom(body,data,assemblies,frames,cuts,wall,gap)
        notes.append('Lark: satın alınan Ø16 mm karbon kuyruk borusunun boyu carbon_boom kaydındadır. Boru gövde ve kuyruk yuvalarına oturur. Motor arka gövde plakasına, karbon boru motorun altına yerleşir.')
    if g.get('tail_booms'):
        from backend.twin_boom import prepare_booms
        tail_floors=[]
        if g.get('fuse_preset')=='vtol5':
            for panel_spec in data['panels']:
                if not panel_spec['name'].startswith(('tail_horizontal_','tail_v_')):continue
                tail_frame,tail_length=panel_frame(panel_spec)
                section=profile(panel_spec['coords'],float(panel_spec['chord'])*1000)
                solid=section.extrude(tail_length,scale_top=[panel_spec['tipChord']/panel_spec['chord']]*2)
                tail_floors.append(float(local_transform(solid,tail_frame).bounding_box()[1]))
        tail_floor=min(tail_floors,default=None)
        booms=prepare_booms(g,assemblies,frames,cuts,wall,gap,screw,nf,nh,tail_floor)
    specs=sorted(specs,key=lambda p: ('horizontal' in p['name'],p['kind']!='wing'))
    pending=specs.copy();specs=[];available={'body',*assemblies.keys()}
    while pending:
        ready=[p for p in pending if p.get('parent','body') in available]
        if not ready:raise ManufacturingError('Kuyruk bağlantı sırası geçersiz; taşıyıcı bulunamadı.')
        for p in ready:specs.append(p);available.add(p['name']);pending.remove(p)
    for spec in specs:
        name=spec['name']
        if not name.replace('_','').isalnum() or len(name)>50: raise ManufacturingError('Parça adı geçersiz.')
        chord=float(spec['chord'])*1000;tip=float(spec['tipChord'])*1000
        if not 20<=tip<=chord<=1500: raise ManufacturingError(f'{name}: veter ölçüleri geçersiz.')
        mat,length=panel_frame(spec);section=profile(spec['coords'],chord)
        rounded = spec['kind'] == 'tail' and tail_tip_is_free(name,g['tail_type'],bool(g.get('tail_booms')))
        def loft(profile_section):
            if rounded:
                return rounded_tail_panel(profile_section,chord,tip,length)
            return profile_section.extrude(length,scale_top=[tip/chord]*2)
        panel = untrimmed = loft(section)
        simulation_envelopes.append(local_transform(panel,mat))
        if spec['kind']=='wing':
            wingtip=curved_wingtip(section,chord,tip,mat,length)
            wingtip_parts.append(Part(name+'_tip',wingtip,2,family='wing'))
            simulation_envelopes.append(wingtip)
        parent=spec.get('parent','body')
        fin_parent=parent.startswith('tail_vertical')
        trim=0
        if spec['kind']=='wing':
            inverse=np.linalg.inv(mat[:,:3])
            local_body=outer.transform(np.column_stack([inverse,-inverse@mat[:,3]]).tolist())
            embedded=local_body^panel
            trim=round(float(embedded.bounding_box()[5]),2)+.35 if not embedded.is_empty() else 20
            if g.get('fuse_preset') == 'vtol5':
                zone=local_body^box([-chord*.2,-10000,0],[chord,10000,length])
                if not zone.is_empty():trim=max(trim,round(float(zone.bounding_box()[5]),2)+.35)
            trim += (16 if g.get('fuse_preset')=='vtol5' else min(80, length*.11)
                     if g.get('vtol_fixed_body') else min(20, length*.03))
        elif parent=='vtol_tail_carrier':
            radial_per_mm = np.linalg.norm(mat[1:,2])
            trim=10 + (carbon_boom['outer_diameter_mm']/2+gap/2+1)/radial_per_mm
        elif parent == 'body' and not g.get('vtol_fixed_body'):
            inverse = np.linalg.inv(mat[:, :3])
            local_body = outer.transform(np.column_stack([inverse, -inverse @ mat[:, 3]]).tolist())
            embedded = local_body ^ panel
            if not embedded.is_empty():
                trim = round(float(embedded.bounding_box()[5]), 2) + .35
            if abs(mat[2, 2]) > .5:
                trim = max(20, trim)
        elif (parent=='body' or fin_parent or parent=='tail_bridge') and abs(mat[2,2])>.5:
            trim=20
        elif parent.startswith('boom_'):trim=float(g['tail_booms']['diameter'])*500+3
        elif parent.startswith('tail_horizontal_'):trim=max(float(g['tail_booms']['diameter'])*500+10+gap,float(g['htail_tip_chord'])*80+3)
        if trim:
            panel=panel.trim_by_plane([0,0,1],trim)
        mating_envelope=loft(section.offset(gap/2,circular_segments=24))
        if trim: mating_envelope=mating_envelope.trim_by_plane([0,0,1],trim-gap/2)
        inset=section.offset(-wall/((tip/chord)*(.68 if rounded else 1)),circular_segments=24)
        if inset.area()>.01:
            cavity_end = length*TAIL_TIP_START-wall if rounded else length-wall
            cavity=loft(inset)^box([-10000,-10000,trim+wall],[10000,10000,cavity_end])
            shell=panel-cavity
            for z in np.arange(trim+8,length-wall,rib):
                shell=shell+(panel^box([-10000,-10000,z], [10000,10000,min(z+rt,length)]))
            panel=shell
        flush_seat=spec['kind']=='wing'
        if flush_seat:
            tongue_scale=1+(tip/chord-1)*(trim+wing_seat+wall*3)/length
            tongue_outer=section.offset(-(wall+gap)/tongue_scale,circular_segments=24)
            tongue_inner=section.offset(-(2*wall+gap)/tongue_scale,circular_segments=24)
            tongue=tongue_outer.extrude(length,scale_top=[tip/chord]*2)
            if tongue_inner.area()>.01:
                tongue-=tongue_inner.extrude(length,scale_top=[tip/chord]*2)
            tongue= tongue ^ box([-10000,-10000,trim],[10000,10000,trim+wing_seat+wall*3])
            panel=panel.trim_by_plane([0,0,1],trim+wing_seat+gap/2)+tongue
        cx=chord*float(spec.get('mountChordFraction',.25 if fin_parent and g.get('tail_booms') else .85 if fin_parent else .4))
        keyw=min(chord*(.13 if fin_parent else .22),20 if fin_parent else 32)
        fastener=wing_pin if spec['kind']=='wing' else screw
        keyh=max(6,fastener+3)
        depth=14 if spec['kind']=='wing' else 10
        root=trim
        key=box([cx-keyw/2,-keyh/2,root-depth],[cx+keyw/2,keyh/2,root+8])
        beam=box([cx-keyw/2,-keyh/2,root],[cx+keyw/2,keyh/2,root+9])
        panel=panel+key+beam
        sleeve=box([cx-keyw/2-3,-keyh/2-3,root-depth-3],[cx+keyw/2+3,keyh/2+3,root])
        socket_end=root+9+gap if flush_seat else root+gap
        female=box([cx-keyw/2-gap/2,-keyh/2-gap/2,root-depth-gap],[cx+keyw/2+gap/2,keyh/2+gap/2,socket_end])
        lead=1.5
        mouth=md.CrossSection.square([keyw+gap,keyh+gap],center=True).extrude(
            lead,scale_top=[(keyw+gap+1.2)/(keyw+gap),(keyh+gap+1.2)/(keyh+gap)]
        ).translate([cx,0,root-lead])
        female=female+mouth
        screw_z=root-depth*.55
        drill=cylinder((fastener+gap)/2,500,[cx,-250,screw_z],[0,1,0])
        nut=md.Manifold() if spec['kind']=='wing' else nut_cut(cx,-keyh/2-1,screw_z,nf+gap,nh+gap)
        panel=panel-drill
        world_sleeve=local_transform(sleeve,mat);world_female=local_transform(female,mat)
        world_drill=local_transform(drill,mat);world_nut=local_transform(nut,mat)
        if spec['kind']=='wing':
            pin_axis=mat[:,1]
            pin_center=mat[:,:3]@np.array([cx,0,screw_z])+mat[:,3]
            world_drill=cylinder((wing_pin+gap)/2,500,pin_center-pin_axis*250,pin_axis)
        cuts.setdefault(name,[]).append(world_drill)
        saddle=md.Manifold()
        if spec['kind']=='tail' and trim and (parent=='body' or parent in assemblies):
            saddle_length=trim-gap/2
            if parent == 'body' and name.startswith('tail_horizontal_'):
                scale = 1+(tip/chord-1)*saddle_length/length
                root_solid = section.extrude(saddle_length,scale_top=[scale]*2)
            else:
                root_solid = untrimmed.trim_by_plane([0,0,-1],-saddle_length)
            saddle=local_transform(root_solid,mat)
        if spec['kind']=='wing' and trim:
            saddle_length=trim-gap/2
            saddle_scale=1+(tip/chord-1)*saddle_length/length
            stub=section.extrude(saddle_length,scale_top=[saddle_scale]*2)
            if inset.area()>.01:
                hollow=inset.extrude(max(.1,saddle_length-wall*2),scale_top=[saddle_scale]*2)
                stub=stub-hollow
            from backend.wing_blend import blended_root
            stub,root_outer=blended_root(section,inset,chord,tip/chord,length,saddle_length,wall,gap,
                              1.0 if atlas or g.get('vtol_fixed_body') else 1.22,
                              body_profile=rings if g.get('fuse_preset')=='vtol' else None,frame=mat,roof_blend=.60 if g.get('fuse_preset')=='vtol5' else .75,
                              seat_end=trim+wing_seat,return_outer=True,roof_profile=rings if atlas else None)
            cavity_body=mesh_solid(cavity_rings,cavity_rings[0][:,[1,2]])
            saddle=local_transform(stub,mat)-cavity_body
            if trim+wing_seat+wall>=length:
                raise ManufacturingError(f'{name}: kanat kök yuvası için açıklık yetersiz.')
            collar_length=trim+wing_seat
            root_scale=1+(tip/chord-1)*trim/length
            root_section=section.scale([root_scale,root_scale])
            collar_start=max(0,trim-wall*2)
            collar=root_section.offset(wall+gap/2,circular_segments=24).extrude(
                collar_length-collar_start).translate([0,0,collar_start])
            seat_void=root_section.offset(gap/2,circular_segments=24).extrude(
                wing_seat+gap+1).translate([0,0,trim-gap/2])
            mating_envelope=mating_envelope+seat_void
            if flush_seat:
                collar=section.extrude(length,scale_top=[tip/chord]*2)^box(
                    [-10000,-10000,collar_start],[10000,10000,collar_length])
                seat_void=root_section.offset(-wall-gap/2,circular_segments=24).extrude(
                    wing_seat+gap+1).translate([0,0,trim-gap/2])
                mating_envelope=section.offset(gap/2,circular_segments=24).extrude(
                    length,scale_top=[tip/chord]*2).trim_by_plane([0,0,1],collar_length+gap/2)
                mating_envelope+=seat_void
            if not flush_seat:
                saddle=saddle+local_transform(collar,mat)
            root_fairing_union=root_fairing_union+saddle
            root_outer_union+=local_transform(root_outer,mat)
            root_fairings.append({'part':name,'parent':'body','root_plane_mm':trim,
                                 'fixed_plane_mm':saddle_length,'seam_mm':gap/2,
                                 'seat_depth_mm':wing_seat,'seat_end_mm':collar_length})
            root_fairings[-1].update(blended=True,blend_length_mm=saddle_length,flush_seat=True,body_profile_blend=bool(g.get('vtol_fixed_body')))
        cuts.setdefault(parent,[]).extend([world_female,world_drill,world_nut,local_transform(mating_envelope,mat)])
        world_panel=local_transform(panel,mat)
        if parent=='body':
            support=sleeve
            if trim:
                support=box([cx-keyw/2-3,-keyh/2-3,0],[cx+keyw/2+3,keyh/2+3,root])
            center_x=float((mat[:,:3]@np.array([cx,0,root-depth*.5])+mat[:,3])[0])
            bridge=outer^box([center_x-2,-10000,-10000],[center_x+2,10000,10000])
            nearest=rings[np.argmin(abs(rings[:,0,0]-center_x))]
            yc=float(nearest[:,1].mean());half_h=float(np.ptp(nearest[:,1]))*.32;half_w=float(np.ptp(nearest[:,2]))*.32
            if spec['kind']=='wing':
                bridge=bridge-box([center_x-3,yc-half_h,-half_w],[center_x+3,yc+half_h,half_w])
            body=(body+bridge+local_transform(support,mat)+world_sleeve+saddle)-world_female-world_drill-world_nut
            body_obstacles.append(bridge+local_transform(support,mat)+world_sleeve+saddle)
        elif parent in assemblies:
            support=box([cx-keyw/2-3,-keyh/2-3,0],[cx+keyw/2+3,keyh/2+3,root]) if trim else sleeve
            fixed=local_transform(support,mat)
            if parent.startswith('tail_horizontal_'):
                radius=float(g['tail_booms']['diameter'])*500;side=1 if mat[2,3]>0 else -1
                x=float(mat[0,3]+cx);y=float(mat[1,3]);z=float(mat[2,3])
                offsets=sorted([-side*(radius+3),-side*(radius+gap)])
                x0,x1 = x-keyw/2-3, x+keyw/2+3
                if g.get('fuse_preset') == 'vtol5':
                    web = rounded_hatch_prism(x0,x1,(offsets[1]-offsets[0])/2,2,y,y+root)
                    fixed += web.translate([0,0,z+sum(offsets)/2])
                    shoulder = rounded_hatch_prism(x0,x1,radius+3,5,y+radius+gap,y+root)
                    fixed += shoulder.translate([0,0,z])
                else:
                    fixed += box([x0,y,z+offsets[0]],[x1,y+root,z+offsets[1]])
                    fixed += box([x0,y+radius+gap,z-radius-3],[x1,y+root,z+radius+3])
            assemblies[parent]=(assemblies[parent]+fixed+world_sleeve+saddle)-world_female-world_drill-world_nut
        elif parent=='boom' or parent=='fin':
            carrier=world_sleeve
            b=g.get('tail_booms',{});by=float(b.get('y',.1))*1000
            for sign in [1,-1]:
                rail=box([mat[0,3]-10,mat[1,3]-10,sign*by-12],[mat[0,3]+chord*.65,mat[1,3]+10,sign*by+12])
                bore=cylinder(float(b.get('diameter',.012))*500+gap/2,chord,[mat[0,3]-15,mat[1,3],sign*by],[1,0,0])
                carrier=carrier+(rail-bore)
            assemblies[f'{name}_carrier']=(carrier-world_female-world_drill-world_nut)
            frames[f'{name}_carrier']=(np.column_stack([np.eye(3),[0,0,0]]),0,'tail')
        else: raise ManufacturingError(f'{name}: kuyruk taşıyıcısı bulunamadı.')
        if spec['kind']=='wing':
            if main and rear and (rear_position-main_position)*chord<(main+rear)/2+wall*2:
                raise ManufacturingError('Ana ve arka karbon boru kanalları çok yakın; konumlarını birbirinden uzaklaştırın.')
            for role,pos,dia in [('main',main_position,main),('rear',rear_position,rear)]:
                if dia == 0:
                    continue
                coordinates=spec['coords'];half=len(coordinates)//2
                upper=np.array(sorted((float(c['x']),float(c['y_upper'])) for c in coordinates[:half]))
                lower=np.array(sorted((float(c['x']),float(c['y_lower'])) for c in coordinates[half:]))
                center_y=(float(np.interp(pos,*upper.T))+float(np.interp(pos,*lower.T)))*chord/2
                inverse=np.linalg.inv(mat[:,:3])
                direction=np.array([(tip-chord)*pos/length,
                                    center_y*(tip/chord-1)/length,1.])
                world_direction=mat[:,:3]@direction
                path_scale=float(np.linalg.norm(world_direction))
                axis=world_direction/path_scale
                side=mat[:,0]-axis*np.dot(mat[:,0],axis);side/=np.linalg.norm(side)
                up=np.cross(axis,side);angles=np.linspace(0,2*math.pi,48,endpoint=False)
                offsets=(np.cos(angles)[:,None]*side+np.sin(angles)[:,None]*up)*(dia/2)
                offsets=offsets@inverse.T
                polygons=inset.to_polygons()
                if not polygons:raise ManufacturingError(f'{name}: boru için iç kesit kalmadı.')
                polygon=np.asarray(polygons[0]);pa=polygon;pb=np.roll(polygon,-1,axis=0)
                def fits(points):
                    px=points[:,0,None];py=points[:,1,None]
                    crossing=(pa[:,1]>py)!=(pb[:,1]>py)
                    dy=pb[:,1]-pa[:,1]
                    atx=pa[:,0]+(py-pa[:,1])*(pb[:,0]-pa[:,0])/np.where(abs(dy)>1e-15,dy,1)
                    return np.all(np.count_nonzero(crossing&(px<atx),axis=1)%2==1)
                reach=0
                for z in np.linspace(0,length,301):
                    local_chord=chord+(tip-chord)*z/length
                    u=pos
                    if u>=1:break
                    if main and rear and local_chord*(rear_position-main_position)<(main+rear)/2+wall*2:break
                    sample=offsets+np.array([chord*pos,center_y,0])+direction*z
                    scale=(chord+(tip-chord)*sample[:,2]/length)/chord
                    if not fits(sample[:,:2]/scale[:,None]):break
                    safe=True
                    for kind in (['flaperon'] if 'flaperon' in g.get('control_surfaces', {}) else ['flap','aileron']):
                        ctl=g.get('control_surfaces',{}).get(kind,{})
                        begin=max(trim+14,length*float(ctl.get('eta_start',.08 if kind=='flap' else .55)))
                        end=min(length-22,length*float(ctl.get('eta_end',.5 if kind=='flap' else .9)))
                        if not begin-15<=z<=end+15:continue
                        hinge_fraction=1-float(ctl.get('chord_ratio',.3 if kind=='flap' else .25))
                        height=(float(np.interp(hinge_fraction,*upper.T))-float(np.interp(hinge_fraction,*lower.T)))*local_chord
                        reserve=max(3,hinge_pin/2+gap/2+wall,height*.65)+gap+wall*3
                        if local_chord*pos+dia/2+reserve>=local_chord*hinge_fraction:safe=False;break
                    if not safe:break
                    reach=float(z)
                reach=min(reach,length-wall*2)
                if reach < trim+10:
                    raise ManufacturingError(f'{name}: Ø{dia:g} mm boru için sabit kanat payı yetersiz. Boru çapını azaltın veya veteri artırın.')
                start=mat[:,:3]@np.array([chord*pos,center_y,0])+mat[:,3]
                origin=start-world_direction*20
                panel_cut=cylinder(dia/2,(reach+20)*path_scale,origin,axis)
                if (panel_cut^world_drill).volume()>.01:
                    raise ManufacturingError(f'{name}: karbon boru kanalı kanat kök pimiyle çakışıyor; boru konumunu değiştirin.')
                world_panel=world_panel-panel_cut
                body=body-panel_cut
                cuts['body'].append(panel_cut)
                cuts.setdefault(name,[]).append(panel_cut)
                spar_channels.append({'part':name,'role':role,'chord_position':pos,'center_offset_mm':center_y,'hole_diameter_mm':dia,'reach_from_center_mm':reach,'wing_insertion_length_mm':reach-trim,'start_mm':start.tolist(),
                    'end_mm':(start+world_direction*reach).tolist(),'axis':axis.tolist(),
                    'path_scale':path_scale,'local_direction':direction.tolist(),
                    'tube_length_mm':(reach-trim)*path_scale,'follows_taper':True})
        if parent=='body': body=body-local_transform(mating_envelope,mat)
        elif parent in assemblies: assemblies[parent]=assemblies[parent]-local_transform(mating_envelope,mat)
        assemblies[name]=world_panel;frames[name]=(mat,trim,spec['kind'])
        interfaces.append({'part':name,'parent':parent,'key_mm':[keyw,keyh,depth], 'root_trim_mm':trim,'bolt_axis':mat[:,1].tolist(),'bolt_point_mm':(mat[:,:3]@np.array([cx,0,screw_z])+mat[:,3]).tolist(),'diametral_clearance_mm':gap,'entry_lead_mm':lead,'entry_flare_per_side_mm':.6})
        if spec['kind']=='wing':
            interfaces[-1].update(fastener_type='retaining_pin',pin_count=1,
                                 pin_diameter_mm=wing_pin,hole_diameter_mm=wing_pin+gap,
                                 seat_depth_mm=wing_seat)
    if not root_fairing_union.is_empty() and g.get('fuse_preset')!='vtol5':
        body=body+root_fairing_union
    if not root_fairing_union.is_empty() and g.get('fuse_preset')!='vtol5':
        shared_roof=outer+root_outer_union
        roof_body,lid,_,_,hatch_holes,hatch_opening,_,hatch_clips=make_fuselage(
            data,wall,gap,screw,nf,nh,shared_outer=shared_roof)
        cap_bounds=lid.bounding_box()
        seat_floor=min(p[1] for p in hatch_holes)-12
        roof_band=box([cap_bounds[0]-4,seat_floor,cap_bounds[2]-4],
                      [cap_bounds[3]+4,10000,cap_bounds[5]+4])
        body=(body-roof_band)+(roof_body^roof_band)
        cuts['body'][0]=hatch_opening
    from backend.motor_mounts import install_motor_mounts
    if booms:
        from backend.twin_boom import install_boom_sockets
        install_boom_sockets(assemblies,cuts,booms,gap,screw,nf,nh)
        if g['tail_type']=='conventional':
            for boom in booms:
                x,y,z=boom['center_mm'];radius=boom['outer_diameter_mm']/2
                clearance=cylinder(radius+gap/2,boom['end_x_mm']-x+1,[x-.5,y,z],[1,0,0])
                if boom.get('tail_socket'):
                    socket=boom['tail_socket']
                    start=socket['start_x_mm']+1.4
                    bore_radius=radius+gap/2
                    protected_radius=bore_radius+socket['nominal_wall_mm']-1.1
                    length=boom['end_x_mm']-start
                    stop=cylinder(protected_radius,max(3.5,wall)-.3,[boom['end_x_mm']+.3,y,z],[1,0,0])
                    grip=(cylinder(protected_radius,length+.55,[start,y,z],[1,0,0])
                          -cylinder(bore_radius,length+.25,[start-.05,y,z],[1,0,0]))
                    socket_core=grip+stop
                    assemblies['tail_bridge']+=socket_core
                    cuts['tail_bridge']=[tool-socket_core for tool in cuts['tail_bridge']]
                collar=assemblies['tail_bridge']^box([x,-10000,z-radius-5],[boom['end_x_mm']+20,10000,z+radius+5])
                for name in assemblies:
                    if not name.startswith(('tail_horizontal_','tail_vertical_')):continue
                    assemblies[name]=assemblies[name]-clearance-collar
                    for offset in [[gap/2,0,0],[-gap/2,0,0],[0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]]:
                        assemblies[name]=assemblies[name]-collar.translate(offset)
    from backend.tail_joints import install_tail_center_joint
    center_parts=install_tail_center_joint(g,specs,assemblies,cuts,interfaces,gap,screw,nf,nh)
    motor_service_parts=[]
    vtol_joints=[]
    hover_report=None
    if g.get('fuse_preset')=='vtol':
        from backend.vtol_mounts import install_vtol
        body,vtol_parts,motors,vtol_joints,motor_obstacles=install_vtol(body,assemblies,data,outer,gap,cuts)
        motor_service_parts.extend(vtol_parts);motor_cuts=[]
        from backend.hover_balance import hover_balance
        hover_report=hover_balance(g,motors)
        notes+=['Tria karbon kuyruk borusu satın alınır, STL parçası değildir. Gövde yuvasına belirtilen uzunluk kadar sokun, gövde ve kuyruk taşıyıcısının dış kulaklarındaki iki M3 vida/somunla sıkın. Arka motor üst eyer ve alt kelepçeyi boruya dört M3 vida/somunla bağlayın. Boru delinmez; bağlantı kayması, dönmesi, ezilmesi ve baskı dayanımı gerçek boru ve yükle denenmelidir. Kuyruk kökleri ayrı taşıyıcının profil yuvalarına geçer ve vidalanır.']
        notes+=['VTOL prototipi: ön iki motor bağımsız pivotlu, arka motor sabit dikeydir. Ön taşıyıcı açıları dikeyden -20 ile 90 derece arasındadır. Uçuş kontrolcüsü, servo torku, itki, ağırlık merkezi ve geçiş uçuşu doğrulanmış değildir.',
                'VTOL ön mekanizması kompakt doğrudan servo düzenidir. Sabit yan gövde kanat taşıyıcısına dört M3 vida ve alttan erişilen somunla bağlanır. Pivotta metal mil/vida, pul ve emniyetli somun kullanın. Servo yan servis bölmesine oturur; iki Ø2.4 mm kasa deliğinden bağlanır. Motor taşıyıcısının dört deliği satın alınan metal servo koluna vidalanır; basılı spline/diş yoktur. Kol delik yarıçapını ve vida çapını gerçek kola göre ayarlayın. Servis kapağında dört M2 vida ve içeriden erişilen somun cepleri bulunur. Kabloya dönüş boyunca serbest pay bırakın. Servo/motor/pervane ve metal bağlantılar STL değildir.',
                'VTOL arka motor üst eyer ve alt kelepçe ile karbon boruya bağlanır. İki hizalama geçmesini oturtun, dört M3 vidayı üstten ve altıgen somunları alttaki ceplerden takın; eşit ve kademeli sıkın. Boruyu ezmeden tutuşu gerçek donanımla doğrulayın. Motor vidalarına üst taşıyıcının açık yanlarından erişilir. Vida boyunu gerçek baskı ve donanıma göre seçin. STL ölçüleri mekanik prototip içindir; yük ve gerçek donanımla hareket testi gerektirir.',
                'VTOL hareket kontrolü -20 ile 90 derece arasında 5 derece aralıklarla örneklenir; sürekli hareket, kablo, servo kolu ve itme çubuğu çarpışma doğrulaması değildir. Referans: https://ardupilot.org/plane/docs/guide-tilt-rotor.html']
    else:
        body,motor_obstacles,motor_cuts,motors=install_motor_mounts(body,lid,assemblies,data,outer,wall,gap,motor_service_parts)
        if g.get('fuse_preset')=='vtol5':
            from backend.quad_vtol import install_quad_lift
            lift_parts,lift_motors=install_quad_lift(body,assemblies,data,gap,cuts,motors)
            motor_service_parts.extend(lift_parts);motors.extend(lift_motors)
            notes+=['Penta: ön motorlar kısa vidalı kanat taşıyıcılarına, arka motorlar iki parçalı M3 kelepçelerle satın alınan karbon borulara bağlanır. Bom çapı ve kesim boyu booms listesinde verilir. Borular kanat ve kuyruk soketlerine yapıştırılır; karbonu delmeyin. Kuyruk soketleri borunun çevresini sarar ve ucunu kapalı dayamaya oturtur. Kavrama boyu tail_socket.engagement_mm alanında verilir. Motor ve pervaneler satın alınır. İtki, ağırlık merkezi, ray dayanımı, titreşim ve geçiş uçuşu fiziksel olarak doğrulanmamıştır.']
    body_obstacles.extend(motor_obstacles);cuts['body'].extend(motor_cuts)
    from backend.camera_mounts import install_camera_mount
    body,camera_obstacles,cameras=install_camera_mount(body,outer,data,wall,gap)
    body_obstacles.extend(camera_obstacles)
    from backend.landing_gear import install_landing_mounts
    body,landing_mounts=install_landing_mounts(body,data,gap,cuts)
    if landing_mounts and landing_mounts['layout']=='tricycle_wheel_mounts':notes+=['Üç tekerli iniş takımı için gövde altında bir ön merkez ve ağırlık merkezinin arkasında iki ana bağlantı yuvası bulunur. Her yuvada iki M3 geçme deliği ve içeriden erişilen altıgen somun cepleri vardır. Ön vida aralığı 20 mm, ana bağlantı aralığı 34 mm. Teker, mil ve harici taşıyıcılar STL değildir. Gerçek donanım, teker açıklığı, ağırlık merkezi ve iniş yükü ayrıca doğrulanır.']
    elif landing_mounts:notes+=['Gövde altında iki ön ve bir arka merkez bağlantı yuvası bulunur. Ayaklar haricen temin edilir; STL paketinde ayak yoktur. Her yuvada iki M3 vida geçme deliği ve gövde içinden yerleştirilen altıgen somun cepleri bulunur. Ön vida aralığı 20 mm, arka 34 mm. Harici ayağın yüksekliği, pervane boşluğu, ağırlık merkezi ve iniş yükü gerçek donanımla doğrulanır.']
    for owner,tools in cuts.items():
        if owner=='body':
            for tool in tools:body=body-tool
        elif owner in assemblies:
            for tool in tools:assemblies[owner]=assemblies[owner]-tool
    if g.get('fuse_preset')=='seyir' and g.get('wing_position')=='high':
        components=sorted(connected_solids(body),key=lambda part:part.volume(),reverse=True)
        if len(components)==2:
            shell,seat=components
            x0,y0,z0,x1,y1,z1=seat.bounding_box()
            bx0,_,bz0,bx1,_,bz1=hatch_opening.bounding_box()
            if (y1-y0<=wall+.03 and z0<0<z1 and
                    bx0<=x0<x1<=bx1+wall and bz0-wall<=z0<z1<=bz1+wall):
                for fraction in (.75,.60,.40):
                    x=x0+fraction*(x1-x0)
                    support=outer^box([x-wall,y0,-10000],[x+wall,y1,10000])
                    for tool in cuts['body']:
                        support-=tool
                    if (support^seat).volume()>.1 and (support^shell).volume()>.1:
                        repaired=body+support
                        if len(connected_solids(repaired))==1:
                            body=repaired
                            body_obstacles.append(support)
                            break
    from backend.control_joints import install_control_surfaces
    controls=install_control_surfaces(g,specs,assemblies,frames,wall,gap,
        hinge_pin,control_travel,auto_root_splices=g.get('fuse_preset') in ('vtol','vtol5') and options.get('designMode','auto')=='auto',splice_chord_limit=2*max(bed),root_splice_clearance=max(80,2*(nf+2*wall+3)+4*wall+4), center_parts=center_parts,lower_wing_horns=bool(int(options.get('controlServoMount',0))&1))
    for owner,tools in cuts.items():
        if owner in assemblies:
            for tool in tools:assemblies[owner]=assemblies[owner]-tool
    from backend.control_servo_mounts import install_control_servos
    servo_exclusions={}
    body,servo_parts,control_servos=install_control_servos(
        body,outer,assemblies,specs,controls,cuts,body_obstacles,options,wall,gap,
        carbon_boom.get('tail_carrier') if carbon_boom else None,motors,motor_service_parts,servo_exclusions)
    if any(item['status']=='ready' for item in control_servos):
        notes.append('Kontrol servosunu ölçülere uygun yuvaya takın. Kanat kapaklarını ve servo taşıyıcılarını M2 vidalarla sabitleyin. Kumanda çubuğunu kol açıklığından hareketli yüzeye uzatın.')
    if any(item['status']=='no_clearance' for item in control_servos):
        notes.append('Bazı kontrol servoları için mevcut karbon boru ve montaj boşlukları dışında yeterli yer bulunamadı. Daha küçük servo ölçüleriyle tekrar deneyin.')
    if any(c['part']=='tail_elevator_one_piece' for c in controls):
        notes.append('Tek parça irtifa dümeni iki yan menteşe pimiyle takılır. Ortadaki köprü baskıdan sonra kesilmez.')
    split_x=(hatch_holes[2][0]+hatch_holes[4][0])/2
    front_lid=lid^box([-10000,-10000,-10000],[split_x,10000,10000])
    rear_lid=lid^box([split_x,-10000,-10000],[10000,10000,10000])
    if atlas:
        hx0, hy0, hz0, hx1, _, hz1 = hatch_opening.bounding_box()
        body_pieces = connected_solids(body)
        if len(body_pieces) > 1:
            largest = max(piece.volume() for piece in body_pieces)
            kept = []
            for piece in body_pieces:
                x0, y0, z0, x1, y1, z1 = piece.bounding_box()
                loose_skin = (
                    piece.volume() < largest * .001 and y1 - y0 <= wall and y0 >= hy0 - wall
                    and hx0 <= x0 <= x1 <= hx1 and hz0 <= z0 <= z1 <= hz1
                )
                if not loose_skin:
                    kept.append(piece)
            if len(kept) < len(body_pieces):
                body = md.Manifold.compose(kept)
    from backend.removable_nose import install_removable_nose
    short_pod = g.get('fuse_preset') in ('vtol5','akin')
    tria_gimbal=gimbal_mode and g.get('fuse_preset')=='vtol'
    nose_cuts=[]
    gimbal_seam=None
    if g.get('fuse_preset')=='vtol':
        from backend.tria_gimbal import TRIA_GIMBAL_SEAM_FRACTION
        gimbal_seam=rings[-1,0,0]*TRIA_GIMBAL_SEAM_FRACTION
    body, nose, vent_cover, nose_module = install_removable_nose(
        body, outer, rings, wall, gap, cameras,
        wide_cover=g.get('fuse_preset') == 'seyir', cavity_rings=cavity_rings, clip_cover=bool(hatch_clips),
        seam_fraction=.135 if short_pod else .112, joint_slope=0 if short_pod or tria_gimbal or goliath_gimbal else .16,
        vent=not tria_gimbal, nose_cuts=nose_cuts, seam_x=gimbal_seam, gimbal=goliath_gimbal,
    )
    if goliath_gimbal:
        from backend.goliath_gimbal_parts import install_gimbal_accessories, rounded_tip_warp
        round_tip=rounded_tip_warp(nose,vent_cover)
        nose=nose.warp_batch(round_tip)
        vent_cover,accessories=install_gimbal_accessories(nose,vent_cover,outer,nose_module,wall,gap)
        cover_name=nose_module['gimbal']['cover_part']
        nose_parts=[Part(cover_name,vent_cover,0,family='body'),*accessories]
        notes.append('Gimbal, açık alt bölümün üstündeki M2 yuvalı plakaya takılır. VTX tepsisi üst kapakla birlikte çıkar.')
    elif tria_gimbal:
        from backend.tria_gimbal import install_gimbal_nose
        nose,nose_parts,gimbal=install_gimbal_nose(body,outer,nose_module,gap,nose_cuts)
        nose_module['gimbal']=gimbal
        notes.append('Gimbal burnu, gövdeye mevcut iki M2 vida ile doğrudan bağlanır. VTX kapağı ayrı STL parçasıdır.')
    else:
        nose_parts=[Part('body_nose_vent',vent_cover,0,family='body')]
        notes.append('Burun ayrı STL parçasıdır. İç geçmeye oturtup iki M2 vida ve içerideki M2 somunlarla sabitleyin. Üst havalandırma yuvaları STL’de açıktır.')
    parts=[Part('body',body,0,family='body'),Part('body_nose',nose,0,family='body'),
           Part('hatch_front',front_lid,0,family='hatch'),Part('hatch_rear',rear_lid,0,family='hatch')]+nose_parts+motor_service_parts+center_parts+servo_parts
    for name,solid in assemblies.items():
        mat,trim,kind=frames[name]
        parts.append(Part(name,solid,0 if name.startswith('boom_') else 2,mat,kind))
    parts.extend(wingtip_parts)
    for p in parts:
        discard_trim_slivers = g.get('fuse_preset')=='vtol' and (
            p.name=='vtol_tail_carrier' or p.name.endswith('_ruddervator')
        )
        original=p.solid
        simplified=original if p.name.startswith('body_gimbal_') else original.as_original().set_tolerance(.02).simplify(.02)
        try:
            p.solid=printable_precision(simplified,p.name)
        except ManufacturingError:
            p.solid=printable_precision(original,p.name)
        if discard_trim_slivers:
            components=sorted(connected_solids(p.solid),key=lambda solid:solid.volume(),reverse=True)
            if len(components)>1:
                debris=components[1:]
                total=sum(c.volume() for c in debris)
                carrier_skin=p.name=='vtol_tail_carrier' and all(
                    np.min(np.subtract(c.bounding_box()[3:],c.bounding_box()[:3]))<=wall for c in debris)
                if total<=(1. if carrier_skin else .1):
                    p.solid=components[0]
        if g['tail_type']=='conventional' and booms and p.name.startswith('tail_horizontal_'):
            components=sorted(connected_solids(p.solid),key=lambda c:c.volume(),reverse=True)
            kept=components[:1]
            for piece in components[1:]:
                x0,y0,z0,x1,y1,z1=piece.bounding_box()
                at_collar=any(b['center_mm'][0]-.5<=x0<=x1<=b['end_x_mm']+20+gap/2
                              and max(abs(z-b['center_mm'][2]) for z in (z0,z1))<=b['outer_diameter_mm']/2+5+gap
                              for b in booms)
                if not (at_collar and 0<piece.volume()<=.025 and min(y1-y0,z1-z0)<=.2):
                    kept.append(piece)
            if len(kept)<len(components):
                p.solid=md.Manifold.compose(kept)
        socket_booms = [b for b in booms if b.get('tail_socket')] if p.name.startswith('tail_vertical_') else []
        if socket_booms:
            components=sorted(connected_solids(p.solid),key=lambda c:c.volume(),reverse=True)
            if len(components)>1:
                kept=components[:1]
                for piece in components[1:]:
                    x0,y0,z0,x1,y1,z1=piece.bounding_box()
                    small=piece.volume()<components[0].volume()*.001 and min(y1-y0,z1-z0)<=2*wall+gap
                    at_socket=any(b['tail_socket']['start_x_mm']-2<=x0<=x1<=b['end_x_mm']+8
                                  and max(abs(z-b['center_mm'][2]) for z in (z0,z1))<=b['outer_diameter_mm']/2+8
                                  for b in socket_booms)
                    if not (small and at_socket):
                        kept.append(piece)
                p.solid=md.Manifold.compose(kept)
        check(p.solid,p.name)
    notes += ['Yumuşak geçişli kanat uçları ayrı STL parçalarıdır. Düz kök yüzlerini ilgili kanat ucuna yapıştırın.',
              'Her kanat yarısı profil biçimli gövde yuvasına oturur ve tek metal pimle tutulur. Başlı, uçtan emniyet klipsli pim kullanın; düz ve emniyetsiz çubuk kullanmayın. Pim ve klips STL paketine dahil değildir. Karbon borular kanat içi takviyedir. Gerçek baskıda oturma ve yük testi yapın.',
              'Ölçüler örnek ayarlardır. Yazıcı / malzeme için tolerans kuponunu basın.',
              'Vida: metrik geçme delik + altıgen somun cebi; basılı diş veya ısı inserti kullanılmaz.',
              'Kanat karbon boruları ve bağlantı vidaları satın alınan parçalardır; pakete dahil değildir. Her yarı kendi ekseninde boru kullanır; dihedral nedeniyle iki kanada tek düz boru geçirilmez.',
              'Gövde dilimleri iç bilezikle hizalanır. Dilim birleştirmeleri yapıştırılır; uçuş öncesi yük testi gerekir.',
              ('Sabit kanat dilimleri bütünleşik iç dil ve yuvalar ile kenetlenir; toplam dört vida ile kilitlenir. Vidaları üstten, somunları alttan takın. Ayrı dilim köprüsü yoktur. Boru kanalları korunur. Kapak, kuyruk ve hareketli yüzey dilimleri yapıştırılır.' if wing_join=='bolted' else 'Kanat, kapak, kuyruk ve hareketli yüzey dilimleri yapıştırılarak birleştirilir. Kanat boru kanalları hizalamayı sağlar; bu modda dilim köprüleri üretilmez.'),
              'Flap, aileron, elevator ve rudder/ruddervator ayrı STL parçalarıdır. Menteşeler satın alınan metal pin/dişli çubukla birleşir. Pim başını kök girintisine oturtup uçtan somunla sabitleyin; basılı diş yoktur. Kontrol kolundaki Ø2 mm bağlantıya servo itme çubuğunu takın. Servo boyutuna uygun yatak, elektrik bağlantısı ve nötr/son konum ayarı gerçek donanımla yapılır.',
              'Flap ve aileron kumanda kolları geniş iç tabanlı ve yuvarlatılmıştır. İki Ø2 mm delikten gerçek servo kolu ve itme çubuğu hareketine uygun olanı seçin. Delik seçimi mekanik oranı değiştirir; her iki uçta sıkışma, servo sınırı ve gerçek donanım boşluğu fiziksel olarak doğrulanır.',
              'Bu kontrol uçuşa elverişlilik veya malzeme dayanımı onayı değildir.']
    if cameras:notes+=['Ortalanmış lens açıklığı ve iki yandan vidalanan kamera yuvası gövde STL parçasına dahildir. Kamera alttan yerleştirilir ve yanlardan vidalanır. Lens, kasa ve vida merkezlerini gerçek kamera üzerinden ölçün.']
    if motors:notes+=['Motorlar ve pervaneler satın alınır; STL yalnız bağlantı taşıyıcılarını içerir. Vida boyunu motor üreticisine göre seçin; sargılara değmemelidir. Girilen ölçüleri gerçek motorla doğrulayın. Motor vidaları motorun metal dişlerine girer; plastik plakada geçme delikleri vardır.']
    if booms and g.get('fuse_preset')!='vtol5':notes+=['Savaşan İHA: bom kökleri kanat soketlerine girer ve enine vida/somunla tutulur. Bom dilimlerinin iç geçmelerini hizalayıp yapıştırın. Ayrı kuyruk köklerini yuvalarına takıp vidalayın. Yatay kuyruk köprüsünü iki bom üzerindeki vida/somunla sabitleyin. İtici motor arka gövde plakası üzerinden monte edilir; gövde dilimlerini yapıştırmadan önce vidalarını içeriden takın.']
    if center_parts:notes+=['Kuyruk orta birleştirme parçası tail_center_joint ayrı STL olarak verilir. İki kuyruk ucunun anahtarlarını bu parçaya geçirin; iki vida ve somunla sabitleyin. Ters V tepesindeki yüzeyler orta düzleme göre birleşir; serbest uçlar birbirine yapıştırılarak bağlantısız bırakılmaz.']
    simulation_body=outer.warp_batch(round_tip) if goliath_gimbal else outer
    if carbon_boom:
        end=carbon_boom['body_end_mm']
        simulation_body=outer^box([-10000,-10000,-10000],[end,10000,10000])
        simulation_envelopes.append(cylinder(carbon_boom['outer_diameter_mm']/2,
            carbon_boom['length_mm'],carbon_boom['start_mm'],[1,0,0]))
    for boom in booms:
        x,y,z=boom['center_mm']
        simulation_envelopes.append(cylinder(boom['outer_diameter_mm']/2,
            boom['end_x_mm']-x,[x,y,z],[1,0,0]))
    simulation_envelopes.extend([simulation_body,root_outer_union])
    simulation_outer=md.Manifold.batch_boolean(simulation_envelopes,md.OpType.Add)
    hatch_manifest = [
        {'part':name, 'bolt_points_mm':[] if hatch_clips else hatch_holes[i*4:(i+1)*4],
         'fastening':'clip' if hatch_clips else 'screws',
         'clips':hatch_clips[i] if hatch_clips else []}
        for i,name in enumerate(('hatch_front','hatch_rear'))
    ]
    if hatch_clips:
        notes.append('Üst kapaklar tırnak ve çentikle takılır. Bir kenarı geçirdikten sonra diğer tırnağı hafifçe esnetin.')
    return parts,{'bed_mm':bed,'fixed_vtol_body':g.get('vtol_fixed_body',False),'design_mode':options.get('designMode','auto'),'wing_join_mode':wing_join,'wall_mm':wall,'clearance_mm':gap,'mesh_tolerance_mm':.02,'screw_mm':screw,'nut_flat_mm':nf,'nut_height_mm':nh,'wing_position_offset_mm':float(g['wing_position_offset'])*1000,'hatch_bolts_mm':[] if hatch_clips else hatch_holes,'service_hatches':hatch_manifest,'interfaces':interfaces,'spar_channels':spar_channels,'controls':controls,'control_servos':control_servos,'wing_root_fairings':root_fairings,'motors':motors,'vtol_joints':vtol_joints,'cameras':cameras,'nose_module':nose_module,'booms':booms,'carbon_boom':carbon_boom,'hover_balance':hover_report,'landing_mounts':landing_mounts,'notes':notes},{'simulation_outer':simulation_outer,'simulation_geometry':g,'simulation_motors':motors,'simulation_mounts':motor_service_parts,'outer':rings,'cavity':cavity_rings,'cuts':cuts['body'],'part_cuts':cuts,'servo_exclusions':servo_exclusions,'obstacles':body_obstacles,'wing_specs':{s['name']:s for s in specs if s['kind']=='wing'},'assembly_parts':parts}


def orthogonal_print(solid,bed,with_transform=False):
    bbox=np.array(solid.bounding_box());size=bbox[3:]-bbox[:3]
    fits=[]
    for perm in itertools.permutations(range(3)):
        dims=size[list(perm)]
        if np.all(dims<=np.array(bed)+.001): fits.append((dims[2],perm))
    if not fits:
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
        vertices=np.asarray(solid.hull().to_mesh().vert_properties)[:,:3].astype(float)
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


def connected_solids(solid):
    """Keep enclosed cavity boundaries with their containing material component."""
    components=[]
    for component in solid.decompose():
        if abs(component.volume())<=1e-8:
            bounds=component.bounding_box()
            if any(bounds[i+3]-bounds[i]<=1e-8 for i in range(3)):
                continue
        components.append(component)
    positive=[c for c in components if c.volume()>0]
    negative=[c for c in components if c.volume()<0]
    groups=[[c] for c in positive]
    for cavity in negative:
        b=np.array(cavity.bounding_box())
        owners=[i for i,c in enumerate(positive)
                if np.all(b[:3]>=np.array(c.bounding_box())[:3]-.001)
                and np.all(b[3:]<=np.array(c.bounding_box())[3:]+.001)]
        if not owners:raise ManufacturingError('Bölünmüş parçanın iç boşluğu eşleştirilemedi.')
        groups[min(owners,key=lambda i:positive[i].volume())].append(cavity)
    return [md.Manifold.compose(g) if len(g)>1 else g[0] for g in groups]


def fit_or_split(solid,bed,depth=0):
    """Partition actual assembly geometry until each connected piece fits rigidly."""
    try:
        printed,transform=orthogonal_print(solid,bed,True)
        return [(solid,printed,transform)]
    except ManufacturingError:
        if depth>=24:raise ManufacturingError('Otomatik bölme sınırına ulaşıldı; yazıcı ölçülerini kontrol edin.')
    b=np.array(solid.bounding_box());size=b[3:]-b[:3]
    axis=int(np.argmax(size));cut=round(float((b[axis]+b[axis+3])/2),2)
    if cut<=b[axis]+.02 or cut>=b[axis+3]-.02:
        raise ManufacturingError('Yazıcı hacmi bu parçayı bölmek için çok küçük.')
    lo=b[:3]-1;hi=b[3:]+1;left_hi=hi.copy();left_hi[axis]=cut
    right_lo=lo.copy();right_lo[axis]=cut
    children=[]
    for fragment in (solid^box(lo,left_hi),solid^box(right_lo,hi)):
        children.extend(connected_solids(fragment))
    result=[]
    for child in children:
        result.extend(fit_or_split(child,bed,depth+1))
    return result


def printable_parts(parts,manifest,rings):
    part_cuts=rings.get('part_cuts',{})
    rings_servo_exclusions=rings.get('servo_exclusions',{})
    wing_specs=rings.get('wing_specs',{})
    assembly_parts=rings.get('assembly_parts',parts)
    manifest['wing_segment_joints']=[]
    manifest['body_segment_joints']=[]
    obstacles=rings.get('obstacles',[])
    cavity_rings=rings['cavity'];cutters=rings['cuts'];rings=rings['outer']
    bed=manifest['bed_mm'];wall=manifest['wall_mm'];gap=manifest['clearance_mm'];result=[]
    maxlen=min(max(bed)-12,200)
    def partition(p, local, seam_shift=0.0):
        segments = []
        b=local.bounding_box();start=b[p.axis];end=b[p.axis+3]
        count=max(1,math.ceil((end-start)/maxlen));step=(end-start)/count
        for i in range(count):
            lo=start if i==0 else round(start+i*step+seam_shift,2)
            hi=end if i==count-1 else round(start+(i+1)*step+seam_shift,2)
            low=[-10000]*3;high=[10000]*3;low[p.axis]=lo;high[p.axis]=hi
            piece=local^box(low,high)
            if p.name=='body' and i<count-1:
                ring=rings[np.argmin(abs(rings[:,0,0]-hi))]
                poly=ring[:,[1,2]]
                area=np.sum(poly[:,0]*np.roll(poly[:,1],-1)-np.roll(poly[:,0],-1)*poly[:,1])
                if area<0:poly=poly[::-1]
                cs=md.CrossSection([poly.tolist()])
                lip_outer=[];lip_inner=[]
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
                following=local^box([hi,-10000,-10000],[hi+6.5,10000,10000])
                sleeve=sleeve-following
                for shift in ([0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]):
                    sleeve=sleeve-following.translate(shift)
                for obstacle in obstacles:
                    sleeve=sleeve-obstacle
                    for direction in ([0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]):
                        sleeve=sleeve-obstacle.translate(direction)
                flange=(cs-cs.offset(-wall-2,circular_segments=32)).extrude(4).transform([[0,0,1,hi-4],[1,0,0,0],[0,1,0,0]])
                attachment=flange+sleeve
                for tool in cutters:
                    attachment=attachment-tool
                piece=piece+attachment
            if p.name.startswith('boom_') and i<count-1:
                boom=next(b for b in manifest['booms'] if b['part']==p.name)
                _,y,z=boom['center_mm'];r=boom['outer_diameter_mm']/2
                lip_r=r-wall-gap/2;inner=max(1,lip_r-wall)
                collar=cylinder(r,3,[hi-3,y,z],[1,0,0])-cylinder(inner,3,[hi-3,y,z],[1,0,0])
                lip=cylinder(lip_r,12.5,[hi-.5,y,z],[1,0,0])-cylinder(inner,12.5,[hi-.5,y,z],[1,0,0])
                following=local^box([hi,-10000,-10000],[hi+13,10000,10000])
                lip=lip-following
                for shift in [[gap/2,0,0],[-gap/2,0,0],[0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]]:
                    lip=lip-following.translate(shift)
                attachment=collar+lip
                for tool in part_cuts.get(p.name,[]):
                    attachment=attachment-tool
                piece=piece+attachment
            name=p.name if count==1 else f'{p.name}_{i+1:02d}of{count:02d}'
            original_piece = piece
            if p.frame is None:
                piece=piece.as_original().set_tolerance(.02).simplify(.02)
            try:
                piece=printable_precision(piece,name)
            except ManufacturingError:
                if p.frame is not None:
                    raise
                piece=printable_precision(original_piece,name)
            check(piece,name,connected=False)
            assembled=piece if p.frame is None else local_transform(piece,p.frame)
            assembled=printable_precision(assembled,name)
            fitted=[]
            for component in connected_solids(assembled):
                if component.volume() > .001:
                    fitted.extend(fit_or_split(component,bed))
            if not fitted:
                check(assembled,name)
            for index,(fragment,printpiece,print_transform) in enumerate(fitted):
                splitname=name if len(fitted)==1 else f'{name}_split{index+1:02d}of{len(fitted):02d}'
                fragment=printable_precision(fragment,splitname)
                printpiece=printable_precision(printpiece,splitname)
                check(printpiece,splitname)
                inverse=print_transform[:,:3].T
                world=np.column_stack([inverse,-inverse@print_transform[:,3]])
                segments.append(Part(splitname,printpiece,family=p.family,assembled=fragment,print_to_world=world))
        return segments

    for p in parts:
        if p.name.startswith('body_gimbal_'):
            printed,transform=orthogonal_print(p.solid,bed,True)
            printed=printable_precision(printed,p.name)
            inverse=transform[:,:3].T
            result.append(Part(p.name,printed,family=p.family,assembled=p.solid,
                               print_to_world=np.column_stack([inverse,-inverse@transform[:,3]])))
            continue
        if p.name in wing_specs and manifest.get('wing_join_mode')=='bolted':
            from backend.wing_segments import segmented_wing
            result.extend(segmented_wing(p,wing_specs[p.name],manifest,assembly_parts,part_cuts.get(p.name,[]),
                rings_servo_exclusions.get(p.name,[])))
            continue
        local=p.solid
        if p.frame is not None:
            mat=p.frame; inv=np.linalg.inv(mat[:,:3]);local=local.transform(np.column_stack([inv,-inv@mat[:,3]]).tolist())
        if p.frame is not None:local=local.set_tolerance(.001)
        if p.name == 'tail_elevator_one_piece':
            try:
                printed, transform = orthogonal_print(local,bed,True)
            except ManufacturingError as error:
                raise ManufacturingError('Tek parça irtifa dümeni yazıcı hacmine sığmıyor. Daha büyük yazıcı hacmi seçin veya kuyruk açıklığını azaltın.') from error
            printed = printable_precision(printed,p.name)
            inverse = transform[:,:3].T
            result.append(Part(p.name,printed,family=p.family,assembled=local,
                               print_to_world=np.column_stack([inverse,-inverse@transform[:,3]])))
            continue
        bounds=local.bounding_box()
        shifts=(0.0, .37, -.37, 1.1, -1.1, 2.3, -2.3) if bounds[p.axis+3]-bounds[p.axis]>maxlen else (0.0,)
        for seam_shift in shifts:
            try:
                segments = partition(p, local, seam_shift)
            except ManufacturingError as error:
                precision_failure = any(text in str(error) for text in (
                    'STL hassasiyeti', 'açık veya çoklu kenar', 'sıfır alanlı',
                ))
                if not precision_failure or seam_shift == shifts[-1]:
                    raise
            else:
                result.extend(segments)
                break
    if manifest.get('carbon_boom') and manifest['carbon_boom'].get('layout')!='akin':
        from backend.body_braces import neck_braces
        result=neck_braces(result,manifest)
    from backend.root_braces import root_braces
    result=root_braces(result,manifest,wing_specs,rings,part_cuts)
    measure_printed_controls(parts,result,manifest['controls'])
    return result


def measure_printed_controls(parts,printed,controls):
    """Measure the assembled silhouette of the actual export fragments."""
    sources={part.name:part for part in parts}
    fragments={}
    for part in printed:
        name=re.sub(r'(?:_(?:split)?\d+of\d+)+$', '', part.name)
        fragments.setdefault(name,[]).append(part)
    chord=np.array([1.,0.,0.])
    for control in controls:
        name=control['part']
        source=sources[name]
        span=np.array([0.,0.,1.])
        if source.family=='tail' and source.frame is not None:
            span=source.frame[:,2].copy()
            span[0]=0.
            span/=np.linalg.norm(span)
        projection=np.stack([chord,span,np.cross(chord,span)])
        outlines=[]
        for fragment in fragments.get(name,[]):
            transform=projection@fragment.print_to_world
            polygons=fragment.solid.transform(transform.tolist()).project().to_polygons()
            outlines.append(md.CrossSection(polygons,md.FillRule.Positive))
        if outlines:
            area=md.CrossSection.batch_boolean(outlines,md.OpType.Add).area()
            control['printed_planform_area_m2']=round(area/1e6,8)


def binary_stl(solid, connected=True):
    v,f=check(solid,'STL',connected=connected);tri=v[f]
    normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);normals/=np.linalg.norm(normals,axis=1)[:,None]
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    arr=np.zeros(len(f),dtype=dtype);arr['normal']=normals;arr['vertices']=tri
    return b'ZETA mm manifold validated'.ljust(80,b'\0')+struct.pack('<I',len(f))+arr.tobytes()


def preview(parts,manifest,rings,printed=None,*,packed=False):
    if printed is None:printed=printable_parts(parts,manifest,rings)
    meshes=[]
    for part in printed:
        mesh=part.solid.to_mesh()
        vertices=np.asarray(mesh.vert_properties)[:,:3]@part.print_to_world[:,:3].T+part.print_to_world[:,3]
        if packed:
            positions=b64encode(np.asarray(vertices/1000,dtype='<f4').tobytes()).decode('ascii')
            indices=b64encode(np.asarray(mesh.tri_verts,dtype='<u4').tobytes()).decode('ascii')
            meshes.append({'name':part.name,'positions_m_f32':positions,'indices_u32':indices})
        else:
            meshes.append({'name':part.name,'vertices':vertices.reshape(-1).tolist(),'faces':np.asarray(mesh.tri_verts).reshape(-1).tolist()})
    return {'parts':meshes,'manifest':manifest,'summary':f'{len(printed)} STL parçası montaj konumunda gösteriliyor; delikler, kapaklar ve dilim bağlantıları dahil.'}


def package(parts,manifest,rings,filter='all',printed=None):
    control_names={c['part'] for c in manifest.get('controls',[])}
    selected=[p for p in parts if filter=='all' or (filter=='controls' and p.name in control_names) or (filter=='fuselage' and p.family in ['body','hatch']) or p.family==filter]
    if not selected: raise ManufacturingError('İstenen parça bulunamadı.')
    if printed is None:printed=printable_parts(parts,manifest,rings)
    printed=[p for p in printed if filter=='all' or (filter=='controls' and any(p.name==n or p.name.startswith(n+'_') for n in control_names)) or (filter=='fuselage' and p.family in ['body','hatch']) or p.family==filter]
    manifest=dict(manifest)
    manifest['motors']=[m for m in manifest.get('motors',[]) if m['parent'] in {p.name for p in selected}]
    manifest['controls']=[c for c in manifest.get('controls',[]) if c['part'] in {p.name for p in selected}]
    manifest['parts']=[]
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        for p in printed:
            filename=p.name+'.stl';z.writestr(filename,binary_stl(p.solid))
            b=np.array(p.solid.bounding_box());manifest['parts'].append({'file':filename,'bounds_mm':b.tolist(),'size_mm':(b[3:]-b[:3]).tolist(),'volume_mm3':p.solid.volume(),'closed':True,'connected':True})
        gap=manifest['clearance_mm']
        key=box([0,0,0],[12,6,20])+box([-4,-2,0],[16,8,3])
        socket=box([0,0,0],[18,12,24])-box([3-gap/2,3-gap/2,4],[15+gap/2,9+gap/2,25])
        z.writestr('fit_test_key.stl',binary_stl(orthogonal_print(key,manifest['bed_mm'])))
        z.writestr('fit_test_socket.stl',binary_stl(orthogonal_print(socket,manifest['bed_mm'])))
        integral=next((j for j in manifest.get('wing_segment_joints',[])
                       if j.get('type')=='internal_tongue'),None)
        named={p.name:p for p in printed}
        if integral and all(integral[k] in named for k in ('male','female')):
            bounds=np.array(integral['support_bounds_world_mm'])
            region=box(bounds[:3]-.1,bounds[3:]+.1)
            for role in ('male','female'):
                label='wing_joint_test_'+role
                coupon=printable_precision(named[integral[role]].assembled^region,label)
                check(coupon,label)
                z.writestr(label+'.stl',binary_stl(printable_precision(orthogonal_print(coupon,manifest['bed_mm']),label)))
        if manifest['controls']:
            pin=manifest['controls'][0]['pin_diameter_mm'];radius=max(3,pin/2+gap/2+1.2)
            center_z=radius+3;fixed=box([0,0,0],[24,4,3]);moving=md.Manifold()
            for lo,hi in [(2,8),(14+2*gap,20+2*gap)]:
                fixed=fixed+cylinder(radius,hi-lo,[lo,5,center_z],[1,0,0])+box([lo,2,2],[hi,5,center_z])
            lo=8+gap;hi=14+gap
            moving=cylinder(radius,hi-lo,[lo,5,center_z],[1,0,0])+box([lo,5,center_z-1.2],[hi,14,center_z+1.2])
            bore=cylinder((pin+gap)/2,26,[-1,5,center_z],[1,0,0])
            for label,solid in [('hinge_fit_fixed',fixed-bore),('hinge_fit_moving',moving-bore)]:
                z.writestr(label+'.stl',binary_stl(orthogonal_print(solid,manifest['bed_mm'])))
        z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        text='ZETA MONTAJ VE BASKI\n\nModel boyutu korunur; parçalar yazıcı hacmine göre otomatik bölünür. Dosya adındaki split numaraları ek bölümleri gösterir. Vidalı kanat modunda iç dil ve yuva eşleştirmelerini aşağıda izleyin. Yapıştırmalı modda ve diğer parçaların ek kesimlerinde düz yüzeyleri hizalayıp yapıştırın. Önizlemedeki montaj konumlarını izleyerek bu yüzeyleri hizalayıp yapıştırın.\n\n'+ '\n'.join(manifest['notes'])+'\n\n'
        for joint in manifest.get('body_segment_joints',[]):
            text+=f"{joint['bridge']}: {' + '.join(joint['segments'])} boru girişindeki arka gövde dilimini önündeki ana gövde dilimine bağlar. Alt dış ceplere somunları yerleştirin. Uzun köprüyü gövdenin içinden birleşimin iki yanına oturtup iç taraftan iki M{joint['screw_diameter_mm']:g} vida ile sabitleyin. Vida boyunu gerçek baskıdaki sıkma uzunluğuna göre seçin; yapıştırma yüzey sızdırmazlığı için ek olarak kullanılabilir. Karbon boru delinmez.\n"
        for joint in manifest.get('wing_root_braces',[]):
            text+=f"{joint['bridge']}: {' + '.join(joint['segments'])} arasındaki gövde-kanat kök birleşimini içeriden bağlar. Alt dış ceplere somunları yerleştirin; köprüyü kök açıklığından içerideki yuvasına yerleştirin; üstteki erişim deliklerinden iki M{joint['screw_diameter_mm']:g} vida ile sıkın. Kanadı sökmek için bu vidaları ve mevcut kök pimini çıkarın. Vida boyunu gerçek baskıdaki sıkma uzunluğuna göre seçin.\n"
        for joint in manifest.get('wing_segment_joints',[]):
            text+=f"{joint['male']} içindeki bütünleşik dili {joint['female']} iç yuvasına birleşim doğrultusunda sürün. Ayrı köprü parçası yoktur. {len(joint['holes'])} adet M{joint['screw_diameter_mm']:g} kilitleme vidası üst erişim deliklerinden, aynı sayıda {joint['nut_flat_mm']:g} mm ağız / {joint['nut_height_mm']:g} mm kalınlık somun alttan takılır. Önce veter yönündeki parçaları, sonra açıklık yönündeki sıraları birleştirin; karbon boruyu hizalanmış kanallardan geçirin. Vidaları tüm parçalar oturduktan sonra sıkın. Vida boyunu gerçek baskı ve donanımla doğrulayın.\n"
        for control in manifest['controls']:
            text+=f"{control['part']}: ayrı {control['kind']} parçası. Metal pim/mil Ø{control['pin_diameter_mm']:g} mm; delik Ø{control['pin_hole_mm']:g} mm; gerekli mil boyu yaklaşık {control['pin_length_mm']:.1f} mm. İzin verilen geometrik hareket ±{control['travel_deg'][1]:g}°. Pim, vida ve somunlar satın alınır.\n"
            text+='Dilimli kontrol parçalarını hizalayıp yapıştırın. Sabit ve hareketli menteşe gözlerini sırayla hizalayın; pimi uç taraftan geçirin. Kök başını/somununu girintiye oturtup diğer uçta uygun somunla sabitleyin. Gövdeye takmadan önce pim erişimini tamamlayın. Ø2 mm kontrol kolu deliğine servo itme çubuğunu bağlayın. Bomun iki yanındaki flap bölümleri aynı eksende tek mil paylaşır; kollarını gerçek servo yerleşimine göre kumanda edin.\n'
        for motor in manifest['motors']:
            if motor.get('out_axis'):
                text+=f"{motor['name']}: dikey referans konumlu VTOL tablası; motor çapı {motor['motor_diameter_mm']:g} mm, motor uzunluğu {motor['motor_length_mm']:g} mm, vida geçme deliği {motor['hole_diameter_mm']:g} mm, merkez açıklığı {motor['center_bore_mm']:g} mm.\n"
                continue
            label=('Gövde arkası / itici motor' if motor['axis'][0]<0 else 'Gövde burnu') if motor['parent']=='body' else {'wing_right':'Sağ kanat','wing_left':'Sol kanat'}.get(motor['parent'],motor['parent'])
            text+=f"{label} motor montajı: motor Ø{motor['motor_diameter_mm']:g} × {motor['motor_length_mm']:g} mm; plaka {motor['plate_thickness_mm']:g} mm; vida geçme deliği Ø{motor['hole_diameter_mm']:g} mm; orta delik Ø{motor['center_bore_mm']:g} mm.\n"
            text+='Motor vidalarını gövdenin/taşıyıcının içinden plakaya geçirin. Gövde motorunu dilimleri yapıştırmadan önce monte edin. Ayrı kablo deliğinden kabloları geçirin; motor metal dişine giren vida boyunu üretici ölçüsüyle kontrol edin.\n'
            if motor.get('service_cover'):text+='Kanat motoru: alt servis kapağını çıkarın, içeriden motor vidalarını takıp sıkın. Kapak yuvalarına iki M3 altıgen somun yerleştirin; kapağı iki M3 vida ile sabitleyin. Kapak ayrı STL parçasıdır. Vida boyunu basılan kapağa göre seçin.\n'
        text+='1. fit_test_key ve fit_test_socket dosyalarını basın. İç geçmeli kanat paketinde wing_joint_test_male ve wing_joint_test_female gerçek birleşim numunelerini de basıp vida ve somunla deneyin. Menteşe içeren pakette hinge_fit_fixed ve hinge_fit_moving kuponlarını da basıp gerçek metal pimle deneyin. Sıkı/geçmeyen veya gevşek sonuçta uygulamadaki geçme boşluğunu değiştirin.\n2. STL dosyaları mm birimindedir; her parça Z=0 tabanına yerleştirilmiştir. Destek, brim ve katman ayarlarını dilimleyicide kontrol edin.\n3. Gövde numaraları burundan kuyruğa ilerler. İç bilezikler sonraki parçada hizalama sağlar; bu birleşimleri yapıştırın.\n4. İki bağımsız servis kapağının her birinde dört vida deliği ve sürekli alt oturma çerçevesi vardır; karşı somunlara gövde içinden erişilir.\n5. Kanadı gövdedeki profil yuvasına oturtup tek metal pim ve emniyet klipsiyle sabitleyin. Kuyruk anahtarlarını karşı soketlerine takın; vida ve somunlarla bağlayın.\n6. Metal pimleri ve gerçek servo/motor donanımını monte edin. Mekanik hareket, yük ve titreşim testlerini gerçek basılı parçalarla doğrulayın.\n'
        z.writestr('MONTAJ.txt',text)
    return buf.getvalue()


def assembled_stl(parts):
    """Serialize closed assembly shells in design coordinates, in millimetres.

    Preserve clearances and component boundaries; simulation joints/materials
    are assigned by the importing application. Never apply print transforms.
    """
    chunks=[]
    for part in parts:
        solid=printable_precision(part.solid,part.name)
        chunks.append(binary_stl(solid,connected=False))
    count=sum(struct.unpack('<I',chunk[80:84])[0] for chunk in chunks)
    return b'ZETA assembled model; units mm'.ljust(80,b'\0')+struct.pack('<I',count)+b''.join(chunk[84:] for chunk in chunks)


def simulation_envelope(rings):
    solid=rings['simulation_outer']
    if 'simulation_geometry' in rings:
        from backend.simulation_gear import landing_gear
        gear,_=landing_gear(solid,rings['outer'],rings['simulation_geometry'],rings['simulation_motors'])
        solid+=gear
        from backend.simulation_propulsion import propulsion
        solid=md.Manifold.batch_boolean([solid,*(p.solid for p in rings.get('simulation_mounts',[])),*propulsion(rings['simulation_motors'])],md.OpType.Add)
    return solid


def simulation_stl(rings):
    """External envelope in metres, nose +X, up +Y (right-handed).

    Design coordinates are millimetres with the nose towards -X and +Y up.
    Apply a proper rotation, not an axis swap/reflection or a print orientation.
    Keep longitudinal/lateral origins. With wheels, set their contact plane
    to Y=0 to avoid spawning the landing gear beneath the ground.
    """
    solid=simulation_envelope(rings).as_original().set_tolerance(.02).simplify(.02)
    ground=float(solid.bounding_box()[1]) if 'simulation_geometry' in rings else 0.
    header=b'ZETA simulation; units m; nose +X; up +Y'
    header+=b'; wheel ground Y=0' if 'simulation_geometry' in rings else b'; origin unchanged'
    return simulation_mesh_stl(solid, ground, header)


def merkusim_stl(rings):
    """Airframe only, in the design frame recognized by Merkusim's ZETA importer."""
    skin = rings['simulation_outer'].as_original().set_tolerance(.02).simplify(.02)
    skin = printable_precision(skin, 'Merkusim gövdesi')
    content = binary_stl(skin, connected=False)
    g = rings['simulation_geometry']
    wing_ac = g.get('wing_ac_x', g['wing_x_pos'] + .25 * g['mac'])
    cg_x_mm = (wing_ac - .25 * g['mac'] + g['cg_position']) * 1000
    header = f'ZETA Merkusim airframe; units mm; nose -X; up +Y; cg_x_mm={cg_x_mm:.6g}'
    return header.encode('ascii').ljust(80, b'\0') + content[80:]


def simulation_mesh_stl(solid, ground, header):
    solid=solid.transform([[-1,0,0,0],[0,1,0,-ground],[0,0,-1,0]])
    solid=printable_precision(solid,'Simülasyon dış yüzeyi')
    content=binary_stl(solid,connected=False)
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    triangles=np.frombuffer(content,offset=84,dtype=dtype).copy()
    triangles['vertices']*=.001
    tri=triangles['vertices'];vertices=tri.reshape(-1,3)
    faces=np.arange(len(vertices)).reshape(-1,3)
    area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
    if np.any(area==0) or not welded_mesh_closed(vertices,faces):
        raise ManufacturingError('Simülasyon STL: metre dönüşümünde yüzey hassasiyeti kayboldu.')
    return header.ljust(80,b'\0')+content[80:84]+triangles.tobytes()
