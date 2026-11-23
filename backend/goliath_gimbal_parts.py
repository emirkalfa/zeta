import numpy as np

from backend.manufacturing import (
    ManufacturingError, Part, cylinder, rounded_hatch_prism,
)


def rounded_tip_warp(nose, cover):
    front = nose.bounding_box()[0]
    blend_end = cover.bounding_box()[0] - 1.
    length = blend_end - front
    shortening = min(14., .38*length)

    def shape(vertices):
        fitted = vertices.copy()
        progress = np.clip((fitted[:,0]-front)/length,0,1)
        fitted[:,0] += shortening*(1-progress)**3*(1+1.4*progress)
        return fitted

    return shape


def install_gimbal_accessories(nose, cover, outer, module, wall, clearance):
    gimbal = module['gimbal']
    mount_x, mount_y, mount_z = gimbal['mounts'][1]['point_mm']
    adapter_name = 'body_gimbal_camera_adapter'
    adapter_top = mount_y + max(2.6, wall)
    adapter = rounded_hatch_prism(mount_x-10, mount_x+10, mount_z-2, 3.2,
                                  mount_y, adapter_top)
    adapter += rounded_hatch_prism(mount_x-3.6,mount_x+3.6,mount_z+3.6,1.7,
                                   mount_y,adapter_top)
    hole_radius = 1.05 + clearance/2
    for sign in (-1,1):
        adapter -= cylinder(hole_radius, adapter_top-mount_y+2,
                            [mount_x,mount_y-1,sign*mount_z], [0,1,0], 32)
        slot_x = mount_x + sign*5
        adapter -= rounded_hatch_prism(slot_x-1.25,slot_x+1.25,min(8.,.4*mount_z),
                                       .55,mount_y-1,adapter_top+1)
    adapter -= cylinder(2.5, adapter_top-mount_y+2,[mount_x,mount_y-1,0],[0,1,0],32)

    if (nose^adapter).volume()>.03:
        adapter -= nose+nose.translate([0,-clearance,0])

    tray_name = 'body_gimbal_vtx_tray'
    tray_x = cover.bounding_box()[3] - 18
    tray_z = min(10., .50*mount_z)
    cover_hits = [cover.ray_cast([tray_x,2000,z],[tray_x,-2000,z])
                  for z in (-tray_z,tray_z)]
    if any(len(hits)<2 for hits in cover_hits):
        raise ManufacturingError('VTX tepsisi için kapakta yeterli oturma yüzeyi yok.')
    inner_roof = min(2000-4000*hits[1].distance for hits in cover_hits)
    tray_top = inner_roof-max(6.,wall+3.)
    tray_bottom = tray_top-max(2.4,wall)
    tray = rounded_hatch_prism(tray_x-11,tray_x+11,tray_z+3.8,3.,tray_bottom,tray_top)
    tray_holes = []
    for sign in (-1,1):
        z = sign*tray_z
        boss = cylinder(3.3, inner_roof-tray_top+wall+5,[tray_x,tray_top,z],[0,1,0],32)^outer
        if (boss^cover).volume() < 1:
            raise ManufacturingError('VTX tepsisi ayağı üst kapağa bağlanamıyor.')
        pilot = cylinder(.85,4.7,[tray_x,tray_top-.2,z],[0,1,0],32)
        cover = (cover+boss)-pilot
        tray -= cylinder(hole_radius,tray_top-tray_bottom+2,[tray_x,tray_bottom-1,z],[0,1,0],32)
        slot_x = tray_x + sign*5
        tray -= rounded_hatch_prism(slot_x-1.5,slot_x+1.5,min(6.,tray_z*.62),.6,
                                    tray_bottom-1,tray_top+1)
        tray_holes.append({'point_mm':[tray_x,tray_bottom,z],'axis':[0,-1,0]})

    vent_x = tray_x-14
    pitch = min(3.6, .36*tray_z)
    slot_width = min(1.8, .54*pitch)
    vent_bottom,vent_top = cover.bounding_box()[1]-1,cover.bounding_box()[4]+1
    vents = []
    for index in range(-3,4):
        z = index*pitch
        half_length = 8.5*(1-.045*index**2)
        opening = rounded_hatch_prism(vent_x-half_length,vent_x+half_length,
                                      slot_width/2,slot_width*.24,vent_bottom,vent_top)
        cover -= opening.translate([0,0,z])
        vents.append({'center_xz_mm':[vent_x,z],'length_mm':2*half_length,'width_mm':slot_width})
    module['vent_count'] = len(vents)
    module['vent_cover']['slots'] = vents

    solids = (nose,cover,adapter,tray)
    for index,part in enumerate(solids):
        if any((part^other).volume()>.03 for other in solids[index+1:]):
            raise ManufacturingError('Gimbal montaj plakası veya VTX tepsisi burun içinde çakışıyor.')
    gimbal.update(adapter_part=adapter_name,tray_part=tray_name,tray_holes=tray_holes)
    return cover,[Part(adapter_name,adapter,family='body'),Part(tray_name,tray,family='body')]
