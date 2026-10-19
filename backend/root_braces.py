"""Removable internal straps across the fixed cuff / detachable wing seam."""
import math
from itertools import product
import numpy as np
import manifold3d as md
from backend.manufacturing import (Part, box, cylinder, panel_frame,
    printable_precision, check, orthogonal_print, ManufacturingError, profile, local_transform, mesh_solid)


def root_braces(parts, manifest, specs, body_rings, cutters):
    result=list(parts); manifest['wing_root_braces']=[]
    body_envelope=mesh_solid(body_rings,body_rings[0][:,[1,2]])
    gap=manifest['clearance_mm']; screw=manifest['screw_mm']
    flat=manifest['nut_flat_mm']; nh=manifest['nut_height_mm']
    boss_r=max(7.,flat/math.sqrt(3)+gap+2.5)
    strap_thickness=max(5.,screw*1.6)
    strap_radius=max(8.,boss_r+1.)
    def fitted(name,solid,family):
        solid=printable_precision(solid,name);check(solid,name)
        printed,t=orthogonal_print(solid,manifest['bed_mm'],True)
        printed=printable_precision(printed,name);check(printed,name)
        inv=t[:,:3].T
        return Part(name,printed,family=family,assembled=solid,
                    print_to_world=np.column_stack([inv,-inv@t[:,3]]))
    for joint in manifest.get('wing_root_fairings',[]):
        name=joint['part']; spec=specs[name]; mat,length=panel_frame(spec)
        trim=joint['root_plane_mm']; depth=joint['seat_depth_mm']
        section=profile(spec['coords'],spec['chord']*1000)
        envelope=local_transform(section.extrude(length,scale_top=[spec['tipChord']/spec['chord']]*2),mat)
        candidates=[[(i,p) for i,p in enumerate(result) if p.name.startswith('body')],
                    [(i,p) for i,p in enumerate(result) if p.family=='wing' and (p.name==name or p.name.startswith(name+'_') and '_join_' not in p.name)]]
        if not all(candidates):continue
        bridge='wing_root_brace_'+name
        solution=None;last_error='uygun yer bulunamadı'
        # Search the actual hollow shell, keeping clear of the main spar,
        # rear spar and the existing root pin. No change to their bores.
        for fraction,inset_span in product([.63,.65,.28,.32],[18,10,6]):
            anchors=[]; owners=[]; contacts=[]; shell_floor=[]
            for span,group in zip([trim-inset_span,trim+depth+18],candidates):
                scale=1+(spec['tipChord']/spec['chord']-1)*span/length
                pt=mat[:,:3]@np.array([fraction*spec['chord']*1000*scale,0,span])+mat[:,3]
                region=box(pt+[-boss_r,-10000,-boss_r],pt+[boss_r,10000,boss_r])
                floor=float((envelope^region).bounding_box()[1])
                skin_region=region^box([-10000,floor-5,-10000],[10000,floor+4,10000])
                hits=[(float((p.assembled^skin_region).bounding_box()[1]),i) for i,p in group if not (p.assembled^skin_region).is_empty()]
                if not hits:break
                cy,i=min(hits,key=lambda h:abs(h[0]-floor));anchors.append(pt);owners.append(i);contacts.append(cy)
                shell_floor.append(floor)
            if len(anchors)!=2:continue
            for rise in [5,7,9,11]:
                bottom=max(shell_floor)+rise; top=bottom+strap_thickness
                caps=[cylinder(strap_radius,strap_thickness,[pt[0],bottom,pt[2]],[0,1,0]) for pt in anchors]
                strap=md.Manifold.batch_hull(caps)
                if (strap-envelope).volume()>.1:continue
                recess=strap
                for shift in [[gap/2,0,0],[-gap/2,0,0],[0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]]:
                    recess+=strap.translate(shift)
                proposals=[];holes=[];removals=[]
                for i,pt,cy in zip(owners,anchors,contacts):
                    base=cy-1
                    boss=cylinder(boss_r,bottom-gap/2-base,[pt[0],base,pt[2]],[0,1,0])
                    bore=cylinder((screw+gap)/2,top-base+2,[pt[0],top+1,pt[2]],[0,-1,0])
                    pocket=cylinder((flat+gap)/math.sqrt(3),nh+gap+.1,[pt[0],base-.1,pt[2]],[0,1,0],sides=6)
                    boss=boss^(body_envelope+envelope if i==owners[0] else envelope)
                    access_r=screw+gap
                    access=cylinder(access_r,10000,[pt[0],top+gap/2,pt[2]],[0,1,0])
                    for tool in cutters.get('body' if i==owners[0] else name,[]):boss-=tool
                    solid=(result[i].assembled+boss)-recess-bore-pocket-access
                    # The opposite shell cannot be bridged by a fixed boss.
                    other=owners[1] if i==owners[0] else owners[0]
                    if (solid^result[other].assembled).volume()>.1:break
                    proposals.append((i,solid));strap-=bore
                    removed=result[i].assembled^(recess+bore+pocket+access)
                    if not removed.is_empty():removals.append(removed)
                    holes.append(dict(point_mm=[pt[0],top,pt[2]],axis=[0,-1,0],
                        nut_point_mm=[pt[0],base,pt[2]],grip_mm=top-base,
                        head_access_diameter_mm=2*access_r))
                if len(proposals)!=2:continue
                if any((strap^solid).volume()>.01 for _,solid in proposals):continue
                try:
                    fitted_parts=[(i,fitted(result[i].name,solid,result[i].family)) for i,solid in proposals]
                    fitted_strap=fitted(bridge,strap,'wing')
                except ManufacturingError as error:
                    last_error=str(error)
                    # Retry a different cavity height/location; every returned
                    # candidate still passes the identical STL and bed checks.
                    continue
                footprint=md.Manifold.batch_boolean(removals+[strap],md.OpType.Add)
                solution=(fitted_strap,fitted_parts,holes,list(footprint.bounding_box()));break
            if solution:break
        if not solution:
            raise ManufacturingError(f'{name}: iç kök desteği için vida ve somuna yeterli boşluk bulunamadı ({last_error}).')
        strap,proposals,holes,bounds=solution
        for i,part in proposals:result[i]=part
        result.append(strap)
        manifest['wing_root_braces'].append(dict(bridge=bridge,parent=name,
            segments=[result[i].name for i,_ in proposals],holes=holes,support_bounds_world_mm=bounds,
            screw_diameter_mm=screw,nut_flat_mm=flat,nut_height_mm=nh,
            thickness_mm=strap_thickness,width_mm=2*strap_radius,boss_diameter_mm=2*boss_r))
    return result
