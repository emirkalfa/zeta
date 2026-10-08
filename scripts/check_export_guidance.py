"""Browser regression for failed ZIP explanations, links, and pastel layout."""
import os, sys, json
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from app import app
from playwright.sync_api import sync_playwright
OUT=ROOT.parents[1]/'outputs'/'studio-qa'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    exe=next(p for p in [Path(os.environ.get('PROGRAMFILES',''))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'] if p.exists())
    browser=pw.chromium.launch(executable_path=str(exe),headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];downloads=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('download',lambda d:downloads.append(d))
    def route(req):
        url=urlsplit(req.request.url)
        if url.hostname!='zeta.test':return req.abort()
        if url.path=='/api/manufacturing':
            return req.fulfill(status=400,content_type='application/json',body=json.dumps({'error':'Yazıcı hacmi bu parçayı bölmek için çok küçük.'}))
        with app.test_client() as c:
            response=c.open(url.path,method=req.request.method,data=req.request.post_data,headers={'Content-Type':req.request.headers.get('content-type','')})
        req.fulfill(status=response.status_code,body=response.data,headers={'Content-Type':response.content_type})
    page.route('**/*',route)
    page.goto('http://zeta.test/')
    page.wait_for_function("document.querySelector('#airfoil').options.length>0")
    page.locator('#calculateBtn').click()
    page.wait_for_function("!!state.geometry")
    for width in [1440,768,390,320]:
        page.set_viewport_size({'width':width,'height':1000})
        page.locator('button.sidebar-link[data-tab="results"]').click()
        assert page.locator('#results-grid .spec-group').evaluate_all('''cards=>cards.every(card=>{
            const box=card.getBoundingClientRect();
            return [...card.querySelectorAll('h3,dt,dd')].every(el=>{
                const r=el.getBoundingClientRect();
                return r.left>=box.left+12 && r.right<=box.right-12 && el.scrollWidth<=el.clientWidth+1;
            });
        })'''),f'result card padding/overflow at {width}'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        if width in [1440,390]:page.screenshot(path=str(OUT/f'14-results-{width}.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('button.sidebar-link[data-tab="stl"]').click()
    page.locator('#manufacturingDownload').click()
    issue=page.locator('#manufacturingIssue');issue.wait_for(state='visible')
    assert issue.locator('li').count()==2
    assert 'gerçek' in issue.inner_text()
    assert not downloads
    page.screenshot(path=str(OUT/'12-zip-yardim.png'),full_page=True)
    issue.get_by_role('button',name='İlgili ayara git').first.click()
    assert page.locator('#printBedX').evaluate('(e)=>e===document.activeElement')
    # Parameter tab links must also activate their tab and expand the control.
    page.evaluate("showManufacturingIssue('Kamera derinliği burun ile kanat arasına sığmıyor.');switchTab('stl')")
    issue.get_by_role('button',name='İlgili ayara git').first.click()
    assert page.locator('#cameraDepth').evaluate('(e)=>e===document.activeElement')
    assert page.locator('.tab-pane.active').get_attribute('data-tab')=='input'
    page.evaluate("showManufacturingIssue('')")
    assert issue.is_hidden()
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(OUT/'13-pastel-mobil.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    print('ZIP guidance, field links, no failed download, clearing and mobile overflow: PASS',flush=True)
    browser.close()
