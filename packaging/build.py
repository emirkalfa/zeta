#!/usr/bin/env python3
"""ZETA'yı çalıştırılabilir masaüstü uygulaması olarak paketler.

    python packaging/build.py

Bulunulan işletim sistemine göre dist/release/ altında şunu üretir:
    Linux    ZETA-<sürüm>-linux-x86_64.AppImage
    Windows  ZETA-<sürüm>-windows-x64.exe
    macOS    ZETA-<sürüm>-macos-<mimari>.zip  (içinde ZETA.app)

Gereksinim: pip install -e ".[build]"
"""
import os
import platform
import shutil
import stat
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGING = ROOT / "packaging"
BUILD = ROOT / "build"
DIST = ROOT / "dist"
RELEASE = DIST / "release"
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()

APPIMAGETOOL_URL = (
    "https://github.com/AppImage/appimagetool/releases/download/continuous/"
    "appimagetool-{arch}.AppImage"
)


def run(cmd, **kwargs):
    print("+", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def make_icon(kind):
    """icon.png'den Windows (.ico) ya da macOS (.icns) simgesi üretir."""
    from PIL import Image

    BUILD.mkdir(exist_ok=True)
    out = BUILD / f"icon.{kind}"
    Image.open(PACKAGING / "icon.png").save(out)
    return out


def pyinstaller(onefile, icon=None):
    sep = os.pathsep
    cmd = [
        sys.executable, "-m", "PyInstaller", ROOT / "app.py",
        "--name", "ZETA", "--noconfirm", "--clean",
        "--onefile" if onefile else "--onedir",
        # Konsol penceresi açılmaz; uygulama tarayıcı sekmesi kapanınca kendini kapatır
        "--windowed",
        "--distpath", DIST, "--workpath", BUILD / "pyinstaller", "--specpath", BUILD,
        "--add-data", f"{ROOT / 'templates'}{sep}templates",
        "--add-data", f"{ROOT / 'static'}{sep}static",
        "--add-data", f"{ROOT / 'database' / 'schema.sql'}{sep}database",
        "--add-data", f"{ROOT / 'VERSION'}{sep}.",
        "--hidden-import", "database.seed",
        "--exclude-module", "tkinter", "--exclude-module", "pytest",
    ]
    if icon:
        cmd += ["--icon", icon]
    if sys.platform == "darwin":
        cmd += ["--osx-bundle-identifier", "com.zeta.aircraftdesigner"]
    run(cmd, cwd=ROOT)


def build_windows():
    pyinstaller(onefile=True, icon=make_icon("ico"))
    out = RELEASE / f"ZETA-{VERSION}-windows-x64.exe"
    shutil.copy2(DIST / "ZETA.exe", out)
    return out


def build_macos():
    pyinstaller(onefile=False, icon=make_icon("icns"))
    arch = "arm64" if platform.machine() == "arm64" else "x64"
    out = RELEASE / f"ZETA-{VERSION}-macos-{arch}.zip"
    # ditto, .app içindeki sembolik bağları ve izinleri korur
    run(["ditto", "-c", "-k", "--keepParent", DIST / "ZETA.app", out])
    return out


def build_linux():
    pyinstaller(onefile=False)
    arch = platform.machine()
    appdir = BUILD / "ZETA.AppDir"
    shutil.rmtree(appdir, ignore_errors=True)
    shutil.copytree(DIST / "ZETA", appdir / "usr" / "lib" / "zeta", symlinks=True)
    shutil.copy2(PACKAGING / "zeta.desktop", appdir / "zeta.desktop")
    shutil.copy2(PACKAGING / "icon.png", appdir / "zeta.png")
    shutil.copy2(PACKAGING / "icon.png", appdir / ".DirIcon")
    apprun = appdir / "AppRun"
    apprun.write_text('#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/usr/lib/zeta/ZETA" "$@"\n')
    apprun.chmod(0o755)

    tool = BUILD / f"appimagetool-{arch}.AppImage"
    if not tool.exists():
        print("appimagetool indiriliyor…", flush=True)
        urllib.request.urlretrieve(APPIMAGETOOL_URL.format(arch=arch), tool)
        tool.chmod(tool.stat().st_mode | stat.S_IXUSR)

    out = RELEASE / f"ZETA-{VERSION}-linux-{arch}.AppImage"
    # CI ortamlarında FUSE bulunmadığı için araç kendini açarak çalıştırılır
    env = {**os.environ, "ARCH": arch, "APPIMAGE_EXTRACT_AND_RUN": "1"}
    run([tool, "--no-appstream", appdir, out], env=env)
    return out


def main():
    RELEASE.mkdir(parents=True, exist_ok=True)
    builders = {"win32": build_windows, "darwin": build_macos, "linux": build_linux}
    if sys.platform not in builders:
        sys.exit(f"Desteklenmeyen platform: {sys.platform}")
    out = builders[sys.platform]()
    print(f"\nHazır: {out}  ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
