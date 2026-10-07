import numpy as np

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
                       ):
    """airframe: 'standard' klasik çekici pervaneli model uçak yerleşimi,
    'combat' it dalaşı yarışmaları (Savaşan İHA vb.) için çift bomlu, itici pervaneli yerleşim:
    burun kameraya ayrılır, kısa gövde (pod) kanada bağlanır, kuyruk iki bomla taşınır."""
    combat = airframe == "combat"
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
        wing_area = wingspan**2 / ar
        root_chord = 2 * wing_area / (wingspan * (1 + taper_ratio))
        tip_chord = root_chord * taper_ratio
        aspect_ratio = ar
        if wing_shape == 'ste_tapered':
            half_span = wingspan / 2
            sweep_angle = float(np.degrees(np.arctan(0.75 * root_chord * (1 - taper_ratio) / max(half_span, 0.01))))

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
        target_h = .70 * wing_area * mac / max(htail_arm, .01)
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
    cylindrical_length = fuse_length - nose_length - tailcone_length
    fuse_max_width = fuse_diameter
    fuse_max_height = fuse_diameter

    result = {
        'wingspan': round(wingspan, 3),
        'weight': round(weight, 3),
        'airfoil': airfoil_code,
        'wing_position': wing_position,
        'tail_type': tail_type,
        'wing_shape': wing_shape,
        'root_chord': round(root_chord, 3),
        'tip_chord': round(tip_chord, 3),
        'taper_ratio': round(taper_ratio, 3),
        'wing_area': round(wing_area, 3),
        'aspect_ratio': round(aspect_ratio, 3),
        'mac': round(mac, 3),
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
        'htail_area': round(htail_area, 3),
        'htail_arm': round(htail_arm, 3),
        'vtail_span': round(vtail_span, 3),
        'vtail_chord': round(vtail_root_chord, 3),
        'vtail_tip_chord': round(vtail_tip_chord, 3),
        'vtail_taper': round(vtail_taper, 3),
        'vtail_area': round(vtail_area, 3),
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
            'y': round(boom_y, 3),
            'x_start': round(leading_at_boom + 0.85 * chord_at_boom, 3),
            'x_end': round(last_mount, 3),
            'length': round(last_mount - leading_at_boom - .85*chord_at_boom, 3),
            'diameter': round(max(0.012 * wingspan, 0.008), 3),
        }

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
    arm = geom['htail_arm']
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
