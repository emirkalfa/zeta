import numpy as np

def flight_test(geom, airfoil_props, tail_props=None, rho=1.225):
    if tail_props is None:
        tail_props = airfoil_props
    W = geom['weight'] * 9.81
    S = geom['wing_area']
    AR = geom['aspect_ratio']
    mac = geom['mac']
    htail_area = geom['htail_area']
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

    # Available power estimate (assume 150 W/kg)
    power_avail = geom['weight'] * 150
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

    # Stability assessment
    if 0.05 <= static_margin <= 0.20:
        stability_status = "Stabil"
        stability_grade = "✅"
    elif static_margin > 0.20:
        stability_status = "Aşırı stabil (manevra kabiliyeti düşük)"
        stability_grade = "⚠️"
    else:
        stability_status = "Kararsız"
        stability_grade = "❌"

    # Overall assessment
    assessments = []
    passed = True

    # Stall speed check
    if V_stall < 5:
        assessments.append("✅ Stall hızı çok düşük, harika!")
    elif V_stall < 10:
        assessments.append("✅ Stall hızı normal")
    elif V_stall < 15:
        assessments.append("⚠️ Stall hızı biraz yüksek")
    else:
        assessments.append("❌ Stall hızı çok yüksek")
        passed = False

    # Climb check
    if climb_rate > 5:
        assessments.append("✅ Tırmanma performansı mükemmel")
    elif climb_rate > 2:
        assessments.append("✅ Tırmanma performansı iyi")
    elif climb_rate > 0:
        assessments.append("⚠️ Tırmanma performansı zayıf")
    else:
        assessments.append("❌ Tırmanma yetersiz")
        passed = False

    # Stability check
    assessments.append(f"{stability_grade} {stability_status} (SM=%{static_margin*100:.1f})")
    if static_margin < 0.05:
        passed = False

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
    }
