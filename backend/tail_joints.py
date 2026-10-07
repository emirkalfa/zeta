"""Removable center splice with mitered inverted-V arms and real bolt holes."""
import numpy as np
from backend.manufacturing import Part,box,cylinder,profile,panel_frame,local_transform,nut_cut

def install_tail_center_joint(g,specs,assemblies,cuts,interfaces,gap,screw,nf,nh):
    if not g.get('tail_booms') or g['tail_type'] not in ['ttail','vtail']:return []
    import manifold3d as md
    joined=md.Manifold();drills=[];females=[];nuts=[]
    for spec in specs:
        name=spec['name']
        if not (name.startswith('tail_horizontal_') if g['tail_type']=='ttail' else name.startswith('tail_v_')):continue
        mat,length=panel_frame(spec);chord=float(spec['chord'])*1000;tip=float(spec['tipChord'])*1000
        section=profile(spec['coords'],chord)
        full=section.extrude(length,scale_top=[tip/chord]*2)
        seam=length-18;end_chord=chord+(tip-chord)*seam/length
        cx=end_chord*.4;kw=min(18,end_chord*.16);kh=max(5,screw+2);depth=10
        inv=mat[:,:3];inv=np.linalg.inv(inv)
        local=assemblies[name].transform(np.column_stack([inv,-inv@mat[:,3]]).tolist())
        local=local^box([-10000,-10000,-10000],[10000,10000,seam-gap/2])
        cap=full^box([-10000,-10000,seam-2],[10000,10000,seam-gap/2])
        key=box([cx-kw/2,-kh/2,seam-2],[cx+kw/2,kh/2,seam+depth])
        drill=cylinder((screw+gap)/2,500,[cx,-250,seam+depth*.55],[0,1,0])
        local=(local+cap+key)-drill
        assemblies[name]=local_transform(local,mat)
        arm=full^box([-10000,-10000,seam+gap/2],[10000,10000,length+1])
        if g['tail_type']=='vtail':
            # Normal tip caps overlap below the apex and leave a wedge above it.
            # Extend the profile, then miter both arms on the shared center plane.
            extension=profile(spec['coords'],tip).extrude(max(8,tip*.12)).translate([0,0,length])
            arm=arm+extension
        housing=box([cx-kw/2-2,-kh/2-2,seam+gap/2],[cx+kw/2+2,kh/2+2,seam+depth+2])
        arm=local_transform(arm+housing,mat)
        positive=spec['root'][2]>0
        arm=arm^box([-10000,-10000,0 if positive else -10000],[10000,10000,10000 if positive else 0])
        joined=joined+arm
        female=box([cx-kw/2-gap/2,-kh/2-gap/2,seam-gap],[cx+kw/2+gap/2,kh/2+gap/2,seam+depth+gap])
        females.append(local_transform(female,mat));drills.append(local_transform(drill,mat))
        nuts.append(local_transform(nut_cut(cx,-kh/2-1,seam+depth*.55,nf+gap,nh+gap),mat))
        cuts.setdefault(name,[]).append(drills[-1])
        interfaces.append({'part':name,'parent':'tail_center_joint','key_mm':[kw,kh,depth],
                           'bolt_axis':mat[:,1].tolist(),'bolt_point_mm':(mat[:,:3]@np.array([cx,0,seam+depth*.55])+mat[:,3]).tolist(),
                           'diametral_clearance_mm':gap,'entry_lead_mm':0,'entry_flare_per_side_mm':0,
                           'purpose':'center_splice'})
    for tool in females+drills+nuts:joined=joined-tool
    return [Part('tail_center_joint',joined,0,family='tail')]
