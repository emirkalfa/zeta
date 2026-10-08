import io, json, zipfile
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.manufacturing import generate, package, cylinder, panel_frame, local_transform, profile
from tests.test_manufacturing import coords, request_data, assert_stl


@pytest.mark.parametrize('preset',['atlas','seyir','akin','combat'])
@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
@pytest.mark.parametrize('position',['low','mid','high'])
def test_profile_seat_single_pin_and_removal(coords,preset,shape,position):
    g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position,
                         airframe='combat' if preset=='combat' else 'standard')
    data=request_data(coords,preset=preset,geometry=g)
    data['options'].update(wingPin=4,wingSeatDepth=10)
    parts,report,rings=generate(data)
    named={p.name:p.solid for p in parts}
    from backend.wing_placement import place_wing_assembly
    specs=place_wing_assembly(data)['panels']
    for j in [j for j in report['interfaces'] if j['part'].startswith('wing_')]:
        assert j['pin_count']==1 and j['fastener_type']=='retaining_pin'
        assert j['hole_diameter_mm']==pytest.approx(4.3)
        owner=named[j['part']];body=named['body']
        assert (owner ^ body).volume()<.1
        point=np.array(j['bolt_point_mm']);axis=np.array(j['bolt_axis'])
        probe=cylinder(1.9,500,point-axis*250,axis)
        assert (owner ^ probe).volume()<.01
        assert (body ^ probe).volume()<.01
        spec=next(p for p in specs if p['name']==j['part'])
        mat,length=panel_frame(spec)
        # The seated root withdraws along its span without jamming in a tapered socket.
        for distance in (2,6,10,20):
            assert (owner.translate((mat[:,2]*distance).tolist()) ^ body).volume()<.1
        root=j['root_trim_mm'];scale=1+(spec['tipChord']/spec['chord']-1)*root/length
        section=profile(spec['coords'],spec['chord']*1000).scale([scale,scale])
        # A thin profile ring must remain at the outer end of the new seat.
        ring=(section.offset(.8)-section.offset(.4)).extrude(.4).translate([0,0,root+9])
        ring=local_transform(ring,mat)
        assert (body ^ ring).volume() > ring.volume()*.95
    if (preset,shape,position)==('combat','tapered','high'):
        archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
        manifest=json.loads(archive.read('manifest.json'))
        assert all(j['pin_count']==1 for j in manifest['interfaces'] if j['part'].startswith('wing_'))
        for name in archive.namelist():
            if name.endswith('.stl'):assert_stl(archive.read(name))
