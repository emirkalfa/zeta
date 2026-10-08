import pytest
import io, zipfile, json
from backend.manufacturing import generate, cylinder, box
from tests.test_manufacturing import coords, request_data, assert_stl
from tests.test_motor_mounts import settings


@pytest.mark.parametrize('preset',['atlas','seyir','akin','combat'])
def test_camera_fits_and_screw_holes_are_open(coords,preset):
    data=request_data(coords,preset=preset,combat=preset=='combat')
    data['options'].update(settings('single'))
    data['options']['cameraMount']=1
    parts,report,_=generate(data)
    body=next(p.solid for p in parts if p.name=='body')
    c=report['cameras'][0]
    b=c['envelope_mm']
    assert (body ^ box(b[:3],b[3:])).volume()<.02
    for h in c['holes']:
        x,y,z=h['point_mm']
        probe=cylinder(.8,8,[x,y,z-4],[0,0,1])
        assert (body ^ probe).volume()<.001
    assert len([p for p in body.decompose() if p.volume()>0])==1
    if preset=='combat':
        from backend.manufacturing import package, preview
        assert preview(parts,report,_)['manifest']['cameras']==report['cameras']
        archive=zipfile.ZipFile(io.BytesIO(package(parts,report,_)))
        assert json.loads(archive.read('manifest.json'))['cameras']==report['cameras']
        for name in archive.namelist():
            if name.endswith('.stl'):assert_stl(archive.read(name))


def test_camera_dimensions_change_cradle(coords):
    data=request_data(coords)
    data['options'].update(cameraMount=1,cameraWidth=28,cameraHeight=24,cameraDepth=32)
    parts,report,_=generate(data)
    c=report['cameras'][0];b=c['envelope_mm']
    assert b[5]-b[2]==pytest.approx(28)
    assert b[4]-b[1]==pytest.approx(24)
    assert b[3]-b[0]==pytest.approx(32)


def test_camera_invalid_hole_location_is_rejected(coords):
    from backend.manufacturing import ManufacturingError
    from backend.camera_mounts import install_camera_mount
    data=request_data(coords)
    data['options'].update(cameraMount=1,cameraDepth=10,cameraHoleX=12)
    with pytest.raises(ManufacturingError,match='cameraHoleX'):
        install_camera_mount(None,None,data,1.2,.3)
