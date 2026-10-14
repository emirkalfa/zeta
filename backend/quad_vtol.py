"""Four fixed lift motors on bolted wing rails; the fifth motor is a pusher."""
import math
import numpy as np
import manifold3d as md
from backend.manufacturing import Part, ManufacturingError, number, box, cylinder, profile, panel_frame, local_transform, mesh_solid


def install_quad_lift(body, assemblies, data, gap, cuts, motors):
    g=data['geometry'];o=data['options'];pieces=[]
    diameter=number(o,'vtolMotorDiameter',28,16,65)
    length=number(o,'vtolMotorLength',30,10,70)
    prop=number(o,'vtolPropDiameter',180,80,500)
    hx=number(o,'vtolHoleX',16,8,45);hz=number(o,'vtolHoleZ',19,8,45)
    screw=number(o,'vtolScrew',3,2,5);bore=number(o,'vtolBore',8,3,20)
    # A flat plate underside clears the tail boom by 2 mm; the spar curves gently
    # up to its underside instead of adding a tall pedestal.
    height=float(g['tail_booms']['diameter'])*500+10
    margin=number(o,'quadClearance',30,15,150)
    radius=max(diameter/2+7,hx/2+screw/2+8,hz/2+screw/2+8)
    if min(hx,hz)<bore+screw+gap+3:
        raise ManufacturingError('VTOL: motor mili ve vida delikleri birbirine çok yakın.')
    holes=[[-hx/2,0],[hx/2,0],[0,-hz/2],[0,hz/2]]
    airframe=body
    for solid in assemblies.values():airframe+=solid
    lift=[];disks=[];envelopes=[];rails=[]
    for spec in [p for p in data['panels'] if p['kind']=='wing']:
        side='right' if spec['tip'][2]>0 else 'left'
        station=g['tail_booms']['y']/(g['wingspan']/2)
        leading=(np.asarray(spec['root'])+(np.asarray(spec['tip'])-spec['root'])*station)*1000
        x,y,z=leading;chord=(spec['chord']+(spec['tipChord']-spec['chord'])*station)*1000
        front=x-prop/2-margin;back=x+chord+prop/2+margin
        # Closed oval spar: thicker walls and no square exterior corners.
        angles=np.linspace(0,2*math.pi,64,endpoint=False)
        def oval_spar(a,b,ry,rz):
            rings=[]
            for xx in sorted(set(np.linspace(a,b,65))|{v for v in [front,x,x+chord,back] if a<v<b}):
                u=np.clip((x-xx)/(x-front) if xx<x else (xx-x-chord)/(back-x-chord),0,1)
                blend=6*u**5-15*u**4+10*u**3
                cy=y-20+(height-plate-8+20)*blend
                rings.append(np.column_stack([np.full(64,xx),cy+ry*np.sin(angles),z+rz*np.cos(angles)]))
            rings=np.asarray(rings)
            return mesh_solid(rings,rings[0][:,[1,2]])
        plate=8
        rail_half_width=max(16,height-10+7)
        rail=oval_spar(front-radius-7,back+radius+7,10,rail_half_width)
        rail-=oval_spar(front-radius-2,back+radius+2,5,rail_half_width-5)
        mat,span=panel_frame(spec)
        section=profile(spec['coords'],spec['chord']*1000)
        wing_envelope=local_transform(section.offset(gap/2,circular_segments=24).extrude(span,scale_top=[spec['tipChord']/spec['chord']]*2),mat)
        bolts=[]
        for xx in [x+chord*.25,x+chord*.6]:
            angles=np.linspace(0,2*math.pi,48,endpoint=False);rings=[]
            for yy in np.linspace(y-20,y+10,25):
                u=(yy-y+20)/30;blend=6*u**5-15*u**4+10*u**3
                vx=np.sign(np.sin(angles))*np.abs(np.sin(angles))**.5
                vz=np.sign(np.cos(angles))*np.abs(np.cos(angles))**.5
                rings.append(np.column_stack([xx+(10+5*blend)*vx,np.full(48,yy),z+(18+5*blend)*vz]))
            rings=np.asarray(rings)
            rail+=mesh_solid(rings,rings[0][:,[0,2]])
            for zz in [z-10,z+10]:
                drill=cylinder((3+gap)/2,90,[xx,y-40,zz],[0,1,0])
                rail-=drill
                rail-=cylinder((5.5+gap)/math.sqrt(3),2.7,[xx,y-30,zz],[0,1,0],sides=6)
                cuts[spec['name']].append(drill);assemblies[spec['name']]-=drill
                bolts.append([xx,y+10,zz])
        rail-=wing_envelope
        name='vtol5_'+side+'_rail'
        for xx,position in [(front,'front'),(back,'rear')]:
            face=[xx,y+height,z]
            plate=8
            mount=cylinder(radius,plate,[xx,y+height-plate,z],[0,1,0])
            # A broad under-plate saddle joins the spar to the whole landing,
            # with a smooth flare instead of a narrow tangent contact.
            saddle_angles=np.linspace(0,2*math.pi,64,endpoint=False)
            saddle=[]
            for yy in np.linspace(y+height-plate-10,y+height-plate+2,25):
                u=(yy-(y+height-plate-10))/12
                blend=6*u**5-15*u**4+10*u**3
                rx=max(16,radius*.72)+(radius-max(16,radius*.72))*blend
                rz=14+(radius-14)*blend
                saddle.append(np.column_stack([xx+rx*np.sin(saddle_angles),np.full(64,yy),z+rz*np.cos(saddle_angles)]))
            saddle=np.asarray(saddle)
            mount+=mesh_solid(saddle,saddle[0][:,[0,2]])
            for dx,dz in holes:
                mount-=cylinder((screw+gap)/2,height+45,[xx+dx,y-36,z+dz],[0,1,0])
            mount-=cylinder((bore+gap)/2,height+36,[xx,y-32,z],[0,1,0])
            rail+=mount
            for dx,dz in holes:
                rail-=cylinder((screw+gap)/2,height+45,[xx+dx,y-36,z+dz],[0,1,0])
            rail-=cylinder((bore+gap)/2,height+36,[xx,y-32,z],[0,1,0])
            center=[xx,y+height+length+8,z]
            disk=cylinder(prop/2,2,np.asarray(center)-[0,1,0],[0,1,0])
            envelope=cylinder(diameter/2,length,face,[0,1,0])
            disks.append(disk);envelopes.append(envelope)
            lift.append(dict(name='vtol5_'+side+'_'+position,parent=name,face_mm=face,out_axis=[0,1,0],motor_diameter_mm=diameter,motor_length_mm=length,prop_diameter_mm=prop,prop_center_mm=center,
                hole_points_mm=[[xx+dx,y+height,z+dz] for dx,dz in holes],hole_diameter_mm=screw+gap,center_bore_mm=bore+gap,
                plate_thickness_mm=plate,rail_outer_mm=[20,2*rail_half_width],rail_wall_mm=5,support_ribs=0,pedestal_style="flat_plate",smooth_plate_saddle=True,saddle_depth_mm=10,face_offset_mm=height,rounded_wide_foot=True,smooth_wing_transition=True,clamp_bolt_points_mm=bolts if position=='front' else [],clamp_part=spec['name']))
        # Expanded feet must also clear the finished wing, including its fittings.
        rail-=assemblies[spec['name']]
        boom=g['tail_booms']
        rail-=cylinder(float(boom['diameter'])*500+gap/2,
                       (boom['x_end']-boom['x_start'])*1000,
                       [boom['x_start']*1000,y,z],[1,0,0])
        # Boom clearance may trim isolated slivers from the hollow spar.
        # Remove only tiny offcuts; a detached structural piece still fails check().
        components=sorted([p for p in rail.decompose() if p.volume()>.001],key=lambda p:p.volume(),reverse=True)
        offcuts=components[1:]
        if offcuts and sum(p.volume() for p in offcuts)<rail.volume()*.005:
            for offcut in offcuts:rail-=offcut
        rails.append(rail);pieces.append(Part(name,rail,family='wing'))
    complete=airframe
    for rail in rails:complete+=rail
    for i,(disk,envelope) in enumerate(zip(disks,envelopes)):
        if ((disk+envelope)^complete).volume()>.1:
            raise ManufacturingError('Beş motorlu VTOL: kaldırma motoru/pervanesi uçakla çakışıyor. Kanat önü/arkası boşluğunu artırın; pervane çapını azaltın.')
        for other in disks[i+1:]:
            if (disk^other).volume()>.1:
                raise ManufacturingError('Beş motorlu VTOL: kaldırma pervaneleri çakışıyor. Pervane çapını azaltın veya kanat açıklığını büyütün.')
    for m in motors:
        axis=np.array(m.get('axis',[1,0,0]));center=[m['prop_plane_x_mm'],m['face_mm'][1],m['face_mm'][2]]
        disk=cylinder(m['prop_diameter_mm']/2,2,np.asarray(center)-axis,axis)
        obstacles=complete
        for envelope,lift_disk in zip(envelopes,disks):obstacles+=envelope+lift_disk
        if (disk^obstacles).volume()>.1:
            raise ManufacturingError('Beş motorlu VTOL: itici pervane kaldırma taşıyıcılarıyla çakışıyor. İtici pervane çapını azaltın veya motor yerleşimini değiştirin.')
    return pieces,lift
