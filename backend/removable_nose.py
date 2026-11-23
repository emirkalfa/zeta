"""Removable ventilated nose, with an internal register and two M2 fasteners."""
import numpy as np
import manifold3d as md
from backend.manufacturing import (
    ManufacturingError, box, cylinder, mesh_solid, rounded_hatch_prism,
)


def install_removable_nose(body, outer, rings, wall, clearance, cameras=(), *, wide_cover=False, cavity_rings=None, seam_fraction=.112, joint_slope=.16, clip_cover=False, vent=True, nose_cuts=None, seam_x=None, gimbal=False):
    xs = rings[:, 0, 0]
    front, rear = xs[0], xs[-1]
    length = rear - front
    seam = front + seam_fraction * length if seam_x is None else seam_x
    register_depth = min(10., .025 * length)
    if register_depth < 5:
        raise ManufacturingError('Vidalı burun bağlantısı için gövde boyu yetersiz.')

    def ring_at(x):
        j = int(np.clip(np.searchsorted(xs, x), 1, len(xs) - 1))
        a, b = rings[j - 1, :, 1:], rings[j, :, 1:]
        return a + (b - a) * ((x - xs[j - 1]) / (xs[j] - xs[j - 1]))

    def profile(x):
        yz = ring_at(x)
        if np.sum(yz[:, 0] * np.roll(yz[:, 1], -1) - yz[:, 1] * np.roll(yz[:, 0], -1)) < 0:
            yz = yz[::-1]
        return md.CrossSection([yz])

    def extrude(section, xlo, xhi):
        return section.extrude(xhi - xlo).transform(
            [[0, 0, 1, xlo], [1, 0, 0, 0], [0, 1, 0, 0]]
        )

    start = seam - register_depth
    section = ring_at(start)
    center_y = float((section[:,0].min()+section[:,0].max())/2)
    slope = joint_slope
    to_joint = [[1,-slope,0,slope*center_y],[0,1,0,0],[0,0,1,0]]
    from_joint = [[1,slope,0,-slope*center_y],[0,1,0,0],[0,0,1,0]]
    local_body = body.transform(to_joint)
    nose = local_body ^ box([-10000,-10000,-10000], [seam-clearance/2,10000,10000])
    rear_body = local_body ^ box([seam+clearance/2,-10000,-10000], [10000,10000,10000])
    reach = slope * np.max(abs(section[:,0]-center_y))
    fitting = profile(start-reach).offset(-wall-clearance-.6, circular_segments=24)
    aperture = fitting.offset(-max(3.5, wall+1), circular_segments=24)
    if aperture.area() < 40:
        raise ManufacturingError('Vidalı burun için iç geçme alanı yetersiz.')
    register = extrude(fitting - aperture, start, seam + 4)
    receiver = outer.transform(to_joint) ^ box([seam+clearance/2,-10000,-10000], [seam+5,10000,10000])
    receiver -= extrude(aperture, seam, seam+6)
    rear_body = (rear_body + register + receiver).transform(from_joint)
    socket = fitting.offset(clearance, circular_segments=24) - aperture.offset(-clearance, circular_segments=24)
    socket_cut = extrude(socket, start-.1, seam+1).transform(from_joint)
    nose = nose.transform(from_joint) - socket_cut

    half_width = float(np.max(abs(ring_at(start-reach)[:,1])))
    screw_x = seam - register_depth / 2
    radius = (2 + clearance) / 2
    screw_section = ring_at(screw_x)
    extent = max(half_width, float(np.max(np.abs(screw_section[:,1])))) + 10
    drill = cylinder(radius, 2 * extent, [screw_x,center_y,-extent], [0,0,1])
    nose -= drill
    rear_body -= drill
    def sides_at_height(yz,y):
        a=yz
        b=np.roll(yz,-1,axis=0)
        crossing=((a[:,0]<=y)&(y<b[:,0]))|((b[:,0]<=y)&(y<a[:,0]))
        points=a[crossing]+((y-a[crossing,0])/(b[crossing,0]-a[crossing,0]))[:,None]*(b[crossing]-a[crossing])
        return float(points[:,1].min()),float(points[:,1].max())

    skin_sides=sides_at_height(screw_section,center_y)
    register_sides=sides_at_height(np.asarray(fitting.to_polygons()[0]),center_y)
    head_depth=min(1.1, max(.65,wall*.55))
    nose_holes=[]
    head_pockets=[]
    for side,skin,register_edge in zip((-1,1),skin_sides,register_sides):
        pocket = cylinder(2.45, extent-abs(skin)+head_depth, [screw_x,center_y,side*extent],
                          [0,0,-side], sides=32)
        nose -= pocket
        head_pockets.append(pocket)
        nut_center = register_edge - side*1.6
        nut = cylinder((4+clearance)/np.sqrt(3), 3, [screw_x,center_y,nut_center],
                       [0,0,-side], sides=6)
        rear_body -= nut
        nose_holes.append({'point_mm':[float(screw_x),center_y,skin], 'axis':[0,0,side],
                           'nut_point_mm':[float(screw_x),center_y,nut_center]})

    if not vent:
        if nose_cuts is not None:
            nose_cuts.extend([socket_cut,drill,*head_pockets])
        return rear_body,nose,None,{'part':'body_nose','seam_x_mm':float(seam),
            'register_depth_mm':float(register_depth),'vent_count':0,
            'hole_diameter_mm':2+clearance,'fastening':'m2_nose_register','holes':nose_holes}

    vent_x = front + .057 * length
    vent_ring = ring_at(vent_x)
    width = float(np.ptp(vent_ring[:,1]))
    vent_floor = float((vent_ring[:,0].min()+vent_ring[:,0].max())/2)
    slot_half = min(.8, max(.42, width * .011))
    vent_top = float(rings[:,:,1].max()) + 2
    if not gimbal:
        for index in range(-4,5):
            span = min(38., .039 * length) * np.sqrt(1 - (index / 5.2)**2)
            slot = rounded_hatch_prism(vent_x-span/2, vent_x+span/2, slot_half,
                                      slot_half*.90, vent_floor, vent_top)
            nose -= slot.translate([0,0,index*width*.043])

    if cameras:
        lens = cameras[0]['lens']
        x, y, z = lens['point_mm']
        throat = lens['diameter_mm'] / 2
        depth = min(16., .022 * length, (lens['bore_end_x_mm']-x) * .8)
        recess = md.Manifold.cylinder(depth+1, throat+4, throat, circular_segments=64)
        recess = recess.rotate([0,90,0]).translate([x-1,y,z])
        nose -= recess

    panel_front = front + (.037 if gimbal else .025) * length
    panel_rear = front + .092 * length
    panel_half_width = width * (.40 if gimbal else .70 if wide_cover else .62)
    panel_radius = min(8., .14 * (panel_rear - panel_front))
    lower_edge = vent_floor + (.32 if gimbal else .02 if wide_cover else .06) * float(np.ptp(vent_ring[:,0]))
    opening = rounded_hatch_prism(panel_front-clearance/2, panel_rear+clearance/2,
                                  panel_half_width+clearance/2, panel_radius,
                                  lower_edge-clearance/2, vent_top)
    cover_shape = rounded_hatch_prism(panel_front+clearance/2, panel_rear-clearance/2,
                                      panel_half_width-clearance/2, panel_radius,
                                      lower_edge+clearance/2, vent_top)
    cover = nose ^ cover_shape
    nose -= opening
    if cameras and cavity_rings is not None:
        cavity = mesh_solid(cavity_rings, cavity_rings[0][:,[1,2]])
        cover -= cavity.scale([1,.99,.99])
    cover_holes = []
    cover_clips = []
    if clip_cover:
        from backend.hatch_latches import latch_cover
        roof = lambda x: float(ring_at(x)[:,0].max())
        nose,cover,_,cover_clips=latch_cover(nose,cover,outer,(panel_front,panel_rear),roof,wall,clearance,block=socket_cut)
        from backend.manufacturing import connected_solids
        components=sorted(connected_solids(nose),key=lambda piece:piece.volume(),reverse=True)
        retained=components[:1]
        for piece in components[1:]:
            x0,y0,z0,x1,y1,z1=piece.bounding_box()
            at_latch=any(edge-1<=x0<=x1<=edge+1 for edge in (panel_front,panel_rear))
            thin=min(x1-x0,y1-y0,z1-z0)<.4
            if not (at_latch and thin and max(abs(z0),abs(z1))<=4+clearance and piece.volume()<.3):
                retained.append(piece)
        if len(retained)<len(components):
            nose=md.Manifold.compose(retained)
    else:
        for side, edge in ((-1, panel_front), (1, panel_rear)):
            x = edge - side * max(4.5, .006 * length)
            y = float(ring_at(x)[:,0].max())
            inner_x = x - side * 3.5
            first_roof = min(float(ring_at(sample)[:,0].max()) for sample in np.linspace(edge, inner_x, 9))
            y_pad = first_roof - wall - clearance - .8
            xmin, xmax = sorted((edge + side * 5, x - side * 3.5))
            anchor_roof = float(ring_at(edge + side * 3)[:,0].max())
            pad_bottom = min(y_pad-6, anchor_roof-wall-2)
            pad = box([xmin,pad_bottom,-3.6], [xmax,y_pad,3.6])
            xmin, xmax = sorted((edge + side * (clearance + .3), edge + side * 5))
            anchor = outer ^ box([xmin,min(lower_edge-3,pad_bottom),-3.6],[xmax,vent_top,3.6])
            drill = cylinder(radius, vent_top-pad_bottom+1, [x,pad_bottom-1,0], [0,1,0])
            nut = cylinder((4+clearance)/np.sqrt(3), 2.2, [x,pad_bottom-.01,0],
                           [0,1,0], sides=6)
            seat = (pad ^ outer) + anchor
            if (seat ^ cover).volume() > .005:
                seat = seat - cover - cover.translate([0,-clearance,0])
            nose = (nose + (seat - socket_cut)) - drill - nut
            cover -= drill
            cover_holes.append({'point_mm':[float(x),y,0], 'axis':[0,1,0]})

    if cameras:
        limit = np.asarray(cameras[0]['envelope_mm'])
        keep_clear = box(limit[:3] - clearance/4, limit[3:] + clearance/4)
        nose -= keep_clear
        cover -= keep_clear
        rear_body -= keep_clear

    gimbal_mount = None
    cover_part = 'body_nose_vent'
    if gimbal:
        nose_length = seam - front
        opening_front = front + .115 * nose_length
        opening_rear = front + .65 * nose_length
        mount_x = front + .495 * nose_length
        local = ring_at(mount_x)
        local_height = float(np.ptp(local[:,0]))
        center = float((local[:,0].min() + local[:,0].max()) / 2)
        opening_half = max(np.ptp(ring_at(x)[:,1]) for x in
                           np.linspace(opening_front,opening_rear,9)) * .48
        opening_ceiling = min(float(rings[0,:,1].min())-.15, center-.025*local_height)
        front_center = front + .235 * nose_length
        front_width = .51 * np.ptp(ring_at(front_center)[:,1])
        angles = np.linspace(-np.pi/2,np.pi/2,33)
        curved_edge = np.column_stack((
            front_center-(front_center-opening_front)*np.cos(angles),
            front_width*np.sin(angles),
        ))
        lip_plan = np.concatenate([curved_edge,[[front-1,front_width],[front-1,-front_width]]])
        lip_thickness = max(1.8,wall)
        lip = md.CrossSection([lip_plan]).extrude(lip_thickness+.4).transform(
            [[1,0,0,0],[0,0,1,opening_ceiling-.4],[0,1,0,0]]
        )
        lower_trim = rounded_hatch_prism(front-8,opening_rear,opening_half+max(2.2,wall),
                                         6.5,-10000,opening_ceiling)
        nose = (nose + (lip ^ outer)) - lower_trim
        shelf_top = center + .26 * local_height
        mounts = []
        for sign in (-1,1):
            pad_z = sign * .31 * np.ptp(local[:,1])
            low_z,high_z=sorted([pad_z-sign*3.8,sign*opening_half*1.3])
            pad_bottom = max(shelf_top-6, opening_ceiling+clearance)
            pad = outer ^ box([mount_x-6,pad_bottom,low_z],[mount_x+6,shelf_top,high_z])
            if (pad ^ nose).volume() < 1:
                raise ManufacturingError('Gimbal montaj yuvası burun kabuğuna bağlanamıyor.')
            pilot=cylinder(.85,4.5,[mount_x,shelf_top-4,pad_z],[0,1,0],32)
            nose=(nose+pad)-pilot
            mounts.append({'point_mm':[mount_x,shelf_top,pad_z], 'axis':[0,1,0]})
        cover_part = 'body_gimbal_vtx_cover'
        gimbal_mount = {
            'part':'body_nose', 'cover_part':cover_part, 'mount_plane_mm':float(seam-clearance/2),
            'aperture_mm':[opening_rear-opening_front,2*opening_half],
            'pilot_diameter_mm':1.7, 'mounts':mounts, 'opening_ceiling_y_mm':opening_ceiling,
        }

    if (nose ^ rear_body).volume() > .02:
        raise ManufacturingError('Sökülebilir burun ve iç geçme çakışıyor.')
    if (nose ^ cover).volume() > .02 or (rear_body ^ cover).volume() > .02:
        raise ManufacturingError('Havalandırma kapağı gövdeyle çakışıyor.')
    return rear_body, nose, cover, {
        'part': 'body_nose', 'seam_x_mm': float(seam),
        'register_depth_mm': float(register_depth), 'vent_count': 0 if gimbal else 9,
        'hole_diameter_mm': 2+clearance,
        'vent_cover': {'part':cover_part, 'holes':cover_holes, 'clips':cover_clips,
                       'fastening':'clip' if clip_cover else 'screws'},
        'fastening':'m2_nose_register', 'holes':nose_holes,
        **({'gimbal':gimbal_mount} if gimbal_mount else {}),
    }
