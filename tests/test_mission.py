"""Görev performansı (backend/mission.py) testleri."""
import math

import pytest

from backend.mission import mission_performance, G


@pytest.fixture()
def perf(default_geom, airfoil_props_2412):
    return mission_performance(default_geom, airfoil_props_2412, motor_power=600, battery_wh=100)


def test_speed_envelope_is_ordered(perf):
    assert perf['can_fly']
    assert perf['stall_speed'] < perf['loiter_speed'] <= perf['cruise_speed'] < perf['max_speed']
    assert perf['cruise_speed'] >= 1.3 * perf['stall_speed'] - 0.01


def test_stall_speed_matches_lift_equation(perf, default_geom, airfoil_props_2412):
    W = default_geom['weight'] * G
    expected = math.sqrt(2 * W / (1.225 * default_geom['wing_area'] * airfoil_props_2412['cl_max']))
    assert perf['stall_speed'] == pytest.approx(expected, abs=0.01)


def test_endurance_scales_with_battery(default_geom, airfoil_props_2412):
    small = mission_performance(default_geom, airfoil_props_2412, 600, 100)
    large = mission_performance(default_geom, airfoil_props_2412, 600, 200)
    assert large['endurance_min'] == pytest.approx(2 * small['endurance_min'], rel=0.01)
    assert large['range_km'] == pytest.approx(2 * small['range_km'], rel=0.02)


def test_avionics_load_shortens_endurance(default_geom, airfoil_props_2412):
    bare = mission_performance(default_geom, airfoil_props_2412, 600, 100)
    loaded = mission_performance(default_geom, airfoil_props_2412, 600, 100, avionics_power=30)
    assert loaded['cruise_power'] == pytest.approx(bare['cruise_power'] + 30, abs=0.2)
    assert loaded['endurance_min'] < bare['endurance_min']


def test_more_power_improves_speed_climb_and_turn(default_geom, airfoil_props_2412):
    weak = mission_performance(default_geom, airfoil_props_2412, 200, 100)
    strong = mission_performance(default_geom, airfoil_props_2412, 800, 100)
    assert strong['max_speed'] > weak['max_speed']
    assert strong['climb_rate'] > weak['climb_rate']
    assert strong['turn_rate_deg'] >= weak['turn_rate_deg']


def test_underpowered_aircraft_cannot_fly(default_geom, airfoil_props_2412):
    perf = mission_performance(default_geom, airfoil_props_2412, motor_power=5, battery_wh=100,
                               targets={})
    assert not perf['can_fly']
    assert perf['endurance_min'] == 0
    assert perf['targets_met'] is False


def test_sustained_turn_respects_structural_limit(default_geom, airfoil_props_2412):
    perf = mission_performance(default_geom, airfoil_props_2412, 5000, 100, n_limit=3.0)
    assert perf['turn_load_factor'] <= 3.0 + 1e-6
    # Sürekli dönüş, köşe hızındaki anlık dönüşten hızlı olamaz
    assert perf['turn_rate_deg'] <= perf['corner_turn_rate_deg'] + 0.5


def test_turn_radius_consistent_with_rate(perf):
    omega = math.radians(perf['turn_rate_deg'])
    assert perf['turn_radius'] == pytest.approx(perf['turn_speed'] / omega, rel=0.03)


def test_corner_speed_formula(perf):
    assert perf['corner_speed'] == pytest.approx(perf['stall_speed'] * 2.0, abs=0.02)  # sqrt(4 g)


def test_heavier_aircraft_turns_worse(airfoil_props_2412):
    from backend.geometry import calculate_geometry
    light = mission_performance(calculate_geometry(2.0, 4.0, '2412'), airfoil_props_2412, 1000, 200)
    heavy = mission_performance(calculate_geometry(2.0, 8.0, '2412'), airfoil_props_2412, 1000, 200)
    assert heavy['stall_speed'] > light['stall_speed']
    assert heavy['turn_rate_deg'] < light['turn_rate_deg']
    assert heavy['endurance_min'] < light['endurance_min']


def test_target_checks(default_geom, airfoil_props_2412):
    easy = mission_performance(default_geom, airfoil_props_2412, 600, 200,
                               targets={'endurance_min': 1, 'turn_rate_deg': 1, 'stall_speed': 50})
    assert [c['status'] for c in easy['checks']] == ['pass', 'pass', 'pass']
    assert easy['targets_met'] is True

    hard = mission_performance(default_geom, airfoil_props_2412, 600, 200,
                               targets={'endurance_min': 10000, 'turn_rate_deg': 1, 'stall_speed': 50})
    assert hard['checks'][0]['status'] == 'fail'
    assert hard['targets_met'] is False


def test_no_checks_without_targets(perf):
    assert 'checks' not in perf


def test_api_mission(client, default_geom):
    res = client.post('/api/mission', json={
        'geometry': default_geom, 'airfoil_code': '2412',
        'motor_power': 600, 'battery_wh': 100, 'targets': {'endurance_min': 15},
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data['max_speed'] > data['stall_speed']
    assert len(data['turn_curve']) > 10 and len(data['power_curve']) > 10
    assert data['checks'][0]['target'] == 15


def test_api_stability_uses_motor_power(client, default_geom):
    body = {'geometry': default_geom, 'airfoil_code': '2412'}
    default = client.post('/api/stability', json=body).get_json()
    weak = client.post('/api/stability', json={**body, 'motor_power': 100, 'prop_efficiency': 0.5}).get_json()
    assert weak['power_available'] == pytest.approx(50.0)
    assert weak['climb_rate'] < default['climb_rate']
