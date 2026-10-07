"""Dimensioned BLDC firewalls and twin wing nacelles; motors/props are purchased parts."""
import math
import numpy as np
from backend.manufacturing import number,box,cylinder,ManufacturingError

def install_motor_mounts(body,lid,assemblies,data,outer,wall,gap):
    options=data.get('options',{});layout=options.get('motorLayout','none')
    if layout not in ['none','single','twin']:raise ManufacturingError('Motor yerleşimi geçersiz.')
    if layout=='none':return body,[],[],[]
    diameter=number(options,'motorDiameter',28,10,100)
    length=number(options,'motorLength',30,8,150)
    spacing_y=number(options,'motorSpacingY',16,4,100)
    spacing_z=number(options,'motorSpacingZ',19,4,100)
    bore=number(options,'motorBore',8,3,50)
    screw=number(options,'motorScrew',3,2,6)
    thickness=number(options,'motorPlate',5,3,12)
    wire=number(options,'motorWire',6,3,15)
    prop=number(options,'propDiameter',152,60,800)
    prop_offset=number(options,'propOffset',8,0,100)
    station=number(options,'motorStation',40,20,70)/100
    pattern=options.get('motorPattern','cross')
    if pattern=='cross':holes=[[-spacing_y/2,0],[spacing_y/2,0],[0,-spacing_z/2],[0,spacing_z/2]]
    elif pattern=='rectangle':holes=[[y,z] for y in [-spacing_y/2,spacing_y/2] for z in [-spacing_z/2,spacing_z/2]]
    else:raise ManufacturingError('Motor vida düzeni geçersiz.')
    if min(math.hypot(y,z) for y,z in holes)-(bore+screw+gap)/2<2:
        raise ManufacturingError('Motor orta deliği vida deliklerine çok yakın. Delik/aralık ölçülerini kontrol edin.')
    radius=max(diameter/2+3,max(math.hypot(y,z) for y,z in holes)+(screw+gap)/2+3,(bore+gap)/2+wire+4)
    wire_center=None
    for angle in [45,0,90,135,180,225,270,315]:
        candidate=np.array([math.cos(math.radians(angle)),math.sin(math.radians(angle))])*(radius-wire/2-2)
        if min(np.linalg.norm(candidate-np.array(hole)) for hole in holes)>=wire/2+(screw+gap)/2+2:
            wire_center=candidate.tolist();break
    if wire_center is None:raise ManufacturingError('Kablo deliği ile motor vidaları için yeterli alan yok. Motor/plaka ve delik ölçülerini kontrol edin.')
    rings=np.asarray(data['fuselage']);poses=[];obstacles=[];body_cuts=[]
    if layout=='single':
        x=float(rings[0,:,0].mean());y=float(rings[0,:,1].mean())
        poses.append(('motor_nose','body',[x,y,0],x+thickness))
    else:
        for panel in data['panels']:
            if panel['kind']!='wing':continue
            root=np.array(panel['root'])*1000;tip=np.array(panel['tip'])*1000
            leading=root+(tip-root)*station
            chord=(float(panel['chord'])+(float(panel['tipChord'])-float(panel['chord']))*station)*1000
            face=[float(leading[0]-20),float(leading[1]-diameter*.35),float(leading[2])]
            poses.append((f"motor_{panel['name']}",panel['name'],face,float(leading[0]+chord*.4)))
        if len(poses)!=2:raise ManufacturingError('Çift motor için iki kanat yarısı gerekli.')
    report=[];prop_disks=[];motor_envelopes=[]
    for name,parent,face,back in poses:
        x,y,z=face
        drills=[cylinder((screw+gap)/2,thickness+2,[x-1,y+hy,z+hz],[1,0,0]) for hy,hz in holes]
        center=cylinder((bore+gap)/2,thickness+2,[x-1,y,z],[1,0,0])
        front_wire=cylinder(wire/2,thickness+2,[x-1,y+wire_center[0],z+wire_center[1]],[1,0,0])
        if parent=='body':
            # Fill the true nose cross-section so a small motor plate cannot float
            # inside a wider hollow fuselage.
            firewall=(outer^box([x-1,-10000,-10000],[x+thickness,10000,10000]))+cylinder(radius,thickness,face,[1,0,0])
            obstacles.append(firewall);body=body+firewall
            for cut in drills+[center,front_wire]:body=body-cut;body_cuts.append(cut)
        else:
            pod_length=back-x
            pod=cylinder(radius,pod_length,face,[1,0,0])
            inner=cylinder(radius-2,pod_length-thickness-3,[x+thickness,y,z],[1,0,0])
            pod=pod-inner
            cable=cylinder(wire/2,radius*2+4,[back-8,y,z-radius-2],[0,0,1])
            for cut in drills+[center,front_wire,cable]:pod=pod-cut
            if (pod^assemblies[parent]).volume()<1:
                raise ManufacturingError(f'{name}: motor taşıyıcısı kanada bağlanamıyor. Motor konumunu veya ölçüsünü değiştirin.')
            assemblies[parent]=(assemblies[parent]+pod)-cable
        prop_x=x-length-prop_offset
        prop_disks.append(cylinder(prop/2,2,[prop_x-1,y,z],[1,0,0]))
        motor_envelopes.append(cylinder(diameter/2,length,[x-length,y,z],[1,0,0]))
        report.append({'name':name,'parent':parent,'face_mm':face,'axis':[1,0,0],
                       'motor_diameter_mm':diameter,'motor_length_mm':length,
                       'plate_thickness_mm':thickness,'plate_radius_mm':radius,
                       'hole_centers_yz_mm':holes,'hole_diameter_mm':screw+gap,
                       'center_bore_mm':bore+gap,'wire_diameter_mm':wire,
                       'front_wire_center_yz_mm':wire_center,
                       'prop_diameter_mm':prop,'prop_plane_x_mm':prop_x,
                       'prop_offset_mm':prop_offset,
                       'station_fraction':station if layout=='twin' else None,
                       'back_x_mm':back,
                       'pattern':pattern})
    fixed_parts=[body,lid,*assemblies.values()]
    for i,disk in enumerate(prop_disks):
        if any((disk^part).volume()>.1 for part in fixed_parts):
            raise ManufacturingError('Pervane gövdeye veya kanada çakışıyor. Pervane çapını azaltın veya kanattaki motor konumunu dışarı alın.')
        if any((motor_envelopes[i]^part).volume()>.1 for part in fixed_parts):
            raise ManufacturingError('Motor gövdesi uçak parçasına çakışıyor. Motor ölçüsü ve yerleşimini kontrol edin.')
    if len(prop_disks)==2 and (prop_disks[0]^prop_disks[1]).volume()>.1:
        raise ManufacturingError('İki pervane birbiriyle çakışıyor. Motorları dışarı alın veya pervane çapını azaltın.')
    return body,obstacles,body_cuts,report
