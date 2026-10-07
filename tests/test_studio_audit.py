"""Independent equation, reference-coordinate and API regression checks."""
import json,math,subprocess
from pathlib import Path
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.airfoil import get_airfoil_properties,naca_4_digit_coordinates
from backend.mission import mission_performance,PARASITE_CD0,OSWALD_E
from backend.stability import flight_test

@pytest.mark.parametrize('tail',['conventional','ttail','vtail'])
def test_blank_manual_tail_has_positive_auto_dimensions(tail):
    auto=calculate_geometry(1.5,2,'2412',tail_type=tail)
    manual=calculate_geometry(1.5,2,'2412',tail_type=tail,manual_mode=True)
    for key in ['htail_span','htail_chord','vtail_span','vtail_chord']:
        assert manual[key]==auto[key] and manual[key]>0

@pytest.mark.parametrize('combat',[False,True])
@pytest.mark.parametrize('tail',['conventional','ttail','vtail'])
def test_aerodynamic_tail_arm_matches_displayed_panels(combat,tail):
    g=calculate_geometry(1.5,2,'2412',tail_type=tail,airframe='combat' if combat else 'standard')
    script="const fs=require('fs'),vm=require('vm');const c=vm.createContext({window:{addEventListener(){}}});vm.runInContext(fs.readFileSync('static/js/assembly.js','utf8'),c);c.g=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(vm.runInContext('aircraftPanelSpecs(g,[],[],[])',c)));"
    panels=json.loads(subprocess.check_output(['node','-e',script],input=json.dumps(g).encode(),cwd=Path(__file__).resolve().parents[1]))
    def ac(p):
        u=np.linspace(0,1,10001);chord=p['chord']+(p['tipChord']-p['chord'])*u
        le=p['root'][0]+(p['tip'][0]-p['root'][0])*u
        return np.trapezoid((le+.25*chord)*chord,u)/np.trapezoid(chord,u)
    wing=next(p for p in panels if p['name']=='wing_right')
    horizontal=next(p for p in panels if p['name']==('tail_v_right' if tail=='vtail' else 'tail_horizontal_right'))
    assert g['effective_tail_arm']==pytest.approx(ac(horizontal)-ac(wing),abs=.0002)


def test_max_speed_is_a_power_balance_root_not_grid_limit():
    g=calculate_geometry(1.5,2,'2412');p=get_airfoil_properties('2412')
    r=mission_performance(g,p,10000,74)
    v=r['max_speed'];w=g['weight']*9.81;s=g['wing_area'];k=1/(math.pi*g['aspect_ratio']*OSWALD_E)
    required=.5*1.225*v**3*s*(p['cd_0']+PARASITE_CD0)+2*k*w*w/(1.225*v*s)
    assert v>max(60,6*r['stall_speed'])
    assert required==pytest.approx(r['power_available'],rel=.0005)


def test_large_stall_speed_is_not_a_universal_no_flight_rule():
    g=calculate_geometry(1.5,10,'2412');r=flight_test(g,get_airfoil_properties('2412'),power_available=3000)
    assert r['stall_speed']>15
    assert next(c for c in r['checks'] if c['key']=='stall_speed')['status']=='warn'


def test_positive_small_static_margin_is_not_negative_stability():
    g=calculate_geometry(1.5,2,'2412');p=get_airfoil_properties('2412');r=flight_test(g,p)
    g['cg_position']=(r['neutral_point']-.025)*g['mac'];r=flight_test(g,p)
    assert 0<r['static_margin']<5
    assert next(c for c in r['checks'] if c['key']=='static_margin')['status']=='warn'


def test_near_miss_is_not_target_met():
    g=calculate_geometry(1.5,2,'2412');p=get_airfoil_properties('2412');base=mission_performance(g,p,600,100)
    r=mission_performance(g,p,600,100,targets={'endurance_min':base['endurance_min']/ .95,'turn_rate_deg':.1,'stall_speed':100})
    assert r['checks'][0]['status']=='warn' and not r['targets_met']

@pytest.mark.parametrize('body',[{'wingspan':0},{'weight':-1},{'wingspan':'NaN'},{'man_root_chord':-1},{'tail_type':'invalid'}])
def test_invalid_geometry_is_a_clear_client_error(client,body):
    r=client.post('/api/calculate',json=body)
    assert r.status_code==400 and r.json['error']

@pytest.mark.parametrize('field,value',[('prop_efficiency',0),('n_limit',-1),('reynolds_number',0),('motor_power',-1),('battery_wh','Infinity')])
def test_invalid_performance_is_rejected(client,field,value):
    r=client.post('/api/mission',json={'geometry':calculate_geometry(1.5,2,'2412'),field:value})
    assert r.status_code==400 and r.json['error']


def test_no_infinite_corner_radius_at_one_g():
    r=mission_performance(calculate_geometry(1.5,2,'2412'),get_airfoil_properties('2412'),400,74,n_limit=1)
    assert r['corner_turn_radius'] is None
    json.dumps(r,allow_nan=False)


@pytest.mark.parametrize('code',['0012','2412','4412','2415','0015','4415','6412'])
def test_naca_shape_against_published_uiuc_coordinates(code):
    ref=[]
    for line in (Path(__file__).parent/'reference_data'/(code+'.dat')).read_text().splitlines()[1:]:
        try:
            x,y=map(float,line.split())
            if -.05<=x<=1.05 and abs(y)<.5:ref.append([x,y])
        except ValueError:continue
    assert len(ref)>20
    model=naca_4_digit_coordinates(code,n=1200);a=model[:-1];edge=model[1:]-a
    length=np.sum(edge*edge,axis=1);dist=[]
    for point in ref:
        u=np.clip(np.sum((point-a)*edge,axis=1)/np.maximum(length,1e-20),0,1)
        dist.append(float(np.linalg.norm(a+u[:,None]*edge-point,axis=1).min()))
    # Known 4415 coordinate convention differs by up to 0.18% of chord.
    assert max(dist)<(.002 if code=='4415' else .0003)
