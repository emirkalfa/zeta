"""Optional external landing gear attaches to reinforced fuselage screw pads."""
import math
import numpy as np
import manifold3d as md
from backend.manufacturing import cylinder, ManufacturingError


def install_landing_mounts(body, data, gap, cuts):
    g=data['geometry']
    vtol=g.get('fuse_preset') in ('vtol','vtol5')
    rings=np.asarray(data['fuselage']);length=rings[-1,0,0]-rings[0,0,0]
    xs=[rings[0,0,0]+length*.20,rings[0,0,0]+length*(.51 if g['fuse_preset']=='vtol' else .82)]
    if vtol:
        stations=['front','rear']
    else:
        nose=rings[0,0,0]
        cg=(float(g.get('wing_ac_x',g['wing_x_pos']+.25*g['mac']))-.25*g['mac']+g['cg_position'])*1000
        front=nose+length*.18
        if data['options'].get('cameraMount'):
            camera_back=nose+max(12,length*.08)+float(data['options'].get('cameraDepth',25))+2*gap
            front=max(front,camera_back+28)
        main=max(cg+max(35,g['mac']*150),front+60)
        if main+28>=nose+length:raise ManufacturingError('Üç teker bağlantısı için gövde boyunu artırın.')
        xs=[front,main];stations=['front','main']
    records=[]
    for x,station in zip(xs,stations):
        ring=rings[np.argmin(abs(rings[:,0,0]-x))]
        local_width=ring[:,2].max()-ring[:,2].min()
        paired=(station=='front') if vtol else (station=='main')
        layout=[(1,'right'),(-1,'left')] if paired else [(0,'center')]
        wide=station in ('rear','main')
        for sign,side in layout:
            z=sign*local_width*.22
            bottoms=[]
            for sample_x in [x-24,x,x+24]:
                sample=rings[np.argmin(abs(rings[:,0,0]-sample_x))]
                lower=sample[sample[:,1]<sample[:,1].mean()];order=np.argsort(lower[:,2])
                for sample_z in [z-12,z,z+12]:
                    bottoms.append(float(np.interp(sample_z,lower[order,2],lower[order,1])))
            seat=min(bottoms)-4
            pad_cs=md.CrossSection.square([46 if wide else 36,22],center=True).offset(3,circular_segments=32)
            pad=pad_cs.extrude(14).rotate([-90,0,0]).translate([x,seat,z])
            body+=pad
            holes=[]
            for dx in ([-17,17] if wide else [-10,10]):
                point=[x+dx,seat,z]
                bore=cylinder((3+gap)/2,30,[x+dx,seat-10,z],[0,1,0])
                nut=cylinder((5.5+gap)/math.sqrt(3),12,[x+dx,seat+6,z],[0,1,0],sides=6)
                body-=bore+nut;cuts['body'].extend([bore,nut]);holes.append(point)
            records.append(dict(name=side+'_'+station,label=('Ön merkez' if side=='center' and station=='front' else 'Sağ ana' if side=='right' and station=='main' else 'Sol ana' if station=='main' else side+' '+station),part='body',parent='body',bolt_points_mm=holes,
                                screw_diameter_mm=3,hole_diameter_mm=3+gap,mount_plane_mm=seat,
                                bolt_spacing_mm=34 if wide else 20,nut_flat_mm=5.5+gap))
    return body,dict(mounts=records,external_legs=True,printed_legs=False,layout='vtol_external_legs' if vtol else 'tricycle_wheel_mounts')
