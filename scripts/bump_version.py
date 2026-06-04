#!/usr/bin/env python3
"""Bump ZETA VERSION and prepend a new section to CHANGELOG.md.

Usage:
    python scripts/bump_version.py patch
    python scripts/bump_version.py minor
    python scripts/bump_version.py major
    python scripts/bump_version.py 0.3.0
"""
import datetime
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"
CHANGELOG = ROOT / "CHANGELOG.md"

SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$")


def read_version() -> tuple[int, int, int, str]:
    raw = VERSION_FILE.read_text(encoding="utf-8").strip()
    m = SEMVER_RE.match(raw)
    if not m:
        print(f"HATA: VERSION dosyasi gecersiz: {raw!r}", file=sys.stderr)
        sys.exit(1)
    major, minor, patch, pre = m.groups()
    return int(major), int(minor), int(patch), pre or ""


def write_version(major: int, minor: int, patch: int, pre: str) -> None:
    new = f"{major}.{minor}.{patch}" + (f"-{pre}" if pre else "")
    VERSION_FILE.write_text(new + "\n", encoding="utf-8")
    print(f"VERSION guncellendi: {new}")


def bump(current: tuple[int, int, int, str], level: str) -> tuple[int, int, int, str]:
    major, minor, patch, pre = current
    if level == "major":
        return major + 1, 0, 0, ""
    if level == "minor":
        return major, minor + 1, 0, ""
    if level == "patch":
        return major, minor, patch + 1, ""
    print(f"HATA: bilinmeyen seviye: {level}", file=sys.stderr)
    sys.exit(1)


def update_changelog(old: str, new: str) -> None:
    text = CHANGELOG.read_text(encoding="utf-8")
    today = datetime.date.today().isoformat()
    if not text:
        text = "# Changelog\n\n"
    replacement = (
        f"## [Unreleased]\n\n"
        f"## [{new}] - {today}\n"
    )
    if "## [Unreleased]" in text:
        text = text.replace("## [Unreleased]\n\n", replacement, 1)
    else:
        text = text + f"\n## [{new}] - {today}\n"
    CHANGELOG.write_text(text, encoding="utf-8")
    print(f"CHANGELOG.md guncellendi (yeni: {new})")


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    arg = sys.argv[1]
    current = read_version()
    old_str = (
        f"{current[0]}.{current[1]}.{current[2]}"
        + (f"-{current[3]}" if current[3] else "")
    )

    if arg in ("major", "minor", "patch"):
        new = bump(current, arg)
        new_str = (
            f"{new[0]}.{new[1]}.{new[2]}" + (f"-{new[3]}" if new[3] else "")
        )
    elif SEMVER_RE.match(arg):
        m = SEMVER_RE.match(arg)
        new = (int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4) or "")
        new_str = arg
    else:
        print(f"HATA: gecersiz arguman: {arg}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)

    write_version(*new)
    update_changelog(old_str, new_str)

    print()
    print(f"  Eski: {old_str}")
    print(f"  Yeni: {new_str}")
    print()
    print("Sonraki adimlar:")
    print(f"  1. CHANGELOG.md'i duzenle (Unreleased bolumunu doldur)")
    print(f"  2. git add VERSION CHANGELOG.md")
    print(f"  3. git commit -m 'release: v{new_str}'")
    print(f"  4. git tag -a v{new_str} -m 'Release v{new_str}'")
    print(f"  5. git push origin main --tags")


if __name__ == "__main__":
    main()
