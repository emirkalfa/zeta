import json,subprocess
from pathlib import Path
import numpy as np
import pytest
from backend.manufacturing import generate,ManufacturingError
from backend.motor_mounts import motor_sized_fuselage
from tests.test_manufacturing import coords,request_data
from tests.test_motor_mounts import settings

@pytest.mark.parametrize('diameter',[28,36,48])
def test_pusher_face_and_plate_match_motor_diameter(coords,diameter):
    data=request_data(coords,preset='combat',combat=True)
    data['options'].update(settings('single'),motorDiameter=diameter)
    shaped=motor_sized_fuselage(data);rings=np.asarray(shaped['fuselage'])
    center=rings[-1,:,1:].mean(axis=0)
    assert np.linalg.norm(rings[-1,:,1:]-center,axis=1)==pytest.approx(diameter/2,abs=.001)
    assert motor_sized_fuselage(shaped) is shaped
    parts,report,_=generate(data);mount=report['motors'][0]
    assert mount['plate_radius_mm']==diameter/2
    body=next(p.solid for p in parts if p.name=='body')
    vertices=np.asarray(body.to_mesh().vert_properties)[:,:3]
    face=vertices[abs(vertices[:,0]-mount['face_mm'][0])<.001]
    assert np.ptp(face[:,1])==pytest.approx(diameter,abs=.04)
    assert np.ptp(face[:,2])==pytest.approx(diameter,abs=.04)

def test_frontend_and_backend_use_identical_motor_taper(coords):
    data=request_data(coords,preset='combat',combat=True);data['options'].update(settings('single'),motorDiameter=36)
    g={**data['geometry'],'motor_mount':data['options']}
    script="const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js')});vm.runInContext(fs.readFileSync('./static/js/fuselage.js','utf8'),c);c.g=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(vm.runInContext('libraryFuselageSections(g).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000]))',c)));"
    result=subprocess.run(['node','-e',script],input=json.dumps(g),text=True,capture_output=True,check=True,cwd=Path(__file__).resolve().parents[1])
    expected=np.asarray(motor_sized_fuselage(data)['fuselage']);actual=np.array(json.loads(result.stdout))
    assert actual==pytest.approx(expected,abs=1e-6)

def test_motor_face_rejects_holes_that_do_not_fit(coords):
    data=request_data(coords,preset='combat',combat=True)
    data['options'].update(settings('single'),motorDiameter=24)
    with pytest.raises(ManufacturingError,match='Motor çapı'):generate(data)
