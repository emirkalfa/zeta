#!/usr/bin/env python3
"""Paketlenmiş uygulamayı (ya da app.py'yi) başlatıp temel uç noktaları dener.

    python scripts/smoke_test.py dist/release/ZETA-1.3.3-linux-x86_64.AppImage
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
    with urllib.request.urlopen(req, timeout=10) as res:
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
                     "/static/vendor/three.min.js", "/static/vendor/fonts.css", "/static/favicon.svg"]:
            status, body = request(path)
            assert status == 200 and body, path

        assert len(json.loads(request("/api/airfoils")[1])) >= 8, "profil veritabanı boş"
        geom = json.loads(request("/api/calculate", {"wingspan": 2.0, "weight": 5.0, "airframe": "combat"})[1])
        assert geom["tail_booms"]["length"] > 0
        polars = json.loads(request("/api/analyze", {"geometry": geom})[1])
        assert polars["cl_vs_alpha"]
        mission = json.loads(request("/api/mission", {"geometry": geom, "motor_power": 1200, "battery_wh": 222})[1])
        assert mission["can_fly"]

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
