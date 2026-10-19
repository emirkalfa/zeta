"""The body root fairing must not grow a second leading-edge ledge."""
import numpy as np
import pytest
from backend.manufacturing import profile, box
from backend.wing_blend import blended_root
from tests.test_manufacturing import coords


@pytest.mark.parametrize('taper',[1.,.65])
@pytest.mark.parametrize('roof_blend',[.60,.75])
def test_fixed_root_stays_on_real_wing_planform(coords,taper,roof_blend):
    chord=250.;length=750.;end=95.;wall=1.2
    section=profile(coords[0],chord)
    inset=section.offset(-wall/taper,circular_segments=24)
    frame=np.array([[1.,0,0,360],[0,1.,0,0],[0,0,1.,0]])
    from backend.fixed_vtol import canonical_rings
    root=blended_root(section,inset,chord,taper,length,end,wall,.3,
                      body_profile=canonical_rings(),frame=frame,roof_blend=roof_blend,seat_end=end+8)
    assert root.status().name=='NoError'
    # This catches the old 50 mm lip at the inboard leading edge, which
    # outboard-only flush-cuff tests could not see.
    assert (root ^ box([-100,-1000,-1],[-.025,1000,end+9])).volume()<.001
    envelope=section.offset(.025).extrude(length,scale_top=[taper]*2)
    tip=root ^ box([-1000,-1000,end+7.95],[1000,1000,end+8.01])
    assert (tip-envelope).volume()<.001
