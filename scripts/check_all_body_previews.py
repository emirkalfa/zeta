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
        if response.status_code>=400:print('API ERROR',url.path,response.get_data(as_text=True),flush=True)
        req.fulfill(status=response.status_code,body=response.data,headers={k:v for k,v in response.headers.items() if k.lower() not in ['content-length','transfer-encoding']})
    context.route('**/*',route)
    page=context.new_page();page.set_default_timeout(90000)
    page.on('pageerror',lambda error:(errors.append(str(error)),print('JS ERROR:',error,flush=True)))
    page.goto('http://zeta.test/');print('loaded',flush=True);page.wait_for_function("document.querySelector('#airfoil').options.length>0")
    page.locator('#calculateBtn').click()
    page.wait_for_function("!!state.geometry && !document.querySelector('#calculateBtn').disabled")
    for preset in ['atlas','seyir','akin','combat']:
        page.locator('button.sidebar-link[data-tab="fuse"]').click()
        page.locator(f'[data-preset="{preset}"]').click()
        page.wait_for_function("!document.querySelector('#calculateBtn').disabled")
        for position in ['low','mid','high']:
            page.locator('button.sidebar-link[data-tab="input"]').click()
            page.locator(f'input[name="wing_pos"][value="{position}"]').check(force=True)
            page.wait_for_function("p=>state.geometry.wing_position===p && !document.querySelector('#calculateBtn').disabled",arg=position)
            page.wait_for_function("document.querySelector('#fusePreviewStatus').textContent.includes('STL ile aynı')",timeout=120000)
            page.locator('button.sidebar-link[data-tab="fuse"]').click()
            page.locator('#fuseShowAircraft').check()
            result=page.evaluate("""()=>{
                const actual=fuseViewerGroup.children.filter(m=>m.userData.partName);
                const parts=manufacturingResult.parts;
                return {preset:state.geometry.fuse_preset,position:state.geometry.wing_position,
                    matches:actual.length===parts.length&&actual.every(m=>{
                        const p=parts.find(p=>p.name===m.userData.partName);
                        return p&&p.faces.length===m.geometry.index.count&&p.vertices.length===m.geometry.attributes.position.array.length;
                    }),pins:manufacturingResult.manifest.interfaces.filter(j=>j.part.startsWith('wing_')).map(j=>j.pin_count)};
            }""")
            assert result['preset']==preset and result['position']==position,result
            assert result['matches'] and result['pins']==[1,1],result
            print(preset,position,'real STL meshes and pins PASS',flush=True)
            if position=='high':page.screenshot(path=str(OUT/f'15-{preset}-production.png'))
    assert not errors,errors
    browser.close()
