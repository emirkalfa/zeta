"""Physical STL root and motor transitions, across every selectable wing position."""
import itertools
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.manufacturing import generate, printable_parts, cylinder
from tests.test_manufacturing import coords, request_data
from tests.test_vtol import assert_flush_cuffs
from tests.test_motor_mounts import settings


@pytest.mark.parametrize('preset,shape,position',list(itertools.product(
    ['atlas','seyir','akin','combat','vtol5'],
    ['rectangular','tapered','ste_tapered'],['high','mid','low'])))
def test_real_blend_and_flush_seat_in_every_model_position(coords,preset,shape,position):
    combat=preset in ('combat','vtol5')
    g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position,
                         airframe='combat' if combat else 'standard')
    data=request_data(coords,preset=preset,combat=combat,wing_shape=shape,geometry=g)
    data['options']['wingJoinMode']='bolted'
    parts,manifest,rings=generate(data);named={p.name:p.solid for p in parts}
    assert len(manifest['wing_root_fairings'])==2
    assert all(j['blended'] and j['flush_seat'] for j in manifest['wing_root_fairings'])
    assert_flush_cuffs(data,parts,manifest)
    for j in manifest['interfaces']:
        if j['part'] not in ('wing_right','wing_left'):continue
        assert (named['body']^named[j['part']]).volume()<.1
        pt=np.asarray(j['bolt_point_mm']);axis=np.asarray(j['bolt_axis'])
        probe=cylinder(j['pin_diameter_mm']/2-.1,30,pt-axis*15,axis)
        assert ((named['body']+named[j['part']])^probe).volume()<.1
    # Validation includes actual segmentation, print orientation, screw bosses,
    # closed float32 STL edges and the configured 220 mm printer volume.
    printed=printable_parts(parts,manifest,rings)
    assert len(manifest['wing_root_braces'])==2
    for p in printed:
        b=np.asarray(p.solid.bounding_box())
        assert np.all(b[3:]-b[:3]<=np.asarray(manifest['bed_mm'])+.001)


@pytest.mark.parametrize('shape,position',list(itertools.product(
    ['rectangular','tapered','ste_tapered'],['high','mid','low'])))
def test_twin_motor_transition_tracks_wing_shape_and_height(coords,shape,position):
    g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position)
    data=request_data(coords,wing_shape=shape,geometry=g)
    data['options'].update(settings('twin'))
    parts,manifest,rings=generate(data)
    assert len(manifest['motors'])==2
    assert all(m['smooth_wing_transition'] for m in manifest['motors'])
    named={p.name:p.solid for p in parts}
    for m in manifest['motors']:
        x,y,z=m['face_mm']
        for hy,hz in m['hole_centers_yz_mm']:
            assert (named[m['parent']]^cylinder(1.4,m['plate_thickness_mm']+2,
                [x-1,y+hy,z+hz],[1,0,0])).volume()<.1
