import io,json,zipfile
import pytest
import numpy as np
from tests.test_manufacturing import coords,request_data,assert_stl
from backend.manufacturing import generate,package,cylinder

@pytest.mark.parametrize('preset',['atlas','seyir','akin','combat','vtol','vtol5'])
def test_two_independent_service_hatches(coords,preset):
    from backend.geometry import calculate_geometry
    frame='vtol_fixed' if preset=='vtol' else 'vtol5_fixed' if preset=='vtol5' else 'combat' if preset=='combat' else 'standard'
    g=calculate_geometry(1.5,1.2,'2412',wing_shape='tapered',tail_type='vtail' if preset=='vtol' else 'conventional',airframe=frame)
    data=request_data(coords,preset=preset,geometry=g);data['options']['wingJoinMode']='bolted'
    parts,manifest,rings=generate(data);named={p.name:p.solid for p in parts}
    assert len(manifest['service_hatches'])==2 and len(manifest['hatch_bolts_mm'])==8
    front=named['hatch_front'];rear=named['hatch_rear'];body=named['body']
    assert (front^rear).volume()<.01
    assert front.bounding_box()[3]+7<rear.bounding_box()[0]
    for cap in manifest['service_hatches']:
        solid=named[cap['part']];assert len(cap['bolt_points_mm'])==4
        for dy in [0,5,30,100]:assert (solid.translate([0,dy,0])^body).volume()<.1
        for point in cap['bolt_points_mm']:
            assert ((body+solid)^cylinder(1.4,200,np.asarray(point)-[0,100,0],[0,1,0])).volume()<.1
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    for name in ['hatch_front','hatch_rear']:assert any(n.startswith(name) for n in archive.namelist())
    report=json.loads(archive.read('manifest.json'))
    for part in report['parts']:
        assert np.all(np.asarray(part['size_mm'])<=np.asarray(report['bed_mm'])+.001)
        assert_stl(archive.read(part['file']))
