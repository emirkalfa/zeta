"""Görev performansı: güç sistemi verilen sabit kanatlı İHA için hız zarfı,
havada kalış ve dönüş (manevra) performansı.

Model, parabolik sürükleme polarına dayanır: CD = CD0 + k·CL², k = 1/(π·AR·e).
Elektrikli tahrikte mevcut güç hızdan bağımsız kabul edilir (P = η·P_motor).
"""
import numpy as np

G = 9.81
OSWALD_E = 0.85
# Profil sürüklemesine eklenen gövde + kuyruk + girişim payı (küçük İHA'lar için tipik)
PARASITE_CD0 = 0.015
# Bataryanın kullanılabilir kısmı (LiPo %20'nin altına indirilmez)
USABLE_BATTERY = 0.8

DEFAULT_TARGETS = {
    'endurance_min': 20.0,     # dk, en az
    'turn_rate_deg': 30.0,     # °/s, en az (sürekli dönüş)
    'stall_speed': 12.0,       # m/s, en fazla
}


def mission_performance(geom, airfoil_props, motor_power, battery_wh,
                        prop_efficiency=0.6, n_limit=4.0, avionics_power=0.0,
                        targets=None, rho=1.225):
    """Hız zarfı, havada kalış ve dönüş performansını hesaplar.

    motor_power: motorun azami elektrik gücü (W)
    battery_wh: batarya enerjisi (Wh)
    prop_efficiency: bataryadan itkiye toplam verim (ESC·motor·pervane)
    n_limit: yapısal yük faktörü sınırı (g)
    avionics_power: otopilot, görev bilgisayarı, kamera vb. sabit tüketim (W)
    targets: verilirse {'endurance_min', 'turn_rate_deg', 'stall_speed'} hedeflerine göre kontrol üretir
    """
    mass = geom['weight']
    W = mass * G
    S = geom['wing_area']
    AR = geom['aspect_ratio']
    cl_max = airfoil_props['cl_max']
    cd0 = airfoil_props['cd_0'] + PARASITE_CD0
    k = 1.0 / (np.pi * AR * OSWALD_E)
    P_avail = prop_efficiency * motor_power

    def power_required(V, n=1.0):
        return 0.5 * rho * V**3 * S * cd0 + 2.0 * k * (n * W)**2 / (rho * V * S)

    v_stall = float(np.sqrt(2 * W / (rho * S * cl_max)))
    # En az güç (en uzun havada kalış) ve en az sürükleme (en uzun menzil) hızları
    v_base = np.sqrt(2 * W / (rho * S))
    v_min_power = max(float(v_base * (k / (3 * cd0)) ** 0.25), v_stall * 1.1)
    # Seyir, stall'a güvenli pay bırakacak şekilde en az 1.3·Vs alınır
    v_best_range = max(float(v_base * (k / cd0) ** 0.25), v_stall * 1.3)

    # Solve P_required(V)=P_available, not the last point of a capped speed grid.
    v_opt=max(float(v_base*(k/(3*cd0))**.25),v_stall)
    minimum_power=float(power_required(v_opt))
    can_fly=bool(P_avail>=minimum_power)
    def bisect_root(lo,hi,fn):
        for _ in range(65):
            mid=(lo+hi)/2
            if fn(mid)>0:hi=mid
            else:lo=mid
        return (lo+hi)/2
    v_max=0.;v_min=v_stall
    if can_fly:
        upper=max(2*v_opt,60.)
        while power_required(upper)<P_avail:upper*=2
        v_max=bisect_root(v_opt,upper,lambda v:power_required(v)-P_avail)
        if power_required(v_stall)>P_avail:
            v_min=bisect_root(v_stall,v_opt,lambda v:P_avail-power_required(v))
        # Avionics consume energy per distance too; include their load in range optimum.
        A=.5*rho*S*cd0;B=2*k*W*W/(rho*S)
        lo=(B/A)**.25;hi=max(2*lo,v_max)
        while 2*A*hi**4-avionics_power*prop_efficiency*hi-2*B<0:hi*=2
        v_range=bisect_root(lo,hi,lambda v:2*A*v**4-avionics_power*prop_efficiency*v-2*B)
        v_best_range=float(np.clip(max(v_range,1.3*v_stall),v_min,v_max))
        v_min_power=float(np.clip(v_min_power,v_min,v_max))
    climb_rate=max(0.,float((P_avail-minimum_power)/W))
    speeds=np.unique(np.r_[np.linspace(v_stall,max(v_max*1.2,v_stall*3),600),v_opt,v_best_range,v_max if can_fly else v_stall])
    p_req=power_required(speeds)

    usable_wh = battery_wh * USABLE_BATTERY
    # Düz seyirde bataryadan çekilen güç; rüzgâr, tırmanma ve manevra dahil değildir
    p_cruise = power_required(v_best_range) / prop_efficiency + avionics_power
    endurance_min = float(usable_wh / p_cruise * 60.0) if can_fly else 0.0
    range_km = float(endurance_min / 60.0 * v_best_range * 3.6)

    # Dönüş performansı: yük faktörü üç sınırın en küçüğüdür
    #   aerodinamik (stall): n = (V/Vs)²,  yapısal: n_limit,  güç (sürekli dönüş için)
    def turn(V, n):
        if n <= 1.0:
            return 0.0, float('inf')
        root = np.sqrt(n**2 - 1.0)
        return float(np.degrees(G * root / V)), float(V**2 / (G * root))

    def sustained_n(V):
        excess = P_avail - 0.5 * rho * V**3 * S * cd0
        if excess <= 0:
            return 0.0
        n_power = np.sqrt(excess * rho * V * S / (2.0 * k)) / W
        return float(min(n_power, (V / v_stall) ** 2, n_limit))

    curve = []
    best = {'rate': 0.0, 'radius': float('inf'), 'speed': v_stall, 'n': 1.0}
    turn_speeds = np.linspace(v_stall, max(v_max, v_stall * 1.05), 60) if can_fly else []
    for V in turn_speeds:
        n_sus = sustained_n(V)
        rate_sus, radius_sus = turn(V, n_sus)
        rate_inst, _ = turn(V, min((V / v_stall) ** 2, n_limit))
        curve.append({'v': round(float(V), 2), 'sustained': round(rate_sus, 2), 'instantaneous': round(rate_inst, 2)})
        if rate_sus > best['rate']:
            best = {'rate': rate_sus, 'radius': radius_sus, 'speed': float(V), 'n': n_sus}

    # Köşe hızı: stall ve yapısal sınırın kesiştiği, anlık dönüşün en hızlı olduğu nokta
    v_corner = v_stall * np.sqrt(n_limit)
    corner_rate, corner_radius = turn(v_corner, n_limit)

    power_curve = [
        {'v': round(float(V), 2), 'required': round(float(p), 1)}
        for V, p in zip(speeds[::6], p_req[::6]) if p <= max(P_avail * 1.6, p_req.min() * 3)
    ]

    result = {
        'validation_status': 'preliminary_unvalidated',
        'cruise_stall_margin_met': bool(can_fly and v_best_range >= 1.3*v_stall),
        'can_fly': can_fly,
        'stall_speed': round(v_stall, 2),
        'max_speed': round(v_max, 2),
        'loiter_speed': round(v_min_power, 2),
        'cruise_speed': round(v_best_range, 2),
        'climb_rate': round(climb_rate, 2),
        'endurance_min': round(endurance_min, 1),
        'range_km': round(range_km, 1),
        'cruise_power': round(float(p_cruise), 1),
        'turn_rate_deg': round(best['rate'], 1),
        'turn_radius': round(best['radius'], 1) if np.isfinite(best['radius']) else None,
        'turn_speed': round(best['speed'], 2),
        'turn_load_factor': round(best['n'], 2),
        'corner_speed': round(float(v_corner), 2),
        'corner_turn_rate_deg': round(corner_rate, 1),
        'corner_turn_radius': round(corner_radius, 1) if np.isfinite(corner_radius) else None,
        'wing_loading': round(mass / S, 2),
        'power_loading': round(motor_power / mass, 1),
        'power_available': round(P_avail, 1),
        'cd0_total': round(cd0, 4),
        'turn_curve': curve,
        'power_curve': power_curve,
    }

    if targets is not None:
        t = {**DEFAULT_TARGETS, **{key: float(v) for key, v in targets.items() if v is not None}}
        result['checks'] = [
            _check('endurance_min', endurance_min, t['endurance_min'], higher_is_better=True),
            _check('turn_rate_deg', best['rate'], t['turn_rate_deg'], higher_is_better=True),
            _check('stall_speed', v_stall, t['stall_speed'], higher_is_better=False),
        ]
        result['targets_met'] = can_fly and all(c['status'] == 'pass' for c in result['checks'])
    return result


def _check(key, value, target, higher_is_better):
    """Hedefi karşılıyorsa 'pass', %10'a kadar kaçırıyorsa 'warn', aksi halde 'fail'."""
    ratio = (value / target) if higher_is_better else (target / value if value > 0 else 0.0)
    status = 'pass' if ratio >= 1.0 else 'warn' if ratio >= 0.9 else 'fail'
    return {'key': key, 'value': round(float(value), 2), 'target': target, 'status': status}
