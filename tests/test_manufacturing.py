"""Manufactured output tests exercise real CSG and serialized binary STL."""
import io
import itertools
import json
import subprocess
import zipfile
from pathlib import Path

import numpy as np
import pytest

from backend.geometry import calculate_geometry
from backend.manufacturing import generate, package, printable_parts, panel_frame, ManufacturingError, cylinder

ROOT=Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def coords():
    from app import app
    c=app.test_client();airfoils=c.get('/api/airfoils').json
    def get(code):
        aid=next(a['id'] for a in airfoils if a['code']==code)
        return c.get(f'/api/airfoil/{aid}').json['coordinates']
    return get('2412'),get('0012')


def request_data(coords,tail='conventional',preset='atlas',combat=False,wing_shape='rectangular',geometry=None):
    g=geometry or calculate_geometry(1.5,1.2,'2412',tail_type=tail,wing_shape=wing_shape,wing_position='high',airframe='combat' if combat else 'standard')
    g.update(fuse_preset=preset,fuse_width_scale=1.,fuse_height_scale=1.)
    script='''const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js'),window:{addEventListener(){}}});for(const f of ['fuselage.js','assembly.js'])vm.runInContext(fs.readFileSync('./static/js/'+f,'utf8'),c);const d=JSON.parse(fs.readFileSync(0,'utf8'));Object.assign(c,d);console.log(JSON.stringify(vm.runInContext('({geometry:g,panels:aircraftPanelSpecs(g,w,h,h),fuselage:libraryFuselageSections(g).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000]))})',c)));'''
    out=subprocess.run(['node','-e',script],input=json.dumps({'g':g,'w':coords[0],'h':coords[1]}),text=True,capture_output=True,cwd=ROOT,check=True)
    data=json.loads(out.stdout)
    data['options']={'bedX':220,'bedY':220,'bedZ':250,'wall':1.2,'clearance':.3,'screw':3,'nutFlat':5.5,'nutHeight':2.4}
    if tail=='ttail':
        data['options'].update(bedX=300,bedY=300)
    return data


def channel_probe(channel,start_span=0,end_span=None,inset=.05):
    from backend.manufacturing import cylinder
    axis=np.asarray(channel['axis']);scale=channel['path_scale']
    origin=np.asarray(channel['start_mm'])+axis*start_span*scale
    end_span=channel['reach_from_center_mm'] if end_span is None else end_span
    return cylinder(channel['hole_diameter_mm']/2-inset,(end_span-start_span)*scale,origin,axis)


def assert_stl(content):
    count=int.from_bytes(content[80:84],'little');assert len(content)==84+50*count
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    tri=np.frombuffer(content,offset=84,dtype=dtype)['vertices']
    assert np.isfinite(tri).all()
    assert np.min(np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1))>1e-10
    _,indices=np.unique(tri.reshape(-1,3),axis=0,return_inverse=True)
    faces=indices.reshape(-1,3)
    edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    _,counts=np.unique(np.sort(edges,axis=1),axis=0,return_counts=True)
    assert np.all(counts==2), 'serialized STL is watertight'


@pytest.mark.parametrize('tail',['conventional','ttail','vtail'])
def test_tail_assembly_and_package(coords,tail):
    from backend.wing_placement import place_wing_assembly

    data=place_wing_assembly(request_data(coords,tail))
    parts,manifest,rings=generate(data)
    body=next(p.solid for p in parts if p.name=='body');lid=next(p.solid for p in parts if p.name=='hatch_front')+next(p.solid for p in parts if p.name=='hatch_rear')
    assert (body^lid).volume()<1e-5
    named={p.name:p.solid for p in parts}
    import manifold3d as md
    for spec in data['panels']:
        mat,_=panel_frame(spec)
        if spec['kind']=='tail' and abs(mat[2,2])>.5:
            probe=md.Manifold.cube([1,1,1],center=True).translate([spec['chord']*700,0,8]).transform(mat.tolist())
            assert (named[spec.get('parent','body')]^probe).volume()>.9, 'fixed saddle completes tail center'
    for joint in manifest['interfaces']:
        parent=named.get(joint['parent'])
        if parent is not None:
            assert (parent^named[joint['part']]).volume()<.1, joint['part']
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    slices=printable_parts([p for p in parts if p.name=='body'],manifest,rings)
    for a,b in itertools.combinations(slices,2):
        assert (a.assembled ^ b.assembled).volume()<.1, 'body sleeve fits the receiving cavity'
    report=json.loads(archive.read('manifest.json'))
    assert any(p['file'].startswith('hatch') for p in report['parts'])
    for p in report['parts']:
        assert np.all(np.array(p['size_mm'])<=np.array(report['bed_mm'])+.001)
        assert_stl(archive.read(p['file']))
    assert_stl(archive.read('fit_test_key.stl'));assert_stl(archive.read('fit_test_socket.stl'))


@pytest.mark.parametrize('preset',['seyir','akin'])
def test_fuselage_families(coords,preset):
    parts,report,rings=generate(request_data(coords,preset=preset))
    assert (parts[0].solid^parts[1].solid).volume()<1e-5
    assert len(report['hatch_bolts_mm'])==8
    if preset=='akin':
        tube=report['carbon_boom']
        motor=next(m for m in report['motors'] if m['name']=='motor_rear')
        radius=tube['outer_diameter_mm']/2
        purchased=cylinder(radius,tube['length_mm'],tube['start_mm'],[1,0,0])
        assert tube['purchased'] and tube['layout']=='akin'
        assert motor['face_mm'][1]-tube['start_mm'][1]>=motor['prop_diameter_mm']/2+radius+7.9
        for part in parts:
            assert (part.solid^purchased).volume()<.1, part.name



def test_clipped_upper_covers_keep_two_nose_screws(coords):
    data=request_data(coords)
    data['options'].update(hatchFastening='clip',cameraMount=1)
    parts,report,_=generate(data)
    by_name={part.name:part.solid for part in parts}
    assert report['nose_module']['fastening']=='m2_nose_register'
    assert [h['axis'] for h in report['nose_module']['holes']]==[[0,0,-1],[0,0,1]]
    covers=report['service_hatches']
    assert all(not m['bolt_points_mm'] and len(m['clips'])==2 for m in covers)
    assert all((by_name[m['part']]^by_name['body']).volume()<.02 for m in covers)
    assert len(report['nose_module']['vent_cover']['clips'])==2
    assert (by_name['body_nose_vent']^by_name['body_nose']).volume()<.02


def test_lark_high_wing_and_lower_t_tail_mount(coords):
    g=calculate_geometry(1.5,3,'2412',tail_type='ttail',lark_layout=True)
    data=request_data(coords,tail='ttail',preset='akin',geometry=g)
    panels={p['name']:p for p in data['panels']}
    fin=panels['tail_vertical']
    tail=panels['tail_horizontal_right']
    assert g['wing_position']=='high'
    assert tail['parent']==fin['name']
    assert (tail['root'][1]-fin['root'][1])/(fin['tip'][1]-fin['root'][1])==pytest.approx(.27)
    parts,report,_=generate(data)
    assert report['wing_position_offset_mm']>20
    assert any(j['parent']==fin['name'] for j in report['interfaces'])
    assert next(p for p in parts if p.name=='tail_horizontal_right').solid.volume()>0


def test_control_servo_seats_preserve_wing_spars_and_hatches(coords):
    data=request_data(coords,tail='vtail')
    data['options'].update(controlServoMount=3,wingJoinMode='bolted',hatchFastening='clip')
    parts,manifest,rings=generate(data)
    names={p.name:p.solid for p in parts}
    seats=manifest['control_servos']
    assert len(seats)==6 and all(s['status']=='ready' for s in seats)
    assert len(manifest['spar_channels'])==4
    assert len(manifest['service_hatches'])==2
    for seat in seats:
        cover=seat['cover']
        start,end=np.asarray(seat['wire_ends_mm'])
        length=np.linalg.norm(end-start)
        bore=cylinder(1.,length-.4,start+.2*(end-start)/length,end-start)
        assert (bore^names[seat['parent']]).volume()<.02
        if cover:
            assert (names[cover]^names[seat['parent']]).volume()<.02
            assert (bore^names[cover]).volume()<.02
    printed=printable_parts(parts,manifest,rings)
    assert sum(p.name.endswith('_control_servo_cover') for p in printed)==4


def test_tapered_wing_servo_seat_stays_ahead_of_hinge(coords,monkeypatch):
    from backend import control_servo_mounts
    from backend.manufacturing import box, local_transform, profile

    spec={'name':'wing_right','kind':'wing','coords':coords[0],'chord':.25,'tipChord':.125,
          'root':[0,0,0],'tip':[.06,.03,.65],'up':[0,1,0]}
    frame,length=panel_frame(spec)
    wing=local_transform(profile(coords[0],250).extrude(length,scale_top=[.5,.5]),frame)
    hinge=frame[:,:3]@np.array([175.,0.,0.])+frame[:,3]
    axis=frame[:,:3]@np.array([-.135,0.,1.])
    horn=frame[:,:3]@np.array([145.,0.,380.])+frame[:,3]
    control={'part':'wing_right_flaperon','parent':'wing_right','hinge_point_mm':hinge,
             'hinge_axis':axis/np.linalg.norm(axis),'link_holes_mm':[horn],
             'span_start_mm':100.,'span_end_mm':550.,'clearance_radius_mm':10.}
    checked=[]
    def inspect_port(solid,envelope,protected,x,z,*args):
        if not checked:
            assert z==pytest.approx(380.)
            assert x==pytest.approx(175.-.135*z-23./2-20.)
            assert (protected ^ box([122,-40,z-.5],[126,40,z+.5])).volume()>1.
            assert (protected ^ box([90,-40,z-.5],[94,40,z+.5])).volume()<.01
        checked.append(z)
        return None
    monkeypatch.setattr(control_servo_mounts,'service_port',inspect_port)
    control_servo_mounts.install_control_servos(wing,wing,{'wing_right':wing},[spec],
        [control],{},[],{'controlServoMount':1},1.2,.3,None,[],[],{})
    assert checked



def test_invalid_settings_fail_before_export(coords):
    data=request_data(coords);data['options']['wall']=0
    with pytest.raises(ManufacturingError):generate(data)

def test_zero_spar_diameter_disables_only_that_channel(coords):
    data=request_data(coords);data['options'].update(sparMain=0,sparRear=4.2)
    _,report,_=generate(data)
    assert len(report['spar_channels'])==2
    assert all(c['chord_position']==.55 for c in report['spar_channels'])


def test_small_printer_automatically_subdivides_package(coords):
    data=request_data(coords);parts,manifest,rings=generate(data)
    manifest['bed_mm']=[80,80,80]
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    report=json.loads(archive.read('manifest.json'))
    assert any('_split' in p['file'] for p in report['parts'])
    for p in report['parts']:
        assert np.all(np.array(p['size_mm'])<=80.001)
        assert_stl(archive.read(p['file']))


def test_manufacturing_http_api(coords):
    from app import app
    client=app.test_client()
    bad=client.post('/api/manufacturing',json={})
    assert bad.status_code==400 and bad.json['error']
    data=request_data(coords)
    result=client.post('/api/manufacturing',json=data)
    assert result.status_code==200,result.get_data(as_text=True)[:1000]
    assert any(p['name'].startswith('hatch') for p in result.json['parts'])
    result=client.post('/api/manufacturing?mode=zip&part=fuselage',json=data)
    assert result.status_code==200 and result.mimetype=='application/zip'
    archive=zipfile.ZipFile(io.BytesIO(result.data))
    assert 'fit_test_key.stl' in archive.namelist()
    assert any(n.startswith('hatch') and n.endswith('.stl') for n in archive.namelist())


def test_boom_layout_has_printable_connected_parts(coords):
    parts,report,_=generate(request_data(coords,combat=True,preset='combat'))
    assert {'boom_right','boom_left','tail_bridge'}<={p.name for p in parts}
    assert len(report['booms'])==2

@pytest.mark.parametrize('shape',['tapered','ste_tapered'])
def test_vtail_and_tapered_wings_fit_default_bed_without_degenerate_faces(coords,shape):
    parts,manifest,rings=generate(request_data(coords,'vtail',wing_shape=shape))
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    report=json.loads(archive.read('manifest.json'))
    for p in report['parts']:
        assert np.all(np.array(p['size_mm'])<=np.array(report['bed_mm'])+.001)
        assert_stl(archive.read(p['file']))

@pytest.mark.parametrize('preset,shape,tail',[
    ('seyir','ste_tapered','conventional'),
    ('akin','tapered','vtail'),
    ('akin','ste_tapered','vtail'),
])
def test_audited_fractional_cuts_have_no_float32_slivers(coords,preset,shape,tail):
    parts,manifest,rings=generate(request_data(coords,tail,preset=preset,wing_shape=shape))
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    for filename in archive.namelist():
        if filename.endswith('.stl'):assert_stl(archive.read(filename))


@pytest.mark.parametrize('shape',['tapered','ste_tapered'])
def test_tapered_wing_channels_stop_before_the_thin_edge(coords,shape):
    data=request_data(coords,wing_shape=shape)
    data['options'].update(bedX=350,bedY=350,bedZ=350)
    parts,manifest,rings=generate(data)
    rear=[s for s in manifest['spar_channels'] if s['chord_position']==.55]
    assert len(rear)==2
    assert all(s['reach_from_center_mm']<panel_frame(rings['wing_specs'][s['part']])[1] for s in rear)
    assert all(s['wing_insertion_length_mm']>0 for s in rear)
    archive=zipfile.ZipFile(io.BytesIO(package(parts,manifest,rings)))
    for name in archive.namelist():
        if name.endswith('.stl'):assert_stl(archive.read(name))


def test_adaptive_split_preserves_size_volume_and_cavities():
    from backend.manufacturing import box, fit_or_split, check
    solid=box([0,0,0],[360,280,70])-box([4,4,4],[356,276,66])
    large=fit_or_split(solid,[400,400,400])
    small=fit_or_split(solid,[120,120,120])
    assert len(large)==1 and len(small)>len(large)
    assert sum(p[0].volume() for p in small)==pytest.approx(solid.volume(),rel=1e-6)
    for assembled,printed,transform in small:
        check(printed,'split')
        b=np.array(printed.bounding_box())
        assert np.all(b[3:]-b[:3]<=120.001)
        v=np.asarray(printed.to_mesh().vert_properties)[:,:3]
        recovered=(v-transform[:,3])@transform[:,:3]
        original=np.asarray(assembled.to_mesh().vert_properties)[:,:3]
        assert recovered.min(axis=0)==pytest.approx(original.min(axis=0),abs=.001)
        assert recovered.max(axis=0)==pytest.approx(original.max(axis=0),abs=.001)


@pytest.mark.parametrize('tail,preset,combat',[('conventional','atlas',False),('ttail','combat',True),('vtail','combat',True)])
def test_large_aircraft_zip_fits_without_rescaling(coords,tail,preset,combat):
    geometry=calculate_geometry(3.0,1.2,'2412',tail_type=tail,wing_position='high',airframe='combat' if combat else 'standard')
    data=request_data(coords,tail,preset,combat,geometry=geometry)
    parts,report,rings=generate(data)
    printed=printable_parts(parts,report,rings)
    assert any('_split' in p.name for p in printed)
    archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
    packed=json.loads(archive.read('manifest.json'))
    assert [p.name+'.stl' for p in printed]==[p['file'] for p in packed['parts']]
    for p in printed:
        bounds=np.array(p.solid.bounding_box())
        assert np.all(bounds[3:]-bounds[:3]<=np.array(report['bed_mm'])+.001)
        assert_stl(archive.read(p.name+'.stl'))
    for original in parts:
        fragments=[p.assembled for p in printed if p.name==original.name or p.name.startswith(original.name+'_')]
        import manifold3d as md
        union=md.Manifold.batch_boolean(fragments,md.OpType.Add)
        removed=original.solid-union
        from backend.manufacturing import box
        for joint in report.get('wing_segment_joints',[]):
            if joint['parent']==original.name:
                b=np.array(joint['support_bounds_world_mm'])
                removed=removed-box((b[:3]-.03).tolist(),(b[3:]+.03).tolist())
        for joint in report.get('wing_root_braces',[]):
            if original.name=='body' or joint['parent']==original.name:
                b=np.array(joint['support_bounds_world_mm'])
                removed=removed-box((b[:3]-.03).tolist(),(b[3:]+.03).tolist())
        assert removed.volume()<max(.1,original.solid.volume()*.001)
