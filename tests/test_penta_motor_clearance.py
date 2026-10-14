import pytest
from backend.geometry import calculate_geometry
from backend.fixed_vtol import normalize,canonical_rings

@pytest.mark.parametrize('span,length,offset',[(1.,30,8),(1.5,100,25),(2.,150,100)])
def test_penta_tail_leaves_motor_and_propeller_gap_before_sizing(span,length,offset):
    clearance=(length+offset+40)/1000
    g=calculate_geometry(span,4,'4412',airframe='vtol5_fixed',penta_pusher_clearance=clearance)
    assert g['tail_x_pos']*1000 >= g['fuselage_length']*1000+length+offset+40-.001
    g['fuse_preset']='vtol5'
    n=normalize({'geometry':g,'panels':[],'options':{'motorLength':length,'propOffset':offset}})
    assert n['geometry']['tail_x_pos']==pytest.approx(g['tail_x_pos'])
    assert g['htail_arm']==g['effective_tail_arm']


def test_penta_roof_is_flattened_without_removing_lower_equipment_space():
    rings=canonical_rings('vtol5')
    mid=min(rings,key=lambda r:abs(r[0,0]-380))
    assert mid[:,1].max()<37
    assert mid[:,1].min()<-60
