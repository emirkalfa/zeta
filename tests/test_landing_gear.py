import io
import json
import zipfile
import numpy as np
import pytest
from tests.test_manufacturing import coords,request_data,assert_stl
from backend.manufacturing import generate,package,cylinder,printable_parts

@pytest.mark.parametrize('preset,shape,position,span',[('vtol','tapered','mid',1.5),('vtol5','rectangular','low',1.5),('vtol5','ste_tapered','high',1.5),('vtol5','tapered','mid',3.)])
def test_external_mounts_only_bolts_and_real_zip(coords,preset,shape,position,span):
    from backend.geometry import calculate_geometry
    g=calculate_geometry(span,1.2,'2412',wing_shape=shape,wing_position=position,tail_type='vtail' if preset=='vtol' else 'conventional',airframe='vtol_fixed' if preset=='vtol' else 'vtol5_fixed')
    data=request_data(coords,geometry=g,preset=preset)
    data['options'].update(wingJoinMode='bolted',cameraMount=1)
    parts,report,rings=generate(data)
    mounts=report['landing_mounts'];assert len(mounts['mounts'])==3 and not mounts['printed_legs']
    assert {m['name'] for m in mounts['mounts']}=={'right_front','left_front','center_rear'}
    assert not any(p.name.startswith('landing_') for p in parts)
    body=next(p.solid for p in parts if p.name=='body')
    for mount in mounts['mounts']:
        for point in mount['bolt_points_mm']:
            drill=cylinder(1.4,30,np.asarray(point)-[0,10,0],[0,1,0])
            assert (body^drill).volume()<.1
    printed=printable_parts(parts,report,rings)
    for mount in mounts['mounts']:
        for point in mount['bolt_points_mm']:
            drill=cylinder(1.4,30,np.asarray(point)-[0,10,0],[0,1,0])
            assert sum((p.assembled^drill).volume() for p in printed if p.name.startswith('body'))<.1
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings,printed=printed)))
    manifest=json.loads(archive.read('manifest.json'))
    assert not any(n.startswith('landing_') for n in archive.namelist())
    assert len(manifest['landing_mounts']['mounts'])==3
    for p in manifest['parts']:
        assert np.all(np.asarray(p['size_mm'])<=np.asarray(manifest['bed_mm'])+.001)
        assert_stl(archive.read(p['file']))
