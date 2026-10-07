"""Offline browser QA: render owned sources; API requests use Flask test_client.
No local HTTP server, external network, or user browser profile is used.
"""
from pathlib import Path
import json,sys,os
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import app
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parents[1]/'outputs'/'studio-qa';OUT.mkdir(parents=True,exist_ok=True)
errors=[]
with sync_playwright() as pw:
    browser_path=next(p for p in [Path(os.environ.get('PROGRAMFILES',''))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'] if p.exists())
    browser=pw.chromium.launch(executable_path=str(browser_path),headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1,accept_downloads=True)
    def route(req):
        from urllib.parse import urlsplit
        url=urlsplit(req.request.url)
        if url.hostname!='zeta.test':return req.abort()
        if url.path=='/api/manufacturing':
            (OUT/'production-request.json').write_text(req.request.post_data,encoding='utf-8')
        with app.test_client() as client:
            response=client.open(url.path+('?' +url.query if url.query else ''),method=req.request.method,data=req.request.post_data,headers={'Content-Type':req.request.headers.get('content-type','')})
        req.fulfill(status=response.status_code,body=response.data,headers={k:v for k,v in response.headers.items() if k.lower() not in ['content-length','transfer-encoding']})
    context.route('**/*',route)
    page=context.new_page();page.set_default_timeout(90000)
    page.on('pageerror',lambda error:(errors.append(str(error)),print('JS ERROR:',error,flush=True)))
    page.goto('http://zeta.test/');print('loaded',flush=True);page.wait_for_function("document.querySelector('#airfoil').options.length>0")
    page.screenshot(path=str(OUT/'01-parametreler.png'),full_page=True)
    print('initial screenshot',flush=True)
    assert page.locator('.info-dot').count()>60
    page.get_by_role('button',name='Kanat açıklığı hakkında bilgi',exact=True).click()
    page.locator('#infoDialog').wait_for(state='visible')
    assert 'NASA' in page.locator('#infoSources').inner_text()
    page.screenshot(path=str(OUT/'02-bilgi.png'))
    page.keyboard.press('Escape');assert not page.locator('#infoDialog').is_visible()
    print('invalid fields',page.locator('#paramForm :invalid').evaluate_all('(nodes)=>nodes.map(n=>({id:n.id,value:n.value,message:n.validationMessage}))'),flush=True)
    page.locator('#calculateBtn').click()
    page.wait_for_function("document.querySelector('.tab-pane.active').dataset.tab==='results' || !document.querySelector('#formError').hidden")
    assert not page.locator('#formError').is_visible(),page.locator('#formError').inner_text()
    print('calculated',flush=True)
    page.locator('button.sidebar-link[data-tab="charts"]').click()
    page.wait_for_function("Object.keys(charts).length>=5")
    page.screenshot(path=str(OUT/'03-grafikler.png'),full_page=True)
    page.locator('button.sidebar-link[data-tab="viewer"]').click()
    page.wait_for_function("document.querySelector('#modelPreviewStatus').textContent.includes('STL ile aynı')",timeout=120000)
    page.screenshot(path=str(OUT/'04-model.png'))
    page.locator('button.sidebar-link[data-tab="stl"]').click()
    with page.expect_download(timeout=120000) as download:
        page.locator('#manufacturingDownload').click()
    item=download.value;item.save_as(str(OUT/item.suggested_filename))
    page.screenshot(path=str(OUT/'05-stl.png'),full_page=True)
    page.locator('button.sidebar-link[data-tab="input"]').click()
    page.locator('#darkToggle').click()
    page.screenshot(path=str(OUT/'07-koyu-tema.png'),full_page=True)
    page.locator('#darkToggle').click()
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(OUT/'06-mobil.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    print(json.dumps({'js_errors':errors,'help_buttons':page.locator('.info-dot').count(),'zip':item.suggested_filename,'screenshots':str(OUT)},ensure_ascii=False))
    assert not errors,errors
    browser.close()
