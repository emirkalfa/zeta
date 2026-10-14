import io,json,zipfile
import numpy as np
import pytest
from tests.test_manufacturing import coords,request_data,assert_stl
from backend.manufacturing import generate,package,cylinder
from backend.control_joints import rotate_about

@pytest.mark.parametrize('preset,shape,position',[('atlas','rectangular','high'),('seyir','tapered','low'),('akin','ste_tapered','mid'),('combat','ste_tapered','high'),('vtol','tapered','mid'),('vtol5','ste_tapered','high')])
def test_wing_horns_adjustment_holes_motion_and_stl(coords,preset,shape,position):
    from backend.geometry import calculate_geometry
    frame='vtol_fixed' if preset=='vtol' else 'vtol5_fixed' if preset=='vtol5' else 'combat' if preset=='combat' else 'standard'
    g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position,tail_type='vtail' if preset=='vtol' else 'conventional',airframe=frame)
    data=request_data(coords,preset=preset,geometry=g);data['options']['wingJoinMode']='bolted'
    parts,report,rings=generate(data);named={p.name:p.solid for p in parts}
    for control in report['controls']:
        assert control['horn_style']=='rounded_tapered_spreader' and control['horn_thickness_mm']>=4
        assert control['horn_base_width_mm']>=6 and len(control['link_holes_mm'])==2
        moving=named[control['part']];axis=np.asarray(control['link_axis'])
        for point in control['link_holes_mm']:
            point=np.asarray(point)
            assert (moving^cylinder(.9,control['horn_thickness_mm']+2,point-axis*(control['horn_thickness_mm']/2+1),axis)).volume()<.01
        for angle in [-25,-12.5,0,12.5,25]:
            pose=rotate_about(moving,control['hinge_point_mm'],control['hinge_axis'],angle)
            for part in parts:
                if part.name!=control['part']:assert (pose^part.solid).volume()<.1,(control['part'],part.name,angle)
    # Representative serialised ZIPs cover both the ordinary and VTOL paths.
    if preset in ('atlas','vtol5'):
        archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
        manifest=json.loads(archive.read('manifest.json'))
        for p in manifest['parts']:
            assert np.all(np.asarray(p['size_mm'])<=np.asarray(manifest['bed_mm'])+.001)
            assert_stl(archive.read(p['file']))
