"""Recessed control-servo seats with replaceable skin covers."""
import numpy as np


def service_port(solid, envelope, protected, x, station, floor, dimensions, wall, gap, cover=True):
    from .manufacturing import box, cylinder, connected_solids, rounded_hatch_prism

    length, width, height = dimensions
    half_x, half_z = length / 2 + gap, width / 2 + gap
    margin = max(4., wall + 1.)
    lo = np.array([x-half_x, floor-.5, station-half_z])
    hi = np.array([x+half_x, floor+height+1., station+half_z])
    seat_zone = box(lo- [margin,0,margin],hi+[margin,wall,margin])
    opening = box(lo-[0,100,0],hi)
    recess_lo=[lo[0]-margin,floor-100,lo[2]]
    recess_hi=[hi[0]+margin,floor+wall+2,hi[2]]
    radius = min(3., half_z*.5)
    def cover_shape(inset):
        return rounded_hatch_prism(recess_lo[0]+inset,recess_hi[0]-inset,
            half_z-inset,radius-inset,recess_lo[1],recess_hi[1]).translate([0,0,station])
    cavity = opening ^ envelope
    installed = box(lo+[0,wall+.3,0],hi)
    if (installed-envelope).volume()>.1 or (seat_zone^protected).volume()>.1:
        return None
    if cover:
        cap=solid ^ cover_shape(gap/2)
        cavity+=cover_shape(0.) ^ envelope
        if cap.is_empty() or len(connected_solids(cap))!=1:
            return None
    else:
        cap=None
    arm = box([x+half_x-5,floor-100,station-3],[x+half_x+.8,floor+height+1,station+3])
    wire = find_wire_passage(solid,envelope,protected,lo,hi,x,station,floor,wall,margin)
    if wire is None:
        return None
    wire_tool,wire_start,wire_end = wire
    fixed = (solid+(seat_zone ^ envelope))-cavity-arm-wire_tool
    holes = []
    for px in (x-half_x-margin/2,x+half_x+margin/2):
        pilot = cylinder(.85,height+wall+4,[px,floor-1,station],[0,1,0])
        if (fixed^pilot).volume() < .15:
            return None
        fixed-=pilot
        if cover:
            cap-=cylinder(1.15,height+wall+4,[px,floor-1,station],[0,1,0])
        holes.append([px,floor,station])
    if cover:
        cap-=arm
        if (cap^fixed).volume()>.02 or len(connected_solids(cap))!=1:
            return None
    if len(connected_solids(fixed))!=1:
        return None
    return fixed,cap,cavity+arm+wire_tool,holes,wire_start,wire_end


def find_wire_passage(solid,envelope,protected,lo,hi,x,station,floor,wall,margin):
    from .manufacturing import cylinder

    radius = 1.5
    wire_heights = (floor+wall+3., (lo[1]+hi[1])/2, hi[1]-2.)
    for depth in (margin+7,margin+12,margin+20,margin+30):
        for y in wire_heights:
            paths = (([x,y,lo[2]+2],[0,0,-1]),
                     ([x,y,hi[2]-2],[0,0,1]),
                     ([lo[0]+2,y,station],[-1,0,0]),
                     ([hi[0]-2,y,station],[1,0,0]),
                     ([x,hi[1]-2,station],[0,1,0]))
            for inlet,direction in paths:
                start=np.asarray(inlet)
                axis=np.asarray(direction)
                end=start+depth*axis
                terminal=cylinder(radius,4,end-4*axis,axis)
                if (terminal-envelope).volume()>.05 or (terminal^solid).volume()>.05:
                    continue
                wire=cylinder(radius,depth,start,axis)
                if (wire-envelope).volume()<=.05 and (wire^protected).volume()<=.05:
                    return wire,start,end
    return None


def install_control_servos(body, outer, assemblies, specs, controls, cuts,
                           body_obstacles, options, wall, gap, tail_carrier, motors, motor_parts, exclusions):
    from manifold3d import Manifold, OpType
    from .manufacturing import Part, ManufacturingError, panel_frame, profile, local_transform, box

    mode = int(options.get('controlServoMount',0))
    if mode not in range(4):
        raise ManufacturingError('Geçersiz kontrol servo yuvası seçimi.')
    if not mode:
        return body,[],[]
    dims = tuple(float(options.get(k,v)) for k,v in
                 zip(('controlServoLength','controlServoWidth','controlServoHeight'),(23,12,10)))
    if not all(np.isfinite(v) and lo<=v<=hi for v,lo,hi in zip(dims,(12,7,7),(45,24,30))):
        raise ManufacturingError('Kontrol servo ölçüleri izin verilen aralıkta olmalı.')
    parts,report=[],[]
    by_name = {spec['name']:spec for spec in specs}
    for control in controls:
        parent = control['parent']
        wing = parent.startswith('wing_')
        if wing and not mode&1 or not wing and not mode&2:
            continue
        record={'control':control['part'],'dimensions_mm':list(dims)}
        horn=np.asarray(control['link_holes_mm'][0])
        if wing:
            spec=by_name[parent]
            frame,span=panel_frame(spec)
            inverse=np.linalg.inv(frame[:,:3])
            local=np.column_stack([inverse,-inverse@frame[:,3]])
            to_local=lambda solid:local_transform(solid,local)
            root,tip=spec['chord']*1000,spec['tipChord']*1000
            envelope=profile(spec['coords'],root).extrude(span,scale_top=[tip/root]*2)
            fixed=to_local(assemblies[parent])
            obstacles=[to_local(c) for c in cuts.get(parent,[])+exclusions.get(parent,[])]
            obstacles.extend(to_local(part.solid) for part in motor_parts)
            for motor in motors:
                if motor.get('parent')!=parent or 'back_x_mm' not in motor:
                    continue
                mx,my,mz=motor['face_mm']
                radius=motor['plate_radius_mm']+wall
                keepout=box([mx,my-radius,mz-radius],
                            [motor['back_x_mm']+wall,my+radius,mz+radius])
                obstacles.append(to_local(keepout))
            location=inverse@(horn-frame[:,3])
            hinge_lines={}
            for surface in controls:
                if surface['parent']!=parent:
                    continue
                hinge=inverse@(np.asarray(surface['hinge_point_mm'])-frame[:,3])
                direction=inverse@np.asarray(surface['hinge_axis'])
                slope=direction[0]/direction[2]
                intercept=hinge[0]-slope*hinge[2]
                hinge_lines[surface['part']]=(intercept,slope)
                normal=np.array([1.,0.,-slope])
                norm=np.linalg.norm(normal)
                limit=(intercept-surface['clearance_radius_mm']-wall-gap)/norm
                opening=envelope.trim_by_plane(normal/norm,limit)
                opening=opening.trim_by_plane([0,0,1],surface['span_start_mm']-gap)
                opening=opening.trim_by_plane([0,0,-1],-surface['span_end_mm']-gap)
                if not opening.is_empty():
                    obstacles.append(opening)
            intercept,slope=hinge_lines[control['part']]
            stations=[location[2]+delta for delta in (0,22,-22,44,-44)]
            candidates=[(intercept+slope*z-dims[0]/2-extra,z)
                        for z in stations for extra in (20,27,34,44,52,62,76,88)]
            cover=True
        else:
            parent=tail_carrier or 'body'
            if parent!='body' and parent not in assemblies:
                continue
            shell=body if parent=='body' else assemblies[parent]
            envelope_world=outer if parent=='body' else shell.hull()
            bounds=envelope_world.bounding_box()
            side=1 if horn[2]>=0 else -1
            frame=np.array([[1.,0.,0.,0.],[0.,0.,side,0.],[0.,-side,0.,0.]])
            local=np.column_stack([frame[:,:3].T,[0.,0.,0.]])
            to_local=lambda solid:local_transform(solid,local)
            envelope=to_local(envelope_world)
            fixed = to_local(shell)
            obstacles=[to_local(c) for c in cuts.get(parent,[])]
            if parent=='body':
                obstacles.extend(to_local(c) for c in body_obstacles)
            root=np.asarray(by_name[control['parent']]['root'])*1000
            candidates=[(min(root[0],bounds[3])-dims[0]/2-delta,root[1]*side+shift)
                        for delta in (20,33,48,65,85,105,130) for shift in (-8,-15,0,8)]
            cover=False
        protected=Manifold.batch_boolean(obstacles, OpType.Add)
        for x,z in candidates:
            extent=envelope ^ box([x-dims[0]/2,-10000,z-dims[1]/2],
                                  [x+dims[0]/2,10000,z+dims[1]/2])
            if extent.is_empty():
                continue
            samples=[envelope ^ box([x+dx-.15,-10000,z+dz-.15],
                                    [x+dx+.15,10000,z+dz+.15])
                     for dx in (-(dims[0]/2+gap),0,dims[0]/2+gap)
                     for dz in (-(dims[1]/2+gap),0,dims[1]/2+gap)]
            if any(sample.is_empty() for sample in samples):
                continue
            floor=max(sample.bounding_box()[1] for sample in samples)
            made=service_port(fixed,envelope,protected,x,z,floor,dims,wall,gap,cover)
            if not made:
                continue
            fixed,cap,opening,holes,wire_start,wire_end=made
            result=local_transform(fixed,frame)
            world_opening=local_transform(opening,frame)
            exclusions.setdefault(parent,[]).append(world_opening)
            if not wing:
                cuts.setdefault(parent,[]).append(world_opening)
            if parent=='body':
                body=result
            else:
                assemblies[parent]=result
            name=control['part']+'_control_servo_cover'
            if cover:
                parts.append(Part(name,local_transform(cap,frame),2,frame,'wing'))
            report.append(dict(record,parent=parent,cover=name if cover else None,
                status='ready',mount_points_mm=[(frame[:,:3]@p+frame[:,3]).tolist() for p in holes],
                linkage_target_mm=horn.tolist(),
                wire_diameter_mm=3.,
                wire_ends_mm=[(frame[:,:3]@p+frame[:,3]).tolist() for p in (wire_start,wire_end)]))
            break
        else:
            report.append(dict(record,parent=parent,status='no_clearance'))
    return body,parts,report
