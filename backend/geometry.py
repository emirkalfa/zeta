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
                       fuse_type='conventional'):
    if manual_mode:
        root_chord = float(man_root_chord or 0.2)
        tip_chord = float(man_tip_chord or 0.1)
        sweep_angle = float(man_sweep or 5.0)
        dihedral_angle = float(man_dihedral or 3.0)
        taper_ratio = tip_chord / root_chord if root_chord > 0 else 0.5
        wing_area = (root_chord + tip_chord) / 2 * wingspan
        aspect_ratio = wingspan**2 / wing_area if wing_area > 0 else 7.0
    else:
        ar = 7.0
        sweep_angle = 5.0
        dihedral_angle = 3.0
        if wing_shape == 'rectangular':
            taper_ratio = 1.0
            sweep_angle = 0.0
        else:
            taper_ratio = 0.5
        wing_area = wingspan**2 / ar
        root_chord = 2 * wing_area / (wingspan * (1 + taper_ratio))
        tip_chord = root_chord * taper_ratio
        aspect_ratio = ar

    mac = (2 / 3) * root_chord * (1 + taper_ratio + taper_ratio**2) / (1 + taper_ratio)
    mac_y = (wingspan / 6) * (1 + 2 * taper_ratio) / (1 + taper_ratio)
    wing_sweep = sweep_angle

    fuse_length = 0.80 * wingspan
    fuse_max_width = 0.09 * wingspan
    fuse_max_height = 0.05 * wingspan
    wing_x_pos = 0.30 * fuse_length
    tail_x_pos = 0.82 * fuse_length
    htail_arm = tail_x_pos - wing_x_pos

    if manual_mode:
        htail_span = float(man_htail_span or 0)
        htail_root_chord = float(man_htail_root or 0)
        htail_tip_chord = float(man_htail_tip or 0)
        htail_sweep = float(man_htail_sweep or 3.0)
        htail_taper = htail_tip_chord / htail_root_chord if htail_root_chord > 0 else 0.5
        htail_area = (htail_root_chord + htail_tip_chord) / 2 * htail_span if htail_span > 0 else 0

        vtail_span = float(man_vtail_span or 0)
        vtail_root_chord = float(man_vtail_root or 0)
        vtail_tip_chord = float(man_vtail_tip or 0)
        vtail_taper = vtail_tip_chord / vtail_root_chord if vtail_root_chord > 0 else 0.4
        vtail_area = (vtail_root_chord + vtail_tip_chord) / 2 * vtail_span if vtail_span > 0 else 0
    else:
        htail_Vh = 0.55
        htail_taper = 0.5
        htail_span = 0.35 * wingspan
        htail_area = htail_Vh * wing_area * mac / max(htail_arm, 0.01)
        htail_root_chord = 2 * htail_area / (htail_span * (1 + htail_taper))
        htail_tip_chord = htail_root_chord * htail_taper
        htail_sweep = 3.0

        vtail_Vv = 0.035
        vtail_taper = 0.4
        vtail_span = 0.20 * wingspan
        vtail_area = vtail_Vv * wing_area * wingspan / max(htail_arm, 0.01)
        vtail_root_chord = 2 * vtail_area / (vtail_span * (1 + vtail_taper))
        vtail_tip_chord = vtail_root_chord * vtail_taper

    cg_position = 0.25 * mac
    span_efficiency = 0.85

    wing_position_offset = {
        'low': -fuse_max_height * 0.65,
        'mid': 0.0,
        'high': fuse_max_height * 0.65,
    }

    # Conventional fuselage parameters
    fuse_diameter = 0.09 * wingspan
    nose_length = 2.0 * fuse_diameter
    tailcone_length = 3.5 * fuse_diameter
    cylindrical_length = fuse_length - nose_length - tailcone_length
    if fuse_type == 'conventional':
        fuse_max_width = fuse_diameter
        fuse_max_height = fuse_diameter

    result = {
        'wingspan': round(wingspan, 3),
        'weight': round(weight, 3),
        'airfoil': airfoil_code,
        'wing_position': wing_position,
        'tail_type': tail_type,
        'wing_shape': wing_shape,
        'fuse_type': fuse_type,
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
        'wing_x_pos': round(wing_x_pos, 3),
        'tail_x_pos': round(tail_x_pos, 3),
        'manual_mode': manual_mode,
    }

    return result

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

def generate_fuselage_mesh_data(geom, n_circumferential=24):
    length = geom['fuselage_length']
    max_w = geom['fuselage_max_width'] / 2
    max_h = geom['fuselage_max_height'] / 2
    theta = np.linspace(0, 2 * np.pi, n_circumferential + 1)[:-1]

    def el_pts(x_pos, w, h):
        ct = np.cos(theta); st = np.sin(theta)
        return np.column_stack([np.full_like(theta, x_pos), h * st, w * ct])

    sections = []
    pod_ratio = 0.35
    nose_ratio = 0.18
    n_pod = 25
    boom_w = max(max_w * 0.045, 0.008)
    boom_h = max(max_h * 0.035, 0.006)

    for i in range(n_pod + 1):
        eta = i / n_pod
        x_pos = eta * pod_ratio * length
        if eta < nose_ratio / pod_ratio:
            u = eta * pod_ratio / nose_ratio
            t = u * u * (3 - 2 * u)
            ws = t
            hs = t * 0.70
        elif eta > 0.80:
            u = (eta - 0.80) / 0.20
            ss = u * u * (3 - 2 * u)
            ws = 1 - 0.45 * ss
            hs = 1 - 0.55 * ss
        else:
            ws = 1; hs = 1
        w = max_w * max(ws, boom_w / max_w * 0.8)
        h = max_h * max(hs, boom_h / max_h * 0.8)
        sections.append(el_pts(x_pos, w, h))

    n_boom = 20
    for i in range(n_boom + 1):
        eta = i / n_boom
        x_pos = (pod_ratio + eta * (1 - pod_ratio)) * length
        r_scale = 1
        if eta > 0.88:
            r_scale = 1 - (eta - 0.88) / 0.12 * 0.3
        bw = boom_w * r_scale
        bh = boom_h * r_scale
        ct = np.cos(theta); st = np.sin(theta)
        sections.append(np.column_stack([np.full_like(theta, x_pos), bh * st, bw * ct]))

    return {
        'sections': sections,
        'n_spanwise': n_pod + n_boom + 2,
        'n_circumferential': n_circumferential,
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

    # Cylindrical section — elliptical
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
        c = chord * (1 - eta * 0.3)
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
        c = vchord * (1 - eta * 0.2)
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
