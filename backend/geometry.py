import numpy as np
from .airfoil import get_airfoil_properties


def aerodynamic_centers(g, combat=False):
    """Quarter-chord centers of the actual assembly panel planforms, in metres."""
    def mean(root, tip, span):
        t=tip/root
        return 2*root/3*(1+t+t*t)/(1+t), span/6*(1+2*t)/(1+t)
    wm, wy=mean(g["root_chord"],g["tip_chord"],g["wingspan"])
    dx=(g["root_chord"]-g["tip_chord"])*wy/(g["wingspan"]/2) if g["straight_te"] else wy*np.tan(np.radians(g["sweep_angle"]))
    wing=g["wing_x_pos"]+dx+.25*wm
    if g["tail_type"]=="vtail":
        tm, ty=mean(g["vtail_chord"],g["vtail_tip_chord"],g["vtail_span"])
        tail=g["tail_x_pos"]+ty*(np.cos(np.radians(35)) if combat else 1)*np.tan(np.radians(5))+.25*tm
        return wing, tail, tail
    hm,hy=mean(g["htail_chord"],g["htail_tip_chord"],g["htail_span"])
    vm,vy=mean(g["vtail_chord"],g["vtail_tip_chord"],2*g["vtail_span"])
    vle=g["tail_x_pos"]
    if combat:
        vle+=g["htail_chord"]-g["vtail_chord"] if g["tail_type"]=="ttail" else g["htail_span"]/2*np.tan(np.radians(g["htail_sweep"]))+g["htail_tip_chord"]-g["vtail_chord"]
    hle=g["tail_x_pos"]
    if g["tail_type"]=="ttail":
        hle=vle+g["vtail_span"]*np.tan(np.radians(5))+.25*(g["vtail_tip_chord"]-g["htail_chord"])
    return wing, hle+hy*np.tan(np.radians(g["htail_sweep"]))+.25*hm, vle+vy*np.tan(np.radians(5))+.25*vm

def calculate_geometry(wingspan, weight, airfoil_code, wing_position='mid',
                       tail_type='conventional',
                       manual_mode=False, wing_shape='tapered',
                       man_root_chord=None, man_tip_chord=None,
                       man_sweep=None, man_dihedral=None,
                       man_htail_span=None, man_htail_root=None,
                       man_htail_tip=None, man_htail_sweep=None,
                       man_vtail_span=None, man_vtail_root=None,
                       man_vtail_tip=None,
                       fuse_type='conventional',
                       man_fuse_length=None, man_fuse_width=None,
                       airframe='standard',
                       tria_tail_vh=.45, tria_tail_vv=.03,
                       target_stall_speed=12., reynolds_number=200000, penta_pusher_clearance=.078, penta_motor_diameter=28,
                       ):
    """airframe: 'standard' klasik çekici pervaneli model uçak yerleşimi,
    'combat' it dalaşı yarışmaları (Savaşan İHA vb.) için çift bomlu, itici pervaneli yerleşim:
    burun kameraya ayrılır, kısa gövde (pod) kanada bağlanır, kuyruk iki bomla taşınır."""
    combat = airframe in ("combat","vtol5_fixed")
    fixed_body=airframe=='vtol_fixed'
    fixed_penta=airframe=='vtol5_fixed'
    if manual_mode and any(value is None for value in [man_root_chord,man_tip_chord,
            man_htail_span,man_htail_root,man_htail_tip,man_vtail_span,man_vtail_root,man_vtail_tip]):
        defaults=calculate_geometry(wingspan,weight,airfoil_code,wing_position,tail_type,
                                    wing_shape=wing_shape,airframe=airframe,tria_tail_vh=tria_tail_vh,tria_tail_vv=tria_tail_vv,
                                    target_stall_speed=target_stall_speed,reynolds_number=reynolds_number,penta_pusher_clearance=penta_pusher_clearance,penta_motor_diameter=penta_motor_diameter)
        # Missing manual dimensions inherit the auto design rather than zero-area tails.
        man_root_chord=defaults['root_chord'] if man_root_chord is None else man_root_chord
        man_tip_chord=defaults['tip_chord'] if man_tip_chord is None else man_tip_chord
        man_htail_span=defaults['htail_span'] if man_htail_span is None else man_htail_span
        man_htail_root=defaults['htail_chord'] if man_htail_root is None else man_htail_root
        man_htail_tip=defaults['htail_tip_chord'] if man_htail_tip is None else man_htail_tip
        man_vtail_span=defaults['vtail_span'] if man_vtail_span is None else man_vtail_span
        man_vtail_root=defaults['vtail_chord'] if man_vtail_root is None else man_vtail_root
        man_vtail_tip=defaults['vtail_tip_chord'] if man_vtail_tip is None else man_vtail_tip
    target_stall_speed=float(target_stall_speed)
    if not np.isfinite(target_stall_speed) or not 1<=target_stall_speed<=100:
        raise ValueError('Hedef stall hızı 1 ile 100 m/s arasında olmalı.')
    cl_max=get_airfoil_properties(airfoil_code,Re=reynolds_number)['cl_max']
    required_area=2*float(weight)*9.81/(1.225*target_stall_speed**2*cl_max)
    if manual_mode:
        root_chord = float(man_root_chord or 0.2)
        tip_chord = float(man_tip_chord or 0.1)
        sweep_angle = float(5.0 if man_sweep is None else man_sweep)
        dihedral_angle = float(3.0 if man_dihedral is None else man_dihedral)
        taper_ratio = tip_chord / root_chord if root_chord > 0 else 0.5
        wing_area = (root_chord + tip_chord) / 2 * wingspan
        aspect_ratio = wingspan**2 / wing_area if wing_area > 0 else 7.0
    else:
        # Yarışma uçağında daha düşük açıklık oranı: daha sağlam kanat, daha hızlı yuvarlanma
        ar = 6.0 if combat else 7.0
        dihedral_angle = 3.0
        if wing_shape == 'rectangular':
            taper_ratio = 1.0
            sweep_angle = 0.0
        elif wing_shape == 'ste_tapered':
            taper_ratio = 0.5
            sweep_angle = 5.0
        else:
            taper_ratio = 0.5
            sweep_angle = 5.0
        # Keep the established planform as a minimum; enlarge it when the
        # lift requirement exceeds that area. CLmax is a preliminary estimate.
        wing_area = max(wingspan**2 / ar, required_area)
        root_chord = 2 * wing_area / (wingspan * (1 + taper_ratio))
        tip_chord = root_chord * taper_ratio
        aspect_ratio = wingspan**2 / wing_area
        if wing_shape == 'ste_tapered':
            half_span = wingspan / 2
            sweep_angle = float(np.degrees(np.arctan(0.75 * root_chord * (1 - taper_ratio) / max(half_span, 0.01))))

    root_chord=round(root_chord,3) if manual_mode else np.ceil(root_chord*1000)/1000
    tip_chord=round(tip_chord,3) if manual_mode else np.ceil(tip_chord*1000)/1000
    taper_ratio=tip_chord/root_chord
    wing_area=(root_chord+tip_chord)*wingspan/2
    aspect_ratio=wingspan**2/wing_area
    sweep_angle=round(sweep_angle,1)
    mac = (2 / 3) * root_chord * (1 + taper_ratio + taper_ratio**2) / (1 + taper_ratio)
    mac_y = (wingspan / 6) * (1 + 2 * taper_ratio) / (1 + taper_ratio)
    wing_sweep = sweep_angle

    fuse_length = 0.80 * wingspan
    fuse_max_width = 0.09 * wingspan
    fuse_max_height = 0.05 * wingspan
    wing_x_pos = 0.30 * fuse_length
    tail_x_pos = 0.82 * fuse_length

    if combat:
        # Kısa gövde; kuyruk kolu bomlarla gövdeden bağımsız uzatılır
        fuse_length = 0.50 * wingspan
        wing_x_pos = 0.40 * fuse_length
        tail_x_pos = wing_x_pos + 0.50 * wingspan

    if fuse_type == 'manual' and man_fuse_length is not None:
        fuse_length = float(man_fuse_length)
        fuse_max_width = float(man_fuse_width or 0.09 * wingspan)
        fuse_max_height = fuse_max_width * (0.05 / 0.09)
        wing_x_pos = 0.30 * fuse_length
        tail_x_pos = 0.82 * fuse_length

    htail_arm = tail_x_pos - wing_x_pos
    if fixed_body:
        fuse_length=1.2;wing_x_pos=.36;tail_x_pos=.984;htail_arm=.624
        wing_position='mid';fuse_type='conventional'

    if fixed_penta:
        from .penta_layout import penta_layout
        pod=penta_layout(wingspan,root_chord,penta_motor_diameter,penta_pusher_clearance)
        fuse_length=pod['length'];wing_x_pos=pod['wing'];tail_x_pos=pod['tail']
        htail_arm=tail_x_pos-wing_x_pos;fuse_type='conventional'
        fuse_max_width=pod['width'];fuse_max_height=pod['height']

    if manual_mode:
        htail_span = float(man_htail_span or 0)
        htail_root_chord = float(man_htail_root or 0)
        htail_tip_chord = float(man_htail_tip or 0)
        htail_sweep = float(3.0 if man_htail_sweep is None else man_htail_sweep)
        htail_taper = htail_tip_chord / htail_root_chord if htail_root_chord > 0 else 0.5
        htail_area = (htail_root_chord + htail_tip_chord) / 2 * htail_span if htail_span > 0 else 0

        vtail_span = float(man_vtail_span or 0)
        vtail_root_chord = float(man_vtail_root or 0)
        vtail_tip_chord = float(man_vtail_tip or 0)
        vtail_taper = vtail_tip_chord / vtail_root_chord if vtail_root_chord > 0 else 0.4
        vtail_area = (vtail_root_chord + vtail_tip_chord) / 2 * vtail_span if vtail_span > 0 else 0
    else:
        htail_Vh = 0.70
        htail_taper = 0.5
        htail_span = 0.40 * wingspan
        htail_area = htail_Vh * wing_area * mac / max(htail_arm, 0.01)
        htail_root_chord = 2 * htail_area / (htail_span * (1 + htail_taper))
        htail_tip_chord = htail_root_chord * htail_taper
        htail_sweep = 3.0

        vtail_Vv = 0.045
        vtail_taper = 0.4
        vtail_span = 0.25 * wingspan
        vtail_area = vtail_Vv * wing_area * wingspan / max(htail_arm, 0.01)
        vtail_root_chord = 2 * vtail_area / (vtail_span * (1 + vtail_taper))
        vtail_tip_chord = vtail_root_chord * vtail_taper

        if combat:
            # Bomlar arasında dikdörtgen yatay kuyruk ve bom uçlarında ikiz dikey kuyruk.
            # vtail_* değerleri tek bir dikey kuyruğa aittir (toplam alanın yarısı).
            htail_taper = 1.0
            htail_sweep = 0.0
            htail_span = 0.36 * wingspan
            htail_root_chord = htail_area / htail_span
            htail_tip_chord = htail_root_chord
            vtail_taper = 0.6
            vtail_span = 0.16 * wingspan
            vtail_area = vtail_area / 2
            vtail_root_chord = 2 * vtail_area / (vtail_span * (1 + vtail_taper))
            vtail_tip_chord = vtail_root_chord * vtail_taper

    # V-tail replaces both surfaces. At fixed 35 degrees meet both equivalent
    # tail-volume targets, rather than assigning an arbitrary wing-area fraction.
    if tail_type == 'vtail':
        vgamma = np.radians(35)
        cos2 = np.cos(vgamma) ** 2
        sin2 = np.sin(vgamma) ** 2
        target_h = (.45 if fixed_body else .70) * wing_area * mac / max(htail_arm, .01)
        target_v = .045 * wing_area * wingspan / max(htail_arm, .01)
        manual_v = manual_mode and all(v is not None and float(v)>0 for v in
                                       [man_vtail_span,man_vtail_root,man_vtail_tip])
        if manual_v:
            # Manual span means the combined span of both inclined panels.
            vtail_span = float(man_vtail_span)
            vtail_root_chord = float(man_vtail_root)
            vtail_tip_chord = float(man_vtail_tip)
            vtail_taper = vtail_tip_chord / vtail_root_chord
            vtail_surface_area = (vtail_root_chord+vtail_tip_chord)*vtail_span/2
        else:
            vtail_span = round(0.40 * wingspan,3)
            vtail_taper = 0.6
            vtail_surface_area = max(target_h/cos2,target_v/sin2)
            if fixed_body:
                if not .2<=float(tria_tail_vh)<=1.2 or not .01<=float(tria_tail_vv)<=.12:
                    raise ValueError('Tria kuyruk hacim katsayıları izin verilen aralıkta değil.')
            vtail_root_chord = np.ceil(2 * vtail_surface_area / (vtail_span * (1 + vtail_taper))*1000)/1000
            vtail_tip_chord = np.ceil(vtail_root_chord * vtail_taper*1000)/1000
        # Report areas from the same millimeter dimensions used by preview/STL.
        vtail_span=round(vtail_span,3)
        vtail_root_chord=round(vtail_root_chord,3)
        vtail_tip_chord=round(vtail_tip_chord,3)
        vtail_taper=vtail_tip_chord/vtail_root_chord
        vtail_surface_area=(vtail_root_chord+vtail_tip_chord)*vtail_span/2
        htail_span = vtail_span * np.cos(vgamma)
        htail_area = vtail_surface_area * cos2
        vtail_area = vtail_surface_area * sin2
        htail_root_chord = vtail_root_chord
        htail_tip_chord = vtail_tip_chord
        htail_taper = vtail_taper

    if not manual_mode:
        vh=float(tria_tail_vh) if fixed_body and tail_type=='vtail' else .70
        vv=float(tria_tail_vv) if fixed_body and tail_type=='vtail' else .045
        def layout(hr,ht,vr,vt,vs):
            return dict(root_chord=root_chord,tip_chord=tip_chord,wingspan=wingspan,
                        straight_te=wing_shape=='ste_tapered',sweep_angle=wing_sweep,
                        wing_x_pos=round(wing_x_pos,3),tail_x_pos=round(tail_x_pos,3),tail_type=tail_type,
                        htail_chord=hr,htail_tip_chord=ht,htail_span=htail_span,htail_sweep=htail_sweep,
                        vtail_chord=vr,vtail_tip_chord=vt,vtail_span=vs)
        if tail_type=='vtail':
            def candidate(area):
                span=np.ceil(max(.36*wingspan,np.sqrt(3*area))*1000)/1000 if fixed_body else round(.4*wingspan,3)
                root=np.ceil(2*area/(span*1.6)*1000)/1000
                tip=np.ceil(root*.6*1000)/1000
                wa,ha,va=aerodynamic_centers(layout(root,tip,root,tip,span),combat)
                actual=(root+tip)*span/2
                return span,root,tip,actual,ha-wa
            low,high=1e-6,max(wing_area,vtail_surface_area)
            for _ in range(30):
                sp,cr,ct,area,arm=candidate(high)
                if arm>0 and area*cos2*arm>=vh*wing_area*mac and area*sin2*arm>=vv*wing_area*wingspan:break
                high*=2
            else:raise ValueError('Açıklık ve ağırlık için kuyruk kolu yetersiz. Açıklığı artırın veya ağırlığı azaltın.')
            for _ in range(60):
                mid=(low+high)/2
                sp,cr,ct,area,arm=candidate(mid)
                if arm>0 and area*cos2*arm>=vh*wing_area*mac and area*sin2*arm>=vv*wing_area*wingspan:high=mid
                else:low=mid
            vtail_span,vtail_root_chord,vtail_tip_chord,vtail_surface_area,_=candidate(high)
            vtail_taper=vtail_tip_chord/vtail_root_chord
            htail_span=vtail_span*np.cos(vgamma)
            htail_area=vtail_surface_area*cos2;vtail_area=vtail_surface_area*sin2
            htail_root_chord=vtail_root_chord;htail_tip_chord=vtail_tip_chord;htail_taper=vtail_taper
        else:
            # Coupled T/twin-fin placement changes both AC arms as chords change.
            hr,vr=htail_root_chord,vtail_root_chord
            for _ in range(400):
                wa,ha,va=aerodynamic_centers(layout(hr,hr*htail_taper,vr,vr*vtail_taper,vtail_span),combat)
                if min(ha-wa,va-wa)<=.01:
                    raise ValueError('Açıklık ve ağırlık için kuyruk kolu yetersiz. Açıklığı artırın veya ağırlığı azaltın.')
                next_h=2*vh*wing_area*mac/((ha-wa)*htail_span*(1+htail_taper))
                next_v=2*vv*wing_area*wingspan/((va-wa)*vtail_span*(1+vtail_taper)*(2 if combat else 1))
                if max(abs(next_h-hr),abs(next_v-vr))<1e-10:break
                hr=(hr+next_h)/2;vr=(vr+next_v)/2
            else:raise ValueError('Kuyruk boyutlandırması yakınsamadı. Açıklık ve ağırlığı kontrol edin.')
            htail_root_chord=np.ceil(hr*1000)/1000;htail_tip_chord=np.ceil(htail_root_chord*htail_taper*1000)/1000
            vtail_root_chord=np.ceil(vr*1000)/1000;vtail_tip_chord=np.ceil(vtail_root_chord*vtail_taper*1000)/1000
            htail_taper=htail_tip_chord/htail_root_chord;vtail_taper=vtail_tip_chord/vtail_root_chord
            htail_area=(htail_root_chord+htail_tip_chord)*htail_span/2
            vtail_area=(vtail_root_chord+vtail_tip_chord)*vtail_span/2

    cg_position = 0.25 * mac
    span_efficiency = 0.85

    wing_position_offset = {
        'low': -fuse_max_height * 0.65,
        'mid': 0.0,
        'high': fuse_max_height * 0.65,
    }

    # Fuselage parameters
    if fuse_type == 'manual' and man_fuse_width is not None:
        fuse_diameter = float(man_fuse_width)
    else:
        fuse_diameter = 0.09 * wingspan
    nose_length = 2.0 * fuse_diameter
    tailcone_length = 3.5 * fuse_diameter
    if nose_length+tailcone_length>fuse_length:
        ratio=fuse_length/(nose_length+tailcone_length)
        nose_length*=ratio;tailcone_length*=ratio
    cylindrical_length = max(0.,fuse_length - nose_length - tailcone_length)
    fuse_max_width = fuse_diameter
    fuse_max_height = fuse_diameter
    if fixed_body:
        fuse_max_width=.17;fuse_max_height=.11

    if fixed_penta:
        fuse_max_width=pod['width'];fuse_max_height=pod['height']

    result = {
        'wingspan': round(wingspan, 3),
        'weight': round(weight, 3),
        'airfoil': airfoil_code,
        'wing_position': wing_position,
        'tail_type': tail_type,
        'wing_shape': wing_shape,
        'root_chord': round(root_chord, 3),
        'tip_chord': round(tip_chord, 3),
        'taper_ratio': taper_ratio,
        'wing_area': round(wing_area, 6),
        'aspect_ratio': round(aspect_ratio, 3),
        'mac': round(mac, 6),
        'mac_y': round(mac_y, 3),
        'sweep_angle': round(wing_sweep, 1),
        'dihedral_angle': round(dihedral_angle, 1),
        'wing_position_offset': wing_position_offset.get(wing_position, 0),
        'fuselage_length': round(fuse_length, 3),
        'fuselage_max_width': round(fuse_max_width, 3),
        'fuselage_max_height': round(fuse_max_height, 3),
        'nose_length': round(nose_length, 3),
        'tailcone_length': round(tailcone_length, 3),
        'cylindrical_length': round(cylindrical_length, 3),
        'fuse_diameter': round(fuse_diameter, 3),
        'htail_span': round(htail_span, 3),
        'htail_chord': round(htail_root_chord, 3),
        'htail_tip_chord': round(htail_tip_chord, 3),
        'htail_taper': round(htail_taper, 3),
        'htail_sweep': round(htail_sweep, 1),
        'htail_area': round(htail_area, 6),
        'htail_arm': round(htail_arm, 3),
        'vtail_span': round(vtail_span, 3),
        'vtail_chord': round(vtail_root_chord, 3),
        'vtail_tip_chord': round(vtail_tip_chord, 3),
        'vtail_taper': round(vtail_taper, 3),
        'vtail_area': round(vtail_area, 6),
        'vtail_sweep': 5.0,
        'cg_position': round(cg_position, 3),
        'span_efficiency': span_efficiency,
        'taper_ratio_input': taper_ratio,
        'straight_te': wing_shape == 'ste_tapered',
        'wing_x_pos': round(wing_x_pos, 3),
        'tail_x_pos': round(tail_x_pos, 3),
        'manual_mode': manual_mode,
        'fuse_type': fuse_type,
    }

    result['vtol_fixed_body']=fixed_body or fixed_penta
    if fixed_penta:
        result['penta_motor_diameter']=penta_motor_diameter
        result['body_sizing']={'method':'conceptual_pod_envelope','wing_span_ratio':.38,'root_chord_ratio':1.6,'minimum_fineness':4,'hardware_clearance_mm':penta_pusher_clearance*1000,'certified':False}
    result['airframe'] = 'combat' if combat else 'standard'
    if tail_type == 'vtail':
        result.update(vtail_angle=35.0,
                      vtail_surface_area=round(vtail_surface_area,6),
                      vtail_panel_area=round(vtail_surface_area/2,6),
                      htail_effective_area=round(htail_area,6),
                      vtail_effective_area=round(vtail_area,6),
                      vtail_sizing='manual' if manual_v else 'equivalent_tail_volume')
    if combat:
        boom_y = vtail_span * np.cos(np.radians(35)) / 2 if tail_type=='vtail' else htail_span / 2
        chord_at_boom = root_chord * (1 - (boom_y / (wingspan / 2)) * (1 - taper_ratio))
        leading_at_boom=wing_x_pos+(root_chord-chord_at_boom if wing_shape=='ste_tapered' else boom_y*np.tan(np.radians(sweep_angle)))
        # End at the actual last mounting saddle, rather than carrying unused
        # tube all the way to the trailing edge of a broad V-tail root.
        if tail_type=='vtail':
            last_mount=tail_x_pos+.4*vtail_root_chord+min(.22*vtail_root_chord,.032)/2+.005
        else:
            fin_lead=tail_x_pos+htail_root_chord-vtail_root_chord if tail_type=='ttail' else tail_x_pos+boom_y*np.tan(np.radians(htail_sweep))+htail_tip_chord-vtail_root_chord
            fin_mount=fin_lead+.4*vtail_root_chord+min(.22*vtail_root_chord,.032)/2+.005
            bridge_mount=tail_x_pos+.4*htail_root_chord+.010
            last_mount=bridge_mount if tail_type=='conventional' else fin_mount
        result['vtail_count'] = 1 if tail_type == 'vtail' else 2
        result['tail_booms'] = {
            'y': float(boom_y),
            'x_start': round(leading_at_boom + 0.85 * chord_at_boom, 3),
            'x_end': round(last_mount, 3),
            'length': round(last_mount - leading_at_boom - .85*chord_at_boom, 3),
            'diameter': round(max(0.012 * wingspan, 0.008), 3),
        }

    wing_ac,tail_ac,vertical_ac=aerodynamic_centers(result,combat)
    result.update(wing_ac_x=round(float(wing_ac),6), htail_ac_x=round(float(tail_ac),6),
                  vtail_ac_x=round(float(vertical_ac),6),
                  effective_tail_arm=round(float(tail_ac-wing_ac),6),
                  effective_vertical_tail_arm=round(float(vertical_ac-wing_ac),6))
    result['tail_le_spacing']=round(float(tail_x_pos-wing_x_pos),6)
    result['htail_arm']=result['effective_tail_arm']
    result['tail_sizing_targets']={'horizontal':float(tria_tail_vh) if fixed_body and tail_type=='vtail' else .7,
                                  'vertical':float(tria_tail_vv) if fixed_body and tail_type=='vtail' else .045,'preliminary':True}
    result['tail_sizing_arm']=result['effective_tail_arm']
    result['wing_sizing']={'mode':'manual' if manual_mode else 'automatic',
                           'target_stall_speed':target_stall_speed,'required_area':float(required_area),
                           'cl_max':float(cl_max),'reynolds_number':float(reynolds_number),
                           'density':1.225,'preliminary':True,
                           'estimated_stall_speed':float(np.sqrt(2*weight*9.81/(1.225*wing_area*cl_max)))}

    result['control_surfaces'] = calculate_control_surfaces(
        wingspan, wing_area, root_chord, taper_ratio, htail_area, vtail_area,
        wing_shape, combat=combat,
    )
    if tail_type == 'vtail':
        result['control_surfaces']['ruddervator'] = {'area':round(vtail_surface_area*.30,4),'chord_ratio':.30}
    return result


def calculate_control_surfaces(wingspan, wing_area, root_chord, taper_ratio,
                                htail_area, vtail_area, wing_shape, combat=False):
    half_span = wingspan / 2

    # Aileron: outer portion, ~25% chord (yarışma uçağında yuvarlanma hızı için daha büyük)
    ail_eta_start = 0.45 if combat else 0.55
    ail_eta_end = 0.95 if combat else 0.90
    ail_chord_ratio = 0.30 if combat else 0.25
    ail_c_root = root_chord * (1 - ail_eta_start * (1 - taper_ratio)) * ail_chord_ratio
    ail_c_tip = root_chord * (1 - ail_eta_end * (1 - taper_ratio)) * ail_chord_ratio
    ail_area = (ail_c_root + ail_c_tip) / 2 * (ail_eta_end - ail_eta_start) * half_span * 2

    # Flap: inner portion, ~30% chord
    flap_eta_start = 0.08
    flap_eta_end = 0.42 if combat else 0.50
    flap_chord_ratio = 0.30
    flap_c_root = root_chord * (1 - flap_eta_start * (1 - taper_ratio)) * flap_chord_ratio
    flap_c_tip = root_chord * (1 - flap_eta_end * (1 - taper_ratio)) * flap_chord_ratio
    flap_area = (flap_c_root + flap_c_tip) / 2 * (flap_eta_end - flap_eta_start) * half_span * 2

    return {
        'aileron': {
            'eta_start': ail_eta_start,
            'eta_end': ail_eta_end,
            'chord_ratio': ail_chord_ratio,
            'span_start_m': round(ail_eta_start * half_span, 3),
            'span_end_m': round(ail_eta_end * half_span, 3),
            'chord_at_root': round(ail_c_root, 3),
            'chord_at_tip': round(ail_c_tip, 3),
            'area': round(ail_area, 4),
        },
        'flap': {
            'eta_start': flap_eta_start,
            'eta_end': flap_eta_end,
            'chord_ratio': flap_chord_ratio,
            'span_start_m': round(flap_eta_start * half_span, 3),
            'span_end_m': round(flap_eta_end * half_span, 3),
            'chord_at_root': round(flap_c_root, 3),
            'chord_at_tip': round(flap_c_tip, 3),
            'area': round(flap_area, 4),
        },
        'elevator': {
            'chord_ratio': 0.30,
            'area': round(htail_area * 0.30, 4),
        },
        'rudder': {
            'chord_ratio': 0.30,
            'area': round(vtail_area * 0.30, 4),
        },
    }


def generate_wing_mesh_data(geom, airfoil_coords, n_sections=35, n_foil_points=76):
    half_span = geom['wingspan'] / 2
    root_chord = geom['root_chord']
    tip_chord = geom['tip_chord']
    sweep = np.radians(geom['sweep_angle'])
    dihedral = np.radians(geom['dihedral_angle'])
    taper = geom['taper_ratio']

    foil_x = np.array([c['x'] for c in airfoil_coords])
    foil_y_upper = np.array([c['y_upper'] for c in airfoil_coords])
    foil_y_lower = np.array([c['y_lower'] for c in airfoil_coords])

    n_half = len(foil_x) // 2
    upper_idx = np.arange(n_half)
    lower_idx = np.arange(n_half - 1, -1, -1) + n_half

    sections_right = []
    sections_left = []

    for i in range(n_sections + 1):
        eta = i / n_sections
        y_pos = eta * half_span

        chord = root_chord * (1 - eta * (1 - taper))
        if geom.get('straight_te', False):
            x_offset = root_chord - chord
        else:
            x_offset = y_pos * np.tan(sweep)
        y_offset = y_pos * np.sin(dihedral)

        x_upper = foil_x[upper_idx] * chord + x_offset
        y_upper = foil_y_upper[upper_idx] * chord + y_offset
        z_upper = np.full_like(x_upper, y_pos)

        x_lower = foil_x[lower_idx] * chord + x_offset
        y_lower = foil_y_lower[lower_idx] * chord + y_offset
        z_lower = np.full_like(x_lower, y_pos)

        sec_right = {
            'upper': np.column_stack([x_upper, y_upper, z_upper]),
            'lower': np.column_stack([x_lower, y_lower, z_lower]),
            'eta': eta,
            'chord': chord,
        }
        sections_right.append(sec_right)

        sec_left = {
            'upper': np.column_stack([x_upper, y_upper, -z_upper]),
            'lower': np.column_stack([x_lower, y_lower, -z_lower]),
            'eta': eta,
            'chord': chord,
        }
        sections_left.append(sec_left)

    return {
        'right': sections_right,
        'left': sections_left,
        'n_sections': n_sections,
        'n_points': n_half,
    }

def generate_conventional_fuselage_mesh_data(geom, n_circumferential=28):
    length = geom['fuselage_length']
    radius = geom['fuse_diameter'] / 2
    max_w = geom['fuselage_max_width'] / 2
    max_h = geom['fuselage_max_height'] / 2
    nose_len = geom['nose_length']
    tailcone_len = geom['tailcone_length']
    cyl_len = geom['cylindrical_length']
    theta = np.linspace(0, 2 * np.pi, n_circumferential + 1)[:-1]

    def el_pts(x_pos, w, h):
        ct = np.cos(theta); st = np.sin(theta)
        return np.column_stack([np.full_like(theta, x_pos), h * st, w * ct])

    n_nose = 24
    n_cyl = 16
    n_tail = 30
    sections = []

    # Nose: aerodynamic ogive shape
    for i in range(n_nose + 1):
        eta = i / n_nose
        x_pos = eta * nose_len
        t = eta * eta * (3 - 2 * eta)
        w = max_w * t
        h = max_h * t
        sections.append(el_pts(x_pos, w, h))

    # Cylindrical section: elliptical
    for i in range(n_cyl + 1):
        eta = i / n_cyl
        x_pos = nose_len + eta * cyl_len
        sections.append(el_pts(x_pos, max_w, max_h))

    # Tail cone: smooth taper
    for i in range(n_tail + 1):
        eta = i / n_tail
        x_pos = nose_len + cyl_len + eta * tailcone_len
        t = 1 - eta * eta * (3 - 2 * eta)
        sections.append(el_pts(x_pos, max_w * t, max_h * t))

    return {
        'sections': sections,
        'n_spanwise': n_nose + n_cyl + n_tail + 3,
        'n_circumferential': n_circumferential,
    }


def generate_tail_mesh_data(geom, airfoil_coords, n_sections=20, n_foil_points=38):
    result = {}

    # Horizontal tail
    half_span = geom['htail_span'] / 2
    chord = geom['htail_chord']
    arm = geom.get('tail_le_spacing',geom['tail_x_pos']-geom['wing_x_pos'])
    htail_sweep = np.radians(geom.get('htail_sweep', 3.0))
    vtail_sweep = np.radians(geom.get('vtail_sweep', 5.0))

    foil_x = np.array([c['x'] for c in airfoil_coords])
    foil_y_upper = np.array([c['y_upper'] for c in airfoil_coords])
    foil_y_lower = np.array([c['y_lower'] for c in airfoil_coords])
    n_half = len(foil_x) // 2
    upper_idx = np.arange(n_half)
    lower_idx = np.arange(n_half - 1, -1, -1) + n_half

    htail_sections = {'right': [], 'left': []}
    for i in range(n_sections + 1):
        eta = i / n_sections
        y_pos = eta * half_span
        c = chord * (1 - eta * (1 - geom['htail_taper']))
        x_offset = arm + y_pos * np.tan(htail_sweep)

        xu = foil_x[upper_idx] * c + x_offset
        yu = foil_y_upper[upper_idx] * c
        zu = np.full_like(xu, y_pos)

        xl = foil_x[lower_idx] * c + x_offset
        yl = foil_y_lower[lower_idx] * c
        zl = np.full_like(xl, y_pos)

        htail_sections['right'].append({
            'upper': np.column_stack([xu, yu, zu]),
            'lower': np.column_stack([xl, yl, zl]),
        })
        htail_sections['left'].append({
            'upper': np.column_stack([xu, yu, -zu]),
            'lower': np.column_stack([xl, yl, -zl]),
        })

    result['horizontal'] = htail_sections

    # Vertical tail
    vspan = geom['vtail_span']
    vchord = geom['vtail_chord']
    varm = arm + 0.2
    symm_foil = np.zeros(len(foil_x))
    # Use symmetric airfoil for vertical tail (half on each side)
    vert_sections = []
    for i in range(n_sections + 1):
        eta = i / n_sections
        z_pos = eta * vspan
        c = vchord * (1 - eta * (1 - geom['vtail_taper']))
        x_offset = varm + z_pos * np.tan(vtail_sweep)

        xu = foil_x[upper_idx] * c + x_offset
        yu = np.full_like(xu, 0.0)
        zu = np.full_like(xu, z_pos)

        # For vertical tail, we need opposite side too
        xl = foil_x[lower_idx] * c + x_offset
        yl = np.full_like(xl, 0.0)
        zl = np.full_like(xl, z_pos)

        # Right side (positive y)
        xr = foil_x[upper_idx] * c + x_offset
        yr = foil_y_upper[upper_idx] * c * 0.5
        zr = np.full_like(xr, z_pos)

        xl2 = foil_x[lower_idx] * c + x_offset
        yl2 = foil_y_lower[lower_idx] * c * 0.5
        zl2 = np.full_like(xl2, z_pos)

        vert_sections.append({
            'right': np.column_stack([xr, yr, zr]),
            'left': np.column_stack([xl2, yl2, zl2]),
        })

    result['vertical'] = vert_sections

    return result
