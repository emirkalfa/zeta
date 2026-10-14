"""Cambered wing keys must fit the entire cuff before automatic brace placement."""
import io,json,zipfile
import numpy as np
import pytest
from backend.geometry import calculate_geometry
from backend.manufacturing import generate,package,cylinder
from database.seed import naca_4_digit_coordinates
from tests.test_manufacturing import request_data,assert_stl


def data(preset,shape):
    cs=tuple([{'x':x,'y_upper':max(0,y),'y_lower':min(0,y)} for x,y in naca_4_digit_coordinates(code)] for code in ['4412','0012'])
    g=calculate_geometry(1.5,4,'4412',wing_shape=shape,tail_type='vtail',
                         airframe='vtol_fixed' if preset=='vtol' else 'combat' if preset in ['combat','vtol5'] else 'standard')
    d=request_data(cs,preset=preset,geometry=g)
    d['options'].update(wingJoinMode='bolted',cameraMount=1,motorLayout='single',
                         motorDiameter=65,propDiameter=152,vtolBoomDiameter=40)
    return d


@pytest.mark.parametrize('preset',['atlas','seyir','akin','combat','vtol','vtol5'])
@pytest.mark.parametrize('shape',['rectangular','tapered','ste_tapered'])
def test_cambered_key_and_cuff_never_overlap(preset,shape):
    d=data(preset,shape);parts,m,r=generate(d)
    body=next(p.solid for p in parts if p.name=='body')
    for name in ['wing_right','wing_left']:
        wing=next(p.solid for p in parts if p.name==name)
        assert (body^wing).volume()<.1
        joint=next(j for j in m['interfaces'] if j['part']==name)
        axis=np.asarray(joint['bolt_axis']);pt=np.asarray(joint['bolt_point_mm'])
        assert ((body+wing)^cylinder(joint['pin_diameter_mm']/2-.1,40,pt-axis*20,axis)).volume()<.1


def test_reported_auto_root_error_produces_closed_zip_with_both_braces():
    d=data('vtol','ste_tapered');parts,m,r=generate(d)
    archive=zipfile.ZipFile(io.BytesIO(package(parts,m,r)))
    report=json.loads(archive.read('manifest.json'))
    assert len(report['wing_root_braces'])==2
    for j in report['wing_root_braces']:
        assert len(j['holes'])==2
        assert all(n+'.stl' in archive.namelist() for n in [j['bridge'],*j['segments']])
    for p in report['parts']:assert_stl(archive.read(p['file']))
