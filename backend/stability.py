import numpy as np

_GRADE_ICONS = {'pass': "✅", 'warn': "⚠️", 'fail': "❌"}

def flight_test(geom, airfoil_props, tail_props=None, rho=1.225, power_available=None):
    if tail_props is None:
        tail_props = airfoil_props
    W = geom['weight'] * 9.81
    S = geom['wing_area']
    AR = geom['aspect_ratio']
    mac = geom['mac']
    htail_area = geom.get('htail_effective_area',geom['htail_area'])
    htail_arm = geom['htail_arm']
    cg = geom['cg_position']

    # Cl_max
    cl_max = airfoil_props['cl_max']
    cl_alpha_2d = airfoil_props['cl_alpha']
    # Sweep correction (simple sweep theory)
    sweep_deg = geom.get('sweep_angle', 0.0)
    cl_alpha = cl_alpha_2d * np.cos(np.radians(sweep_deg))
    if cl_alpha < 0.01:
        cl_alpha = cl_alpha_2d

    cl_alpha_3d = cl_alpha / (1 + cl_alpha / (np.pi * AR))

    # Stall speed
    V_stall = np.sqrt(2 * W / (rho * S * cl_max))

    # Optimum Cl for max range (Cl_opt = sqrt(CD_0 * pi * AR * e))
    cd_0 = airfoil_props['cd_0']
    e = 0.85
    cl_opt = np.sqrt(cd_0 * np.pi * AR * e)

    # Cruise speed at optimum Cl
    V_cruise = np.sqrt(2 * W / (rho * S * cl_opt))

    # Cruise drag
    cd_i_opt = cl_opt**2 / (np.pi * AR * e)
    cd_cruise = cd_0 + cd_i_opt
    D_cruise = 0.5 * rho * V_cruise**2 * S * cd_cruise

    # Mevcut güç: güç sistemi verilmişse ondan, yoksa 150 W/kg varsayımından
    power_avail = power_available if power_available is not None else geom['weight'] * 150
    power_req = D_cruise * V_cruise
    excess_power = power_avail - power_req
    climb_rate = excess_power / W if excess_power > 0 else 0

    # Static stability
    # Downwash gradient from lifting-line theory (Anderson Eq. 6.27):
    #   d_eps/d_alpha = 2 * a_w_3d / (pi * AR)
    # For typical AR=5-10, this gives 0.40-0.50, not 0.5 flat.
    v_h = (htail_area * htail_arm) / (S * mac)
    d_epsilon_d_alpha = 2.0 * cl_alpha_3d / (np.pi * AR)
    a_t = tail_props['cl_alpha']
    np_position = 0.25 + v_h * (a_t / cl_alpha_3d) * (1 - d_epsilon_d_alpha)

    # CG at 25% MAC
    cg_percent = cg / mac
    static_margin = np_position - cg_percent

    # Her kriter: (durum, mesaj). Durum 'fail' ise uçak uçamaz sayılır.
    if 0.05 <= static_margin <= 0.20:
        stability_status = "Stabil"
        stability_level = 'pass'
    elif static_margin > 0.20:
        stability_status = "Aşırı stabil (manevra kabiliyeti düşük)"
        stability_level = 'warn'
    else:
        stability_status = "Kararsız"
        stability_level = 'fail'
    stability_grade = _GRADE_ICONS[stability_level]

    if V_stall < 5:
        stall = ('pass', "Stall hızı çok düşük, harika!")
    elif V_stall < 10:
        stall = ('pass', "Stall hızı normal")
    elif V_stall < 15:
        stall = ('warn', "Stall hızı biraz yüksek")
    else:
        stall = ('fail', "Stall hızı çok yüksek")

    if climb_rate > 5:
        climb = ('pass', "Tırmanma performansı mükemmel")
    elif climb_rate > 2:
        climb = ('pass', "Tırmanma performansı iyi")
    elif climb_rate > 0:
        climb = ('warn', "Tırmanma performansı zayıf")
    else:
        climb = ('fail', "Tırmanma yetersiz")

    checks = [
        {'key': 'stall_speed', 'status': stall[0], 'message': stall[1]},
        {'key': 'climb_rate', 'status': climb[0], 'message': climb[1]},
        {'key': 'static_margin', 'status': stability_level, 'message': stability_status},
    ]
    passed = all(c['status'] != 'fail' for c in checks)
    assessments = [
        f"{_GRADE_ICONS[stall[0]]} {stall[1]}",
        f"{_GRADE_ICONS[climb[0]]} {climb[1]}",
        f"{stability_grade} {stability_status} (SM=%{static_margin*100:.1f})",
    ]

    return {
        'stall_speed': round(V_stall, 2),
        'cruise_speed': round(V_cruise, 2),
        'climb_rate': round(climb_rate, 2),
        'static_margin': round(static_margin * 100, 1),
        'neutral_point': round(np_position, 3),
        'cg_position': round(cg_percent, 3),
        'cl_max': round(cl_max, 2),
        'cl_opt': round(cl_opt, 2),
        'cd_cruise': round(cd_cruise, 4),
        'drag_cruise': round(D_cruise, 2),
        'power_required': round(power_req, 1),
        'power_available': round(power_avail, 1),
        'stability_status': stability_status,
        'stability_grade': stability_grade,
        'overall_passed': passed,
        'assessments': assessments,
        'checks': checks,
    }
