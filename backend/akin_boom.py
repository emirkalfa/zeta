"""Single carbon-boom pusher pod with an offset tail axis."""
import numpy as np

from backend.manufacturing import box, cylinder, ManufacturingError, rounded_hatch_prism


def prepare_akin_boom(body, data, assemblies, frames, cuts, wall, gap):
    options = data['options']
    rings = np.asarray(data['fuselage'], dtype=float)
    pod_end = rings[-1,0,0]
    motor_y = float(rings[-1,:,1].mean())
    prop = float(options.get('propDiameter',152))
    diameter = 16.
    radius = diameter/2
    y = min(-35.,motor_y-prop/2-radius-8.)
    tail_specs = [p for p in data['panels'] if p['kind']=='tail']
    center = max((p['root'][0]+p['chord']*.4)*1000 for p in tail_specs)
    start, front_end = pod_end-87, pod_end-8
    tail_start, end = center-38, center+23
    if tail_start-front_end < 45:
        raise ManufacturingError('Lark: motor bölümü ile kuyruk yuvası arasında açık boru için yer yetersiz.')
    outside = radius + max(4.5,wall+1)
    front = cylinder(outside,front_end-start+4,[start-4,y,0],[1,0,0])
    web = rounded_hatch_prism(start-3,front_end, outside*.83, 5, y, min(8.,motor_y-18.))
    if ((front+web)^body).volume()<1:
        raise ManufacturingError('Lark: seçilen pervane karbon boruyu gövde sınırının dışına indiriyor.')
    front_bore = cylinder(radius+gap/2,front_end-start+2,[start,y,0],[1,0,0])
    body = (body+front+web)-front_bore
    cuts['body'].append(front_bore)

    carrier = cylinder(outside,end-tail_start+4,[tail_start,y,0],[1,0,0])
    tail_bore = cylinder(radius+gap/2,end-start+.4,[start-.2,y,0],[1,0,0])
    carrier -= tail_bore
    name = 'vtol_tail_carrier'
    assemblies[name] = carrier
    cuts[name] = [tail_bore]
    frames[name] = (np.column_stack([np.eye(3),[0,0,0]]),0,'tail')
    delta = y/1000 - data['geometry'].get('tail_position_offset',0)
    for panel in tail_specs:
        if panel.get('parent','body')=='body':
            panel['parent']=name
        panel['root'][1]+=delta
        panel['tip'][1]+=delta
    tube = {'part':'carbon_tail_tube','purchased':True,'structural':True,'layout':'akin',
            'outer_diameter_mm':diameter,'inner_diameter_mm':12.,
            'start_mm':[start,y,0],'end_mm':[end,y,0],'length_mm':end-start,
            'body_end_mm':pod_end,'body_insertion_mm':front_end-start,
            'tail_carrier':name,'socket_bore_mm':diameter+gap}
    return body,tube
