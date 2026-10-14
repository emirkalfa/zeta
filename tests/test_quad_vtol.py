import io
import zipfile
import numpy as np
import pytest
from tests.test_manufacturing import coords, request_data, assert_stl
from backend.manufacturing import generate, package, cylinder, ManufacturingError


@pytest.fixture(scope='module')
def quad_model(coords):
    data=request_data(coords,tail='conventional',preset='vtol5',combat=True,wing_shape='tapered')
    data['options'].update(wingJoinMode='bolted',motorLayout='single',motorDiameter=28)
    return data,generate(data)


def test_five_motors_and_real_mounting_holes(quad_model):
    data,(parts,manifest,rings)=quad_model
    assert len(manifest['motors'])==5 and not manifest['vtol_joints']
    assert len(manifest['booms'])==2
    named={p.name:p.solid for p in parts}
    lift=[m for m in manifest['motors'] if m.get('out_axis')]
    assert len(lift)==4 and all(m['out_axis']==[0,1,0] for m in lift)
    pusher=next(m for m in manifest['motors'] if m.get('axis'))
    assert pusher['axis']==[-1,0,0]
    assert pusher['plate_thickness_mm']>=10
    assert all(m['support_ribs']==0 and m['pedestal_style']=='flat_plate' and m['face_offset_mm']>=2 and m['smooth_plate_saddle'] and m['saddle_depth_mm']==10 and m['rounded_wide_foot'] and m['plate_thickness_mm']==8 for m in lift)
    for m in lift:
        solid=named[m['parent']]
        side='right' if '_right_' in m['name'] else 'left'
        assert (solid^named['boom_'+side]).volume()<.1
        for point in m['hole_points_mm']:
            assert (solid^cylinder(1.4,16,np.asarray(point)-[0,15,0],[0,1,0])).volume()<.1
        if m['clamp_bolt_points_mm']:
            wing=named[m['clamp_part']]
            assert (solid^wing).volume()<.1
            for point in m['clamp_bolt_points_mm']:
                assert ((solid+wing)^cylinder(1.4,80,np.asarray(point)-[0,60,0],[0,1,0])).volume()<.1


def test_quad_zip_is_watertight_and_fits_printer(quad_model):
    _,(parts,manifest,rings)=quad_model
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    for side in ['right','left']:
        assert any(n.startswith('vtol5_'+side+'_rail') for n in archive.namelist())
    for name in archive.namelist():
        if name.endswith('.stl'):assert_stl(archive.read(name))


def test_missing_twin_boom_geometry_is_reported(coords):
    data=request_data(coords,preset='vtol5')
    with pytest.raises(ManufacturingError,match='çift bom'):
        generate(data)


def test_user_auto_4412_straight_te_finds_four_screw_splices(coords):
    from app import app
    from backend.geometry import calculate_geometry
    from collections import Counter
    import json
    client=app.test_client();aid=next(a['id'] for a in client.get('/api/airfoils').json if a['code']=='4412')
    wing_coords=client.get('/api/airfoil/'+str(aid)).json['coordinates']
    g=calculate_geometry(2,4,'4412',wing_position='mid',wing_shape='ste_tapered',airframe='combat')
    data=request_data((wing_coords,coords[1]),preset='vtol5',geometry=g)
    data['options'].update(wingJoinMode='bolted',designMode='auto')
    parts,report,rings=generate(data)
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
    report=json.loads(archive.read('manifest.json'))
    assert report['wing_segment_joints']
    counts=Counter()
    for joint in report['wing_segment_joints']:counts[joint['parent'],joint['seam']]+=len(joint['holes'])
    assert counts and set(counts.values())=={4}
    for p in report['parts']:
        assert all(size<=bed+.001 for size,bed in zip(p['size_mm'],report['bed_mm']))
        assert_stl(archive.read(p['file']))


@pytest.mark.parametrize('span,position,shape',[(1.5,'mid','rectangular'),(1.8,'low','tapered'),(1.5,'high','ste_tapered')])
def test_quad_tracks_wing_position_and_shape(coords,span,position,shape):
    from backend.geometry import calculate_geometry
    g=calculate_geometry(span,1.2,'2412',airframe='combat',wing_position=position,wing_shape=shape)
    data=request_data(coords,preset='vtol5',geometry=g)
    data['options'].update(vtolMotorDiameter=35,vtolMotorLength=38,quadHeight=45)
    _,report,_=generate(data)
    lift=[m for m in report['motors'] if m.get('out_axis')]
    assert len(lift)==4 and all(m['motor_diameter_mm']==35 for m in lift)
    for m in lift:
        side='right' if '_right_' in m['name'] else 'left'
        panel=next(p for p in data['panels'] if p['name']=='wing_'+side)
        station=g['tail_booms']['y']/(g['wingspan']/2)
        expected=report['wing_position_offset_mm']+(panel['tip'][1]-panel['root'][1])*1000*station+g['tail_booms']['diameter']*500+10
        assert m['face_mm'][1]==pytest.approx(expected)
