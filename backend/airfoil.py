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

    alpha_0 = 0.0
    if m > 0:
        alpha_0 = -np.arctan2(m * (1 - 2 * p) + 2 * m * p * (1 - p), 1) * 180 / np.pi
        alpha_0 = -2 * m * 180 / np.pi

    cl_alpha = 2 * np.pi
    cm_0 = 0.0
    if m > 0:
        cm_0 = -np.pi * m * (1 - p) / 2

    cl_max = 1.2 + m * 2.0
    alpha_stall = 12 + (1 - m) * 4

    return {
        'max_camber': m,
        'camber_position': p,
        'max_thickness': t,
        'cl_alpha': cl_alpha,
        'cl_max': cl_max,
        'alpha_stall': alpha_stall,
        'cm_0': -0.05 - m * 0.1,
        'cd_0': 0.006 + t * 0.02,
    }
