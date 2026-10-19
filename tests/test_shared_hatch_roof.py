"""Service lids must follow the completed body/wing roof, not the pod alone."""
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.manufacturing import generate
from tests.test_manufacturing import coords,request_data

@pytest.mark.parametrize('preset,position', [('atlas','high'),('seyir','high'),('akin','high'),('combat','high'),('vtol5','high'),('vtol5','mid'),('vtol5','low'),('vtol','mid')])
@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
def test_hatch_matches_completed_roof(coords,preset,position,shape):
    frame='vtol5_fixed' if preset=='vtol5' else 'vtol_fixed' if preset=='vtol' else 'combat' if preset=='combat' else 'standard'
    g=calculate_geometry(1.5,1.2,'2412',wing_position=position,wing_shape=shape,
                         tail_type='vtail',airframe=frame)
    data=request_data(coords,preset=preset,geometry=g,combat=preset=='combat')
    parts,m,r=generate(data);named={p.name:p.solid for p in parts}
    body=named['body']
    for name in ('hatch_front','hatch_rear'):
        cap=named[name];bb=cap.bounding_box()
        for side in (-1,1):
            edge=bb[5] if side==1 else bb[2]
            for x in np.linspace(bb[0]+8,bb[3]-8,21):
                def top(solid,z):
                    hits=solid.ray_cast([x,500,z],[x,-500,z])
                    assert hits
                    return hits[0].position[1]
                # Extrapolate the neighboring exterior across the intentional
                # fitting gap. A detached raised root lip fails this check.
                y0=top(body,edge+side*.8)
                y1=top(body,edge+side*1.2)
                expected=y0+(y0-y1)*2.5
                actual=top(cap,edge-side*.2)
                assert abs(actual-expected)<.45,(preset,position,shape,name,x,side,actual,expected)
        for dy in (0,5,30):
            assert (body^cap.translate([0,dy,0])).volume()<.1
