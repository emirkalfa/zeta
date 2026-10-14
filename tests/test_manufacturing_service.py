from concurrent.futures import ThreadPoolExecutor
import pytest
import backend.manufacturing_service as module

def fake_service(monkeypatch):
    calls=[]
    def generate(data):
        calls.append(('generate',data['value']))
        return ['part'],{'wing_segment_joints':[]},{}
    def split(parts,manifest,rings):
        calls.append(('split',None));manifest['wing_segment_joints']=['verified']
        return ['printed']
    def preview(parts,manifest,rings,printed=None):
        assert printed==['printed'];return {'manifest':manifest}
    def package(parts,manifest,rings,filter,printed=None):
        assert printed==['printed']
        manifest['wing_segment_joints'].append('export only')
        return b'zip'
    for name,func in [('generate',generate),('printable_parts',split),('preview',preview),('package',package)]:
        monkeypatch.setattr(module,name,func)
    return module.ManufacturingService(),calls

def test_preview_and_zip_share_validated_segmentation(monkeypatch):
    service,calls=fake_service(monkeypatch)
    data={'value':1}
    assert service.result(data)['manifest']['wing_segment_joints']==['verified']
    assert service.result(data,'zip')==b'zip'
    assert service.result(data)['manifest']['wing_segment_joints']==['verified']
    assert calls==[('generate',1),('split',None)]
    service.result({'value':2})
    assert len(calls)==4

def test_concurrent_requests_and_bounded_cache(monkeypatch):
    service,calls=fake_service(monkeypatch)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _:service.result({'value':1}),range(4)))
    assert len(calls)==2
    service.result({'value':2});service.result({'value':3})
    assert len(service.entries)==2
    service.result({'value':1})
    assert len(calls)==8

def test_failed_geometry_is_not_cached(monkeypatch):
    service,calls=fake_service(monkeypatch)
    def fail(data):raise ValueError('invalid mesh')
    monkeypatch.setattr(module,'generate',fail)
    with pytest.raises(ValueError):service.result({'value':1})
    assert not service.entries
