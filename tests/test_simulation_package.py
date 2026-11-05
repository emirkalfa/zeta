import io
import json
import zipfile

import numpy as np
import pytest

from app import app
from backend.manufacturing import welded_mesh_closed
from tests.test_manufacturing import coords, request_data
from tests.test_simulation_export import stl_triangles


@pytest.mark.parametrize('preset,motor_count,tilt_count', [
    ('atlas', 1, 0), ('combat', 1, 0), ('vtol', 3, 2), ('vtol5', 5, 0),
])
def test_simulation_package_separates_moving_parts(coords, preset, motor_count, tilt_count):
    data = request_data(coords, preset=preset, combat=preset in ('combat', 'vtol5'))
    data['options'].update(motorLayout='single', motorDiameter=28, propDiameter=254)
    response = app.test_client().post('/api/manufacturing?mode=simulation', json=data)
    assert response.status_code == 200, response.get_json(silent=True)
    assert response.mimetype == 'application/zip'
    assert 'zeta_simulasyon.zip' in response.headers['Content-Disposition']
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        model = json.loads(archive.read('model.json'))
        assert model['airframe'] == preset
        assert model['frame']['unit'] == 'm'
        assert len(model['propellers']) == motor_count
        assert len(model['wheels']) == 3
        assert len(model['parts']) == 1 + 3 + motor_count + tilt_count
        assert sum(joint['type'] == 'revolute' for joint in model['joints']) == tilt_count
        joints = {joint['child']: joint for joint in model['joints']}
        vertices = {}
        for name, path in model['parts'].items():
            content = archive.read(path)
            triangles = stl_triangles(content)['vertices']
            points = triangles.reshape(-1, 3)
            assert int.from_bytes(content[80:84], 'little') == len(triangles)
            assert np.isfinite(points).all()
            assert np.all(np.linalg.norm(np.cross(
                triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]), axis=1) > 0)
            assert welded_mesh_closed(points, np.arange(len(points)).reshape(-1, 3))
            vertices[name] = points
        assert set(joints) == set(vertices) - {'airframe'}
        for joint in joints.values():
            assert joint['parent'] in vertices
            assert np.linalg.norm(joint['axis']) == pytest.approx(1)
            points = vertices[joint['child']]
            pivot = np.array(joint['pivot_m'])
            assert np.all(points.min(axis=0) - .001 <= pivot)
            assert np.all(pivot <= points.max(axis=0) + .001)
        for wheel in model['wheels']:
            name = wheel['part']
            assert vertices[name][:, 1].min() == pytest.approx(0, abs=1e-6)
            assert joints[name]['pivot_m'][1] == pytest.approx(wheel['radius_m'])
            assert joints[name]['axis'] == [0, 0, -1]
        for propeller in model['propellers']:
            assert propeller['thrust_axis'] in ([1, 0, 0], [0, 1, 0])
            assert propeller['center_m'] == joints[propeller['part']]['pivot_m']
