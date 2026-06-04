import numpy as np

def naca_4_digit_coordinates(code, n=150):
    m = int(code[0]) / 100.0
    p = int(code[1]) / 10.0
    t = int(code[2:4]) / 100.0

    beta = np.linspace(0, np.pi, n // 2 + 1)
    xc = (1 - np.cos(beta)) / 2.0

    yt = 5 * t * (0.2969 * np.sqrt(xc) - 0.1260 * xc - 0.3516 * xc**2 + 0.2843 * xc**3 - 0.1015 * xc**4)

    yc = np.zeros_like(xc)
    dyc_dx = np.zeros_like(xc)

    if m > 0 and p > 0:
        lower = xc <= p
        upper = xc > p
        yc[lower] = (m / p**2) * (2 * p * xc[lower] - xc[lower]**2)
        dyc_dx[lower] = (2 * m / p**2) * (p - xc[lower])
        yc[upper] = (m / (1 - p)**2) * (1 - 2 * p + 2 * p * xc[upper] - xc[upper]**2)
        dyc_dx[upper] = (2 * m / (1 - p)**2) * (p - xc[upper])

    theta = np.arctan(dyc_dx)
    yu = yc + yt * np.cos(theta)
    yl = yc - yt * np.cos(theta)
    xu = xc - yt * np.sin(theta)
    xl = xc + yt * np.sin(theta)

    upper = np.column_stack([xu, yu])
    lower = np.column_stack([xl[::-1], yl[::-1]])

    return np.vstack([upper, lower])

def get_airfoil_properties(code):
    m = int(code[0]) / 100.0
    p = int(code[1]) / 10.0
    t = int(code[2:4]) / 100.0

    # Zero-lift angle from thin airfoil theory (Anderson Eq. 4.61):
    #   alpha_L0 = -(1/pi) * integral_0^pi (dyc/dx)(cos(theta) - 1) dtheta
    # Numerical integration over the camber line for any NACA 4-digit code.
    if m > 0 and p > 0:
        n_int = 200
        theta = np.linspace(1e-9, np.pi - 1e-9, n_int)
        x = (1.0 - np.cos(theta)) / 2.0
        dyc_dx = np.where(
            x <= p,
            (2 * m / p**2) * (p - x),
            (2 * m / (1 - p)**2) * (p - x),
        )
        alpha_L0 = -(1.0 / np.pi) * np.trapezoid(dyc_dx * (np.cos(theta) - 1.0), theta)
    else:
        alpha_L0 = 0.0
    alpha_L0_deg = float(np.degrees(alpha_L0))

    # 2D lift-curve slope from thin airfoil theory (per radian).
    cl_alpha = 2 * np.pi

    # Pitching moment about aerodynamic center from thin airfoil theory:
    #   cm_ac = -(pi/4) * (A1 - A2)
    # where A_n are Fourier coefficients of dyc/dx.
    if m > 0 and p > 0:
        A1 = (2.0 / np.pi) * np.trapezoid(dyc_dx * np.cos(theta), theta)
        A2 = (2.0 / np.pi) * np.trapezoid(dyc_dx * np.cos(2 * theta), theta)
        cm_ac = -(np.pi / 4.0) * (A1 - A2)
    else:
        cm_ac = 0.0

    # Empirical CL_max for NACA 4-digit at Re ~ 1e6 (smooth surface).
    # Fits Abbott & von Doenhoff data within +/- 5%:
    #   thicker -> slightly lower, more camber -> higher.
    cl_max = 1.50 + 4.0 * m - 1.0 * max(t - 0.12, 0.0)

    # Empirical Cd_0 for NACA 4-digit at Re ~ 1e6.
    # Linear in thickness, weak camber penalty.
    cd_0 = 0.0055 + 0.011 * t + 0.02 * m

    # Stall angle: thicker airfoils stall later, camber shifts curve.
    alpha_stall = 12.0 + 30.0 * t - 50.0 * m

    return {
        'max_camber': m,
        'camber_position': p,
        'max_thickness': t,
        'alpha_L0': alpha_L0_deg,
        'cl_alpha': cl_alpha,
        'cl_max': float(cl_max),
        'alpha_stall': float(alpha_stall),
        'cm_0': float(cm_ac),
        'cd_0': float(cd_0),
    }
