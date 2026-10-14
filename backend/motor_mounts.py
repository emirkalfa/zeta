"""Dimensioned BLDC firewalls and twin wing nacelles; motors/props are purchased parts."""
import math
import numpy as np
from backend.manufacturing import number,box,cylinder,ManufacturingError,Part

def motor_sized_fuselage(data):
    if data['geometry'].get('fuse_preset') in ('vtol','vtol5'):return data
    if not data['geometry'].get('tail_booms') or data.get('options',{}).get('motorLayout')!='single':return data
    radius=number(data['options'],'motorDiameter',28,10,100)/2
    rings=np.asarray(data['fuselage'],dtype=float).copy()
    if rings.ndim!=3 or rings.shape[0]<3 or rings.shape[1]<16 or rings.shape[2]!=3 or not np.isfinite(rings).all():return data
    if rings[-1,0,0]<=rings[0,0,0]:return data
    cy,cz=rings[-1,:,1:].mean(axis=0)
    distances=np.linalg.norm(rings[-1,:,1:]-[cy,cz],axis=1)
    if np.all(abs(distances-radius)<.01):return data
    first,last=rings[0,0,0],rings[-1,0,0];start=first+.8*(last-first)
    u=np.clip((rings[:,:,0]-start)/(last-start),0,1);blend=u*u*(3-2*u)
    delta=rings[:,:,1:]-[cy,cz];length=np.linalg.norm(delta,axis=2)
    target=np.array([cy,cz])+radius*delta/np.maximum(length[:,:,None],1e-12)
    rings[:,:,1:]+=blend[:,:,None]*(target-rings[:,:,1:])
    return {**data,'fuselage':rings.tolist()}

def install_motor_mounts(body,lid,assemblies,data,outer,wall,gap,service_parts=None):
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
    if data['geometry'].get('fuse_preset')=='vtol5':thickness=max(10,thickness)
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
    exact_face=layout=='single' and bool(data['geometry'].get('tail_booms'))
    radius=diameter/2 if exact_face else max(diameter/2+3,max(math.hypot(y,z) for y,z in holes)+(screw+gap)/2+3,(bore+gap)/2+wire+4)
    if exact_face and max(math.hypot(y,z) for y,z in holes)+(screw+gap)/2+max(2,wall)>radius:
        raise ManufacturingError('Motor çapı bu vida aralıkları için küçük. Motorun gerçek çapını ve vida ölçülerini kontrol edin.')
    wire_center=None
    for angle in [45,0,90,135,180,225,270,315]:
        candidate=np.array([math.cos(math.radians(angle)),math.sin(math.radians(angle))])*(radius-wire/2-(max(1.5,wall) if exact_face else 2))
        if (not exact_face or np.linalg.norm(candidate)>=(bore+gap)/2+wire/2+2) and min(np.linalg.norm(candidate-np.array(hole)) for hole in holes)>=wire/2+(screw+gap)/2+2:
            wire_center=candidate.tolist();break
    if wire_center is None:raise ManufacturingError('Kablo deliği ile motor vidaları için yeterli alan yok. Motor/plaka ve delik ölçülerini kontrol edin.')
    rings=np.asarray(data['fuselage']);poses=[];obstacles=[];body_cuts=[]
    pusher=bool(data['geometry'].get('tail_booms'))
    if layout=='single':
        ring=rings[-1] if pusher else rings[0]
        x=float(ring[:,0].mean());y=float(ring[:,1].mean())
        poses.append(('motor_rear' if pusher else 'motor_nose','body',[x,y,0],x-thickness if pusher else x+thickness))
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
        direction=-1 if parent=='body' and pusher else 1
        axis=[direction,0,0]
        drills=[cylinder((screw+gap)/2,thickness+2,[x-direction,y+hy,z+hz],axis) for hy,hz in holes]
        center=cylinder((bore+gap)/2,thickness+2,[x-direction,y,z],axis)
        front_wire=cylinder(wire/2,thickness+2,[x-direction,y+wire_center[0],z+wire_center[1]],axis)
        if parent=='body':
            # Fill the true nose cross-section so a small motor plate cannot float
            # inside a wider hollow fuselage.
            firewall=(outer^box([min(x-direction,back),-10000,-10000],[max(x-direction,back),10000,10000]))+cylinder(radius,thickness,face,axis)
            obstacles.append(firewall);body=body+firewall
            for cut in drills+[center,front_wire]:body=body-cut;body_cuts.append(cut)
        else:
            pod_length=back-x
            pod=cylinder(radius,pod_length,face,[1,0,0])
            from backend.wing_blend import motor_wing_transition
            spec=next(p for p in data['panels'] if p['name']==parent)
            leading=(np.asarray(spec['root'])+(np.asarray(spec['tip'])-spec['root'])*station)*1000
            pod+=motor_wing_transition(spec,leading,station,radius,y,back)
            inner=cylinder(radius-2,pod_length-thickness-3,[x+thickness,y,z],[1,0,0])
            pod=pod-inner
            cable=cylinder(wire/2,radius*2+4,[back-8,y,z-radius-2],[0,0,1])
            for cut in drills+[center,front_wire,cable]:pod=pod-cut
            if (pod^assemblies[parent]).volume()<1:
                raise ManufacturingError(f'{name}: motor taşıyıcısı kanada bağlanamıyor. Motor konumunu veya ölçüsünü değiştirin.')
            # Lower half-shell provides hand/tool access behind all four bolts.
            start=x+thickness+2;end=back-4;seam=y-2
            if end-start<18:raise ManufacturingError('Motor taşıyıcısı servis kapağı için çok kısa.')
            opening=box([start,y-radius-5,z-radius-5],[end,seam,z+radius+5])
            cover=(pod^box([start+gap,y-radius-5,z-radius-5],[end-gap,seam-gap,z+radius+5]))
            combined=(assemblies[parent]+pod)-opening-cable
            fasteners=[]
            for side in [-1,1]:
                bx=(start+end)/2;bz=z+side*(radius-3)
                boss=box([bx-5,seam,bz-4],[bx+5,y+3,bz+4])
                tab=box([bx-5,seam-9,bz-4],[bx+5,seam-gap,bz+4])
                # Limit tabs to the nacelle outline; retain the curved outer shell.
                tab=tab^cylinder(radius,10,[bx-5,y,z],[1,0,0])
                drill=cylinder((3+gap)/2,20,[bx,seam-12,bz],[0,1,0])
                nut=cylinder((5.5+gap)/math.sqrt(3),2.6,[bx,seam-.01,bz],[0,1,0],sides=6)
                combined=(combined+boss)-drill-nut
                cover=(cover+tab)-drill
                fasteners.append([bx,bz])
            assemblies[parent]=combined
            if service_parts is not None:service_parts.append(Part(name+'_service_cover',cover,0,family='wing'))
        prop_x=x-direction*(length+prop_offset)
        prop_disks.append(cylinder(prop/2,2,[prop_x-1,y,z],[1,0,0]))
        motor_envelopes.append(cylinder(diameter/2,length,[x-direction*length,y,z],axis))
        report.append({'name':name,'parent':parent,'face_mm':face,'axis':axis,
                       'motor_diameter_mm':diameter,'motor_length_mm':length,
                       'plate_thickness_mm':thickness,'plate_radius_mm':radius,
                       'hole_centers_yz_mm':holes,'hole_diameter_mm':screw+gap,
                       'center_bore_mm':bore+gap,'wire_diameter_mm':wire,
                       'front_wire_center_yz_mm':wire_center,
                       'prop_diameter_mm':prop,'prop_plane_x_mm':prop_x,
                       'prop_offset_mm':prop_offset,
                       'station_fraction':station if layout=='twin' else None,
                       'back_x_mm':back,
                       'pattern':pattern,'smooth_wing_transition':parent!='body',
                       'service_cover':name+'_service_cover' if parent!='body' else None,
                       'service_screws':{'diameter_mm':3,'nut_flat_mm':5.5,'positions_xz_mm':fasteners,'axis':[0,1,0]} if parent!='body' else None})
    fixed_parts=[body,lid,*assemblies.values()]
    for i,disk in enumerate(prop_disks):
        if any((disk^part).volume()>.1 for part in fixed_parts):
            raise ManufacturingError('Pervane gövdeye veya kanada çakışıyor. Pervane çapını azaltın veya kanattaki motor konumunu dışarı alın.')
        if any((motor_envelopes[i]^part).volume()>.1 for part in fixed_parts):
            raise ManufacturingError('Motor gövdesi uçak parçasına çakışıyor. Motor ölçüsü ve yerleşimini kontrol edin.')
    if len(prop_disks)==2 and (prop_disks[0]^prop_disks[1]).volume()>.1:
        raise ManufacturingError('İki pervane birbiriyle çakışıyor. Motorları dışarı alın veya pervane çapını azaltın.')
    return body,obstacles,body_cuts,report
