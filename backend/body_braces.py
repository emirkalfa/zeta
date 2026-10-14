"""Internal axial straps join the tube-entry body slice to its preceding slice."""
import math
import numpy as np
import manifold3d as md
from backend.manufacturing import Part, box, cylinder, printable_precision, check, orthogonal_print, ManufacturingError


def neck_braces(parts,manifest):
    tube=manifest.get('carbon_boom')
    if not tube:return parts
    result=list(parts);gap=manifest['clearance_mm'];screw=manifest['screw_mm']
    flat=manifest['nut_flat_mm'];nh=manifest['nut_height_mm'];radius=tube['outer_diameter_mm']/2
    spacing=radius+10;boss_radius=max(5,flat/math.sqrt(3)+gap+1.5)
    bodies=[(i,p) for i,p in enumerate(result) if p.name.startswith('body')]
    tube_region=box([tube['start_mm'][0]+1,-10000,-radius-6],[tube['body_end_mm']-1,10000,radius+6])
    aft=[(i,p) for i,p in bodies if not (p.assembled^tube_region).is_empty()]
    if not aft:return result
    # The aft slice's incoming plane, not the left/right split, is the joint.
    seam=max(float(p.assembled.bounding_box()[0]) for _,p in aft)
    x_front=seam-18;x_aft=seam+18
    for side,zz in [('left',-spacing),('right',spacing)]:
        indices=[];contacts=[]
        for xx,is_aft in [(x_front,False),(x_aft,True)]:
            region=box([xx-5,-10000,zz-boss_radius],[xx+5,10000,zz+boss_radius])
            options=[]
            for i,p in bodies:
                b=p.assembled.bounding_box()
                if is_aft and b[0]<seam-.1:continue
                if not is_aft and b[0]>=seam-.1:continue
                hit=p.assembled^region
                if not hit.is_empty():options.append((float(hit.bounding_box()[1]),i))
            if not options:break
            cy,i=min(options);indices.append(i);contacts.append(cy)
        if len(indices)!=2 or indices[0]==indices[1]:continue
        combined=result[indices[0]].assembled+result[indices[1]].assembled
        outline=md.CrossSection.square([48,8],center=True).offset(3,circular_segments=24)
        plate=None
        # Recess the strap inside the lower equipment cavity. Leave its
        # outside skin smooth apart from the accessible captive-nut openings.
        for rise in [10,12,14,16]:
            bottom=max(contacts)+rise;top=bottom+4
            candidate=outline.extrude(4).rotate([-90,0,0]).translate([seam,bottom,zz])
            if (candidate^combined).volume()<.01:plate=candidate;break
        if plate is None:raise ManufacturingError('Boru girişi ile ön gövde arasında iç vidalı destek için yeterli boşluk yok.')
        holes=[];proposals=[]
        for i,xx,cy in zip(indices,[x_front,x_aft],contacts):
            p=result[i];boss_bottom=cy-1;boss_top=bottom-gap/2
            boss=cylinder(boss_radius,boss_top-boss_bottom,[xx,boss_bottom,zz],[0,1,0])
            bore=cylinder((screw+gap)/2,top-boss_bottom+2,[xx,top+1,zz],[0,-1,0])
            pocket=cylinder((flat+gap)/math.sqrt(3),nh+gap+.1,[xx,boss_bottom-.1,zz],[0,1,0],sides=6)
            solid=printable_precision(p.assembled+boss-bore-pocket,p.name);check(solid,p.name)
            tube_probe=cylinder(radius-.1,tube['length_mm'],tube['start_mm'],[1,0,0])
            if (solid^tube_probe).volume()>.1:raise ManufacturingError('İç gövde desteği karbon boru açıklığıyla çakışıyor.')
            printed,transform=orthogonal_print(solid,manifest['bed_mm'],True)
            printed=printable_precision(printed,p.name);check(printed,p.name)
            inv=transform[:,:3].T;world=np.column_stack([inv,-inv@transform[:,3]])
            proposals.append((i,Part(p.name,printed,family=p.family,assembled=solid,print_to_world=world)))
            plate-=bore
            holes.append({'point_mm':[xx,top,zz],'axis':[0,-1,0],
                          'nut_point_mm':[xx,boss_bottom,zz],'grip_mm':top-boss_bottom})
        name=f'vtol_body_join_axial_{side}'
        plate=printable_precision(plate,name);check(plate,name)
        if any((plate^p.assembled).volume()>.01 for _,p in proposals):
            raise ManufacturingError('İç gövde desteği montaj yüzeyiyle çakışıyor.')
        for i,p in proposals:result[i]=p
        printed,transform=orthogonal_print(plate,manifest['bed_mm'],True)
        printed=printable_precision(printed,name);check(printed,name)
        inv=transform[:,:3].T;world=np.column_stack([inv,-inv@transform[:,3]])
        result.append(Part(name,printed,family='body',assembled=plate,print_to_world=world))
        manifest['body_segment_joints'].append({'bridge':name,'connection':'axial','seam_x_mm':seam,
            'segments':[result[i].name for i in indices],'screw_diameter_mm':screw,
            'nut_flat_mm':flat,'nut_height_mm':nh,'holes':holes})
    return result
