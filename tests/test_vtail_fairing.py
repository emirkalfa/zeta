import numpy as np
import manifold3d as md
import pytest
from backend.manufacturing import generate,preview,cylinder
from backend.twin_boom import prepare_booms,vtail_end_fairing
from tests.test_manufacturing import coords,request_data

@pytest.mark.parametrize('tail',['conventional','ttail'])
def test_other_tail_boom_tubes_are_unchanged(coords,tail):
    g=request_data(coords,tail=tail,preset='combat',combat=True)['geometry']
    assemblies={};frames={};cuts={}
    report=prepare_booms(g,assemblies,frames,cuts,1.2,.3,3,5.5,2.4)
    for boom in report:
        assert boom['tail_fairing'] is None
        x,y,z=boom['center_mm'];radius=boom['outer_diameter_mm']/2;length=boom['end_x_mm']-x
        original=cylinder(radius,length,[x,y,z],[1,0,0])-cylinder(radius-1.2,length+2,[x-1,y,z],[1,0,0])
        assert (assemblies[boom['part']]-original).volume()<1e-6
        assert (original-assemblies[boom['part']]).volume()<1e-6

def test_fairing_closed_tip_exists_in_exact_print_preview(coords):
    data=request_data(coords,tail='vtail',preset='combat',combat=True)
    parts,report,rings=generate(data);shown=preview(parts,report,rings)['parts']
    for boom in report['booms']:
        f=boom['tail_fairing'];x,y,z=boom['center_mm']
        assert f['closed_aft_end']
        assert f['end_x_mm']>boom['end_x_mm']+8
        probe=cylinder(.2,.4,[f['end_x_mm']-.6,y,z],[1,0,0])
        solids=[]
        for p in shown:
            if p['name'].startswith(boom['part']):
                mesh=md.Mesh(np.array(p['vertices'],dtype=np.float32).reshape(-1,3),np.array(p['faces'],dtype=np.uint32).reshape(-1,3))
                solids.append(md.Manifold(mesh))
        assert sum((s^probe).volume() for s in solids)==pytest.approx(probe.volume(),rel=.001)

@pytest.mark.parametrize('wall',[1.2,2.4,3.5])
def test_fairing_keeps_hollow_front_and_solid_aft_cap(wall):
    skin,info=vtail_end_fairing({'tail_x_pos':1.,'vtail_chord':.24},1120,0,0,9,wall)
    assert skin.status()==md.Error.NoError
    cavity=cylinder(.2,2,[1121,0,0],[1,0,0])
    assert (skin^cavity).volume()<1e-6
    cap=cylinder(.2,.4,[info['end_x_mm']-.6,0,0],[1,0,0])
    assert (skin^cap).volume()==pytest.approx(cap.volume(),rel=.001)
    # Material remains continuous across the former flat-cut tube endpoint.
    bridge=cylinder(.1,2,[1119.5,8.6,0],[1,0,0])
    assert (skin^bridge).volume()==pytest.approx(bridge.volume(),rel=.001)
