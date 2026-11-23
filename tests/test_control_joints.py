"""Real disconnected moving parts, pin clearance and exported STL geometry."""
import io,json,zipfile
import numpy as np
import pytest
from backend.manufacturing import Part,box,generate,package,cylinder,measure_printed_controls
from backend.control_joints import rotate_about
from tests.test_manufacturing import coords,request_data,assert_stl


def test_printed_area_unions_overlapping_splits_in_the_tail_plane():
    angle=np.radians(35)
    span=np.array([0.,np.sin(angle),np.cos(angle)])
    chord=np.array([1.,0.,0.])
    rotation=np.column_stack([chord,np.cross(span,chord),span])
    frame=np.column_stack([rotation,np.zeros(3)])
    solid=box([0,0,0],[20,2,10])
    source=Part('tail_v_right_ruddervator',solid,frame=frame,family='tail')
    printed=[Part(source.name+f'_{i+1:02d}of02',solid,
                  print_to_world=np.column_stack([rotation,span*shift]))
             for i,shift in enumerate((0,8))]
    controls=[{'part':source.name}]
    measure_printed_controls([source],printed,controls)
    assert controls[0]['printed_planform_area_m2']==pytest.approx(360/1e6)

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
            length=np.linalg.norm(b-a); direction=(b-a)/length
            probe=cylinder(c['pin_diameter_mm']*.45,length-.4,a+direction*.2,direction)
            owner=moving if knuckle['moving'] else named[knuckle.get('parent',c['parent'])]
            assert (owner^probe).volume()<.005,c['part']+' blocked hinge'
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
    exported=json.loads(archive.read('manifest.json'))
    if tail == 'ttail':
        elevators=[c for c in report['controls'] if c['kind']=='elevator']
        assert len(elevators)==1 and len(elevators[0]['parents'])==2
        assert [name for name in archive.namelist() if name.startswith('tail_elevator_')]==['tail_elevator_one_piece.stl']
    for c in report['controls']:
        assert any(p['file'].startswith(c['part']) for p in exported['parts'])
    for p in exported['parts']:
        assert np.all(np.array(p['size_mm'])<=np.array(exported['bed_mm'])+.001)
        assert_stl(archive.read(p['file']))
    assert 'bÃ¼tÃ¼nleÅŸik kabuk' not in archive.read('MONTAJ.txt').decode()
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
        from tests.test_manufacturing import channel_probe
        probe=channel_probe(channel,root+1,channel['reach_from_center_mm']-1,inset=channel['hole_diameter_mm']*.05)
        assert (named[p['name']]^probe).volume()<.02
