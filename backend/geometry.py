import numpy as np

def calculate_geometry(wingspan, weight, airfoil_code, wing_position='mid',
                       tail_type='conventional', wing_junction='through'):
    ar = 7.0
    taper_ratio = 0.5
    sweep_angle = 5.0
    dihedral_angle = 3.0

    wing_area = wingspan**2 / ar
    root_chord = 2 * wing_area / (wingspan * (1 + taper_ratio))
    tip_chord = root_chord * taper_ratio

    mac = (2 / 3) * root_chord * (1 + taper_ratio + taper_ratio**2) / (1 + taper_ratio)
    mac_y = (wingspan / 6) * (1 + 2 * taper_ratio) / (1 + taper_ratio)

    wing_sweep = sweep_angle

    fuse_length = 0.80 * wingspan
    fuse_max_width = 0.11 * wingspan
    fuse_max_height = 0.12 * wingspan

    htail_span = 0.35 * wingspan
    htail_chord = 0.40 * root_chord
    htail_area = htail_span * htail_chord

    vtail_span = 0.20 * wingspan
    vtail_chord = 0.35 * root_chord
    vtail_area = vtail_span * vtail_chord

    cg_position = 0.25 * mac

    aspect_ratio = ar
    span_efficiency = 0.85

    wing_position_offset = {
        'low': -fuse_max_height * 0.4,
        'mid': 0.0,
        'high': fuse_max_height * 0.4,
    }

    # Positioning (for 3D model)
    wing_x_pos = 0.35 * fuse_length
    tail_x_pos = 0.82 * fuse_length
    htail_arm = tail_x_pos - wing_x_pos

    result = {
        'wingspan': round(wingspan, 3),
        'weight': round(weight, 3),
        'airfoil': airfoil_code,
        'wing_position': wing_position,
        'tail_type': tail_type,
        'wing_junction': wing_junction,
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
        'htail_span': round(htail_span, 3),
        'htail_chord': round(htail_chord, 3),
        'htail_area': round(htail_area, 3),
        'htail_arm': round(htail_arm, 3),
        'vtail_span': round(vtail_span, 3),
        'vtail_chord': round(vtail_chord, 3),
        'vtail_area': round(vtail_area, 3),
        'cg_position': round(cg_position, 3),
        'span_efficiency': span_efficiency,
        'taper_ratio_input': taper_ratio,
        'wing_x_pos': round(wing_x_pos, 3),
        'tail_x_pos': round(tail_x_pos, 3),
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
        z_offset = y_pos * np.sin(dihedral)

        x_upper = foil_x[upper_idx] * chord + x_offset
        y_upper = foil_y_upper[upper_idx] * chord
        z_upper = np.full_like(x_upper, y_pos + z_offset)

        x_lower = foil_x[lower_idx] * chord + x_offset
        y_lower = foil_y_lower[lower_idx] * chord
        z_lower = np.full_like(x_lower, y_pos + z_offset)

        sec_right = {
            'upper': np.column_stack([x_upper, y_upper, z_upper]),
            'lower': np.column_stack([x_lower, y_lower, z_lower]),
            'eta': eta,
            'chord': chord,
        }
        sections_right.append(sec_right)

        sec_left = {
            'upper': np.column_stack([x_upper, y_upper, -z_upper[:, 2:3]]),
            'lower': np.column_stack([x_lower, y_lower, -z_lower[:, 2:3]]),
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

def generate_fuselage_mesh_data(geom, n_spanwise=32, n_circumferential=24):
    length = geom['fuselage_length']
    max_w = geom['fuselage_max_width'] / 2
    max_h = geom['fuselage_max_height'] / 2

    sections = []
    for i in range(n_spanwise + 1):
        eta = i / n_spanwise
        x_pos = -length * 0.4 + eta * length

        if eta < 0.2:
            r = np.sin(np.pi * eta / 0.4)
            w = max_w * r
            h = max_h * r
        elif eta > 0.8:
            r = np.sin(np.pi * (1 - eta) / 0.4)
            w = max_w * r
            h = max_h * r
        else:
            w = max_w
            h = max_h

        theta = np.linspace(0, 2 * np.pi, n_circumferential + 1)[:-1]
        pts = np.column_stack([
            np.full_like(theta, x_pos),
            w * np.cos(theta),
            h * np.sin(theta),
        ])
        sections.append(pts)

    return {
        'sections': sections,
        'n_spanwise': n_spanwise,
        'n_circumferential': n_circumferential,
    }

def generate_tail_mesh_data(geom, airfoil_coords, n_sections=20, n_foil_points=38):
    result = {}

    # Horizontal tail
    half_span = geom['htail_span'] / 2
    chord = geom['htail_chord']
    arm = geom['htail_arm']

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
        x_offset = arm + y_pos * np.tan(np.radians(3))

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
            'upper': np.column_stack([xu, yu, -zu[:, 2:3]]),
            'lower': np.column_stack([xl, yl, -zl[:, 2:3]]),
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
        x_offset = varm + z_pos * np.tan(np.radians(5))

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
