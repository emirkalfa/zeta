@echo off
rem ZETA'yi tek komutla baslatir: sanal ortami kurar, bagimliliklari yukler, tarayiciyi acar.
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.10+ bulunamadi. https://www.python.org/downloads/ adresinden kurun.
  pause
  exit /b 1
)

if not exist .venv\Scripts\python.exe (
  echo Sanal ortam olusturuluyor ^(.venv^)...
  python -m venv .venv || goto :error
)

fc /b requirements.txt .venv\requirements.installed >nul 2>nul
if errorlevel 1 (
  echo Bagimliliklar yukleniyor...
  .venv\Scripts\python -m pip install --quiet --disable-pip-version-check -r requirements.txt || goto :error
  copy /y requirements.txt .venv\requirements.installed >nul
)

.venv\Scripts\python app.py %*
exit /b %errorlevel%

:error
echo Kurulum basarisiz oldu.
pause
exit /b 1
