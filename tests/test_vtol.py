import io
import json
import zipfile
import numpy as np
import pytest
from tests.test_manufacturing import coords, request_data, assert_stl
from backend.manufacturing import generate, package, cylinder, box, panel_frame, profile, ManufacturingError


@pytest.fixture(scope='module')
def vtol_model(coords):
    data=request_data(coords,tail='vtail',preset='vtol',wing_shape='tapered')
    data['options'].update(wingJoinMode='bolted',cameraMount=1)
    return data,generate(data)


def test_vtol_parts_pivots_and_holes(vtol_model):
    data,(parts,manifest,rings)=vtol_model
    assert len(manifest['motors'])==3
    assert len(manifest['vtol_joints'])==2
    named={p.name:p.solid for p in parts}
    for joint in manifest['vtol_joints']:
        cradle=named[joint['part']];fork=named[joint['parent']]
        assert (cradle^fork).volume()<.1
        assert (fork^named[joint['wing']]).volume()<.1
        p=np.array(joint['pivot_mm'])
        assert (cradle^cylinder(joint['pin_diameter_mm']/2-.1,100,p-[0,0,50],[0,0,1])).volume()<.01
        for hole in joint['bolt_points_mm']:
            assert (fork^cylinder(1.4,20,np.array(hole)-[0,10,0],[0,1,0])).volume()<.01
        assert joint['mechanism']=='compact_direct_servo'
        cover=named[joint['cover_part']]
        assert (cover^fork).volume()<.1
        center=np.asarray(joint['servo_center_mm']);size=np.asarray(joint['servo_mm'])
        servo=box(center-size/2,center+size/2)
        assert ((cover+fork)^servo).volume()<.1
        for hole in joint['horn_holes_mm']:
            assert (cradle^cylinder(.9,12,np.asarray(hole)-[0,0,6],[0,0,1])).volume()<.1
        side=-joint['servo_output_axis'][2]
        for hole in joint['cover_holes_mm']:
            probe=cylinder(1.05,23,np.asarray(hole)-[0,0,side*23],[0,0,side])
            assert ((cover+fork)^probe).volume()<.1
    for motor in manifest['motors']:
        for point in motor['hole_points_mm']:
            assert (named[motor['parent']]^cylinder(1.4,6,np.array(point)-[0,5,0],[0,1,0])).volume()<.02
    rear=next(m for m in manifest['motors'] if m['name']=='vtol_rear')
    x,y,z=rear['face_mm'];body=named[rear['parent']]
    lower=named[rear['clamp_part']]
    assert (body^lower).volume()<.1
    assert (body^named['body']).volume()<.1
    assert (lower^named['body']).volume()<.1
    for point in rear['clamp_bolt_points_mm']:
        probe=cylinder(1.4,18,np.array(point)-[0,16,0],[0,1,0])
        assert ((body+lower)^probe).volume()<.1
    # Both broad walls connect across the support height; the central bay is open.
    for dx in [-18,18]:
        probe=box([x+dx-1,y-25,-8],[x+dx+1,y-8,8])
        assert (body^probe).volume()==pytest.approx(probe.volume(),abs=.1)
    assert (body^box([x-3,y-24,-20],[x+3,y-9,20])).volume()<.1
    for point in rear['hole_points_mm']:
        assert (body^cylinder(3.5,18,np.array(point)-[0,24,0],[0,1,0])).volume()<.1
    for joint in manifest['vtol_joints']:
        panel=next(p for p in data['panels'] if p['name']==joint['wing'])
        leading=(panel['root'][0]+(panel['tip'][0]-panel['root'][0])*.52)*1000
        assert leading-joint['pivot_mm'][0]==pytest.approx(75)


def test_vtol_zip_is_closed_and_includes_mechanisms(vtol_model):
    _,(parts,manifest,rings)=vtol_model
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    report=json.loads(archive.read('manifest.json'))
    assert len(report['vtol_joints'])==2
    for side in ['right','left']:
        for kind in ['fork','cradle','servo_cover']:
            assert any(n.startswith('vtol_wing_'+side+'_'+kind) for n in archive.namelist())
    for kind in ['saddle','clamp']:
        assert any(n.startswith('vtol_rear_'+kind) for n in archive.namelist())
    for n in archive.namelist():
        if n.endswith('.stl'):assert_stl(archive.read(n))


def test_blended_center_keeps_detachable_wings_and_open_channels(vtol_model):
    data,(parts,manifest,_)=vtol_model
    named={p.name:p.solid for p in parts}
    assert len(manifest['wing_root_fairings'])==2
    for fairing in manifest['wing_root_fairings']:
        assert fairing['blended'] and fairing['blend_length_mm']>80
        assert fairing['flush_seat']
        assert (named['body']^named[fairing['part']]).volume()<.1
    for joint in manifest['interfaces']:
        if joint['part'].startswith('wing_'):
            assert joint['pin_count']==1
            p=np.asarray(joint['bolt_point_mm']);axis=np.asarray(joint['bolt_axis'])
            probe=cylinder(joint['pin_diameter_mm']/2-.1,30,p-axis*15,axis)
            assert ((named['body']+named[joint['part']])^probe).volume()<.1
    for channel in manifest['spar_channels']:
        panel=next(p for p in data['panels'] if p['name']==channel['part'])
        mat,_=panel_frame(panel)
        seam=next(j['root_trim_mm'] for j in manifest['interfaces'] if j['part']==channel['part'])
        from tests.test_manufacturing import channel_probe
        probe=channel_probe(channel,seam-12,seam+12,inset=.1)
        assert ((named['body']+named[channel['part']])^probe).volume()<.1


def test_bad_vtol_spacing_rejected(coords):
    data=request_data(coords,tail='vtail',preset='vtol')
    data['options'].update(vtolHoleX=8,vtolBore=12)
    with pytest.raises(ManufacturingError,match='delikleri'):
        generate(data)


def test_carbon_tube_clearance_and_tail_carrier(vtol_model):
    _,(parts,report,_)=vtol_model
    named={p.name:p.solid for p in parts};tube=report['carbon_boom']
    assert tube['purchased'] and tube['outer_diameter_mm']==20
    assert tube['tail_carrier'] in named and 'carbon_tail_tube' not in named
    probe=cylinder(9.9,tube['length_mm']-.2,np.asarray(tube['start_mm'])+[.1,0,0],[1,0,0])
    for name in ['body',tube['tail_carrier'],'vtol_rear_saddle','vtol_rear_clamp']:
        assert (named[name]^probe).volume()<.1
    for name,solid in named.items():
        if name.startswith('tail_'):assert (solid^probe).volume()<.1
    tail=[j for j in report['interfaces'] if j['part'].startswith('tail')]
    assert all(j['parent']==tube['tail_carrier'] for j in tail)
    for key,part in [('body_bolt_points_mm','body'),('tail_bolt_points_mm',tube['tail_carrier'])]:
        for point in tube[key]:
            assert (named[part]^cylinder(1.4,20,np.asarray(point)-[0,10,0],[0,1,0])).volume()<.1
    balance=report['hover_balance'];weights=np.asarray(list(balance['vertical_thrust_fraction'].values()))
    points=np.asarray([[m['face_mm'][0],m['face_mm'][2]] for m in report['motors']])
    assert weights.sum()==pytest.approx(1)
    assert weights@points==pytest.approx(balance['assumed_cg_mm'])


@pytest.mark.parametrize('diameter',[16,32])
def test_carbon_diameter_keeps_keys_clear_of_tube(coords,diameter):
    data=request_data(coords,tail='vtail',preset='vtol')
    data['options'].update(vtolBoomDiameter=diameter,vtolBoomInnerDiameter=diameter-4)
    parts,report,_=generate(data);tube=report['carbon_boom']
    probe=cylinder(diameter/2-.1,tube['length_mm']-.2,np.asarray(tube['start_mm'])+[.1,0,0],[1,0,0])
    for part in parts:
        if part.name.startswith('tail_') or part.name==tube['tail_carrier']:
            assert (part.solid^probe).volume()<.1


@pytest.mark.parametrize('span,position',[(1.5,'mid'),(2.0,'low')])
def test_vtol_wing_position_and_motor_dimensions(coords,span,position):
    from backend.geometry import calculate_geometry
    g=calculate_geometry(span,1.2,'2412',tail_type='vtail',wing_position=position)
    data=request_data(coords,tail='vtail',preset='vtol',geometry=g)
    data['options'].update(vtolMotorDiameter=35,vtolMotorLength=38)
    parts,manifest,_=generate(data)
    assert len(manifest['motors'])==3
    assert all(m['motor_diameter_mm']==35 and m['motor_length_mm']==38 for m in manifest['motors'])
    for joint in manifest['vtol_joints']:
        panel=next(p for p in data['panels'] if p['name']==joint['wing'])
        expected=manifest['wing_position_offset_mm']+(panel['tip'][1]-panel['root'][1])*1000*.52+25
        assert joint['pivot_mm'][1]==pytest.approx(expected)


def test_wide_cambered_tria_center_blend_is_closed_and_printable():
    from app import app
    from backend.geometry import calculate_geometry
    from backend.manufacturing import preview
    client=app.test_client()
    records=client.get('/api/airfoils').json
    def coordinates(code):
        aid=next(a['id'] for a in records if a['code']==code)
        return client.get('/api/airfoil/'+str(aid)).json['coordinates']
    g=calculate_geometry(2,4,'4412',wing_shape='ste_tapered',tail_type='vtail',airframe='vtol_fixed')
    d=request_data((coordinates('4412'),coordinates('0012')),preset='vtol',tail='vtail',geometry=g)
    d['options'].update(wingJoinMode='bolted',cameraMount=1,vtolMotorDiameter=65,vtolMotorLength=30)
    parts,manifest,rings=generate(d)
    assert_flush_cuffs(d,parts,manifest)
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    report=json.loads(archive.read('manifest.json'))
    assert manifest['fixed_vtol_body']
    assert len(manifest['motors'])==3
    assert any(p['file'].startswith('body_') for p in report['parts'])
    for p in report['parts']:
        assert_stl(archive.read(p['file']))
        assert np.all(np.array(p['size_mm'])<=np.array(report['bed_mm'])+.001)


@pytest.mark.parametrize('station',[0,50,100])
def test_rear_motor_uses_exposed_tube_bay_and_does_not_overlap(coords,station):
    from backend.geometry import calculate_geometry
    g=calculate_geometry(2,4,'2412',tail_type='vtail',wing_shape='ste_tapered',airframe='vtol_fixed')
    data=request_data(coords,tail='vtail',preset='vtol',geometry=g)
    data['options'].update(vtolRearStation=station,vtolMotorDiameter=65)
    parts,manifest,_=generate(data);named={p.name:p.solid for p in parts}
    rear=next(m for m in manifest['motors'] if m['name']=='vtol_rear')
    aft,tail=rear['placement']['exposed_bay_mm'];x=rear['face_mm'][0];radius=rear['prop_diameter_mm']/2
    assert x-radius>=aft+14.99 and x+radius<=tail-14.99
    clamp=named['vtol_rear_saddle']+named['vtol_rear_clamp']
    for part in parts:
        if not part.name.startswith('vtol_rear'):
            assert (clamp^part.solid).volume()<.1
    assert manifest['hover_balance']['inside_triangle']


def assert_flush_cuffs(data,parts,manifest):
    from backend.fixed_vtol import normalize
    from backend.wing_placement import place_wing_assembly
    from backend.motor_mounts import motor_sized_fuselage
    if data['geometry'].get('fuse_preset') in ('vtol','vtol5'):data=normalize(data)
    data=place_wing_assembly(motor_sized_fuselage(data))
    body=next(p.solid for p in parts if p.name=='body')
    for fairing in manifest['wing_root_fairings']:
        spec=next(p for p in data['panels'] if p['name']==fairing['part'])
        mat,length=panel_frame(spec);inv=np.linalg.inv(mat[:,:3])
        local=body.transform(np.column_stack([inv,-inv@mat[:,3]]).tolist())
        root=fairing['root_plane_mm'];depth=fairing['seat_depth_mm'];wall=manifest['wall_mm']
        cuff=local^box([-10000,-10000,root+wall],[10000,10000,root+depth-wall])
        envelope=profile(spec['coords'],spec['chord']*1000).offset(.025).extrude(
            length,scale_top=[spec['tipChord']/spec['chord']]*2)
        assert not cuff.is_empty()
        assert (cuff-envelope).volume()<.1, 'root cuff must stay inside the unmodified wing outline'


def test_tria_cuff_is_flush_with_the_original_airfoil(vtol_model):
    data,(parts,manifest,_)=vtol_model
    assert_flush_cuffs(data,parts,manifest)


def test_split_body_socket_is_bolted_to_preceding_body_slice(vtol_model):
    from backend.manufacturing import printable_parts
    _,(parts,manifest,rings)=vtol_model
    printed=printable_parts(parts,manifest,rings);named={p.name:p for p in printed}
    joints=manifest['body_segment_joints']
    assert len(joints)==2
    tube=manifest['carbon_boom'];probe=cylinder(tube['outer_diameter_mm']/2-.1,tube['length_mm'],tube['start_mm'],[1,0,0])
    for joint in joints:
        bridge=named[joint['bridge']].assembled
        assert len(joint['holes'])==2 and len(set(joint['segments']))==2
        assert joint['connection']=='axial'
        assert joint['holes'][0]['point_mm'][0]<joint['seam_x_mm']<joint['holes'][1]['point_mm'][0]
        assert joint['segments'][0].split('_split')[0]!=joint['segments'][1].split('_split')[0]
        assert (bridge^probe).volume()<.01
        for segment in joint['segments']:
            assert (bridge^named[segment].assembled).volume()<.01
            assert (named[segment].assembled^probe).volume()<.1
        for h in joint['holes']:
            axis=np.asarray(h['axis']);bore=cylinder(1.4,h['grip_mm']+2,np.asarray(h['point_mm'])-axis,axis)
            assert (bridge^bore).volume()<.01
            assert sum((named[n].assembled^bore).volume() for n in joint['segments'])<.01
    for j in manifest['vtol_joints']:assert j['wing_support']=='rounded_tapered'


@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
def test_reinforced_motor_and_root_supports_all_wing_shapes(coords,shape):
    from backend.manufacturing import printable_parts
    data=request_data(coords,tail='vtail',preset='vtol',wing_shape=shape)
    data['options']['wingJoinMode']='bolted'
    parts,manifest,rings=generate(data)
    printed=printable_parts(parts,manifest,rings);named={p.name:p for p in printed}
    assert len(manifest['wing_root_braces'])==2
    for j in manifest['vtol_joints']:
        assert j['motor_plate_thickness_mm']==10
        assert j['wing_pad_thickness_mm']==14
        assert j['wing_support_width_mm']['root']==90
    for j in manifest['wing_root_braces']:
        assert j['thickness_mm']>=5 and j['width_mm']>=16
        assert j['boss_diameter_mm']>=14
        assert len(j['holes'])==2 and len(set(j['segments']))==2
        assert j['segments'][0].startswith('body')
        assert j['segments'][1].startswith(j['parent'])
        strap=named[j['bridge']].assembled
        for segment in j['segments']:
            assert (strap^named[segment].assembled).volume()<.01
        for h in j['holes']:
            axis=np.asarray(h['axis'])
            bore=cylinder(1.4,h['grip_mm']+2,np.asarray(h['point_mm'])-axis,axis)
            assert (strap^bore).volume()<.01
            assert sum((named[n].assembled^bore).volume() for n in j['segments'])<.01
    # Reinforcement must not refill purchased spar tubes or the single root pin.
    for c in manifest['spar_channels']:
        spec=next(p for p in data['panels'] if p['name']==c['part'])
        mat,_=panel_frame(spec)
        seam=next(j['root_trim_mm'] for j in manifest['interfaces'] if j['part']==c['part'])
        from tests.test_manufacturing import channel_probe
        probe=channel_probe(c,seam-12,seam+12,inset=.1)
        assert sum((p.assembled^probe).volume() for p in printed if p.name.startswith(c['part']) or p.name.startswith('body'))<.1
