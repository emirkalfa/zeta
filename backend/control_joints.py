"""Separate hollow control surfaces, alternating pin hinges and link horns.

All rotations use a physical world-space hinge axis, including swept/dihedral
panels. Pins are purchased M2 rods/screws; they are not printed hardware.
"""
import math
import numpy as np
import manifold3d as md


def rotate_about(solid, point, axis, degrees):
    axis=np.asarray(axis,dtype=float);axis/=np.linalg.norm(axis)
    x,y,z=axis;k=np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
    a=math.radians(degrees)
    rot=np.eye(3)*math.cos(a)+(1-math.cos(a))*np.outer(axis,axis)+math.sin(a)*k
    point=np.asarray(point,dtype=float)
    return solid.transform(np.column_stack([rot,point-rot@point]).tolist())


def install_control_surfaces(g,specs,assemblies,frames,wall,gap,pin=2,travel=25,auto_root_splices=False,splice_chord_limit=500,root_splice_clearance=40,center_parts=(),lower_wing_horns=False):
    from backend.manufacturing import (ManufacturingError,box,cylinder,profile,
                                       panel_frame,local_transform,rounded_tail_panel)
    from backend.geometry import TAIL_TIP_START, tail_tip_is_free
    report=[]
    definitions=g.get('control_surfaces',{})
    for spec in specs:
        owner=spec['name'];mat,length=panel_frame(spec)
        chord=spec['chord']*1000;tip=spec['tipChord']*1000
        section=profile(spec['coords'],chord)
        rounded = spec['kind']=='tail' and tail_tip_is_free(owner,g['tail_type'],bool(g.get('tail_booms')))
        full=local_transform(rounded_tail_panel(section,chord,tip,length) if rounded
                             else section.extrude(length,scale_top=[tip/chord]*2),mat)
        trim=frames[owner][1]
        root_margin=14
        if spec['kind']=='wing' and auto_root_splices and chord>splice_chord_limit:
            root_margin=root_splice_clearance
        if spec['kind']=='wing':
            keys = ['flaperon'] if 'flaperon' in definitions else ['flap','aileron']
            controls=[(key,definitions.get(key,{})) for key in keys]
        else:
            key='rudder' if 'vertical' in owner else 'ruddervator' if 'tail_v_' in owner else 'elevator'
            controls=[(key,definitions.get(key,definitions.get('elevator',{})))]
        if spec['kind']=='wing' and g.get('tail_booms'):
            boom=g['tail_booms'];center=boom['y']*1000/abs(mat[2,2])
            reserve=(boom['diameter']*500+18)/abs(mat[2,2])
            divided=[]
            for key,setting in controls:
                lo=max(trim+root_margin,length*float(setting.get('eta_start',.08 if key=='flap' else .55)))
                hi=min(length-22,length*float(setting.get('eta_end',.42 if key=='flap' else .95)))
                if hi<center-reserve or lo>center+reserve:divided.append((key,setting));continue
                segments=[('inboard',lo,min(hi,center-reserve)),('outboard',max(lo,center+reserve),hi)]
                usable=[(key,{**setting,'eta_start':a/length,'eta_end':b/length,'segment':label}) for label,a,b in segments if b-a>=28]
                if not usable:raise ManufacturingError(f'{owner}: bom bağlantısının yanında {key} için yer yok; kanat/kuyruk ölçülerini değiştirin.')
                if key == 'flaperon':
                    usable = [max(usable, key=lambda item: item[1]['eta_end']-item[1]['eta_start'])]
                divided.extend(usable)
            controls=divided
        for key,setting in controls:
            start=max(trim+root_margin,length*float(setting.get('eta_start',.12)))
            end=min(length-22,length*float(setting.get('eta_end',.78 if key=='rudder' else .90)))
            if rounded:
                end = min(end, length*TAIL_TIP_START-gap)
            if end-start<28:
                raise ManufacturingError(f'{owner}: menteşeli {key} için en az 28 mm serbest açıklık gerekir. Kuyruğu/kanadı büyütün.')
            ratio=float(setting.get('chord_ratio',.30 if key!='aileron' else .25))
            slope=(tip-chord)/length
            straight_tail = spec['kind']=='tail'
            opening_start,opening_end=start,end
            if spec['kind']=='wing':
                drift=ratio*chord*abs(mat[0,2]+slope*(1-ratio))
                end_gap=min(3., max(1.2, gap+drift*(1-math.cos(math.radians(travel)))))
                end_gap=min(end_gap,max(0.,(end-start-28)/2))
                start+=end_gap
                end-=end_gap
            def depth(z):return (tip if straight_tail else chord+slope*z)*ratio
            def h(z):return chord+slope*z-depth(z)
            coords=spec['coords'];half=len(coords)//2
            upper=np.array(sorted((float(c['x']),float(c['y_upper'])) for c in coords[:half]))
            lower=np.array(sorted((float(c['x']),float(c['y_lower'])) for c in coords[half:]))
            mid=(start+end)/2
            hinge_fraction=h(mid)/(chord+slope*mid)
            camber=(np.interp(hinge_fraction,*upper.T)+np.interp(hinge_fraction,*lower.T))/2
            def y(z):return camber*(chord+slope*z)
            def world(z):return mat[:,:3]@np.array([h(z),y(z),z])+mat[:,3]
            a=world(start);b=world(end);axis=b-a;axis/=np.linalg.norm(axis)
            radius=max(3,pin/2+gap/2+wall)
            name=f'{owner}_{key}'+('_'+setting['segment'] if setting.get('segment') else '')
            def mask(lo,hi,front=0,back=10000):
                z0=-length;z1=length*2
                poly=[[h(z0)+front,z0],[h(z0)+back,z0],[h(z1)+back,z1],[h(z1)+front,z1]]
                cut=md.CrossSection([poly]).extrude(2000).transform([[1,0,0,0],[0,0,1,-1000],[0,1,0,0]])
                return local_transform(cut,mat).trim_by_plane(axis,float(np.dot(axis,world(lo)))).trim_by_plane(-axis,float(-np.dot(axis,world(hi))))
            original=assemblies[owner]
            moving=original^mask(start,end)
            moving=moving+(full^mask(start,end,0,wall*2))
            for lo,hi in [(start,start+wall*2),(end-wall*2,end)]:
                moving=moving+(full^mask(lo,hi))
            fixed=original-mask(opening_start-gap/2,opening_end+gap/2,-gap)
            corridor=cylinder(radius+gap,np.linalg.norm(b-a)+2*gap,a-axis*gap,axis)
            moving=moving-corridor
            stations=np.linspace(start+12,end-12,3 if end-start>=65 else 2 if end-start>=45 else 1)
            barrels=[];fixed_additions=[];fixed_intervals=[]
            for station in stations:
                knuckle=6.;spacing=gap+knuckle
                for is_moving,center in [(False,station-spacing/2),(True,station+spacing/2)]:
                    lo=center-knuckle/2;hi=center+knuckle/2
                    pa=world(lo);pb=world(hi)
                    barrel=cylinder(radius,np.linalg.norm(pb-pa),pa,axis)
                    xs=(0,radius+wall*3) if is_moving else (-radius-wall*3,0)
                    bridge=box([h(center)+xs[0],-1000,lo],
                               [h(center)+xs[1],1000,hi])
                    bridge=local_transform(bridge,mat)^full
                    bridge=bridge.trim_by_plane(axis,float(np.dot(axis,pa))).trim_by_plane(-axis,float(-np.dot(axis,pb)))
                    if is_moving:moving=moving+bridge+barrel
                    else:
                        fixed_additions.append((barrel,lo,hi));fixed_intervals.append((lo,hi))
                    barrels.append({'moving':is_moving,'start_mm':pa.tolist(),'end_mm':pb.tolist()})
            station=(start+end)/2
            if g.get('tail_type')=='ttail' and owner.startswith('tail_horizontal_'):
                station+=min(7.3,(end-start)*.04)
            hy=y(station);c=chord+slope*station
            horn_height=max(12,float(np.interp(h(station)/c,*upper.T))*c-hy+10)
            offset=max(radius+wall*4,horn_height*math.tan(math.radians(travel))+gap+5)
            horn_depth=depth(station)
            if key=='ruddervator' and horn_depth<offset+4:
                offset=max(radius+gap+3.5,horn_height*math.tan(math.radians(travel))+gap+2)
            base_half=min(7,offset-radius-gap-.5,horn_depth-offset-.5)
            if base_half<3:
                raise ManufacturingError(f'{name}: bağlantı kolu için kontrol veteri çok küçük. Veteri büyütün veya hareket açısını azaltın.')
            hx=h(station)+offset
            link_points=[]
            thickness=max(4,wall*3)
            tip_half=min(3.5,base_half)
            outline=md.CrossSection([[[hx-base_half,hy-wall],[hx+base_half,hy-wall],
                [hx+tip_half,hy+horn_height-2],[hx+tip_half-1,hy+horn_height],
                [hx-tip_half+1,hy+horn_height],[hx-tip_half,hy+horn_height-2]]])
            outline=outline.offset(-.6,circular_segments=24).offset(.6,circular_segments=24)
            horn=outline.extrude(thickness).translate([0,0,station-thickness/2])
            spreader=md.CrossSection.circle(1,48).scale([base_half,6]).extrude(horn_height+wall)
            spreader=spreader.rotate([-90,0,0]).translate([hx,hy-wall,station])
            lower_horn=lower_wing_horns and spec['kind']=='wing'
            if lower_horn:
                mirror=[[1,0,0,0],[0,-1,0,2*hy],[0,0,1,0]]
                spreader=spreader.transform(mirror)
            moving+=(local_transform(spreader,mat)^full^mask(start,end))
            for down in [3,7]:
                point=[hx,hy+horn_height-down,station]
                horn-=cylinder(1,thickness+2,[point[0],point[1],station-thickness/2-1],[0,0,1])
                if lower_horn:
                    point[1]=2*hy-point[1]
                link_points.append((mat[:,:3]@point+mat[:,3]).tolist())
            if lower_horn:
                horn=horn.transform(mirror)
            moving=moving+local_transform(horn,mat)
            chord_axis=mat[:,0]-axis*np.dot(mat[:,0],axis);chord_axis/=np.linalg.norm(chord_axis)
            up_axis=np.cross(axis,chord_axis);theta=math.radians(travel)
            clear_radius=radius+gap
            for sign in [-1,1]:
                normal=-chord_axis*math.cos(theta)+sign*up_axis*math.sin(theta)
                risk=moving.trim_by_plane(normal,float(np.dot(normal,a)-gap))
                if risk.is_empty():continue
                v=np.asarray(risk.to_mesh().vert_properties)[:,:3]-a
                radial=np.sqrt((v@chord_axis)**2+(v@up_axis)**2)
                clear_radius=max(clear_radius,float(radial.max())+gap+.02)
            fixed=fixed-cylinder(clear_radius,np.linalg.norm(b-a)+gap*2,a-axis*gap,axis)
            for lo,hi in fixed_intervals:
                pa=world(lo-gap/2);pb=world(hi+gap/2)
                moving=moving-cylinder(clear_radius+gap,np.linalg.norm(pb-pa),pa,axis)
            joined=[fixed]
            for barrel,lo,hi in fixed_additions:
                center=(lo+hi)/2
                beam=box([h(center)-clear_radius-wall*2,-1000,lo],[h(center),1000,hi])
                beam=(local_transform(beam,mat)^full).trim_by_plane(axis,float(np.dot(axis,world(lo)))).trim_by_plane(-axis,float(-np.dot(axis,world(hi))))
                joined.append(beam+barrel)
            fixed=md.Manifold.batch_boolean(joined,md.OpType.Add)
            p0=world(trim-1);p1=world(length+1)
            bore=cylinder((pin+gap)/2,np.linalg.norm(p1-p0)+2,p0-axis,axis)
            moving=moving-bore;fixed=fixed-bore
            head=world(trim-.5)
            fixed=fixed-cylinder(pin*1.3+gap/2,4,head,axis)
            angles=sorted({-travel,0.,travel,*map(float,np.arange(-travel,travel,5))})
            for angle in angles:
                if (fixed^rotate_about(moving,a,axis,angle)).volume()>.02:
                    raise ManufacturingError(f'{name}: {angle:g}° hareketinde menteşe çakışması oluştu.')
            assemblies[owner]=fixed;assemblies[name]=moving
            frames[name]=(mat,0,spec['kind'])
            report.append({'part':name,'parent':owner,'kind':key,'hinge_point_mm':a.tolist(),
                'hinge_axis':axis.tolist(),'pin_diameter_mm':pin,'pin_hole_mm':pin+gap,
                'pin_length_mm':float(np.linalg.norm(p1-p0)+6),'pin_entry_mm':p1.tolist(),
                'planform_area_m2': depth(mid) * (end-start)
                    * (abs(mat[2,2]) if spec['kind']=='wing' else 1) / 1e6,
                'root_margin_mm':root_margin,'span_start_mm':start,'span_end_mm':end,'travel_deg':[-travel,travel],
                'checked_angles_deg':angles,'link_hole_mm':2,'link_holes_mm':link_points,'link_axis':mat[:,2].tolist(),
                'horn_thickness_mm':thickness,'horn_base_width_mm':2*base_half,'horn_style':'rounded_tapered_spreader',
                'clearance_radius_mm':clear_radius,
                'segment':setting.get('segment'),'pin_group':owner+'_'+key,'knuckles':barrels})
    if g.get('tail_type') == 'ttail':
        join_elevator(report, assemblies, frames, wall, gap, center_parts)
    return report


def join_elevator(report, assemblies, frames, wall, gap, center_parts):
    from backend.manufacturing import ManufacturingError, connected_solids

    right, left = sorted((c for c in report if c['kind'] == 'elevator'),
                         key=lambda c: c['parent'], reverse=True)
    a = np.asarray(right['hinge_point_mm'])
    axis = np.asarray(right['hinge_axis'])
    other = np.asarray(left['hinge_point_mm']) - a
    if np.linalg.norm(np.cross(axis, other)) > .02 or abs(axis[2]) < .999:
        raise ManufacturingError('Tek parça irtifa dümeninin iki menteşe hattı hizalanmadı.')

    moving_parts = [assemblies[item['part']] for item in (right,left)]
    bounds = [solid.bounding_box() for solid in moving_parts]
    inner = [min((b[2],b[5]), key=abs) for b in bounds]
    zmin,zmax = sorted(inner)
    overlap = min(2.,wall)
    first = bounds[0]
    inward = overlap if inner[0] == first[2] else -overlap
    section = moving_parts[0].slice(inner[0]+inward)
    if section.is_empty():
        raise ManufacturingError('İrtifa dümeninin birleşim kesiti oluşturulamadı.')
    bridge = section.extrude(zmax-zmin+2*overlap).translate([0,0,zmin-overlap])
    chord = bridge.bounding_box()[3]-a[0]
    joined = moving_parts[0]+moving_parts[1]+bridge
    poses = [rotate_about(bridge,a,axis,angle) for angle in right['checked_angles_deg']]
    sweep = md.Manifold.batch_hull(poses)
    clearance = md.Manifold.batch_hull([sweep.translate([dx,dy,0])
        for dx in (-gap,chord+gap) for dy in (-gap,gap)])
    for name in assemblies:
        if name in (right['parent'],left['parent']) or name.startswith('tail_vertical'):
            assemblies[name] -= clearance
    for part in center_parts:
        part.solid -= clearance
    if len(connected_solids(joined)) != 1:
        raise ManufacturingError('İrtifa dümeninin orta köprüsü iki hareketli uca bağlanamadı.')
    for item in (right,left):
        del assemblies[item['part']]
        del frames[item['part']]
    name = 'tail_elevator_one_piece'
    assemblies[name] = joined
    frames[name] = (None,0,'tail')
    for item in (right,left):
        for knuckle in item['knuckles']:
            knuckle['parent'] = item['parent']
    right.update(part=name, parents=[right['parent'],left['parent']],
                 knuckles=right['knuckles']+left['knuckles'],
                 link_holes_mm=right['link_holes_mm']+left['link_holes_mm'],
                 planform_area_m2=right['planform_area_m2']+left['planform_area_m2'])
    report.remove(left)
