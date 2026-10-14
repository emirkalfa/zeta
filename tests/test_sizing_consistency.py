import itertools,json,math,subprocess
from pathlib import Path
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.airfoil import get_airfoil_properties
from backend.stability import flight_test


def test_all_actual_panel_centers_and_tail_volume_targets():
    # Independent integration of the frontend panel geometry; does not call the
    # backend center helper. Covers all three tails, shapes and placements.
    cases=[calculate_geometry(1.5,2.5,'2412',airframe=a,tail_type=t,wing_shape=s,wing_position=p)
           for a,t,s,p in itertools.product(['standard','combat','vtol_fixed'],
              ['conventional','ttail','vtail'],['rectangular','tapered','ste_tapered'],['low','mid','high'])]
    code="""const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js'),window:{addEventListener(){}}});vm.runInContext(fs.readFileSync('./static/js/assembly.js','utf8'),c);console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(g=>{c.g=g;return vm.runInContext('aircraftPanelSpecs(g,[],[],[])',c)})));"""
    out=subprocess.run(['node','-e',code],cwd=Path(__file__).resolve().parents[1],input=json.dumps(cases),capture_output=True,text=True,check=True)
    for g,panels in zip(cases,json.loads(out.stdout)):
        def integrate(p):
            root,tip=np.asarray(p['root']),np.asarray(p['tip'])
            eta=np.linspace(0,1,2001);ch=p['chord']+(p['tipChord']-p['chord'])*eta
            span=math.hypot(*(tip-root)[1:])
            area=float(np.trapezoid(ch,eta)*span)
            ac=float(np.trapezoid(ch*(root[0]+(tip[0]-root[0])*eta+.25*ch),eta)*span)
            return area,ac
        def combined(items):
            values=[integrate(p) for p in items];area=sum(a for a,_ in values)
            return area,sum(x for _,x in values)/area
        wings=[p for p in panels if p['kind']=='wing']
        _,wac=combined(wings)
        horizontal=[p for p in panels if p['kind']=='tail' and not p['name'].startswith('tail_vertical')]
        sh,hac=combined(horizontal)
        if g['tail_type']=='vtail':
            sv=sh*math.sin(math.radians(35))**2;sh*=math.cos(math.radians(35))**2;vac=hac
        else:
            sv,vac=combined([p for p in panels if p['kind']=='tail' and p['name'].startswith('tail_vertical')])
        assert g['effective_tail_arm']==pytest.approx(hac-wac,abs=1e-6)
        assert g['effective_vertical_tail_arm']==pytest.approx(vac-wac,abs=1e-6)
        assert g['htail_arm']==g['effective_tail_arm']
        targets=g['tail_sizing_targets']
        assert sh*(hac-wac)/(g['wing_area']*g['mac'])>=targets['horizontal']*.999
        assert sv*(vac-wac)/(g['wing_area']*g['wingspan'])>=targets['vertical']*.999


@pytest.mark.parametrize('frame',['standard','combat','vtol_fixed'])
@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
def test_mass_and_stall_target_change_area_preserving_layout(frame,shape):
    args=dict(airframe=frame,wing_shape=shape,target_stall_speed=8)
    light=calculate_geometry(1.5,2.5,'2412',**args)
    heavy=calculate_geometry(1.5,4,'2412',**args)
    assert heavy['wing_area']>light['wing_area']
    assert heavy['wing_area']/light['wing_area']==pytest.approx(4/2.5,rel=.005)
    for key in ['wingspan','fuselage_length','fuselage_max_width','wing_x_pos','tail_x_pos','wing_position']:
        assert heavy[key]==light[key]
    cl=get_airfoil_properties('2412')['cl_max']
    for g in [light,heavy]:
        assert g['wing_area']>=2*g['weight']*9.81/(1.225*8**2*cl)
        assert flight_test(g,get_airfoil_properties('2412'))['stall_speed']<=8.01
    faster=calculate_geometry(1.5,4,'2412',airframe=frame,wing_shape=shape,target_stall_speed=12)
    assert faster['wing_area']<heavy['wing_area']


def test_manual_geometry_is_not_resized_by_mass_or_stall_target():
    args=dict(manual_mode=True,man_root_chord=.4,man_tip_chord=.2,man_htail_span=.6,
              man_htail_root=.15,man_htail_tip=.08,man_vtail_span=.3,man_vtail_root=.17,man_vtail_tip=.07)
    a=calculate_geometry(2,2,'2412',target_stall_speed=12,**args)
    b=calculate_geometry(2,5,'2412',target_stall_speed=6,**args)
    for k in ['root_chord','tip_chord','wing_area','htail_span','htail_chord','vtail_span','vtail_chord']:
        assert a[k]==b[k]
    assert b['wing_sizing']['estimated_stall_speed']>6
    # A fully specified manual design need not be feasible in automatic mode.
    c=calculate_geometry(.3,50,'2412',target_stall_speed=2,**args)
    assert c['root_chord']==.4 and c['htail_chord']==.15


def test_api_validates_stall_target_and_uses_selected_reynolds(client):
    payload=dict(wingspan=1.5,weight=4,airfoil_code='2412',target_stall_speed=8,reynolds_number=50000)
    r=client.post('/api/calculate',json=payload)
    assert r.status_code==200
    assert r.json['wing_sizing']['cl_max']==get_airfoil_properties('2412',50000)['cl_max']
    for value in [0,101,'bad',True]:
        assert client.post('/api/calculate',json={**payload,'target_stall_speed':value}).status_code==400
