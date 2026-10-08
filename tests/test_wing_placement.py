import io,zipfile,json,subprocess
from pathlib import Path
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.manufacturing import generate,package,cylinder,panel_frame,local_transform
from backend.wing_placement import place_wing_assembly
from backend.motor_mounts import motor_sized_fuselage
from tests.test_manufacturing import coords,request_data,assert_stl
from tests.test_motor_mounts import settings

@pytest.mark.parametrize('preset',['atlas','seyir','akin','combat'])
@pytest.mark.parametrize('position',['low','mid','high'])
@pytest.mark.parametrize('layout',['none','single','twin'])
def test_all_mounts_follow_actual_wing_height(coords,preset,position,layout):
    shape={'low':'tapered','mid':'rectangular','high':'ste_tapered'}[position]
    g=calculate_geometry(1.5,1.2,'2412',wing_position=position,wing_shape=shape,
                         airframe='combat' if preset=='combat' else 'standard')
    data=request_data(coords,preset=preset,geometry=g);data['options'].update(settings(layout))
    expected=place_wing_assembly(motor_sized_fuselage(data))
    parts,report,rings=generate(data);named={p.name:p.solid for p in parts}
    assert report['wing_position_offset_mm']==pytest.approx(expected['geometry']['wing_position_offset']*1000)
    for joint in report['interfaces']:
        assert (named[joint['part']]^named[joint['parent']]).volume()<.1,joint['part']
    # Verify the actual void, not only a channel label in the manifest.
    for channel in report['spar_channels']:
        spec=next(p for p in expected['panels'] if p['name']==channel['part'])
        mat,length=panel_frame(spec)
        reach=channel['reach_from_center_mm'];trim=reach-channel['wing_insertion_length_mm']
        x=spec['chord']*1000*channel['chord_position']
        probe=local_transform(cylinder(channel['hole_diameter_mm']*.4,reach-trim-2,[x,0,trim+1],[0,0,1]),mat)
        assert (named[channel['part']]^probe).volume()<.01, channel['part']+' tube blocked'
    if layout=='twin':
        for motor in report['motors']:
            p=next(p for p in expected['panels'] if p['name']==motor['parent']);f=motor['station_fraction']
            y=(p['root'][1]+(p['tip'][1]-p['root'][1])*f)*1000-28*.35
            assert motor['face_mm'][1]==pytest.approx(y)
            assert motor['motor_diameter_mm']==28
            assert motor['hole_centers_yz_mm']==[[-8,0],[8,0],[0,-9.5],[0,9.5]]
    for boom in report['booms']:
        y=report['wing_position_offset_mm']+g['tail_booms']['y']*1000*np.sin(np.radians(g['dihedral_angle']))
        assert boom['center_mm'][1]==pytest.approx(y)
        assert (named[boom['part']]^named[boom['parent']]).volume()<.1
    if (preset=='combat' and layout=='twin') or (preset!='combat' and layout=='single'):
        archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings,'all' if preset=='combat' else 'fuselage')))
        for name in archive.namelist():
            if name.endswith('.stl'):assert_stl(archive.read(name))

@pytest.mark.parametrize('tail',['ttail','vtail'])
@pytest.mark.parametrize('position',['low','mid','high'])
def test_other_combat_tails_move_with_booms_without_interference(coords,tail,position):
    g=calculate_geometry(1.5,1.2,'2412',tail_type=tail,wing_position=position,airframe='combat')
    data=request_data(coords,preset='combat',geometry=g);data['options'].update(settings('twin'))
    parts,report,_=generate(data);named={p.name:p.solid for p in parts}
    for joint in report['interfaces']:assert (named[joint['part']]^named[joint['parent']]).volume()<.1
    assert len(report['motors'])==2 and len(report['booms'])==2

def test_height_choices_and_body_height_scaling_are_effective(coords):
    offsets=[]
    for position in ['low','mid','high']:
        g=calculate_geometry(1.5,1.2,'2412',wing_position=position)
        data=request_data(coords,preset='atlas',geometry=g)
        normal=place_wing_assembly(data)['geometry']['wing_position_offset']
        scaled=np.array(data['fuselage']);scaled[:,:,1]*=1.5
        enlarged=place_wing_assembly({**data,'fuselage':scaled.tolist()})['geometry']['wing_position_offset']
        assert enlarged==pytest.approx(normal*1.5)
        offsets.append(normal)
    assert offsets[0]<offsets[1]<offsets[2]
    assert offsets[0]+offsets[2]==pytest.approx(2*offsets[1])

@pytest.mark.parametrize('preset',['atlas','combat'])
@pytest.mark.parametrize('position',['low','mid','high'])
def test_frontend_and_backend_attachment_positions_match(coords,preset,position):
    g=calculate_geometry(1.5,1.2,'2412',wing_position=position,airframe='combat' if preset=='combat' else 'standard')
    data=request_data(coords,preset=preset,geometry=g)
    expected=place_wing_assembly(data)
    script="const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js'),window:{addEventListener(){}}});for(const f of ['fuselage.js','assembly.js'])vm.runInContext(fs.readFileSync('./static/js/'+f,'utf8'),c);c.g=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(vm.runInContext('syncWingPlacement(g,libraryFuselageSections(g).sections);({offset:g.wing_position_offset,panels:aircraftPanelSpecs(g,[],[],[])})',c)));"
    result=subprocess.run(['node','-e',script],input=json.dumps(data['geometry']),text=True,capture_output=True,check=True,cwd=Path(__file__).resolve().parents[1])
    actual=json.loads(result.stdout)
    assert actual['offset']==pytest.approx(expected['geometry']['wing_position_offset'],abs=1e-9)
    for a,b in zip(actual['panels'],expected['panels']):
        assert a['root']==pytest.approx(b['root'],abs=1e-9)
        assert a['tip']==pytest.approx(b['tip'],abs=1e-9)
