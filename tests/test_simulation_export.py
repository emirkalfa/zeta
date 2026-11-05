import struct
from types import SimpleNamespace
import numpy as np
import manifold3d as md
import pytest
from backend.manufacturing import assembled_stl
from tests.test_manufacturing import coords

def test_assembled_export_preserves_world_coordinates_and_separate_shells():
    parts=[SimpleNamespace(name='body',solid=md.Manifold.cube([10,20,30])),
           SimpleNamespace(name='wing',solid=md.Manifold.cube([5,6,7]).translate([-50,40,100]))]
    content=assembled_stl(parts)
    count=struct.unpack('<I',content[80:84])[0]
    assert len(content)==84+50*count
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    vertices=np.frombuffer(content,offset=84,dtype=dtype)['vertices'].reshape(-1,3)
    np.testing.assert_allclose(vertices.min(axis=0),[-50,0,0])
    np.testing.assert_allclose(vertices.max(axis=0),[10,46,107])

def test_stl_endpoint_download_headers(monkeypatch):
    from app import app
    from backend.manufacturing_service import manufacturing_service
    expected=assembled_stl([SimpleNamespace(name='body',solid=md.Manifold.cube([10,20,30]))])
    monkeypatch.setattr(manufacturing_service,'result',lambda data,mode:expected)
    response=app.test_client().post('/api/manufacturing?mode=stl',json={})
    assert response.status_code==200
    assert response.mimetype=='model/stl'
    assert 'zeta_simulasyon_m.stl' in response.headers['Content-Disposition']
    assert response.data==expected


def test_simulation_skin_unions_intersections_without_internal_faces():
    from backend.manufacturing import simulation_stl
    body=md.Manifold.cube([10,10,10])
    wing=md.Manifold.cube([10,10,10]).translate([5,0,0])
    content=simulation_stl({'simulation_outer':body+wing})
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    tri=np.frombuffer(content,offset=84,dtype=dtype)['vertices']
    volume=np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])).sum()/6
    assert volume==pytest.approx(1500e-9,rel=1e-6)
    # All triangles lie on the union boundary; no hidden overlap planes.
    for t in tri:
        assert any(np.allclose(t[:,axis],v) for axis,values in enumerate(([-.015,0],[0,.01],[-.01,0])) for v in values)


def stl_triangles(content):
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    return np.frombuffer(content,offset=84,dtype=dtype)


def test_simulation_frame_scale_and_normals_preserve_chirality():
    from backend.manufacturing import simulation_stl
    # Unequal dimensions and an offset distinguish axes and detect unwanted
    # centering; positive signed volume and normals detect reflection.
    shape=md.Manifold.cube([1200,100,300]).translate([-200,40,-80])
    data=simulation_stl({'simulation_outer':shape})
    mesh=stl_triangles(data);tri=mesh['vertices'];vertices=tri.reshape(-1,3)
    np.testing.assert_allclose(vertices.min(axis=0),[-1.,.04,-.22],atol=1e-7)
    np.testing.assert_allclose(vertices.max(axis=0),[.2,.14,.08],atol=1e-7)
    cross=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
    np.testing.assert_allclose(mesh['normal'],cross/np.linalg.norm(cross,axis=1)[:,None],atol=1e-6)
    volume=np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])).sum()/6
    assert volume==pytest.approx(shape.volume()*1e-9,rel=1e-6)
    assert b'units m; nose +X; up +Y' in data[:80]


@pytest.mark.parametrize('preset,combat',[('atlas',False),('vtol',False),('vtol5',True)])
def test_real_aircraft_simulation_matches_design_dimensions(coords,preset,combat):
    from tests.test_manufacturing import request_data
    from backend.manufacturing import generate,simulation_stl,simulation_envelope
    _,_,rings=generate(request_data(coords,preset=preset,combat=combat))
    source=simulation_envelope(rings)
    data=simulation_stl(rings);mesh=stl_triangles(data);tri=mesh['vertices']
    vertices=tri.reshape(-1,3);bounds=np.array(source.bounding_box())
    # Metre-scale extents and positive volume rule out reflections, print
    # rotations and thousandfold scaling errors; wheel contact is at Y=0.
    np.testing.assert_allclose(vertices.min(axis=0),[-bounds[3],0,-bounds[5]]*np.array([.001]*3),atol=.00003)
    np.testing.assert_allclose(vertices.max(axis=0),[-bounds[0],bounds[4]-bounds[1],-bounds[2]]*np.array([.001]*3),atol=.00003)
    volume=np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])).sum()/6
    assert volume==pytest.approx(source.volume()*1e-9,rel=.001)
    from backend.manufacturing import welded_mesh_closed
    assert welded_mesh_closed(vertices,np.arange(len(vertices)).reshape(-1,3))
    assert np.all(np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)>0)


@pytest.mark.parametrize('preset,combat',[('atlas',False),('vtol',False),('vtol5',True)])
def test_simulation_wheels_are_level_stable_and_only_in_simulation(coords,preset,combat):
    from tests.test_manufacturing import request_data
    from backend.manufacturing import generate,simulation_stl,simulation_envelope,cylinder
    from backend.simulation_gear import landing_gear
    data=request_data(coords,preset=preset,combat=combat)
    data['options'].update(motorLayout='single',motorDiameter=28,propDiameter=254)
    parts,manifest,rings=generate(data)
    airframe=rings['simulation_outer']
    gear,report=landing_gear(airframe,rings['outer'],rings['simulation_geometry'],manifest['motors'])
    wheels=report['wheels'];assert len(wheels)==3
    ground=report['ground_y_mm'];cg=report['assumed_cg_mm'][0]
    nose,right,left=wheels
    assert nose['center_mm'][0]<cg<right['center_mm'][0]==left['center_mm'][0]
    assert right['center_mm'][2]==-left['center_mm'][2] and nose['center_mm'][2]==0
    assert ground<airframe.bounding_box()[1]-report['clearance_mm']+.001
    for w in wheels:
        assert w['center_mm'][1]-w['radius_mm']==pytest.approx(ground)
        assert (gear^airframe).volume()>1
        # The attachment has real volume in the body and connects every wheel.
        probe=cylinder(2,4,np.array(w['mount_mm'])-[0,2,0],[0,1,0])
        assert (probe^airframe).volume()>1
    combined=simulation_envelope(rings)
    assert sum(s.volume()>.001 for s in (airframe+gear).decompose())==1
    assert combined.bounding_box()[1]==pytest.approx(ground,abs=.001)
    assert not any(p.name.startswith('simulation_') for p in parts)
    assert not manifest['landing_mounts']['printed_legs']
    stl=stl_triangles(simulation_stl(rings))['vertices']
    assert stl[:,:,1].min()==pytest.approx(0,abs=1e-6)
    # Three contact patches lie on the same exported Z ground plane.
    for wheel in wheels:
        x,_,z=wheel['contact_mm']
        contact=stl.reshape(-1,3)
        near=(abs(contact[:,0]+x*.001)<.0001)&(abs(contact[:,2]+z*.001)<wheel['width_mm']*.0006)
        assert near.any()
        assert contact[near,1].min()==pytest.approx(0,abs=1e-6)

@pytest.mark.parametrize('axis',[[-1,0,0],[1,0,0],[0,1,0]])
def test_motor_propeller_visuals_follow_mount_axis(axis):
    from backend.simulation_propulsion import propulsion
    from backend.manufacturing import cylinder,check
    axis=np.array(axis,dtype=float);face=np.array([100.,20.,30.]);center=face+axis*38
    motor=dict(face_mm=face.tolist(),out_axis=axis.tolist(),prop_center_mm=center.tolist(),motor_length_mm=30,motor_diameter_mm=28,prop_diameter_mm=254)
    solid=propulsion([motor])[0];check(solid,'motor with propeller')
    probe=cylinder(10,20,face+axis*2,axis)
    assert (probe-solid).volume()<.01
    # A point near the blade tip contains material, unlike an empty shaft.
    across=np.cross([0,1,0] if abs(axis[1])<.9 else [0,0,1],axis);across/=np.linalg.norm(across)
    tip=cylinder(.5,1,center+across*110-axis*.5,axis)
    assert (tip^solid).volume()>.5
