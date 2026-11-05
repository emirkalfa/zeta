"""Export separately addressable simulation meshes and their joint frames."""
import io
import json
import zipfile

import manifold3d as md
import numpy as np

from backend.manufacturing import simulation_mesh_stl
from backend.simulation_gear import landing_gear_components
from backend.simulation_propulsion import propulsion_components


def simulation_package(rings, manifest):
    geometry = rings['simulation_geometry']
    motors = rings['simulation_motors']
    skin = rings['simulation_outer']
    struts, tires, gear = landing_gear_components(skin, rings['outer'], geometry, motors)
    ground = gear['ground_y_mm']
    rotation = np.array([-1, 1, -1])
    offset = np.array([0, ground, 0])

    def point(mm):
        return ((np.asarray(mm) - offset) * rotation / 1000).tolist()

    def direction(axis):
        return (np.asarray(axis) * rotation).tolist()

    tilts = {joint['part']: joint for joint in manifest['vtol_joints']}
    mounts = {part.name: part.solid for part in rings['simulation_mounts']}
    fixed_mounts = [solid for name, solid in mounts.items() if name not in tilts]
    fixed = [skin, *fixed_mounts, *(strut - tire for strut, tire in zip(struts, tires))]
    meshes = {}
    joints = []
    propellers = []

    def joint(name, parent, child, pivot, axis, limits=None):
        record = dict(name=name, type='revolute' if limits else 'continuous',
                      parent=parent, child=child, pivot_m=point(pivot), axis=direction(axis))
        if limits:
            record['limits_deg'] = limits
        joints.append(record)

    for motor in motors:
        name = motor['name']
        casing, rotor, center, axis = propulsion_components(motor)
        parent = 'airframe'
        tilt = tilts.get(motor['parent'])
        if tilt:
            parent = tilt['part']
            meshes[parent] = mounts[parent] + casing
            joint(name + '_tilt', 'airframe', parent, tilt['pivot_mm'], tilt['axis'], tilt['range_deg'])
        else:
            fixed.append(casing)
        rotor_name = name + '_propeller'
        meshes[rotor_name] = rotor - casing
        joint(name + '_spin', parent, rotor_name, center, axis)
        thrust_axis = axis if 'out_axis' in motor else [-1, 0, 0]
        propellers.append(dict(part=rotor_name, center_m=point(center), thrust_axis=direction(thrust_axis),
                               diameter_m=motor['prop_diameter_mm'] / 1000))

    wheels = []
    for info, tire in zip(gear['wheels'], tires):
        name = 'wheel_' + info['name']
        meshes[name] = tire
        joint(name + '_spin', 'airframe', name, info['center_mm'], [0, 0, 1])
        wheels.append(dict(part=name, radius_m=info['radius_mm'] / 1000,
                           width_m=info['width_mm'] / 1000, contact_m=point(info['contact_mm'])))

    meshes['airframe'] = md.Manifold.batch_boolean(fixed, md.OpType.Add)
    paths = {name: f'meshes/{name}.stl' for name in sorted(meshes)}
    model = dict(version=1, airframe=geometry.get('fuse_preset', 'standard'),
                 frame=dict(unit='m', forward='+X', up='+Y', ground_y=0, handedness='right'),
                 total_mass_kg=geometry['weight'], parts=paths, joints=joints,
                 wheels=wheels, propellers=propellers)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in paths.items():
            solid = meshes[name].as_original().set_tolerance(.02).simplify(.02)
            archive.writestr(path, simulation_mesh_stl(solid, ground, b'ZETA part; units m; nose +X; up +Y'))
        archive.writestr('model.json', json.dumps(model, indent=2))
        archive.writestr('ICE_AKTARMA.txt', (
            'ZIP dosyasını açın ve meshes klasöründeki STL parçalarını aynı sahneye yükleyin.\n'
            'Birim metre, burun +X, yukarı +Y ve zemin Y=0. Ölçek 1. Parçaların ortak orijini var.\n'
            'İçe aktarmada otomatik ortalamayı ve parçaları birleştirmeyi kapatın.\n'
            'model.json dosyası montaj konumundaki eklem merkezlerini ve birim eksenleri verir.\n'
            'Eksen dönüşümü yaparsanız eklem merkezlerini ve eksenleri de dönüştürün.\n'
            'Simülatörde teker çarpışmasını, sürtünmeyi ve pervane kumandasını tanımlayın.\n'
            'Uçuş için kütle dağılımı, atalet, aerodinamik, motor itkisi ve kontrolcü ayarları gerekir.\n'
        ))
    return output.getvalue()
