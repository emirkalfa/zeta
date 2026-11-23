"""Shared printed tabs for removable upper covers."""
import manifold3d as md



def latch_cover(parent, cap, exterior, edges, roof_at, wall, gap, *, block=None):
    """Fit two opposed beveled hooks and cut only their assembled pockets."""
    seats = []
    keep_clear = md.Manifold()
    for outward, edge in ((-1,edges[0]),(1,edges[1])):
        stem_x = edge-outward*(gap+3.4)
        roof = roof_at(stem_x)
        depth = max(6.,wall+4.) if block is not None else max(10.,wall+6.)
        stem_bottom = roof-depth
        hook = gap+1.0
        width = 8.
        section = md.CrossSection([[[0,stem_bottom],[hook+gap+3.4,stem_bottom+1.4],
            [hook+gap+3.4,stem_bottom+2.6],[1.25,stem_bottom+2.6],
            [1.25,roof+1],[-.55,roof+1],[-.55,stem_bottom]]])
        tab = section.extrude(width).transform([[outward,0,0,stem_x],[0,1,0,0],[0,0,1,-width/2]])
        tab = tab ^ exterior
        if block is not None:
            tab -= block
        cap += tab
        notch = tab
        for shift in ([gap,0,0],[-gap,0,0],[0,gap,0],[0,-gap,0],[0,0,gap],[0,0,-gap]):
            notch += tab.translate(shift)
        parent -= notch
        keep_clear += notch
        seats.append({'point_mm':[float(edge),float(stem_bottom+2.6),0.],
                      'direction':[outward,0,0],'hook_width_mm':width})
    return parent,cap,keep_clear,seats
