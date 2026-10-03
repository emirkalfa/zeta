#!/usr/bin/env sh
# ZETA'yı tek komutla başlatır: sanal ortamı kurar, bağımlılıkları yükler, tarayıcıyı açar.
set -e
cd "$(dirname "$0")"

PYTHON=${PYTHON:-python3}
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "Python 3.10+ bulunamadı. https://www.python.org/downloads/ adresinden kurun." >&2
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "Sanal ortam oluşturuluyor (.venv)…"
  "$PYTHON" -m venv .venv
fi

# requirements.txt değişmediyse kurulumu atla
if ! cmp -s requirements.txt .venv/requirements.installed 2>/dev/null; then
  echo "Bağımlılıklar yükleniyor…"
  .venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt
  cp requirements.txt .venv/requirements.installed
fi

exec .venv/bin/python app.py "$@"
