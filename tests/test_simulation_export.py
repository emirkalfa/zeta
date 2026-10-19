import struct
from types import SimpleNamespace
import numpy as np
import manifold3d as md
from backend.manufacturing import assembled_stl

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
    assert 'zeta_simulasyon_mm.stl' in response.headers['Content-Disposition']
    assert response.data==expected


def test_simulation_skin_unions_intersections_without_internal_faces():
    from backend.manufacturing import simulation_stl
    body=md.Manifold.cube([10,10,10])
    wing=md.Manifold.cube([10,10,10]).translate([5,0,0])
    content=simulation_stl({'simulation_outer':body+wing})
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    tri=np.frombuffer(content,offset=84,dtype=dtype)['vertices']
    volume=np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])).sum()/6
    assert abs(volume-1500)<.01
    # All triangles lie on the union boundary; no hidden overlap planes.
    for t in tri:
        assert any(np.allclose(t[:,axis],v) for axis,values in enumerate(([0,15],[0,10],[0,10])) for v in values)
