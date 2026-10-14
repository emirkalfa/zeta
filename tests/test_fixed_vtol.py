import json
import subprocess
from pathlib import Path
import numpy as np
from backend.fixed_vtol import canonical_rings,normalize
from backend.geometry import calculate_geometry


def test_canonical_js_preview_and_python_stl_match():
    root=Path(__file__).resolve().parents[1]
    script="""const fs=require('fs'),vm=require('vm');let c=vm.createContext({THREE:require('./static/vendor/three.min.js')});vm.runInContext(fs.readFileSync('./static/js/fuselage.js','utf8'),c);console.log(JSON.stringify(vm.runInContext('libraryFuselageSections({fuse_preset:\"vtol\",fuselage_length:3,fuselage_max_width:.8,fuselage_max_height:.8,fuse_width_scale:1.5,fuse_height_scale:.7}).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000]))',c)));"""
    result=subprocess.run(['node','-e',script],cwd=root,text=True,capture_output=True,check=True)
    assert np.asarray(json.loads(result.stdout))==__import__('pytest').approx(canonical_rings(),abs=1e-6)


def test_old_settings_cannot_distort_fixed_body():
    g=calculate_geometry(2,4,'2412',wing_position='high');g.update(fuse_preset='vtol',fuse_width_scale=.7,fuse_height_scale=1.5)
    d=normalize({'geometry':g,'panels':[{'kind':'wing','root':[g['wing_x_pos'],0,0],'tip':[g['wing_x_pos'],0,1]}],'fuselage':[]})
    assert d['geometry']['wing_position']=='mid'
    assert d['geometry']['wing_x_pos']==.36
    assert d['geometry']['fuse_width_scale']==1
    assert np.asarray(d['fuselage'])==__import__('pytest').approx(canonical_rings())


def test_calculation_uses_fixed_body_before_tail_sizing():
    for span in [1.5,2]:
        g=calculate_geometry(span,4,'2412',airframe='vtol_fixed',wing_position='high',fuse_type='manual',man_fuse_length=3)
        assert g['fuselage_length']==1.2 and g['wing_position']=='mid'
        assert g['fuselage_max_width']==.17 and g['fuselage_max_height']==.11
        assert g['wing_x_pos']==.36 and g['tail_x_pos']==.984


def test_tria_vtail_uses_actual_ac_arm_and_explicit_targets():
    import math
    for span in [1.5,2]:
        g=calculate_geometry(span,4,'4412',tail_type='vtail',wing_shape='ste_tapered',airframe='vtol_fixed')
        area=(g['vtail_chord']+g['vtail_tip_chord'])*g['vtail_span']/2
        assert g['vtail_chord']<g['root_chord']
        assert g['vtail_span']**2/area>2.98
        assert g['tail_sizing_arm']==g['effective_tail_arm']
        assert g['vtail_span']<.5*span
        assert area*math.cos(math.radians(35))**2*g['effective_tail_arm']/(g['wing_area']*g['mac'])>=.449
        assert area*math.sin(math.radians(35))**2*g['effective_tail_arm']/(g['wing_area']*g['wingspan'])>=.0299
    manual=calculate_geometry(2,4,'4412',tail_type='vtail',airframe='vtol_fixed',manual_mode=True,
                              man_vtail_span=.8,man_vtail_root=.30,man_vtail_tip=.18)
    assert manual['vtail_span']==.8 and manual['vtail_chord']==.30


def test_tria_tail_targets_change_area_without_changing_other_families():
    small=calculate_geometry(2,4,'4412',tail_type='vtail',wing_shape='ste_tapered',airframe='vtol_fixed')
    large=calculate_geometry(2,4,'4412',tail_type='vtail',wing_shape='ste_tapered',airframe='vtol_fixed',tria_tail_vh=.7,tria_tail_vv=.045)
    assert small['vtail_surface_area']<large['vtail_surface_area']*.8
    assert small['vtail_surface_area']<.283822*.8
    import pytest
    with pytest.raises(ValueError):calculate_geometry(2,4,'4412',tail_type='vtail',airframe='vtol_fixed',tria_tail_vh=float('nan'))
