import numpy as np

def lifting_line_analysis(geom, airfoil_props, n_stations=40, n_terms=20, rho=1.225):
    b = geom['wingspan']
    ar = geom['aspect_ratio']
    root_c = geom['root_chord']
    taper = geom['taper_ratio_input']
    S = geom['wing_area']
    cg = geom['cg_position']

    cl_alpha_2d = airfoil_props['cl_alpha']
    cl_max = airfoil_props['cl_max']
    alpha_stall = np.radians(airfoil_props['alpha_stall'])
    alpha_L0 = np.radians(airfoil_props['alpha_L0'])
    cm_0 = airfoil_props['cm_0']
    cd_0 = airfoil_props['cd_0']
    mac = geom['mac']

    alphas = np.linspace(-5, 20, 51)
    results = []

    for alpha_deg in alphas:
        alpha = np.radians(alpha_deg)
        # Geometric AoA minus zero-lift angle drives lift (Anderson Eq. 5.51).
        alpha_eff = alpha - alpha_L0

        # Solve lifting line using Fourier series.
        # Equation: alpha_eff(theta) = sum_{n} A_n sin(n*theta) * [n/sin(theta) + 4b/(c*cl_alpha)]
        thetas = np.linspace(1e-6, np.pi - 1e-6, n_stations)
        chord_dist = root_c * (1 - (1 - taper) * np.abs(np.cos(thetas)))

        A = np.zeros((n_stations, n_terms))
        b_vec = np.zeros(n_stations)

        for i in range(n_stations):
            theta = thetas[i]
            chord = chord_dist[i]
            chord_factor = 4 * b / (chord * cl_alpha_2d)

            for n in range(n_terms):
                k = n + 1
                A[i, n] = np.sin(k * theta) * (k / np.sin(theta) + chord_factor)

            b_vec[i] = alpha_eff

        coeffs, _, _, _ = np.linalg.lstsq(A, b_vec, rcond=None)

        # Lift coefficient from Fourier coefficients (Anderson Eq. 5.53).
        CL = np.pi * ar * coeffs[0]

        # Induced drag from Fourier coefficients (Anderson Eq. 5.61).
        CDi = 0
        for n in range(n_terms):
            k = n + 1
            CDi += k * coeffs[n]**2
        CDi *= np.pi * ar

        # Stall: clip CL to cl_max (no post-stall model).
        CL = np.clip(CL, -cl_max, cl_max)
        CL_3d = CL
        CL_2d = cl_alpha_2d * alpha_eff

        CD = cd_0 + CDi
        # Pitching moment about CG with aero center at quarter-chord.
        # Cm_cg = cm_ac + CL * (x_cg - x_ac) / c_ref
        Cm = cm_0 + CL * (cg - 0.25 * mac) / mac

        # Lift distribution
        lift_dist = []
        for i in range(n_stations):
            theta = thetas[i]
            gamma = 0
            for n in range(n_terms):
                k = n + 1
                gamma += coeffs[n] * np.sin(k * theta)
            gamma *= 2 * b
            chord = chord_dist[i]
            cl_local = 2 * gamma / (chord * b)
            y_pos = -b/2 * np.cos(theta)
            lift_dist.append({
                'y': round(y_pos, 3),
                'cl_local': round(float(cl_local), 4),
                'chord': round(float(chord), 4),
            })

        results.append({
            'alpha': round(alpha_deg, 1),
            'CL': round(float(CL_3d), 4),
            'CD': round(float(CD), 4),
            'Cm': round(float(Cm), 4),
            'CL_CD': round(float(CL_3d / CD if CD != 0 else 0), 2),
            'CL_2d': round(float(CL_2d), 4),
            'lift_distribution': lift_dist,
        })

    return results

def calculate_polars(geom, airfoil_props):
    results = lifting_line_analysis(geom, airfoil_props)

    polars = {
        'cl_vs_alpha': [],
        'cd_vs_cl': [],
        'cm_vs_alpha': [],
        'efficiency': [],
        'lift_distribution': [],
    }

    for r in results:
        polars['cl_vs_alpha'].append({'x': r['alpha'], 'y': r['CL']})
        polars['cd_vs_cl'].append({'x': r['CD'], 'y': r['CL']})
        polars['cm_vs_alpha'].append({'x': r['alpha'], 'y': r['Cm']})
        polars['efficiency'].append({'x': r['alpha'], 'y': r['CL_CD']})

    for r in results:
        if r['alpha'] == 5.0:
            polars['lift_distribution'] = r['lift_distribution']
            break

    if not polars['lift_distribution'] and results:
        mid = len(results) // 2
        polars['lift_distribution'] = results[mid]['lift_distribution']

    return polars
