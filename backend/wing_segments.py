"""Recessed, removable splice bridges for printable fixed-wing tiles.

Each seam has four screws in two narrow keyed bridges or one wider bridge. Nuts load from the lower skin; drivers approach from the upper skin.
The original spar bores, root hardware and control travel are exclusion zones.
These are geometric checks, not a strength or flight certification.
"""
import math
import itertools

import manifold3d as md
import numpy as np


def segmented_wing(part, spec, manifest, all_parts, cutters):
    from backend.manufacturing import (Part, ManufacturingError, box, cylinder,
        profile, local_transform, orthogonal_print, printable_precision, check,
        connected_solids)
    from backend.control_joints import rotate_about

    mat=part.frame
    inverse=np.linalg.inv(mat[:,:3])
    inv=np.column_stack([inverse,-inverse@mat[:,3]])
    local=local_transform(part.solid,inv)
    bounds=np.array(local.bounding_box());bed=manifest['bed_mm']
    gap=manifest['clearance_mm'];screw=manifest['screw_mm']
    flat=manifest['nut_flat_mm'];nut_height=manifest['nut_height_mm']
    wall=manifest['wall_mm']
    chord=spec['chord']*1000;tip=spec['tipChord']*1000
    from backend.manufacturing import panel_frame
    _,span=panel_frame(spec)
    envelope=profile(spec['coords'],chord).extrude(span,scale_top=[tip/chord]*2)
    world=lambda solid:local_transform(solid,mat)
    error=lambda reason:ManufacturingError(
        f'{part.name}: kanat dilim bağlantısı oluşturulamadı: {reason}. '
        'Daha kalın kanat profili veya daha büyük veter seçin; vida/somun '
        'ölçülerini gerçek donanımınıza göre kontrol edin. Yazıcı ölçülerini olduğundan büyük girmeyin.')
    if flat-screw-gap<.8:
        raise error('somun ağız ölçüsü vida deliğinin çevresinde yeterli yatak bırakmıyor')

    # Plan all tiles first: no late anonymous split may destroy a joint.
    nx=1;nz=max(1,math.ceil((bounds[5]-bounds[2])/min(max(bed)-12,200)))
    for attempt in range(18):
        xs=np.linspace(bounds[0],bounds[3],nx+1);zs=np.linspace(bounds[2],bounds[5],nz+1)
        # A chordwise seam must leave room for its bridge on either side of a
        # continuous spar. Shift the cutting plane, rather than filling the bore.
        for i in range(1,nx):
            nominal=xs[i];reach=min(30,(bounds[3]-bounds[0])/nx*.2)
            options=sorted(np.linspace(nominal-reach,nominal+reach,61),key=lambda v:abs(v-nominal))
            for value in options:
                if all(abs(value-chord*c['chord_position']) >
                       c['hole_diameter_mm']/2+max(14.,flat+6)+max(2.,wall)+1
                       for c in manifest.get('spar_channels',[]) if c['part']==part.name):
                    xs[i]=value;break
        # Hinge knuckles and boom saddles may overhang their attachment. A cut
        # through that overhang creates an orphan even if its shell fits the bed.
        # Move the seam to keep the original fixed wing connected on both sides.
        for i in range(1,nz):
            nominal=zs[i]
            for delta in [0,-2,2,-4,4,-8,8,-12,12,-20,20]:
                value=round(float(nominal+delta),2)
                if value-zs[i-1]<35 or zs[i+1]-value<35:continue
                halves=[local^box([-10000,-10000,zs[i-1]],[10000,10000,value]),
                        local^box([-10000,-10000,value],[10000,10000,zs[i+1]])]
                if all(sum(c.volume()>.001 for c in connected_solids(h))==1 for h in halves):
                    zs[i]=value;break
        xs[1:-1]=np.round(xs[1:-1],2);zs[1:-1]=np.round(zs[1:-1],2)
        tiles={};failed=[]
        for ix in range(nx):
            for iz in range(nz):
                region=box([xs[ix],-10000,zs[iz]],[xs[ix+1],10000,zs[iz+1]])
                solid=local^region
                if solid.is_empty():continue
                tiles[ix,iz]={'solid':solid,'region':region}
                try:orthogonal_print(world(solid),bed)
                except ManufacturingError:failed.append((ix,iz))
        if not failed:break
        dx=(bounds[3]-bounds[0])/nx;dz=(bounds[5]-bounds[2])/nz
        if dx>=dz:nx+=1
        else:nz+=1
    else:raise error('yazıcı hacmi için bağlantılı dilim planı bulunamadı')

    if not tiles:raise error('sabit kanat yüzeyi boş')
    # Tapered tips often fit without the chordwise cut needed at the root.
    # Do not keep a thin, unnecessary trailing-edge tile merely to preserve a grid.
    for iz in range(nz):
        keys=[key for key in tiles if key[1]==iz]
        if len(keys)<2:continue
        region=box([xs[0],-10000,zs[iz]],[xs[-1],10000,zs[iz+1]])
        solid=local^region
        try:orthogonal_print(world(solid),bed)
        except ManufacturingError:continue
        for key in keys:del tiles[key]
        tiles[0,iz]={'solid':solid,'region':region}
    tiles=dict(sorted(tiles.items(),key=lambda item:(item[0][1],item[0][0])))
    for index,tile in enumerate(tiles.values(),1):
        tile['name']=part.name if len(tiles)==1 else f'{part.name}_{index:02d}of{len(tiles):02d}'

    # Intersections use broad-phase bounds, then actual CSG volumes.
    forbidden=[]
    def protect(solid):
        if not solid.is_empty():forbidden.append((solid,np.array(solid.bounding_box())))
    for tool in cutters:protect(local_transform(tool,inv))
    controls={c['part']:c for c in manifest.get('controls',[]) if c['parent']==part.name}
    for other in all_parts:
        if other.name==part.name:continue
        protect(local_transform(other.solid,inv))
        if other.name in controls:
            c=controls[other.name]
            for angle in c['checked_angles_deg']:
                if angle:protect(local_transform(rotate_about(other.solid,
                    np.array(c['hinge_point_mm']),np.array(c['hinge_axis']),angle),inv))
    def clashes(solid):
        b=np.array(solid.bounding_box())
        return any(np.all(b[:3]<ob[3:]) and np.all(b[3:]>ob[:3]) and
                   (solid^obstacle).volume()>.005 for obstacle,ob in forbidden)

    bridges=[];reports=[];occupied=[]
    width=max(12.,flat+2*wall+3)
    half_length=max(14.,flat+6)
    pitch=half_length-6
    thickness=max(3.,screw*.9)
    margin=max(2.,wall)
    narrow_width=width
    rows=[0.]

    def candidate(axis,cut,along,a,b):
        # axis=2 is a spanwise seam; axis=0 is a chordwise seam.
        x,z=(along,cut) if axis==2 else (cut,along)
        hx,hz=(width/2,half_length) if axis==2 else (half_length,width/2)
        footprint=box([x-hx-margin,-10000,z-hz-margin],[x+hx+margin,10000,z+hz+margin])
        reinforcement=envelope^footprint
        if reinforcement.is_empty():return None
        # All four footprint corners must have sufficient actual airfoil depth.
        tops=[];bottoms=[]
        for px in [x-hx-margin,x+hx+margin]:
            for pz in [z-hz-margin,z+hz+margin]:
                probe=envelope^box([px-.05,-10000,pz-.05],[px+.05,10000,pz+.05])
                if probe.is_empty():return None
                bb=probe.bounding_box();tops.append(bb[4]);bottoms.append(bb[1])
        level=min(tops)-thickness-gap/2
        nut_top=max(bottoms)+nut_height+.4
        if level-nut_top<max(2.,wall+gap):return None
        # Keep supports inside these two tiles and away from adjacent seams.
        if (reinforcement-(a['region']+b['region'])).volume()>.005:return None
        if clashes(reinforcement):return None
        if any((reinforcement^used).volume()>.005 for used in occupied):return None
        # Both original skins must anchor each side of the support.
        for tile in (a,b):
            if (reinforcement^tile['solid']).volume()<width*wall*2:return None
        recess=box([x-hx-gap/2,level,z-hz-gap/2],[x+hx+gap/2,10000,z+hz+gap/2])
        plate=envelope^box([x-hx,level+gap/2,z-hz],[x+hx,10000,z+hz])
        base=reinforcement-recess
        # Circular physical holes: never shear drill shapes with the panel.
        drill_tools=[];nuts=[];holes=[]
        up=mat[:,1]/np.linalg.norm(mat[:,1])
        for offset,row in itertools.product([-pitch,pitch],rows):
            cx,cz=(x+row,z+offset) if axis==2 else (x+offset,z+row)
            top=mat[:,:3]@np.array([cx,max(tops)+2,cz])+mat[:,3]
            bottom=mat[:,:3]@np.array([cx,min(bottoms)-2,cz])+mat[:,3]
            if clashes(local_transform(cylinder(max(3,screw),60,top,up),inv)):
                return None
            if clashes(local_transform(cylinder(flat/2+1,40,bottom,-up),inv)):
                return None
            drill=local_transform(cylinder((screw+gap)/2,200,top+up*20,-up),inv)
            drill_tools.append(drill)
            # Hex pocket opens all the way through the lower skin. The seat is flat.
            seat=mat[:,:3]@np.array([cx,nut_top,cz])+mat[:,3]
            nut=local_transform(cylinder((flat+gap)/math.sqrt(3),200,seat,-up,sides=6),inv)
            nuts.append(nut)
            holes.append({'point_mm':top.tolist(),'axis':up.tolist(),
                'nut_seat_mm':seat.tolist(),'hole_diameter_mm':screw+gap,
                'max_grip_mm':float(max(tops)-nut_top+nut_height)})
        for tool in drill_tools:
            base=base-tool;plate=plate-tool
        for tool in nuts:base=base-tool
        if len(connected_solids(plate))!=1:return None
        proposals=[]
        for tile in (a,b):
            proposed=(tile['solid']+(base^tile['region']))-recess
            for tool in drill_tools+nuts:proposed=proposed-tool
            components=connected_solids(proposed)
            material=[c for c in components if c.volume()>.001]
            if len(material)!=1 or sum(c.volume() for c in components if c.volume()<=.001)>.01:
                return None
            proposed=material[0]
            if (proposed^plate).volume()>.005:return None
            proposals.append(proposed)
        return plate,proposals,holes,reinforcement

    seams=[]
    for a,b in itertools.combinations(tiles.values(),2):
        ba=np.array(a['region'].bounding_box());bb=np.array(b['region'].bounding_box())
        for axis,along_axis in ((2,0),(0,2)):
            first,second=a,b
            if abs(ba[axis+3]-bb[axis])<.001:cut=ba[axis+3]
            elif abs(bb[axis+3]-ba[axis])<.001:cut=bb[axis+3];first,second=b,a
            else:continue
            lo=max(ba[along_axis],bb[along_axis]);hi=min(ba[along_axis+3],bb[along_axis+3])
            if hi-lo>1:seams.append((axis,cut,lo,hi,first,second))
    for seam_index,(axis,cut,lo,hi,a,b) in enumerate(seams,1):
        # Ignore tiles which are neighbours in the grid but share no material.
        low=[-10000]*3;high=[10000]*3;low[axis]=cut-.1;high[axis]=cut+.1
        along_axis=0 if axis==2 else 2
        low[along_axis]=lo;high[along_axis]=hi
        if (local^box(low,high)^ (a['region']+b['region'])).is_empty():continue
        original_a,original_b=a['solid'],b['solid']
        checkpoint=(len(bridges),len(reports),len(occupied))
        success=False
        # Two narrow bridges are preferred. A single wider keyed bridge with
        # four screws serves a narrow tile without removing the second fastener pair.
        for wide in (False,True):
            a['solid'],b['solid']=original_a,original_b
            del bridges[checkpoint[0]:];del reports[checkpoint[1]:];del occupied[checkpoint[2]:]
            spacing=flat+gap+2
            width=narrow_width+spacing if wide else narrow_width
            rows=[-spacing/2,spacing/2] if wide else [0.]
            required=1 if wide else 2
            chosen=[]
            samples=np.linspace(lo+width/2+margin,hi-width/2-margin,49)
            samples=[samples[i] for pair in zip(range(25),range(48,24,-1)) for i in pair]+[samples[24]]
            for along in samples:
                if any(abs(along-prev)<width+2*margin+2 for prev in chosen):continue
                found=candidate(axis,cut,float(along),a,b)
                if found is None:continue
                plate,proposals,holes,reinforcement=found
                chosen.append(float(along));a['solid'],b['solid']=proposals
                name=f'{part.name}_join_{seam_index:02d}_bridge_{len(chosen)}'
                bridges.append((name,plate));occupied.append(reinforcement)
                reports.append({'id':name,'parent':part.name,'bridge':name,
                    'segments':[a['name'],b['name']],'seam':seam_index,'axis_local':axis,
                    'cut_mm':float(cut),'screw_diameter_mm':screw,'nut_flat_mm':flat,
                    'nut_height_mm':nut_height,'clearance_mm':gap,'holes':holes,
                    'support_bounds_world_mm':list(world(reinforcement).bounding_box()),
                    'assembly':'bridge_from_upper_skin; nuts_from_lower_skin; screws_from_upper_skin'})
                if len(chosen)==required:break
            if len(chosen)==required:
                success=True;break
        width=narrow_width;rows=[0.]
        if not success:raise error(f'{seam_index}. birleşimde dört vida için yeterli engelsiz kalınlık yok')

    # No tile can silently escape with only a butt face and no fastening path.
    names={t['name'] for t in tiles.values()}
    reached={next(iter(names))}
    while True:
        expanded=reached|{name for j in reports if reached.intersection(j['segments'])
                          for name in j['segments']}
        if expanded==reached:break
        reached=expanded
    if reached!=names:raise error('tüm kanat dilimleri vidalı bağlantı ağına bağlanamadı')

    result=[]
    for name,solid in [(t['name'],t['solid']) for t in tiles.values()]+bridges:
        solid=printable_precision(world(solid),name)
        check(solid,name)
        printed,transform=orthogonal_print(solid,bed,True)
        printed=printable_precision(printed,name);check(printed,name)
        invrot=transform[:,:3].T
        result.append(Part(name,printed,family=part.family,assembled=solid,
            print_to_world=np.column_stack([invrot,-invrot@transform[:,3]])))
    manifest.setdefault('wing_segment_joints',[]).extend(reports)
    return result
