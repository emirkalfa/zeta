#!/usr/bin/env python3
"""Bir sürümün CHANGELOG.md bölümünü yazdırır; sürüm yayına hazır değilse hata verir.

    python scripts/release_notes.py v2.1.0

Kontroller: etiket VERSION dosyasıyla aynı mı, CHANGELOG'da bu sürümün dolu bir bölümü var mı.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Windows konsolu Türkçe karakterleri kodlayamayınca print çökmesin
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")


def section(changelog, version):
    match = re.search(rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|^\[[^\]]+\]: |\Z)",
                      changelog, re.S | re.M)
    return match.group(1).strip() if match else None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    version = sys.argv[1].removeprefix("v")
    in_file = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if version != in_file:
        sys.exit(f"HATA: etiket v{version}, VERSION dosyası {in_file}. "
                 "Önce scripts/bump_version.py ile sürümü yükseltin.")
    notes = section((ROOT / "CHANGELOG.md").read_text(encoding="utf-8"), version)
    if not notes:
        sys.exit(f"HATA: CHANGELOG.md içinde '## [{version}]' bölümü yok ya da boş.")
    print(notes)


if __name__ == "__main__":
    main()
