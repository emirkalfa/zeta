import io,json,zipfile
import numpy as np
import pytest
from tests.test_manufacturing import coords,request_data,assert_stl
from backend.manufacturing import generate,package,printable_parts,cylinder,box

@pytest.mark.parametrize('preset,shape,position',[('atlas','rectangular','high'),('seyir','tapered','low'),('akin','ste_tapered','mid'),('combat','ste_tapered','high')])
def test_three_external_wheel_mounts_in_preview_and_printed_zip(coords,preset,shape,position):
    from backend.geometry import calculate_geometry
    g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position,airframe='combat' if preset=='combat' else 'standard')
    data=request_data(coords,geometry=g,preset=preset)
    data['options'].update(wingJoinMode='bolted',cameraMount=1)
    parts,report,rings=generate(data)
    mounts=report['landing_mounts'];assert mounts['layout']=='tricycle_wheel_mounts'
    named={m['name']:m for m in mounts['mounts']}
    assert set(named)=={'center_front','right_main','left_main'}
    cg=(g['wing_ac_x']-.25*g['mac']+g['cg_position'])*1000
    assert named['center_front']['bolt_points_mm'][0][0]<cg<named['right_main']['bolt_points_mm'][0][0]
    assert named['right_main']['bolt_points_mm'][0][2]>0>named['left_main']['bolt_points_mm'][0][2]
    body=next(p.solid for p in parts if p.name=='body')
    for camera in report['cameras']:
        bb=camera['envelope_mm'];assert (body^box(bb[:3],bb[3:])).volume()<.1
    printed=printable_parts(parts,report,rings)
    for mount in named.values():
        for point in mount['bolt_points_mm']:
            probe=cylinder(1.4,30,np.asarray(point)-[0,10,0],[0,1,0])
            assert (body^probe).volume()<.1
            assert sum((p.assembled^probe).volume() for p in printed if p.name.startswith('body'))<.1
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings,printed=printed)))
    assert not any(n.startswith(('wheel_','landing_')) for n in archive.namelist())
    manifest=json.loads(archive.read('manifest.json'))
    assert len(manifest['landing_mounts']['mounts'])==3
    for p in manifest['parts']:
        assert np.all(np.asarray(p['size_mm'])<=np.asarray(manifest['bed_mm'])+.001)
        assert_stl(archive.read(p['file']))
