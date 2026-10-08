import io
import json
import zipfile
from collections import Counter

import numpy as np
import pytest

from backend.manufacturing import generate, printable_parts, package, cylinder
from tests.test_manufacturing import coords, request_data, assert_stl


@pytest.mark.parametrize('preset',['atlas','seyir','akin','combat'])
@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
@pytest.mark.parametrize('position',['low','mid','high'])
def test_every_wing_seam_is_fastened_without_blocking_existing_features(coords,preset,shape,position):
    from backend.geometry import calculate_geometry
    g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position,
                         airframe='combat' if preset=='combat' else 'standard')
    data=request_data(coords,preset=preset,geometry=g)
    parts,manifest,rings=generate(data)
    wings=[p for p in parts if p.name in rings['wing_specs']]
    # Include every original part in obstacle checking, but export only wings.
    from backend.wing_segments import segmented_wing
    printed=[]
    for wing in wings:
        printed+=segmented_wing(wing,rings['wing_specs'][wing.name],manifest,parts,rings['part_cuts'].get(wing.name,[]))
    joints=manifest['wing_segment_joints'];assert joints
    seams=Counter()
    for j in joints:seams[j['parent'],j['seam']]+=len(j['holes'])
    assert set(seams.values())=={4}
    actual={p.name:p.assembled for p in printed}
    for joint in joints:
        plate=actual[joint['bridge']]
        assert len(joint['segments'])==2 and len(joint['holes']) in (2,4)
        assert all(name in actual for name in joint['segments'])
        for name in joint['segments']:
            assert (actual[name]^plate).volume()<.03
        # Both fastener holes remain open through the bridge and supporting tile.
        for h in joint['holes']:
            point=np.array(h['point_mm']);axis=np.array(h['axis'])
            probe=cylinder(joint['screw_diameter_mm']/2-.05,200,point+axis*20,-axis)
            for name in [joint['bridge'],*joint['segments']]:
                assert (actual[name]^probe).volume()<.02
            nut=np.array(h['nut_seat_mm'])
            probe=cylinder(joint['nut_flat_mm']*.4,joint['nut_height_mm']-.2,nut-axis*.1,-axis)
            for name in joint['segments']:assert (actual[name]^probe).volume()<.02
        # The keyed bridge is actually removable from above.
        up=np.array(joint['holes'][0]['axis'])
        for distance in (1,5,20):
            for name in joint['segments']:assert (plate.translate((up*distance).tolist())^actual[name]).volume()<.03
    for wing in wings:
        pieces=[p for p in printed if p.name.startswith(wing.name)]
        for tool in rings['part_cuts'].get(wing.name,[]):
            # Serialization rounds to 0.02 mm; compare against original bore residual.
            assert sum((p.assembled^tool).volume() for p in pieces)<(wing.solid^tool).volume()+.1
        # Probe the usable bore, inset by 0.05 mm from tessellated drill walls.
        mat=wing.frame
        for channel in [c for c in manifest['spar_channels'] if c['part']==wing.name]:
            origin=mat[:,:3]@np.array([rings['wing_specs'][wing.name]['chord']*1000*channel['chord_position'],channel['center_offset_mm'],-20])+mat[:,3]
            probe=cylinder(channel['hole_diameter_mm']/2-.05,channel['reach_from_center_mm']+20,origin,mat[:,2])
            assert sum((p.assembled^probe).volume() for p in pieces)<.01
        body=next(p.solid for p in parts if p.name=='body')
        assert sum((p.assembled^body).volume() for p in pieces)<.1
        for p in pieces:
            b=np.array(p.solid.bounding_box())
            assert np.all(b[3:]-b[:3]<=np.array(manifest['bed_mm'])+.01)


def test_zip_contains_joint_hardware_map_and_closed_meshes(coords):
    data=request_data(coords);data['options']['wingJoinMode']='bolted'
    parts,m,r=generate(data)
    archive=zipfile.ZipFile(io.BytesIO(package(parts,m,r)))
    report=json.loads(archive.read('manifest.json'))
    names=set(archive.namelist())
    for joint in report['wing_segment_joints']:
        for name in [joint['bridge'],*joint['segments']]:assert name+'.stl' in names
        assert joint['bridge'] in archive.read('MONTAJ.txt').decode()
    for name in names:
        if name.endswith('.stl'):assert_stl(archive.read(name))


def test_smaller_printer_adds_connected_wing_tiles(coords):
    from backend.wing_segments import segmented_wing
    parts,m,r=generate(request_data(coords))
    wing=next(p for p in parts if p.name=='wing_right')
    counts=[]
    for bed in ([300,300,300],[180,180,180],[120,120,120]):
        m['bed_mm']=bed;m['wing_segment_joints']=[]
        out=segmented_wing(wing,r['wing_specs'][wing.name],m,parts,r['part_cuts'][wing.name])
        counts.append(len(out))
        connected={n for j in m['wing_segment_joints'] for n in j['segments']}
        assert connected=={p.name for p in out if '_join_' not in p.name}
    assert counts==sorted(counts) and counts[-1]>counts[0]


def test_bolted_export_never_silently_falls_back_to_glue(coords):
    from backend.manufacturing import ManufacturingError
    data=request_data(coords)
    data['options'].update(wingJoinMode='bolted',screw=5,nutFlat=4)
    parts,m,r=generate(data)
    with pytest.raises(ManufacturingError,match='kanat dilim bağlantısı'):
        package(parts,m,r)
    assert m['wing_join_mode']=='bolted'


def test_preview_and_wing_only_zip_use_identical_joint_plan(coords):
    from backend.manufacturing import preview
    data=request_data(coords);data['options']['wingJoinMode']='bolted'
    parts,m,r=generate(data)
    full=preview(parts,m,r)
    original=json.loads(json.dumps(full['manifest']['wing_segment_joints']))
    archive=zipfile.ZipFile(io.BytesIO(package(parts,m,r,filter='wing')))
    report=json.loads(archive.read('manifest.json'))
    assert report['wing_segment_joints']==original
    assert all(j['bridge']+'.stl' in archive.namelist() for j in original)


@pytest.mark.parametrize('tail',['conventional','vtail'])
def test_bolted_tiles_preserve_twin_motor_holes_and_control_motion(coords,tail):
    from tests.test_motor_mounts import settings
    from backend.control_joints import rotate_about
    data=request_data(coords,tail=tail)
    data['options'].update(settings('twin'),wingJoinMode='bolted')
    parts,m,r=generate(data);printed=printable_parts(parts,m,r)
    control_names=[c['part'] for c in m['controls']]
    fixed=[p.assembled for p in printed if p.family=='wing' and
           not any(p.name==n or p.name.startswith(n+'_') for n in control_names)]
    for motor in m['motors']:
        x,y,z=motor['face_mm']
        for hy,hz in motor['hole_centers_yz_mm']:
            probe=cylinder(1,3,[x+1,y+hy,z+hz],[1,0,0])
            assert sum((solid^probe).volume() for solid in fixed)<.001
    named={p.name:p.solid for p in parts}
    for c in m['controls']:
        if not c['parent'].startswith('wing_'):continue
        for angle in [-25,-12.5,0,12.5,25]:
            moving=rotate_about(named[c['part']],np.array(c['hinge_point_mm']),np.array(c['hinge_axis']),angle)
            assert sum((solid^moving).volume() for solid in fixed)<.1
