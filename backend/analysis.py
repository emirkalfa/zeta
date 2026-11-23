import numpy as np

def lifting_line_analysis(geom, airfoil_props, n_stations=40, n_terms=20, rho=1.225, max_alpha=20):
    b = geom['wingspan']
    ar = geom['aspect_ratio']
    root_c = geom['root_chord']
    taper = geom['taper_ratio_input']
    S = geom['wing_area']
    cg = geom['cg_position']
    sweep_deg = geom.get('sweep_angle', 0.0)
    sweep_rad = np.radians(sweep_deg)

    cl_alpha_2d_raw = airfoil_props['cl_alpha']
    cl_alpha_2d = cl_alpha_2d_raw * np.cos(sweep_rad)
    if cl_alpha_2d < 0.01:
        cl_alpha_2d = cl_alpha_2d_raw

    cl_max = airfoil_props['cl_max']
    alpha_stall = np.radians(airfoil_props['alpha_stall'])
    alpha_L0 = np.radians(airfoil_props['alpha_L0'])
    cm_0 = airfoil_props['cm_0']
    cd_0 = airfoil_props['cd_0']
    mac = geom['mac']

    alphas = np.linspace(-5, max_alpha, 51)
    results = []

    for alpha_deg in alphas:
        alpha = np.radians(alpha_deg)
        alpha_eff = alpha - alpha_L0

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

        CL = np.pi * ar * coeffs[0]
        CL_linear = float(CL)

        CDi = 0
        for n in range(n_terms):
            k = n + 1
            CDi += k * coeffs[n]**2
        CDi *= np.pi * ar

        CD = cd_0 + CDi

        alpha_eff_deg = np.degrees(alpha_eff)
        stall_overshoot = max(0, abs(alpha_eff_deg) - airfoil_props['alpha_stall'])
        if stall_overshoot > 0:
            sign = 1 if alpha_eff_deg > 0 else -1
            cl_post = cl_max * (1 - 0.12 * stall_overshoot - 0.02 * stall_overshoot**2)
            if cl_post < 0.05:
                cl_post = 0.05
            CL = sign * min(abs(CL), cl_post)
            CD += 0.05 * stall_overshoot + 0.08 * stall_overshoot**2

        CL = np.clip(CL, -cl_max, cl_max)

        CL_2d = cl_alpha_2d * alpha_eff

        Cm = cm_0 + CL * (cg - 0.25 * mac) / mac

        lift_dist = []
        for i in range(n_stations):
            theta = thetas[i]
            gamma = 0
            for n in range(n_terms):
                k = n + 1
                gamma += coeffs[n] * np.sin(k * theta)
            gamma *= 2 * b
            chord = chord_dist[i]
            scale = float(CL)/CL_linear if abs(CL_linear)>1e-12 else 1.0
            cl_local = 2 * gamma / chord * scale
            y_pos = -b/2 * np.cos(theta)
            lift_dist.append({
                'y': round(y_pos, 3),
                'cl_local': round(float(cl_local), 4),
                'chord': round(float(chord), 4),
            })

        results.append({
            'alpha': round(alpha_deg, 1),
            'CL': round(float(CL), 4),
            'CD': round(float(CD), 4),
            'Cm': round(float(Cm), 4),
            'CL_CD': round(float(CL / CD if CD != 0 else 0), 2),
            'CL_2d': round(float(CL_2d), 4),
            'stalled': bool(stall_overshoot > 0),
            'lift_distribution': lift_dist,
        })

    return results

def calculate_polars(geom, airfoil_props, max_alpha=20):
    results = lifting_line_analysis(geom, airfoil_props, max_alpha=max_alpha)

    polars = {
        'model_scope': 'wing_only',
        'experimental_validation': False,
        'lift_distribution_alpha': 5.0,
        'cl_vs_alpha': [],
        'cd_vs_cl': [],
        'cm_vs_alpha': [],
        'efficiency': [],
        'lift_distribution': [],
    }

    for r in results:
        polars['cl_vs_alpha'].append({'x': r['alpha'], 'y': r['CL']})
        polars['cd_vs_cl'].append({'x': r['CD'], 'y': r['CL'], 'stalled': r['stalled']})
        polars['cm_vs_alpha'].append({'x': r['alpha'], 'y': r['Cm']})
        polars['efficiency'].append({'x': r['alpha'], 'y': r['CL_CD']})

    distribution = lifting_line_analysis(geom,airfoil_props,max_alpha=5)[-1]
    polars['lift_distribution'] = distribution['lift_distribution']

    return polars
