"""Isolated owned UI, with all requests routed to Flask test_client."""
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ['ZETA_DATA_DIR'] = tempfile.mkdtemp(prefix='zeta-save-test-')
from app import app
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    exe = next(p for p in [Path(os.environ['PROGRAMFILES'])/'Google/Chrome/Application/chrome.exe', Path(os.environ['PROGRAMFILES(X86)'])/'Microsoft/Edge/Application/msedge.exe'] if p.exists())
    browser = pw.chromium.launch(executable_path=str(exe), headless=True)
    errors = []
    def new_page():
        context = browser.new_context()
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        def route(req):
            url = urlsplit(req.request.url)
            if url.hostname != 'zeta.test':
                return req.abort()
            with app.test_client() as client:
                result = client.open(url.path, method=req.request.method, data=req.request.post_data,
                    headers={'Content-Type': req.request.headers.get('content-type', '')})
            req.fulfill(status=result.status_code, body=result.data, headers={'Content-Type': result.content_type})
        page.route('**/*', route)
        page.goto('http://zeta.test/')
        page.wait_for_function("document.querySelector('#airfoil').options.length>0")
        return page
    page = new_page()
    page.locator('#wingspan').fill('2.2')
    page.locator('label:has(input[name="mode"][value="manual"])').click()
    page.locator('#man_root_chord').fill('0.41')
    page.locator('summary', has_text='BLDC motor ve pervane montajı').click()
    page.locator('#motorDiameter').fill('42')
    page.locator('#saveProjectButton').click()
    page.wait_for_function("document.querySelector('#projectSaveStatus').textContent.includes('kaydedildi')")
    page.evaluate('store.flush()')
    fresh = new_page()
    assert fresh.locator('#wingspan').input_value() == '2.2'
    assert fresh.locator('#man_root_chord').input_value() == '0.41'
    assert fresh.locator('input[name="mode"][value="manual"]').is_checked()
    assert fresh.locator('#motorDiameter').input_value() == '42'
    fresh.locator('#projectName').fill('Deneme A')
    fresh.locator('#saveNamedProject').click()
    fresh.wait_for_function("document.querySelector('#projectLibraryStatus').textContent.includes('ayrı bir kayıt')")
    first_id = fresh.locator('#savedProjects').input_value()
    with fresh.expect_download() as download_info:
        fresh.locator('#exportProject').click()
    downloaded = download_info.value
    saved_file = downloaded.path()
    fresh.locator('#projectName').fill('Deneme B')
    fresh.locator('#wingspan').fill('1.8')
    fresh.locator('#saveNamedProject').click()
    fresh.wait_for_function("document.querySelector('#savedProjects').selectedOptions[0].textContent.includes('Deneme B')")
    fresh.locator('#savedProjects').select_option(first_id)
    with fresh.expect_navigation():
        fresh.locator('#openSavedProject').click()
    fresh.wait_for_function("document.querySelector('#projectName').value==='Deneme A'")
    assert fresh.locator('#wingspan').input_value() == '2.2'
    fresh.locator('#projectFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"oops":true}'})
    fresh.wait_for_function("document.querySelector('#projectLibraryStatus').textContent.includes('desteklenen')")
    assert fresh.locator('#wingspan').input_value() == '2.2'
    fresh.locator('#wingspan').fill('1.9')
    with fresh.expect_navigation():
        fresh.locator('#projectFile').set_input_files(saved_file)
    fresh.wait_for_function("document.querySelector('#projectName').value==='Deneme A'")
    assert fresh.locator('#wingspan').input_value() == '2.2'
    assert fresh.locator('#man_root_chord').input_value() == '0.41'
    assert fresh.locator('#motorDiameter').input_value() == '42'
    assert not errors, errors
    print('PASS: disk restore; named projects; selection; file export/import; malformed-file rejection; manual and motor settings')
    browser.close()
