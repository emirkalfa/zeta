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
