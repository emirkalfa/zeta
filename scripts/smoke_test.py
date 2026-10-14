#!/usr/bin/env python3
"""Paketlenmiş uygulamayı (ya da app.py'yi) başlatıp temel uç noktaları dener.

    python scripts/smoke_test.py dist/release/ZETA-*.AppImage
    python scripts/smoke_test.py            # kaynak koddan: python app.py

Sunucunun açıldığını, arayüz dosyalarının pakete girdiğini, hesap uç noktalarının
çalıştığını ve masaüstü modunda sayfa kapanınca sürecin sonlandığını doğrular.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

PORT = 5791
BASE = f"http://127.0.0.1:{PORT}"
ROOT = Path(__file__).resolve().parent.parent

# Windows konsolu Türkçe karakterleri kodlayamayınca print çökmesin
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")


def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data, method="POST" if payload is not None else "GET",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.status, res.read()


def main():
    if len(sys.argv) > 1:
        cmd = [str(Path(sys.argv[1]).resolve())]
    else:
        cmd = [sys.executable, str(ROOT / "app.py")]
    cmd += ["--no-browser", "--desktop", "--port", str(PORT)]

    env = dict(os.environ, ZETA_DATA_DIR=tempfile.mkdtemp(prefix="zeta-smoke-"))
    # CI'da FUSE olmayabilir; AppImage kendini açarak çalışsın
    env.setdefault("APPIMAGE_EXTRACT_AND_RUN", "1")
    proc = subprocess.Popen(cmd, env=env)
    try:
        for _ in range(120):
            if proc.poll() is not None:
                sys.exit(f"Uygulama açılırken kapandı (çıkış kodu {proc.returncode})")
            try:
                request("/healthz")
                break
            except OSError:
                time.sleep(0.5)
        else:
            sys.exit("Uygulama 60 saniye içinde yanıt vermedi")

        expected = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
        version = json.loads(request("/api/version")[1])["version"]
        assert version == expected, f"sürüm {version}, beklenen {expected}"

        for path in ["/", "/static/js/app.js", "/static/css/style.css",
                     "/static/css/studio.css", "/static/js/help.js", "/static/js/manufacturing-help.js", "/static/references.html", "/static/zeta.ico",
                     "/static/vendor/three.min.js", "/static/vendor/fonts.css", "/static/favicon.svg"]:
            status, body = request(path)
            assert status == 200 and body, path

        html=request('/')[1].decode('utf-8')
        for feature in ['cameraMount','wingPin','wingSeatDepth','mountDetailSelect','manufacturingIssue','wingJoinMode']:
            assert f'id="{feature}"' in html, feature
        assert b'--pastel-mint' in request('/static/css/studio.css')[1]
        assert b'validateProjectFile' in request('/static/js/projects.js')[1]
        design={'format':'zeta-project','schemaVersion':1,'name':'Package test',
                'project':{'wingspan':'2.2'},'manufacturing':{'motorDiameter':42}}
        saved=json.loads(request('/api/designs',design)[1])
        assert json.loads(request('/api/designs/'+str(saved['id']))[1])==design

        profiles=json.loads(request("/api/airfoils")[1])
        assert {'0012','0015','2412','2415','4412','4415','6412'} <= {p['code'] for p in profiles}, "desteklenen NACA profilleri eksik"
        geom = json.loads(request("/api/calculate", {"wingspan": 2.0, "weight": 5.0, "airframe": "combat"})[1])
        assert geom["tail_booms"]["length"] > 0
        polars = json.loads(request("/api/analyze", {"geometry": geom})[1])
        assert polars["cl_vs_alpha"]
        mission = json.loads(request("/api/mission", {"geometry": geom, "motor_power": 1200, "battery_wh": 222})[1])
        assert mission["can_fly"]

        # Optional production request captured by check_studio_ui.py verifies
        # the real manufacturing extension and DLLs inside the frozen package.
        if len(sys.argv) > 2:
            import io, zipfile
            payload=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
            status, body=request('/api/manufacturing?mode=zip',payload)
            archive=zipfile.ZipFile(io.BytesIO(body))
            report=json.loads(archive.read('manifest.json'))
            assert status==200 and report['parts']
            if payload.get('geometry',{}).get('fuse_preset')=='vtol':
                assert len(report['motors'])==3 and len(report['vtol_joints'])==2
                assert all(f.get('blended') for f in report['wing_root_fairings'])
                assert any(p['file'].startswith('vtol_rear_clamp') for p in report['parts'])
                assert all(j['mechanism']=='compact_direct_servo' for j in report['vtol_joints'])
                if report.get('body_segment_joints'):
                    for j in report['body_segment_joints']:
                        assert len(j['holes'])==2
                        assert j['bridge']+'.stl' in archive.namelist()
                        assert all(n+'.stl' in archive.namelist() for n in j['segments'])
                assert report['carbon_boom']['purchased']
                assert any(p['file'].startswith('vtol_tail_carrier') for p in report['parts'])
                assert not any(p['file'].startswith('carbon_tail_tube') for p in report['parts'])
                for side in ['right','left']:
                    assert any(p['file'].startswith('vtol_wing_'+side+'_servo_cover') for p in report['parts'])
            if payload.get('geometry',{}).get('fuse_preset')=='vtol5':
                assert len(report['motors'])==5 and len(report['booms'])==2
                assert not report['vtol_joints']
                assert sum(m.get('out_axis')==[0,1,0] for m in report['motors'])==4
                for side in ['right','left']:
                    assert any(p['file'].startswith('vtol5_'+side+'_rail') for p in report['parts'])
            if payload.get('options',{}).get('cameraMount'):
                assert len(report['cameras'])==1
                assert len(report['cameras'][0]['holes'])==2
            for j in report.get('wing_root_braces',[]):
                assert len(j['holes'])==2
                assert all(n+'.stl' in archive.namelist() for n in [j['bridge'],*j['segments']])
            wings=[j for j in report['interfaces'] if j['part'] in ('wing_right','wing_left')]
            assert len(wings)==2 and all(j['pin_count']==1 for j in wings)
            if payload.get('options',{}).get('wingJoinMode')=='bolted':
                assert report['wing_join_mode']=='bolted' and report['wing_segment_joints']
                from collections import Counter
                totals=Counter()
                for joint in report['wing_segment_joints']:
                    totals[joint['parent'],joint['seam']]+=len(joint['holes'])
                    assert all(n+'.stl' in archive.namelist() for n in [joint['bridge'],*joint['segments']])
                assert set(totals.values())=={4}
            for part in report['parts']:
                assert all(size <= bed+.001 for size,bed in zip(part['size_mm'],report['bed_mm']))
                content=archive.read(part['file'])
                count=int.from_bytes(content[80:84],'little')
                assert len(content)==84+count*50
            print(f"Paketlenmiş üretim motoru: {len(report['parts'])} baskı parçası doğrulandı.",flush=True)

        # Masaüstü modu: sayfa kapandı bildirimi gelince süreç kendini sonlandırmalı
        assert json.loads(request("/api/heartbeat", {})[1])["desktop"] is True
        request("/api/closing", {})
        proc.wait(timeout=30)
        print(f"Tamam: ZETA {version} açıldı, hesapladı ve kendini kapattı.")
    finally:
        if proc.poll() is None:
            proc.kill()


if __name__ == "__main__":
    main()
