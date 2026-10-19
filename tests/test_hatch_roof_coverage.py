"""Assembled roof coverage, beyond per-part manifold/closed-mesh checks."""
import itertools
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.manufacturing import generate,mesh_solid
from tests.test_manufacturing import coords,request_data

CASES=[(p,s,h) for p,s,h in itertools.product(
    ['atlas','seyir','akin','combat','vtol','vtol5'],
    ['rectangular','tapered','ste_tapered'],['low','mid','high'])
    if p!='vtol' or h=='mid']

@pytest.mark.parametrize('preset,shape,position',CASES)
def test_cap_seams_have_a_curved_underlap_in_every_model(coords,preset,shape,position):
    frame='vtol_fixed' if preset=='vtol' else 'vtol5_fixed' if preset=='vtol5' else 'combat' if preset=='combat' else 'standard'
    g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position,
                         tail_type='vtail' if preset=='vtol' else 'conventional',airframe=frame)
    data=request_data(coords,preset=preset,geometry=g)
    parts,m,r=generate(data);named={p.name:p.solid for p in parts}
    body=named['body'];assembled=body+named['hatch_front']+named['hatch_rear']
    inner=mesh_solid(r['cavity'],r['cavity'][0][:,[1,2]])
    gap=m['clearance_mm']
    for name in ('hatch_front','hatch_rear'):
        cap=named[name];bb=cap.bounding_box()
        a,b=bb[0]-gap,bb[3]+gap;hz=max(abs(bb[2]),abs(bb[5]))+gap
        points=[(x,z) for x in (a,b) for z in np.linspace(-hz+.5,hz-.5,11)]
        points += [(x,z) for z in (-hz,hz) for x in np.linspace(a+.5,b-.5,11)]
        for x,z in points:
            reference=inner.ray_cast([x,1000,z],[x,-1000,z])
            actual=assembled.ray_cast([x,1000,z],[x,-1000,z])
            assert reference and actual,(preset,shape,position,name,x,z)
            minimum=reference[0].position[1]-gap-.12
            assert actual[0].position[1]>=minimum,(preset,shape,position,name,x,z,minimum,actual[0].position[1])
        for dy in (0,1,5,30):
            assert (cap.translate([0,dy,0])^body).volume()<.1
