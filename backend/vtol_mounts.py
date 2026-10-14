"""Original three-motor VTOL mounting prototype, millimetres, hover pose.

The two front cradles rotate about Z; the rear motor is fixed vertical.
Purchased shafts, servos, pushrods and motors are references, not printed parts.
"""
import math
import numpy as np
import manifold3d as md
from backend.manufacturing import Part, ManufacturingError, number, box, cylinder, mesh_solid, profile, panel_frame, local_transform


def install_vtol(body, assemblies, data, outer, gap, cuts):
    o=data['options'];g=data['geometry']
    diameter=number(o,'vtolMotorDiameter',28,16,65)
    length=number(o,'vtolMotorLength',30,10,70)
    prop=number(o,'vtolPropDiameter',180,80,500)
    spacing_x=number(o,'vtolHoleX',16,8,45)
    spacing_z=number(o,'vtolHoleZ',19,8,45)
    screw=number(o,'vtolScrew',3,2,5)
    bore=number(o,'vtolBore',8,3,20)
    station=number(o,'vtolStation',52,30,70)/100
    forward=number(o,'vtolForward',75,45,350)
    height=number(o,'vtolHeight',25,20,130)
    rear_height=number(o,'vtolRearHeight',35,25,100)
    rear_station=number(o,'vtolRearStation',50,0,100)/100
    pin=number(o,'vtolPivot',4,3,6)
    servo_x=number(o,'vtolServoLength',23,18,45)
    servo_z=number(o,'vtolServoWidth',12,8,25)
    servo_y=number(o,'vtolServoHeight',24,15,45)
    servo_holes=number(o,'vtolServoSpacing',28,22,60)
    servo_offset=number(o,'vtolServoShaftOffset',6,3,15)
    horn_radius=number(o,'vtolHornRadius',8,6,12)
    horn_screw=number(o,'vtolHornScrew',2,1.6,3)
    if servo_offset>servo_x-3:
        raise ManufacturingError('VTOL: servo mili konumu kasanın içinde olmalı; mil uzaklığını servo boyundan en az 3 mm küçük girin.')
    if servo_holes < servo_x+4:
        raise ManufacturingError('VTOL: servo vida aralığı, servo boyundan en az 4 mm büyük olmalı.')
    if min(spacing_x,spacing_z)<bore+screw+gap+3:
        raise ManufacturingError('VTOL: motor mili ve vida delikleri birbirine çok yakın.')
    r=max(diameter/2+8,spacing_x/2+screw/2+9,spacing_z/2+screw/2+9)
    half=r+3;wall=5;journal=pin/2+5
    pieces=[];motors=[];joints=[];obstacles=[]
    holes=[[-spacing_x/2,0],[spacing_x/2,0],[0,-spacing_z/2],[0,spacing_z/2]]
    moving_template=cylinder(r,10,[0,5,0],[0,1,0])
    for xx,zz in holes:
        moving_template-=cylinder((screw+gap)/2,11,[xx,5,zz],[0,1,0])
    moving_template-=cylinder((bore+gap)/2,11,[0,5,0],[0,1,0])
    # A supported pivot sleeve transmits load; a metal servo horn drives its hub.
    moving_template+=cylinder(journal,2*half+wall+gap+7,[0,0,-half],[0,0,1])
    # Rounded, wider webs join the bearing sleeve to the motor plate.
    # They stay within the original Z envelope and keep the metal pin bore.
    web=md.CrossSection.square([18,14],center=True).offset(2,circular_segments=24).extrude(6).translate([0,6,0])
    for z in [-half,half-6]:
        moving_template+=web.translate([0,0,z])
    lever_z=half+gap+wall+2
    moving_template+=cylinder(horn_radius+4,4,[0,0,lever_z],[0,0,1])
    moving_template-=cylinder((pin+gap)/2,2*half+wall+gap+10,[0,0,-half-1],[0,0,1])
    horn_holes=[[horn_radius,0],[-horn_radius,0],[0,horn_radius],[0,-horn_radius]]
    for xx,yy in horn_holes:
        moving_template-=cylinder((horn_screw+gap)/2,6,[xx,yy,lever_z-1],[0,0,1])

    wings=[s for s in data['panels'] if s['kind']=='wing']
    if len(wings)!=2:raise ManufacturingError('VTOL için iki kanat yarısı gerekli.')
    all_airframe=body
    for solid in assemblies.values():all_airframe+=solid
    for spec in wings:
        name='vtol_'+spec['name'];side=1 if spec['tip'][2]>0 else -1
        root=np.array(spec['root'])*1000;tip=np.array(spec['tip'])*1000
        leading=root+(tip-root)*station
        chord=(spec['chord']+(spec['tipChord']-spec['chord'])*station)*1000
        x,y,z=leading; pivot=np.array([x-forward,y+height,z])
        if 2*abs(z)<prop+5:
            raise ManufacturingError('VTOL: ön pervaneler birbirine çok yakın. Motorları kanatta dışarı taşıyın veya pervane çapını azaltın.')
        transform=np.column_stack([np.diag([1,1,side]),pivot])
        world=lambda solid:solid.transform(transform.tolist())
        # Beam is integral to the wing. A separate fork bolts to its front pad.
        # Flat screw landing retained; a C2 tapered, rounded load path
        # widens into the wing instead of ending in a rectangular cantilever.
        end_x=forward+chord*.32
        landing=md.CrossSection.square([16,30],center=True).offset(3,circular_segments=24)
        beam=landing.extrude(14).rotate([-90,0,0]).translate([20,-height-9,0])
        angles=np.linspace(0,2*math.pi,48,endpoint=False);beam_rings=[]
        for xx in np.linspace(26,end_x,25):
            u=(xx-26)/(end_x-26);blend=6*u**5-15*u**4+10*u**3
            hz=18+27*blend;hy=7
            # Match the pad height at the nose; deepen toward the wing skin.
            cy=-height-2
            vy=np.sign(np.sin(angles))*np.abs(np.sin(angles))**.5
            vz=np.sign(np.cos(angles))*np.abs(np.cos(angles))**.5
            beam_rings.append(np.column_stack([np.full(48,xx),cy+hy*vy,hz*vz]))
        beam_rings=np.asarray(beam_rings)
        beam+=mesh_solid(beam_rings,beam_rings[0][:,[1,2]])
        foot_y=-height+5
        foot=md.CrossSection.square([12,2*(half+wall+gap)-6],center=True).offset(3,circular_segments=24)
        fork=foot.extrude(7).rotate([-90,0,0]).translate([19,foot_y,0])
        for a,b in [(-half-wall-gap,-half-gap),(half+gap,half+wall+gap)]:
            cheek=md.CrossSection.square([37,13-foot_y-4],center=True).offset(2,circular_segments=24)
            fork+=cheek.extrude(b-a).translate([7.5,(foot_y+13)/2,a])
            fork-=cylinder(journal+gap/2,b-a+2,[0,0,a-1],[0,0,1])
        fixed_holes=[]
        for xx in [14,24]:
            for zz in [-9,9]:
                cutter=cylinder((3+gap)/2,24,[xx,foot_y-15,zz],[0,1,0])
                fork-=cutter;beam-=cutter
                # underside-accessible M3 nut pockets, intersect the through bores
                beam-=cylinder((5.5+gap)/math.sqrt(3),2.7,[xx,foot_y-14,zz],[0,1,0],sides=6)
                fixed_holes.append((pivot+np.array([xx,foot_y,side*zz])).tolist())
        # Side-mounted servo chamber aligned with the pivot, plus a removable lid.
        sx=servo_x/2-servo_offset;sz=lever_z+4+gap+4
        chamber_min=min(foot_y-4,-servo_y/2-4)
        tray=box([sx-servo_holes/2-5,chamber_min,sz],[sx+servo_holes/2+5,servo_y/2+4,sz+servo_z+6])
        cavity=box([-servo_offset-gap/2,-servo_y/2-gap/2,sz+3],[servo_x-servo_offset+gap/2,servo_y/2+gap/2,sz+servo_z+7])
        tray-=cavity
        tray-=cylinder(journal+1,5,[0,0,sz-1],[0,0,1])
        # Cable outlet opens into the service chamber and under the module.
        tray-=box([sx-3,chamber_min-1,sz+4],[sx+3,-servo_y/2+1,sz+10])
        cover_z=sz+servo_z+6+gap
        cover=box([sx-servo_holes/2-5,chamber_min,cover_z],[sx+servo_holes/2+5,servo_y/2+4,cover_z+3])
        cover-=box([-servo_offset+3,-servo_y*.25,cover_z-1],[servo_x-servo_offset-3,servo_y*.25,cover_z+4])
        service_holes=[];service_cuts=[]
        for xx in [sx-servo_holes/2-2,sx+servo_holes/2+2]:
            for yy in [chamber_min+3,servo_y/2+1]:
                nut_z=half+gap if yy<foot_y+.5 else sz
                drill=cylinder(1.2,cover_z+4-nut_z,[xx,yy,nut_z-1],[0,0,1])
                tray-=drill;cover-=drill
                nut_pocket=cylinder(2.5,2.2,[xx,yy,nut_z],[0,0,1],sides=6)
                tray-=nut_pocket;service_cuts.extend([drill,nut_pocket])
                service_holes.append((pivot+[xx,yy,side*(cover_z+3)]).tolist())
        servo_mount_holes=[]
        for xx in [sx-servo_holes/2,sx+servo_holes/2]:
            tray-=cylinder(1.2,5,[xx,0,sz-1],[0,0,1])
            servo_mount_holes.append((pivot+[xx,0,side*sz]).tolist())
        fork+=tray+box([-9,foot_y-4,half+gap],[sx+servo_holes/2+5,foot_y+.5,sz+4])
        # Hollow fairing integrates the servo bank into the wing projection.
        shroud_rings=[];inner_rings=[]
        angles=np.linspace(0,2*math.pi,64,endpoint=False)
        start_x=sx-servo_holes/2-7;end_x=forward+chord*.32
        for xx in np.linspace(start_x,end_x,33):
            u=max(0,min(1,((xx-start_x)/(end_x-start_x)-.35)/.65))
            blend=6*u**5-15*u**4+10*u**3
            cy=(-4)*(1-blend)-height*blend
            cz=(sz+(servo_z+6)/2)*(1-blend)
            hy=max(servo_y/2+15,abs(chamber_min+4)+5)*(1-blend)+7*blend
            hz=(servo_z/2+10)*(1-blend)+15*blend
            vy=np.sign(np.sin(angles))*np.abs(np.sin(angles))**.5
            vz=np.sign(np.cos(angles))*np.abs(np.cos(angles))**.5
            shroud_rings.append(np.column_stack([np.full(64,xx),cy+hy*vy,cz+hz*vz]))
            inner_rings.append(np.column_stack([np.full(64,xx),cy+(hy-3)*vy,cz+(hz-3)*vz]))
        shroud_rings=np.asarray(shroud_rings);inner_rings=np.asarray(inner_rings)
        shroud=mesh_solid(shroud_rings,shroud_rings[0][:,[1,2]])-mesh_solid(inner_rings,inner_rings[0][:,[1,2]])
        shroud-=box([sx-servo_holes/2-5,chamber_min,cover_z-gap/2],[sx+servo_holes/2+5,servo_y/2+4,cover_z+30])
        shroud-=cylinder(horn_radius+4+gap,20,[0,0,lever_z-5],[0,0,1])
        fork=(fork+shroud)-cavity
        for tool in service_cuts:fork-=tool
        moving=world(moving_template)
        wing_mat,wing_length=panel_frame(spec)
        wing_envelope=local_transform(profile(spec['coords'],spec['chord']*1000).offset(gap/2,circular_segments=24).extrude(wing_length,scale_top=[spec['tipChord']/spec['chord']]*2),wing_mat)
        beam_seat=beam
        for shift in [[gap/2,0,0],[-gap/2,0,0],[0,gap/2,0],[0,-gap/2,0],[0,0,gap/2],[0,0,-gap/2]]:
            beam_seat+=beam.translate(shift)
        fixed=world(fork)-wing_envelope-world(beam_seat)
        assemblies[spec['name']]+=world(beam)
        # Keep prior spar channels open after the beam union.
        for cutter in cuts.get(spec['name'],[]):assemblies[spec['name']]-=cutter
        pieces.extend([Part(name+'_fork',fixed,family='wing'),Part(name+'_cradle',moving,family='wing'),Part(name+'_servo_cover',world(cover),family='wing')])
        # Every checked moving mesh is contained in this conservative cube.
        # Clip the stationary airframe once instead of intersecting both
        # complete hollow wings at each of the 23 tilt positions.
        reach=prop/2+length+max(r,lever_z+4)+40
        vicinity=box(pivot-reach,pivot+reach)
        collision_airframe=(all_airframe+world(beam))^vicinity
        collision_prop=(collision_airframe+fixed)^vicinity
        for angle in range(-20,91,5):
            rotated=moving_template.rotate([0,0,angle])
            if (rotated^fork).volume()>.1:
                raise ManufacturingError('VTOL: döner taşıyıcı sabit çatala çarpıyor; pivot/servo ölçülerini kontrol edin.')
            theta=math.radians(angle);axis=np.array([-math.sin(theta),math.cos(theta),0])
            motor_envelope=cylinder(diameter/2,length,pivot+axis*15,axis)
            if (motor_envelope^fixed).volume()>.1:
                raise ManufacturingError('VTOL: motor kasası sabit taşıyıcıya çarpıyor. Motor çapını ve taşıyıcı ölçülerini kontrol edin.')
            if ((world(rotated)+motor_envelope)^collision_airframe).volume()>.1:
                raise ManufacturingError('VTOL: motor veya döner taşıyıcı kanada çarpıyor. Kanat önünden uzaklığı veya ön taşıyıcı yüksekliğini artırın.')
            center=pivot+axis*(15+length+8)
            disk=cylinder(prop/2,2,center-axis,axis)
            if (disk^collision_prop).volume()>.1:
                raise ManufacturingError('VTOL: pervane hareketi uçakla çakışıyor. Ön uzaklık, yükseklik veya motor konumunu artırın.')
        face=(pivot+[0,15,0]).tolist()
        motors.append(dict(name=name,parent=name+'_cradle',face_mm=face,out_axis=[0,1,0],motor_diameter_mm=diameter,motor_length_mm=length,prop_diameter_mm=prop,
            prop_center_mm=(pivot+[0,15+length+8,0]).tolist(),hole_points_mm=[(pivot+[xx,15,side*zz]).tolist() for xx,zz in holes],hole_diameter_mm=screw+gap,center_bore_mm=bore+gap))
        joints.append(dict(part=name+'_cradle',parent=name+'_fork',wing=spec['name'],pivot_mm=pivot.tolist(),axis=[0,0,1],range_deg=[-20,90],pin_diameter_mm=pin,hole_diameter_mm=pin+gap,
            mechanism='compact_direct_servo',wing_support='rounded_tapered',wing_support_width_mm={'landing':36,'root':90},motor_plate_thickness_mm=10,wing_pad_thickness_mm=14,journal_diameter_mm=journal*2,bolt_points_mm=fixed_holes,
            horn_holes_mm=[(pivot+[xx,yy,side*(lever_z+4)]).tolist() for xx,yy in horn_holes],horn_screw_mm=horn_screw,
            servo_mount_holes_mm=servo_mount_holes,cover_holes_mm=service_holes,cover_part=name+'_servo_cover',
            servo_center_mm=(pivot+[sx,0,side*(sz+3+servo_z/2)]).tolist(),servo_output_axis=[0,0,-side],servo_mm=[servo_x,servo_y,servo_z]))

    # Rear motor clamps directly around the purchased carbon tube.
    tube=data['carbon_boom']
    tube_r=tube['outer_diameter_mm']/2;roof=tube_r
    ry=roof+rear_height
    span=r+12
    # Position inside the genuinely exposed tube bay, with space for the
    # clamp AND the propeller. A percent of the virtual fuselage length
    # could put the rear motor inside the enlarged center-wing fairing.
    aft=float(body.bounding_box()[3])
    tail_front=min(float(p['root'][0])*1000 for p in data['panels'] if p['kind']=='tail')
    minimum=max(aft+span+15,aft+prop/2+15)
    maximum=min(tail_front-prop/2-15,float(tube['end_mm'][0])-100-span)
    if maximum<=minimum:
        raise ManufacturingError('VTOL: kanat ve kuyruk arasında arka motor ve pervane için açık boru bölümü yetersiz. Daha küçük pervane veya daha kısa kanat veteri seçin.')
    rx=minimum+(maximum-minimum)*rear_station
    if rx-span<tube['body_end_mm']+20 or rx+span>tube['end_mm'][0]-100:
        raise ManufacturingError('Karbon boru: arka motor kelepçesi gövde veya kuyruk yuvasına çok yakın. Arka motor konumunu borunun orta kısmına taşıyın.')
    clearance=cylinder(tube_r+gap/2,span*2+10,[rx-span-5,0,0],[1,0,0])
    jacket=cylinder(tube_r+4,span*2,[rx-span,0,0],[1,0,0])-clearance
    split=0
    band=box([rx-span,-10000,-10000],[rx+span,10000,10000])
    top=jacket^band^box([rx-span,split+gap/2,-10000],[rx+span,10000,10000])
    lower=jacket^band^box([rx-span,-10000,-10000],[rx+span,split-gap/2,10000])
    flange_z=tube_r+9
    clamp_bolts=[]
    for side in [-1,1]:
        zz=side*flange_z
        top+=box([rx-span,split+gap/2,zz-10],[rx+span,split+7,zz+10])
        lower+=box([rx-span,split-7,zz-10],[rx+span,split-gap/2,zz+10])
        # Two tenons locate the saddle independently of bolt clearance.
        key=box([rx-4,split-3,zz-3],[rx+4,split+2,zz+3])
        slot=box([rx-4-gap/2,split-3-gap/2,zz-3-gap/2],[rx+4+gap/2,split+1,zz+3+gap/2])
        top+=key;lower-=slot
        for xx in [rx-r+2,rx+r-2]:
            drill=cylinder((3+gap)/2,18,[xx,split-9,zz],[0,1,0])
            top-=drill;lower-=drill
            lower-=cylinder((5.5+gap)/math.sqrt(3),2.7,[xx,split-7,zz],[0,1,0],sides=6)
            clamp_bolts.append([xx,split+7,zz])
    top-=clearance;lower-=clearance
    # Broad dorsal saddle and two full-width walls form an open service portal.
    # The saddle follows the actual body skin; the central bay remains accessible
    # from either side for a screwdriver and the motor wiring.
    saddle=top+box([rx-r-8,roof-5,-14],[rx+r+8,roof+4,14])
    # Flared and rounded webs spread plate loads into the wide tube saddle.
    stem=md.Manifold()
    for side in [-1,1]:
        polygon=[[rx+side*(r+4),roof-5],[rx+side*(r-12),roof-5],
                 [rx+side*(r-10),ry-2],[rx+side*r,ry-2]]
        if side>0:polygon=polygon[::-1]
        web=md.CrossSection([polygon]).offset(-2,circular_segments=24).offset(2,circular_segments=24)
        stem+=web.extrude(32).translate([0,0,-16])
    plate=cylinder(r,6,[rx,ry-6,0],[0,1,0]);rear=(saddle+stem+plate)-clearance
    rear_cuts=[]
    for xx,zz in holes:
        rear_cuts.append(cylinder((screw+gap)/2,10,[rx+xx,ry-7,zz],[0,1,0]))
        rear-=cylinder((screw+gap)/2+2,rear_height-9,[rx+xx,roof+3,zz],[0,1,0])
    rear_cuts.append(cylinder((bore+gap)/2,rear_height+20,[rx,roof-15,0],[0,1,0]))
    for cutter in rear_cuts:rear-=cutter
    body-=rear_cuts[-1]
    cuts['body'].append(rear_cuts[-1])
    pieces.extend([Part('vtol_rear_saddle',rear,family='body'),Part('vtol_rear_clamp',lower,family='body')])
    if ((rear+lower)^all_airframe).volume()>.1:
        raise ManufacturingError('VTOL: arka motor kelepçesi kanat veya kuyruk parçasıyla çakışıyor.')
    motor_case=cylinder(diameter/2,length,[rx,ry,0],[0,1,0])
    if (motor_case^(all_airframe+rear+lower)).volume()>.1:
        raise ManufacturingError('VTOL: arka motor kasası taşıyıcı veya uçak parçasıyla çakışıyor.')
    prop_center=[rx,ry+length+8,0]
    if (cylinder(prop/2,2,np.array(prop_center)-[0,1,0],[0,1,0])^all_airframe).volume()>.1:
        raise ManufacturingError('VTOL: arka pervane kuyrukla çakışıyor. Arka konumu veya yüksekliği değiştirin.')
    motors.append(dict(name='vtol_rear',parent='vtol_rear_saddle',face_mm=[rx,ry,0],out_axis=[0,1,0],motor_diameter_mm=diameter,motor_length_mm=length,prop_diameter_mm=prop,prop_center_mm=prop_center,clamp_part='vtol_rear_clamp',clamp_bolt_points_mm=clamp_bolts,placement=dict(exposed_bay_mm=[aft,tail_front],center_range_mm=[minimum,maximum],station_percent=rear_station*100),
        hole_points_mm=[[rx+xx,ry,zz] for xx,zz in holes],hole_diameter_mm=screw+gap,center_bore_mm=bore+gap))
    return body,pieces,motors,joints,obstacles
