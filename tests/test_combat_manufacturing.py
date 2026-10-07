import io,json,zipfile
import numpy as np
import pytest
from backend.manufacturing import generate,package,printable_parts,cylinder,ManufacturingError
from tests.test_manufacturing import coords,request_data,assert_stl
from tests.test_motor_mounts import settings

@pytest.mark.parametrize('tail',['conventional','ttail','vtail'])
@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
def test_combat_real_interfaces_and_segmented_stls(coords,tail,shape):
    data=request_data(coords,tail=tail,wing_shape=shape,preset='combat',combat=True)
    data['options'].update(settings('single'))
    parts,report,rings=generate(data);named={p.name:p.solid for p in parts}
    tails=[p for p in data['panels'] if p['kind']=='tail']
    for i,a in enumerate(tails):
        for b in tails[i+1:]:assert (named[a['name']]^named[b['name']]).volume()<.1
        for owner in ['boom_right','boom_left','tail_bridge']:
            if owner in named:assert (named[a['name']]^named[owner]).volume()<.1,(a['name'],owner)
    if tail in ['ttail','vtail']:
        assert 'tail_center_joint' in named
        central=[j for j in report['interfaces'] if j.get('purpose')=='center_splice']
        assert len(central)==2
        for joint in central:
            point=np.array(joint['bolt_point_mm']);axis=np.array(joint['bolt_axis'])
            probe=cylinder(1,50,(point-axis*25).tolist(),axis.tolist())
            assert (named['tail_center_joint']^probe).volume()<1e-5
            assert (named[joint['part']]^probe).volume()<1e-5
    for joint in report['interfaces']:
        assert (named[joint['part']]^named[joint['parent']]).volume()<.1,joint['part']
    for boom in report['booms']:
        assert (named[boom['part']]^named[boom['parent']]).volume()<.1
        x,y,z=boom['bolt_point_mm']
        tool=cylinder(1,40,[x,y-20,z],[0,1,0])
        for owner in [boom['part'],boom['parent']]:assert (named[owner]^tool).volume()<1e-5
    mount=report['motors'][0];x,y,z=mount['face_mm']
    assert mount['axis']==[-1,0,0]
    assert mount['prop_plane_x_mm']>x
    for hy,hz in mount['hole_centers_yz_mm']:
        assert (named['body']^cylinder(1,3,[x-4,y+hy,z+hz],[1,0,0])).volume()<1e-5
    printed=printable_parts(parts,report,rings)
    for side in ['right','left']:
        slices=[p for p in printed if p.name.startswith('boom_'+side)]
        assert len(slices)>1
        for first,second in zip(slices,slices[1:]):assert (first.assembled^second.assembled).volume()<.1
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
    for filename in archive.namelist():
        if filename.endswith('.stl'):assert_stl(archive.read(filename))
    assert any(n.startswith('boom_right_') for n in archive.namelist())
    if tail in ['ttail','vtail']:assert 'tail_center_joint.stl' in archive.namelist()
    manifest=json.loads(archive.read('manifest.json'))
    assert all(np.all(np.array(p['size_mm'])<=manifest['bed_mm']) for p in manifest['parts'])

@pytest.mark.parametrize('tail',['conventional','ttail','vtail'])
def test_combat_twin_motor_service_covers(coords,tail):
    data=request_data(coords,tail=tail,preset='combat',combat=True)
    data['options'].update(settings('twin'))
    parts,report,_=generate(data);names={p.name for p in parts}
    assert len(report['motors'])==2
    assert all(m['service_cover'] in names for m in report['motors'])

def test_pusher_propeller_collision_with_booms_is_rejected(coords):
    data=request_data(coords,preset='combat',combat=True)
    data['options'].update(settings('single'),propDiameter=700)
    with pytest.raises(ManufacturingError,match='Pervane'):generate(data)

@pytest.mark.parametrize('tail',['conventional','ttail'])
def test_manual_combat_tail_dimensions_remain_mountable(coords,tail):
    from backend.geometry import calculate_geometry
    g=calculate_geometry(1.5,1.2,'2412',tail_type=tail,airframe='combat',manual_mode=True,
        man_root_chord=.3,man_tip_chord=.18,man_sweep=0,man_dihedral=3,
        man_htail_span=.54,man_htail_root=.18,man_htail_tip=.09,man_htail_sweep=4,
        man_vtail_span=.24,man_vtail_root=.13,man_vtail_tip=.075)
    data=request_data(coords,preset='combat',geometry=g)
    parts,report,rings=generate(data);named={p.name:p.solid for p in parts}
    horizontal=[p for p in data['panels'] if p['name'].startswith('tail_horizontal_')]
    area=sum((p['chord']+p['tipChord'])/2*abs(p['tip'][2]-p['root'][2]) for p in horizontal)
    assert area==pytest.approx(.54*(.18+.09)/2,abs=1e-9)
    assert area==pytest.approx(g['htail_area'],abs=.0005)  # Report rounds area to 0.001 m².
    for joint in report['interfaces']:assert (named[joint['part']]^named[joint['parent']]).volume()<.1
    tail_names=[p['name'] for p in data['panels'] if p['kind']=='tail']
    for i,name in enumerate(tail_names):
        for other in tail_names[i+1:]+['boom_right','boom_left','tail_bridge']:
            if other in named:assert (named[name]^named[other]).volume()<.1,(name,other)
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings,'tail')))
    for name in archive.namelist():
        if name.endswith('.stl'):assert_stl(archive.read(name))
