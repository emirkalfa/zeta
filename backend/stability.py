import numpy as np
from backend.mission import mission_performance, PARASITE_CD0

_GRADE_ICONS = {'pass': "✅", 'warn': "⚠️", 'fail': "❌"}

def tail_stability_terms(geom, airfoil_props, tail_props):
    """Tail contribution to neutral-point position per metre of tail arm."""
    AR = geom['aspect_ratio']
    htail_area = geom.get('htail_effective_area', geom['htail_area'])
    cl_alpha_2d = airfoil_props['cl_alpha']
    sweep_deg = geom.get('sweep_angle', 0.0)
    cl_alpha = cl_alpha_2d * np.cos(np.radians(sweep_deg))
    if cl_alpha < 0.01:
        cl_alpha = cl_alpha_2d

    cl_alpha_3d = cl_alpha / (1 + cl_alpha / (np.pi * AR))

    d_epsilon_d_alpha = 2.0 * cl_alpha_3d / (np.pi * AR)
    tail_area=geom.get('vtail_surface_area',htail_area)
    tail_span=geom['vtail_span'] if geom.get('tail_type')=='vtail' else geom['htail_span']
    tail_ar=tail_span**2/max(tail_area,.000001)
    a_t_2d=tail_props['cl_alpha']
    a_t=a_t_2d/(1+a_t_2d/(np.pi*max(tail_ar,.01)))
    factor = htail_area / geom['wing_area'] * (a_t / cl_alpha_3d) * (1 - d_epsilon_d_alpha)
    return factor, tail_ar, a_t


def apply_cg_wing_placement(geom, airfoil_props, tail_props, target_percent=None):
    """Place the wing for a stick-fixed preliminary static margin of 10% MAC."""
    length = geom['fuselage_length']
    mac = geom['mac']
    wing = geom['wing_x_pos']
    wing_ac = geom['wing_ac_x']
    tail_ac = geom['htail_ac_x']
    effect, _, _ = tail_stability_terms(geom, airfoil_props, tail_props)
    target_margin = .10
    cg = wing_ac - .25 * mac + geom['cg_position']

    fore = max(0., wing - .12 * length)
    aft = min(wing + .12 * length, geom['tail_x_pos'] - .75 * geom['root_chord'],
              wing + tail_ac - wing_ac - .10 * mac)
    if geom.get('tail_booms'):
        aft = min(aft, wing + geom['tail_booms']['length'] - .08)
    available = not geom.get('vtol_fixed_body') and aft > fore and 0 <= effect < 1
    placements = []
    limited = False
    limits = []
    if available:
        def placement(root):
            center = wing_ac + root - wing
            target = center + effect * (tail_ac - center) - target_margin * mac
            return {'wing_x': root, 'cg_percent': target * 100 / length}

        limits = [placement(fore), placement(aft)]
        placements = [placement(fore + fraction * (aft - fore)) for fraction in (.15, .50, .85)]
        if target_percent is not None:
            requested = target_percent * length / 100
            goal_ac = (requested + target_margin * mac - effect * tail_ac) / (1 - effect)
            goal = wing + goal_ac - wing_ac
            actual = min(aft, max(fore, goal))
            limited = abs(goal - actual) > .0005
            shift = actual - wing
            wing_ac += shift
            cg = wing_ac + effect * (tail_ac - wing_ac) - target_margin * mac
            geom.update(wing_x_pos=actual, wing_ac_x=wing_ac,
                        cg_position=cg - (wing_ac - .25 * mac),
                        htail_arm=tail_ac-wing_ac, effective_tail_arm=tail_ac-wing_ac,
                        effective_vertical_tail_arm=geom['vtail_ac_x']-wing_ac,
                        tail_le_spacing=geom['tail_x_pos']-actual)
            if geom.get('tail_booms'):
                boom = geom['tail_booms']
                geom['tail_booms'] = {**boom, 'x_start': boom['x_start']+shift,
                                     'length': boom['length']-shift}

    neutral = wing_ac + effect * (tail_ac - wing_ac)
    geom['cg_placement'] = {
        'available': bool(available), 'limited': bool(limited),
        'cg_x': cg, 'neutral_x': neutral, 'target_margin': 100 * target_margin,
        'static_margin': 100 * (neutral - cg) / mac,
        'recommendation_x': neutral - target_margin * mac,
        'options': placements, 'limits': limits,
    }


def flight_test(geom, airfoil_props, tail_props=None, rho=1.225, power_available=None):
    if tail_props is None:
        tail_props = airfoil_props
    W = geom['weight'] * 9.81
    S = geom['wing_area']
    AR = geom['aspect_ratio']
    mac = geom['mac']
    htail_arm = geom.get('effective_tail_arm',geom['htail_arm'])
    cg = geom['cg_position']

    cl_max = airfoil_props['cl_max']
    V_stall = np.sqrt(2 * W / (rho * S * cl_max))

    cd_0 = airfoil_props['cd_0'] + PARASITE_CD0
    e = 0.85
    cl_opt = np.sqrt(cd_0 * np.pi * AR * e)

    V_cruise = np.sqrt(2 * W / (rho * S * cl_opt))

    cd_i_opt = cl_opt**2 / (np.pi * AR * e)
    cd_cruise = cd_0 + cd_i_opt
    D_cruise = 0.5 * rho * V_cruise**2 * S * cd_cruise

    power_avail = power_available if power_available is not None else geom['weight'] * 150
    power_req = D_cruise * V_cruise
    performance=mission_performance(geom,airfoil_props,power_avail,0,prop_efficiency=1,rho=rho)
    V_cruise=performance['cruise_speed']
    cl_opt=2*W/(rho*V_cruise**2*S)
    cd_cruise=cd_0+cl_opt**2/(np.pi*AR*e)
    D_cruise=.5*rho*V_cruise**2*S*cd_cruise
    power_req=D_cruise*V_cruise
    climb_rate=performance['climb_rate']

    effectiveness, tail_ar, a_t = tail_stability_terms(geom, airfoil_props, tail_props)
    np_position = .25 + effectiveness * htail_arm / mac

    cg_percent = cg / mac
    static_margin = np_position - cg_percent

    if 0.05 <= static_margin <= 0.20:
        stability_status = "Stabil"
        stability_level = 'pass'
    elif static_margin > 0.20:
        stability_status = "Aşırı stabil (manevra kabiliyeti düşük)"
        stability_level = 'warn'
    elif static_margin > 0:
        stability_status = "Pozitif marj, düşük kararlılık payı"
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
        stall = ('warn', "Stall hızı yüksek; kalkış ve iniş hedefiyle karşılaştırın")

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
        'validation_status': 'preliminary_unvalidated',
        'effective_tail_arm': round(htail_arm,6),
        'tail_aspect_ratio': round(tail_ar,3),
        'tail_lift_curve_slope': round(a_t,4),
        'assumptions': ['CG is an input, not derived from component masses',
                        'generic fuselage/interference drag allowance',
                        'no structural or control-system validation',
                        'no configuration-specific downwash or yaw/dynamic stability'],
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
