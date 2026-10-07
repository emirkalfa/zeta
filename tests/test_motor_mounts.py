"""Real motor-interface CSG, dimensional invariance and serialized STL checks."""
import io,json,zipfile
import manifold3d as md
import numpy as np
import pytest
from backend.manufacturing import generate,package,preview,ManufacturingError,cylinder,orthogonal_print,box
from tests.test_manufacturing import coords,request_data,assert_stl

def settings(layout):
    return dict(motorLayout=layout,motorDiameter=28,motorLength=30,motorPattern='cross',
                motorSpacingY=16,motorSpacingZ=19,motorBore=8,motorScrew=3,
                motorPlate=5,motorWire=6,propDiameter=152,motorStation=40)

@pytest.mark.parametrize('layout',['single','twin'])
def test_mount_holes_are_real_voids_and_archive_is_closed(coords,layout):
    data=request_data(coords);data['options'].update(settings(layout))
    parts,report,rings=generate(data);named={p.name:p.solid for p in parts}
    assert len(report['motors'])==(1 if layout=='single' else 2)
    for mount in report['motors']:
        x,y,z=mount['face_mm'];owner=named[mount['parent']]
        for hy,hz in mount['hole_centers_yz_mm']:
            probe=cylinder(1,3,[x+1,y+hy,z+hz],[1,0,0])
            assert (owner^probe).volume()<1e-5
        center=cylinder(3,3,[x+1,y,z],[1,0,0])
        assert (owner^center).volume()<1e-5
        hy,hz=mount['front_wire_center_yz_mm']
        wire=cylinder(2,3,[x+1,y+hy,z+hz],[1,0,0])
        assert (owner^wire).volume()<1e-5
        if layout=='twin':
            cover=named[mount['service_cover']]
            assert (owner^cover).volume()<1e-5
            for travel in [1,5,15]:
                assert (owner^cover.translate([0,-travel,0])).volume()<1e-5
            # A 3 mm driver shaft can approach each bolt from the open underside.
            for hy,hz in mount['hole_centers_yz_mm']:
                start=np.array([x+mount['plate_thickness_mm']+1,y+hy,z+hz])
                end=np.array([mount['back_x_mm']-7,y-mount['plate_radius_mm']-5,z+hz])
                direction=end-start
                tool=cylinder(1.5,np.linalg.norm(direction),start.tolist(),direction.tolist())
                assert (owner^tool).volume()<1e-4
            for bx,bz in mount['service_screws']['positions_xz_mm']:
                tool=cylinder(1,20,[bx,y-15,bz],[0,1,0])
                assert (cover^tool).volume()<1e-5
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
    manifest=json.loads(archive.read('manifest.json'))
    assert len(manifest['motors'])==len(report['motors'])
    shown=preview(parts,report,rings)['parts']
    volumes={p['file']:p['volume_mm3'] for p in manifest['parts']}
    assert {p['name']+'.stl' for p in shown}==set(volumes)
    for p in shown:
        solid=md.Manifold(md.Mesh(np.array(p['vertices'],dtype=np.float32).reshape(-1,3),np.array(p['faces'],dtype=np.uint32).reshape(-1,3)))
        assert solid.status()==md.Error.NoError
        assert solid.volume()==pytest.approx(volumes[p['name']+'.stl'],rel=1e-4,abs=.1)
    for file in archive.namelist():
        if file.endswith('.stl'):assert_stl(archive.read(file))

def test_motor_dimensions_do_not_scale_with_the_wing(coords):
    from backend.geometry import calculate_geometry
    import subprocess
    reports=[]
    for span in [1.2,1.8]:
        data=request_data(coords);g=calculate_geometry(span,1.2,'2412',wing_shape='rectangular',wing_position='high')
        g.update(fuse_preset='atlas',fuse_width_scale=1.,fuse_height_scale=1.)
        script="""const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js'),window:{addEventListener(){}}});for(const f of ['fuselage.js','assembly.js'])vm.runInContext(fs.readFileSync('./static/js/'+f,'utf8'),c);Object.assign(c,JSON.parse(fs.readFileSync(0,'utf8')));console.log(JSON.stringify(vm.runInContext('({geometry:g,panels:aircraftPanelSpecs(g,w,h,h),fuselage:libraryFuselageSections(g).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000]))})',c)));"""
        from pathlib import Path
        result=subprocess.run(['node','-e',script],input=json.dumps(dict(g=g,w=coords[0],h=coords[1])),capture_output=True,text=True,check=True,cwd=Path(__file__).resolve().parents[1])
        new=json.loads(result.stdout);new['options']=data['options'];new['options'].update(settings('twin'))
        _,report,_=generate(new);reports.append(report['motors'])
    for a,b in zip(*reports):
        for key in ['motor_diameter_mm','motor_length_mm','plate_radius_mm','hole_centers_yz_mm','hole_diameter_mm']:
            assert a[key]==b[key]
        assert abs(a['face_mm'][2])<abs(b['face_mm'][2])
        assert abs(b['face_mm'][2])/abs(a['face_mm'][2])==pytest.approx(1.5)

def test_oversized_propeller_collision_is_rejected(coords):
    data=request_data(coords);data['options'].update(settings('twin'),propDiameter=700)
    with pytest.raises(ManufacturingError,match='Pervane|pervane'):generate(data)

def test_shaft_and_bolt_overlap_is_rejected(coords):
    data=request_data(coords);data['options'].update(settings('single'),motorBore=30)
    with pytest.raises(ManufacturingError,match='çok yakın'):generate(data)

def test_rectangle_pattern_and_filtered_packages(coords):
    data=request_data(coords);data['options'].update(settings('twin'),motorPattern='rectangle')
    parts,report,rings=generate(data)
    assert report['motors'][0]['hole_centers_yz_mm']==[[-8,-9.5],[-8,9.5],[8,-9.5],[8,9.5]]
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings,'wing')))
    assert len(json.loads(archive.read('manifest.json'))['motors'])==2
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings,'fuselage')))
    assert json.loads(archive.read('manifest.json'))['motors']==[]

def test_diagonal_print_rotation_can_be_reversed_for_exact_preview():
    original=box([30,-10,70],[280,-2,80])
    printed,transform=orthogonal_print(original,[220,220,220],True)
    v=np.asarray(printed.to_mesh().vert_properties)[:,:3]
    restored=(v-transform[:,3])@transform[:,:3]
    assert restored.min(axis=0)==pytest.approx([30,-10,70],abs=.001)
    assert restored.max(axis=0)==pytest.approx([280,-2,80],abs=.001)
    assert np.linalg.det(transform[:,:3])==pytest.approx(1)
