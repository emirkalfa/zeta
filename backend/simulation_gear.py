"""Rigid tricycle contact geometry for the simulation mesh only (design mm)."""
import math
import numpy as np
import manifold3d as md

from backend.manufacturing import cylinder, ManufacturingError


def landing_gear(airframe, rings, geometry, motors):
    """Place three equal-height contacts around the nominal design CG.

    This is a rigid mesh: wheel rotation, tire friction and aircraft dynamics
    belong to the simulator. Never infer a mass centre from envelope volume.
    """
    struts, tires, report = landing_gear_components(airframe, rings, geometry, motors)
    return md.Manifold.batch_boolean([*struts, *tires], md.OpType.Add), report


def landing_gear_components(airframe, rings, geometry, motors):
    rings=np.asarray(rings)
    nose=float(rings[0,0,0]);end=float(rings[-1,0,0]);length=end-nose
    span=float(geometry['wingspan'])*1000
    mac=float(geometry['mac'])*1000
    cg=(float(geometry.get('wing_ac_x',geometry['wing_x_pos']+.25*geometry['mac']))
        -.25*geometry['mac']+geometry['cg_position'])*1000
    front=min(nose+.18*length,cg-max(40.,mac*.6))
    main=max(cg+max(35.,mac*.25),front+80.)
    if not nose+10<front<cg<main<end-10:
        raise ManufacturingError('Simülasyon iniş takımı için ağırlık merkezi çevresinde gövde uzunluğu yetersiz.')
    radius=max(18.,span*.018)
    width=radius*.55
    track=max(span*.22, float(np.ptp(rings[:,:,2]))*1.5)
    clearance=max(15.,span*.015)
    floor=float(airframe.bounding_box()[1])
    for motor in motors:
        axis=np.asarray(motor.get('out_axis',motor.get('axis',[1,0,0])),dtype=float)
        axis/=np.linalg.norm(axis)
        center=motor.get('prop_center_mm',motor.get('face_mm',[0,0,0]))
        prop_floor=float(center[1])-float(motor.get('prop_diameter_mm',0))/2*math.sqrt(max(0.,1-axis[1]**2))
        floor=min(floor,prop_floor)
    ground=floor-clearance
    center_y=ground+radius
    struts=[];tires=[];wheels=[]
    for name,x,z in [('nose',front,0.),('main_right',main,-track/2),('main_left',main,track/2)]:
        j=max(1,min(len(rings)-1,int(np.searchsorted(rings[:,0,0],x))))
        a,b=rings[j-1],rings[j]
        ring=a+(b-a)*((x-a[0,0])/(b[0,0]-a[0,0]))
        mount=np.array([x,float(ring[:,1].min())+8.,0.])
        axle=np.array([x,center_y,z])
        strut_radius=max(4.,radius*.2)
        strut=md.Manifold.batch_hull([
            md.Manifold.sphere(strut_radius,circular_segments=16).translate(mount.tolist()),
            md.Manifold.sphere(strut_radius,circular_segments=16).translate(axle.tolist())])
        wheel=cylinder(radius,width,[x,center_y,z-width/2],[0,0,1],sides=48)
        struts.append(strut);tires.append(wheel)
        wheels.append(dict(name=name,center_mm=axle.tolist(),radius_mm=radius,width_mm=width,
                           contact_mm=[x,ground,z],mount_mm=mount.tolist()))
    return struts,tires,dict(wheels=wheels,ground_y_mm=ground,clearance_mm=clearance,
                      assumed_cg_mm=[cg,0,0],rigid=True)
