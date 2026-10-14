import json,subprocess
from pathlib import Path
import numpy as np
import pytest
from backend.fixed_vtol import canonical_rings,normalize
from backend.penta_layout import penta_layout
from backend.geometry import calculate_geometry


def test_penta_adaptive_preview_and_stl_have_identical_body_coordinates():
    script="""const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js')});vm.runInContext(fs.readFileSync('./static/js/fuselage.js','utf8'),c);console.log(JSON.stringify(vm.runInContext('libraryFuselageSections({fuse_preset: \"vtol5\",fuselage_length:.8,fuselage_max_width:.2,fuselage_max_height:.13,fuse_width_scale:1.5,fuse_height_scale:.7,tail_booms:{},motor_mount:{motorLayout:\"single\",motorDiameter:65}}).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000]))',c)));"""
    r=subprocess.run(['node','-e',script],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True,check=True)
    assert np.asarray(json.loads(r.stdout))==pytest.approx(canonical_rings('vtol5',{'fuselage_length':.8,'fuselage_max_width':.2,'fuselage_max_height':.13,'penta_motor_diameter':65}),abs=1e-6)


@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
def test_penta_auto_sizing_preserves_one_shape_and_selected_position(shape):
    for span in [1.5,2.,3.]:
        g=calculate_geometry(span,4,'4412',wing_shape=shape,airframe='vtol5_fixed',wing_position='high',fuse_type='manual',man_fuse_length=3,man_fuse_width=.8)
        pod=penta_layout(span,g['root_chord'])
        assert g['fuselage_length']==pod['length'] and g['fuselage_max_width']==pod['width'] and g['fuselage_max_height']==pod['height']
        assert g['wing_position']=='high' and g['wing_x_pos']==pod['wing'] and g['fuse_type']=='conventional'
        assert g['tail_booms'] and g['vtail_count']==2
    g=calculate_geometry(2,4,'4412',airframe='combat',wing_position='high');g['fuse_preset']='vtol5'
    old_start=g['tail_booms']['x_start'];old_wing=g['wing_x_pos']
    n=normalize({'geometry':g,'panels':[],'fuselage':[]})
    assert np.asarray(n['fuselage'])==pytest.approx(canonical_rings('vtol5',n['geometry']))
    assert n['geometry']['tail_booms']['x_start']==pytest.approx(old_start+n['geometry']['wing_x_pos']-old_wing)


def test_penta_hatch_roof_has_no_dip_between_two_humps():
    rings=canonical_rings("vtol5")
    selected=rings[(rings[:,0,0]>=80)&(rings[:,0,0]<=560)]
    top=selected[:,:,1].max(axis=1)
    peak=int(top.argmax())
    assert np.all(np.diff(top[:peak+1])>=-1e-6)
    assert np.all(np.diff(top[peak:])<=1e-6)
