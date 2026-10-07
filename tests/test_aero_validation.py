"""Independent conservation, scaling and power-envelope checks (not flight certification)."""
import math
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.airfoil import get_airfoil_properties,UnsupportedAirfoilError
from backend.analysis import lifting_line_analysis,calculate_polars
from backend.mission import mission_performance,PARASITE_CD0,OSWALD_E
from backend.stability import flight_test

@pytest.mark.parametrize('span',[.75,1.5,3.0])
def test_span_integrated_sectional_lift_matches_global_lift(span):
    g=calculate_geometry(span,1.2,'2412')
    r=next(r for r in lifting_line_analysis(g,get_airfoil_properties('2412'),n_stations=100) if r['alpha']==5)
    d=r['lift_distribution']
    integrated=np.trapezoid([p['cl_local']*p['chord'] for p in d],[p['y'] for p in d])/g['wing_area']
    assert integrated==pytest.approx(r['CL'],rel=.015)

def test_distribution_is_at_five_degrees_even_for_a_different_plot_range():
    g=calculate_geometry(1.5,1.2,'2412');p=get_airfoil_properties('2412')
    a=calculate_polars(g,p,max_alpha=17);b=calculate_polars(g,p,max_alpha=20)
    assert a['lift_distribution']==b['lift_distribution']
    assert a['lift_distribution_alpha']==5

def test_induced_drag_respects_elliptical_lower_bound():
    g=calculate_geometry(1.5,1.2,'0012');p=get_airfoil_properties('0012')
    for r in lifting_line_analysis(g,p):
        if 1<=r['alpha']<=5:
            assert r['CD']-p['cd_0'] >= r['CL']**2/(math.pi*g['aspect_ratio'])-.0001

def test_cruise_is_inside_the_power_envelope_even_with_marginal_power():
    g=calculate_geometry(1.5,1.2,'2412');p=get_airfoil_properties('2412')
    for watts in np.linspace(25,150,25):
        r=mission_performance(g,p,watts,50)
        if r['can_fly']:
            v=r['cruise_speed'];w=g['weight']*9.81;s=g['wing_area'];rho=1.225
            k=1/(math.pi*g['aspect_ratio']*OSWALD_E)
            req=.5*rho*v**3*s*(p['cd_0']+PARASITE_CD0)+2*k*w*w/(rho*v*s)
            assert req<=r['power_available']+.1

def test_stability_and_mission_use_the_same_power_model():
    g=calculate_geometry(1.5,1.2,'2412');p=get_airfoil_properties('2412')
    a=flight_test(g,p,power_available=240)
    b=mission_performance(g,p,400,50,prop_efficiency=.6)
    assert a['cruise_speed']==b['cruise_speed']
    assert a['climb_rate']==b['climb_rate']

def test_five_digit_profile_cannot_silently_use_four_digit_model():
    with pytest.raises(UnsupportedAirfoilError):get_airfoil_properties('23012')

def test_unsupported_profile_is_hidden_and_returns_a_clear_api_error(client):
    assert all(len(a['code'])==4 for a in client.get('/api/airfoils').json)
    r=client.get('/api/airfoil_props/23012')
    assert r.status_code==400 and r.json['error']

def test_profile_metadata_matches_the_geometry_code(client):
    profile=next(a for a in client.get('/api/airfoils').json if a['code']=='6412')
    assert profile['max_camber_position']==.4
    assert client.get(f"/api/airfoil/{profile['id']}").json['max_camber_position']==.4
