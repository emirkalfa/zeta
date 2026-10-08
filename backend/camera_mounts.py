"""Open, side-screw camera cradle below the forward fuselage, dimensions in mm."""
import numpy as np
from backend.manufacturing import box, cylinder, number, ManufacturingError


def install_camera_mount(body, outer, data, wall, gap):
    opts = data.get('options', {})
    mode = opts.get('cameraMount', 0)
    if mode not in (0, 1):
        raise ManufacturingError('Kamera yuvası seçimi geçersiz.')
    if not mode:
        return body, [], []
    width = number(opts, 'cameraWidth', 19, 10, 60)
    height = number(opts, 'cameraHeight', 19, 10, 60)
    depth = number(opts, 'cameraDepth', 25, 10, 80)
    screw = number(opts, 'cameraScrew', 2, 1.5, 4)
    hole_x = number(opts, 'cameraHoleX', 12, 3, depth-3)
    hole_y = number(opts, 'cameraHoleY', 9.5, 3, height-3)
    rings = np.asarray(data['fuselage'], dtype=float)
    nose, end = rings[0, 0, 0], rings[-1, 0, 0]
    front = nose + max(12., (end-nose)*.08)
    back = front + depth + 2*gap
    wing_x = min(p['root'][0]*1000 for p in data['panels'] if p['kind']=='wing')
    if back+5 >= wing_x:
        raise ManufacturingError('Kamera derinliği burun ile kanat arasına sığmıyor. Kamera derinliğini azaltın.')
    half = (width+2*gap)/2
    thickness = max(3., wall*2)
    # The bridge meets the actual shell; the camera volume stays below its lowest surface.
    region = outer ^ box([front,-10000,-half-thickness],[back,10000,half+thickness])
    if region.is_empty():
        raise ManufacturingError('Kamera yuvası için burun yüzeyi bulunamadı.')
    bb = region.bounding_box()
    roof = float(bb[1])-thickness
    bridge = box([front,roof,-half-thickness],[back,float(bb[1])+2*wall+thickness,half+thickness])-outer
    # Overlap the shell by wall thickness without filling the fuselage cavity.
    contact = outer ^ box([front,roof,-half-thickness],[back,float(bb[1])+2*wall+thickness,half+thickness])
    bridge = bridge + contact
    bottom = roof-height-2*gap
    cradle = bridge
    holes=[]
    for side in (-1,1):
        z0,z1 = (-half-thickness,-half) if side<0 else (half,half+thickness)
        cheek=box([front,bottom,z0],[back,roof+thickness,z1])
        point=[front+gap+hole_x,roof-gap-hole_y,(z0+z1)/2]
        drill=cylinder((screw+gap)/2,thickness+2,[point[0],point[1],z0-1],[0,0,1])
        cradle=cradle+(cheek-drill)
        holes.append({'point_mm':point,'axis':[0,0,side]})
    if (cradle ^ body).volume()<1:
        raise ManufacturingError('Kamera yuvası gövdeye bağlanamıyor; burun ölçülerini kontrol edin.')
    body=body+cradle
    envelope=box([front+gap,bottom+gap,-width/2],[front+gap+depth,roof-gap,width/2])
    if (body ^ envelope).volume()>.01:
        raise ManufacturingError('Kamera hacmi gövdeyle çakışıyor.')
    report={'parent':'body','width_mm':width,'height_mm':height,'depth_mm':depth,
            'hole_diameter_mm':screw+gap,'holes':holes,'envelope_mm':list(envelope.bounding_box()),
            'placement':'nose_underside','mount_type':'side_screws'}
    return body, [cradle], [report]
