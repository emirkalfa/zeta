"""Probe actual carbon paths, moving controls and decoded printable STL meshes."""
import io,itertools,json,zipfile
import manifold3d as md
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.manufacturing import generate,printable_parts,package,cylinder,panel_frame
from backend.control_joints import rotate_about
from tests.test_manufacturing import coords,request_data,channel_probe,assert_stl

CASES=[(p,s,h) for p,s,h in itertools.product(
 ['atlas','seyir','akin','combat','vtol','vtol5'],
 ['rectangular','tapered','ste_tapered'],['low','mid','high']) if p!='vtol' or h=='mid']

def design(coords,preset,shape,position):
 frame='vtol_fixed' if preset=='vtol' else 'vtol5_fixed' if preset=='vtol5' else 'combat' if preset=='combat' else 'standard'
 g=calculate_geometry(1.5,1.2,'2412',wing_shape=shape,wing_position=position,
                      tail_type='vtail' if preset=='vtol' else 'conventional',airframe=frame)
 return request_data(coords,preset=preset,geometry=g)

@pytest.mark.parametrize('preset,shape,position',CASES)
def test_straight_tubes_follow_taper_and_never_enter_moving_surfaces(coords,preset,shape,position):
 data=design(coords,preset,shape,position);parts,m,r=generate(data)
 named={p.name:p.solid for p in parts}
 assert len(m['spar_channels'])==4
 for c in m['spar_channels']:
  spec=r['wing_specs'][c['part']];mat,length=panel_frame(spec)
  # Independent geometry check: one straight tube maintains its selected
  # chord fraction along a linearly tapered wing, including sweep/dihedral.
  for z in (0,length*.4,c['reach_from_center_mm']):
   world=np.asarray(c['start_mm'])+np.asarray(c['axis'])*c['path_scale']*z
   local=np.linalg.solve(mat[:,:3],world-mat[:,3])
   chord=(spec['chord']+(spec['tipChord']-spec['chord'])*z/length)*1000
   assert local[0]/chord==pytest.approx(c['chord_position'],abs=1e-7)
  assert c['reach_from_center_mm']>length*.8
  tube=channel_probe(c,inset=.05)
  assert ((named['body']+named[c['part']])^tube).volume()<.1
  for control in m['controls']:
   if control['parent']!=c['part']:continue
   for angle in control['checked_angles_deg']:
    moving=rotate_about(named[control['part']],np.asarray(control['hinge_point_mm']),np.asarray(control['hinge_axis']),angle)
    assert (tube^moving).volume()<.01,(preset,shape,position,control['part'],angle)

@pytest.mark.parametrize('preset',['atlas','seyir','akin','combat','vtol','vtol5'])
def test_adjusted_positions_and_diameters_are_real_holes_in_serialized_stl(coords,preset):
 data=design(coords,preset,'tapered','mid')
 data['options'].update(wingJoinMode='bolted',sparMain=7.2,sparRear=4.8,sparMainPosition=31,sparRearPosition=50)
 parts,m,r=generate(data);printed=printable_parts(parts,m,r)
 archive=zipfile.ZipFile(io.BytesIO(package(parts,m,r,printed=printed)))
 solids=[]
 dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
 for p in printed:
  content=archive.read(p.name+'.stl');assert_stl(content)
  tri=np.frombuffer(content,offset=84,dtype=dtype)['vertices']
  vertices,index=np.unique(tri.reshape(-1,3),axis=0,return_inverse=True)
  solid=md.Manifold(md.Mesh(vert_properties=vertices,tri_verts=index.reshape(-1,3).astype(np.uint32)))
  solids.append(solid.transform(p.print_to_world.tolist()))
 for c in m['spar_channels']:
  assert c['chord_position'] in (.31,.5)
  assert c['hole_diameter_mm']==pytest.approx(7.2 if c['chord_position']==.31 else 4.8)
  trim=next(j['root_trim_mm'] for j in m['interfaces'] if j['part']==c['part'])
  probe=channel_probe(c,trim+1,c['reach_from_center_mm']-1,inset=.12)
  assert sum((solid^probe).volume() for solid in solids)<.1


def test_carbon_tube_cannot_cross_the_wing_retaining_pin(coords):
 from backend.manufacturing import ManufacturingError
 data=design(coords,'atlas','rectangular','mid')
 data['options']['sparMainPosition']=40
 with pytest.raises(ManufacturingError,match='kök pimiyle'):
  generate(data)
