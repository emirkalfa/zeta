"""Real disconnected moving parts, pin clearance and exported STL geometry."""
import io,json,zipfile
import numpy as np
import pytest
from backend.manufacturing import generate,package,cylinder
from backend.control_joints import rotate_about
from tests.test_manufacturing import coords,request_data,assert_stl

@pytest.mark.parametrize('tail,combat',[('conventional',False),('ttail',False),('vtail',False),('conventional',True),('ttail',True),('vtail',True)])
def test_moving_surfaces_have_pin_bores_and_clear_the_entire_assembly(coords,tail,combat):
    data=request_data(coords,tail,preset='combat' if combat else 'atlas',combat=combat)
    parts,report,rings=generate(data);named={p.name:p.solid for p in parts}
    assert len(report['controls'])>=6
    for c in report['controls']:
        moving=named[c['part']];fixed=named[c['parent']]
        p=np.array(c['hinge_point_mm']);axis=np.array(c['hinge_axis'])
        for angle in [-25,-12.5,0,12.5,25]:
            pose=rotate_about(moving,p,axis,angle)
            assert (fixed^pose).volume()<.03,c['part']
            for part in parts:
                if part.name in [c['part'],c['parent']]:continue
                assert (part.solid^pose).volume()<.1,(c['part'],part.name,angle)
        for knuckle in c['knuckles']:
            a=np.array(knuckle['start_mm']);b=np.array(knuckle['end_mm'])
            probe=cylinder(c['pin_diameter_mm']*.45,np.linalg.norm(b-a)-.4,a+axis*.2,axis)
            owner=moving if knuckle['moving'] else fixed
            assert (owner^probe).volume()<.005,c['part']+' blocked hinge'
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
    exported=json.loads(archive.read('manifest.json'))
    for c in report['controls']:
        assert any(p['file'].startswith(c['part']) for p in exported['parts'])
    for p in exported['parts']:
        assert np.all(np.array(p['size_mm'])<=np.array(exported['bed_mm'])+.001)
        assert_stl(archive.read(p['file']))
    assert 'bütünleşik kabuk' not in archive.read('MONTAJ.txt').decode()
    assert_stl(archive.read('hinge_fit_fixed.stl'));assert_stl(archive.read('hinge_fit_moving.stl'))

@pytest.mark.parametrize('code',['0012','0015','2412','2415','4412','4415','6412'])
def test_spar_bores_follow_camber_and_keep_a_physical_round_section(coords,code):
    from app import app
    from backend.geometry import calculate_geometry
    from backend.manufacturing import panel_frame
    from backend.wing_placement import place_wing_assembly
    c=app.test_client();foils=c.get('/api/airfoils').json
    wing=c.get('/api/airfoil/'+str(next(p['id'] for p in foils if p['code']==code))).json['coordinates']
    data=request_data((wing,coords[1]),geometry=calculate_geometry(1.5,1.2,code,wing_shape='rectangular'))
    placed=place_wing_assembly(data)
    parts,report,_=generate(data);named={p.name:p.solid for p in parts}
    assert len(report['spar_channels'])==4
    for channel in report['spar_channels']:
        p=next(p for p in placed['panels'] if p['name']==channel['part']);mat,_=panel_frame(p)
        root=next(i['root_trim_mm'] for i in report['interfaces'] if i['part']==p['name'])
        origin=mat[:,:3]@np.array([p['chord']*1000*channel['chord_position'],channel['center_offset_mm'],root+1])+mat[:,3]
        probe=cylinder(channel['hole_diameter_mm']*.45,channel['reach_from_center_mm']-root-2,origin,mat[:,2])
        assert (named[p['name']]^probe).volume()<.02
