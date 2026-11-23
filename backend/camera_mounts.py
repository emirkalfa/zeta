"""Removable nose camera mount with a centered forward lens aperture."""
import numpy as np
from backend.manufacturing import box, cylinder, number, ManufacturingError


def install_camera_mount(body, outer, data, wall, gap):
    opts = data.get('options', {})
    mode = opts.get('cameraMount', 0)
    if mode == 2:
        mode = 0
    if mode == 3 and data['geometry'].get('fuse_preset') not in ('atlas','vtol'):
        raise ManufacturingError('Gimbal burun seçeneği Goliath ve Tria VTOL için kullanılabilir.')
    if mode not in (0, 1, 3):
        raise ManufacturingError('Kamera yuvası seçimi geçersiz.')
    if mode != 1:
        return body, [], []

    width = number(opts, 'cameraWidth', 19, 10, 60)
    height = number(opts, 'cameraHeight', 19, 10, 60)
    depth = number(opts, 'cameraDepth', 25, 10, 80)
    screw = number(opts, 'cameraScrew', 2, 1.5, 4)
    hole_x = number(opts, 'cameraHoleX', 12, 3, depth - 3)
    hole_y = number(opts, 'cameraHoleY', 9.5, 3, height - 3)
    lens = number(opts, 'cameraLensDiameter', 12, 4, 54)
    if lens + 2 * gap > min(width, height):
        raise ManufacturingError('Lens açıklığı kamera kasasından büyük. Kamera ve lens ölçülerini kontrol edin.')

    rings = np.asarray(data['fuselage'], dtype=float)
    nose, end = rings[0, 0, 0], rings[-1, 0, 0]
    half = width / 2 + gap
    thickness = max(2.5, 2 * wall)
    wing_x = min(panel['root'][0] * 1000 for panel in data['panels'] if panel['kind'] == 'wing')
    limit = min(nose + .13 * (end - nose) - 4, wing_x - 5)
    center_y = float(np.mean(rings[0, :, 1]))
    bottom, top = center_y - height / 2, center_y + height / 2
    required_volume = depth * (height + 2 * gap) * (2 * half + 2 * thickness)
    for front in np.arange(nose + 8, limit - depth, 3):
        back = front + depth
        space = box([front, bottom - gap, -half - thickness],
                    [back, top + gap, half + thickness])
        if (outer ^ space).volume() >= required_volume * .999:
            break
    else:
        raise ManufacturingError('Kamera kasası buruna sığmıyor. Kamera ölçülerini veya gövde genişliğini kontrol edin.')

    min_y = outer.bounding_box()[1] - 1
    z_extent = max(abs(outer.bounding_box()[2]), abs(outer.bounding_box()[5])) + 1
    pocket = box([front - gap, min_y, -half], [back + gap, top + gap, half])
    envelope = box([front, bottom, -width / 2], [back, top, width / 2])
    hole_y_world = top - hole_y
    hole_x_world = front + hole_x
    cradle = outer ^ box([front, bottom - thickness, -z_extent],
                          [back, top + thickness, z_extent])
    cradle -= pocket
    radius = (screw + gap) / 2
    screw_access = cylinder(radius, 2 * z_extent, [hole_x_world, hole_y_world, -z_extent], [0, 0, 1])
    lens_bore = cylinder((lens + gap) / 2, front - nose + 1.5,
                         [nose - 1, center_y, 0], [1, 0, 0], 48)
    if (cradle ^ body).volume() < 1:
        raise ManufacturingError('Kamera yuvası gövdeye bağlanamıyor.')
    body = (body + cradle) - pocket - screw_access - lens_bore
    if (body ^ envelope).volume() > .01:
        raise ManufacturingError('Kamera hacmi gövdeyle çakışıyor.')

    report = {
        'parent': 'body',
        'width_mm': width, 'height_mm': height, 'depth_mm': depth,
        'hole_diameter_mm': screw + gap,
        'holes': [
            {'point_mm': [hole_x_world, hole_y_world, side * (half + thickness / 2)],
             'axis': [0, 0, side]}
            for side in (-1, 1)
        ],
        'lens': {'point_mm': [float(nose), center_y, 0],
                 'diameter_mm': lens + gap, 'bore_end_x_mm': float(front)},
        'envelope_mm': list(envelope.bounding_box()),
        'placement': 'centered_nose', 'mount_type': 'side_screws',
    }
    return body, [cradle - screw_access - lens_bore], [report]
