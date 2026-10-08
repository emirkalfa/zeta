"""Owned UI regression: icon rail, tooltips, dark grey theme, responsive layout.

Requests are routed to Flask test_client in a fresh test browser profile.
No user browser, external network or live local server is accessed.
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from app import app
from playwright.sync_api import sync_playwright

OUT=ROOT.parents[1]/'outputs'/'compact-ui'
OUT.mkdir(parents=True,exist_ok=True)

with sync_playwright() as pw:
    executable=next(p for p in [Path(os.environ.get('PROGRAMFILES',''))/'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'] if p.exists())
    browser=pw.chromium.launch(executable_path=str(executable),headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.set_default_timeout(30000)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(req):
        url=urlsplit(req.request.url)
        if url.hostname!='zeta.test':return req.abort()
        if url.path=='/api/manufacturing':
            return req.fulfill(status=400,content_type='application/json',
                body=json.dumps({'error':'Önizleme bu arayüz testinde çalıştırılmıyor.'}))
        with app.test_client() as client:
            result=client.open(url.path+('?' +url.query if url.query else ''),method=req.request.method,
                data=req.request.post_data,headers={'Content-Type':req.request.headers.get('content-type','')})
        req.fulfill(status=result.status_code,body=result.data,headers={'Content-Type':result.content_type})
    page.route('**/*',route)
    page.goto('http://zeta.test/')
    page.wait_for_function("document.querySelector('#airfoil').options.length>0")
    page.evaluate('()=>document.fonts.ready')
    assert page.locator('.sidebar-link').count()==8
    assert page.locator('#sidebar').bounding_box()['width']==76
    assert page.locator('.nav-label').evaluate_all('nodes=>nodes.every(n=>n.getBoundingClientRect().width===1)')
    assert page.locator('.sidebar-link i').evaluate_all('nodes=>nodes.every(n=>getComputedStyle(n,"::before").content!=="none")')
    page.locator('.sidebar-item').nth(1).hover()
    assert page.locator('#navTooltip').inner_text()=='Ölçüler, ilk hesaplamadan sonra açılır'
    page.keyboard.press('Escape');assert not page.locator('#navTooltip').is_visible()
    page.locator('.sidebar-link[data-tab="input"]').focus()
    assert page.locator('#navTooltip').inner_text()=='Parametreler'
    page.screenshot(path=str(OUT/'01-light-icon-menu.png'))
    page.locator('#darkToggle').click()
    assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(36, 37, 40)'
    assert page.locator('#darkToggle').get_attribute('aria-label')=='Açık temaya geç'
    page.locator('#calculateBtn').click()
    page.wait_for_function("!!state.geometry && !document.querySelector('#calculateBtn').disabled")
    for tab in ['results','viewer','fuse','charts','flight','mission','stl','input']:
        button=page.locator(f'.sidebar-link[data-tab="{tab}"]')
        button.click()
        assert button.get_attribute('aria-current')=='page'
        assert button.evaluate("n=>getComputedStyle(n).backgroundColor")== 'rgb(198, 225, 212)'
        assert button.locator('i').evaluate("n=>getComputedStyle(n).color")== 'rgb(37, 53, 45)'
        assert page.locator('.tab-pane.active').get_attribute('data-tab')==tab
        assert '—' not in page.locator('.tab-pane.active').inner_text(),tab
    page.locator('.sidebar-link[data-tab="results"]').click()
    page.screenshot(path=str(OUT/'02-dark-pastel-results.png'))
    page.locator('.sidebar-link[data-tab="input"]').click()
    page.locator('.sidebar-link[data-tab="viewer"]').hover()
    assert page.locator('#navTooltip').inner_text()=='3D model'
    page.screenshot(path=str(OUT/'03-dark-icon-menu.png'))
    for width in [768,390,320]:
        page.set_viewport_size({'width':width,'height':1000})
        if page.evaluate('document.documentElement.scrollWidth>innerWidth'):
            page.screenshot(path=str(OUT/f'overflow-{width}.png'),full_page=True)
            print('OVERFLOW',width,page.evaluate("()=>[...document.querySelectorAll('body *')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)&&getComputedStyle(n).position!=='absolute'}).map(n=>({tag:n.tagName,id:n.id,cls:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right})).slice(0,25)"),flush=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.locator('.sidebar-link[data-tab="stl"]').hover()
        box=page.locator('#navTooltip').bounding_box()
        assert box['x']>=7 and box['x']+box['width']<=width-7
        assert box['y']>=7 and box['y']+box['height']<=1000-7
        if width==390:page.screenshot(path=str(OUT/'04-dark-mobile.png'))
    page.reload()
    page.wait_for_function("document.querySelector('#airfoil').options.length>0")
    assert page.evaluate('document.documentElement.dataset.theme')=='dark'
    assert not errors,errors
    print(json.dumps({'status':'passed','js_errors':errors,'widths':[1440,768,390,320],
        'tooltips':'hover, disabled items, keyboard focus, Escape, viewport bounds',
        'theme':'dark grey; pastel; saved after reload','screenshots':str(OUT)},ensure_ascii=False),flush=True)
    browser.close()
