"""Read-only dimensional audit. Independent quadrature on actual JS panel layouts."""
import csv,itertools,json,math,os,subprocess,sys,tempfile
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
os.environ['ZETA_DATA_DIR']=tempfile.mkdtemp(prefix='zeta-dimension-audit-')
from backend.geometry import calculate_geometry
from backend.airfoil import get_airfoil_properties
from backend.stability import flight_test
from backend.manufacturing import generate,printable_parts,ManufacturingError
from tests.test_manufacturing import request_data
from database.seed import naca_4_digit_coordinates
OUT=ROOT/'outputs'/('geometry-audit-'+(ROOT/'VERSION').read_text().strip());OUT.mkdir(parents=True,exist_ok=True)
cases=[]
for preset,span,shape,tail,pos in itertools.product(
    ['atlas','seyir','akin','combat','vtol5'],[1.,1.5,2.,3.],
    ['rectangular','tapered','ste_tapered'],['conventional','ttail','vtail'],['low','mid','high']):
    g=calculate_geometry(span,2.5,'2412',wing_shape=shape,tail_type=tail,wing_position=pos,
                         airframe='combat' if preset in ('combat','vtol5') else 'standard')
    g.update(fuse_preset=preset,fuse_width_scale=1.,fuse_height_scale=1.)
    cases.append(g)
for span,shape,tail in itertools.product([1.,1.5,2.,3.],['rectangular','tapered','ste_tapered'],['conventional','ttail','vtail']):
    g=calculate_geometry(span,2.5,'2412',wing_shape=shape,tail_type=tail,airframe='vtol_fixed')
    g.update(fuse_preset='vtol',fuse_width_scale=1.,fuse_height_scale=1.);cases.append(g)
script=r'''const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js'),window:{addEventListener(){}}});for(const f of ['fuselage.js','assembly.js'])vm.runInContext(fs.readFileSync('./static/js/'+f,'utf8'),c);const inputs=JSON.parse(fs.readFileSync(0,'utf8'));const out=inputs.map(g=>{c.g=g;return vm.runInContext(`(()=>{const rs=libraryFuselageSections(g).sections;syncWingPlacement(g,rs);const p=aircraftPanelSpecs(g,[],[],[]);const v=rs.flat();return {panels:p,body_bounds:[...['x','y','z'].map(a=>Math.min(...v.map(p=>p[a]))),...['x','y','z'].map(a=>Math.max(...v.map(p=>p[a])))]};})()`,c)});console.log(JSON.stringify(out));'''
run=subprocess.run(['node','-e',script],input=json.dumps(cases),capture_output=True,text=True,check=True,cwd=ROOT)
layouts=json.loads(run.stdout)

def measures(p):
    a,b=np.asarray(p['root']),np.asarray(p['tip']);cr,ct=p['chord'],p['tipChord']
    eta=np.linspace(0,1,4001);ch=cr+(ct-cr)*eta
    # Physical thin-surface area is chord times span perpendicular to chord;
    # streamwise sweep must not be counted as extra span.
    span=math.hypot(b[1]-a[1],b[2]-a[2])
    area=float(np.trapezoid(ch,eta)*span)
    ac=float(np.trapezoid(ch*(a[0]+(b[0]-a[0])*eta+.25*ch),eta)/np.trapezoid(ch,eta))
    mac=float(np.trapezoid(ch*ch,eta)/np.trapezoid(ch,eta))
    return area,ac,mac

rows=[]
for g,layout in zip(cases,layouts):
    wings=[p for p in layout['panels'] if p['kind']=='wing']
    tails=[p for p in layout['panels'] if p['kind']=='tail']
    wp=[measures(p) for p in wings]
    s=sum((p['chord']+p['tipChord'])*abs(p['tip'][2]-p['root'][2])/2 for p in wings)
    wac=sum(a*x for a,x,_ in wp)/sum(a for a,_,_ in wp)
    wmac=sum(a*m for a,_,m in wp)/sum(a for a,_,_ in wp)
    hpan=[p for p in tails if not p['name'].startswith('tail_vertical')]
    vpan=[p for p in tails if p['name'].startswith('tail_vertical')]
    hp=[measures(p) for p in hpan];vp=[measures(p) for p in vpan]
    sh=sum(a for a,_,_ in hp);sv=sum(a for a,_,_ in vp)
    hax=sum(a*x for a,x,_ in hp)/sh;lh=hax-wac
    if g['tail_type']=='vtail':
        sv=sh*math.sin(math.radians(35))**2;sh*=math.cos(math.radians(35))**2
        lv=lh
    else:lv=sum(a*x for a,x,_ in vp)/sv-wac
    bounds=np.asarray(layout['body_bounds']);dims=bounds[3:]-bounds[:3]
    rows.append(dict(preset=g['fuse_preset'],span_m=g['wingspan'],shape=g['wing_shape'],
        tail=g['tail_type'],position=g['wing_position'],weight_kg=g['weight'],
        reported_wing_area_m2=g['wing_area'],panel_projected_wing_area_m2=s,
        wing_area_error_pct=100*(g['wing_area']/s-1),
        reported_mac_m=g['mac'],panel_mac_m=wmac,mac_error_pct=100*(g['mac']/wmac-1),
        reported_wing_ac_m=g['wing_ac_x'],panel_wing_ac_m=wac,
        sizing_le_arm_m=g['htail_arm'],reported_effective_arm_m=g['effective_tail_arm'],
        panel_horizontal_arm_m=lh,panel_vertical_arm_m=lv,
        horizontal_arm_error_mm=1000*(g['effective_tail_arm']-lh),
        horizontal_effective_area_m2=sh,vertical_effective_area_m2=sv,
        realized_vh=sh*lh/(s*wmac),realized_vv=sv*lv/(s*g['wingspan']),
        vh_target=g.get('tail_sizing_targets',{}).get('horizontal',.70),
        vv_target=g.get('tail_sizing_targets',{}).get('vertical',.045),
        body_layout_length_m=g['fuselage_length'],body_loft_length_m=dims[0],
        body_loft_width_m=dims[2],body_loft_height_m=dims[1],
        htail_span_m=g['htail_span'],vtail_span_m=g['vtail_span']))
with (OUT/'dimension-matrix.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
summary={'version':(ROOT/'VERSION').read_text().strip(),'cases':len(rows),
    'max_wing_area_error_pct':max(abs(r['wing_area_error_pct']) for r in rows),
    'max_mac_error_pct':max(abs(r['mac_error_pct']) for r in rows),
    'max_horizontal_arm_error_mm':max(abs(r['horizontal_arm_error_mm']) for r in rows),
    'vh_ranges':{},'vv_ranges':{},'mass_response':[],'native_samples':[]}
for preset in ['atlas','seyir','akin','combat','vtol5','vtol']:
    group=[r for r in rows if r['preset']==preset]
    summary['vh_ranges'][preset]=[min(r['realized_vh'] for r in group),max(r['realized_vh'] for r in group)]
    summary['vv_ranges'][preset]=[min(r['realized_vv'] for r in group),max(r['realized_vv'] for r in group)]
for mass in [1.,2.5,4.,6.]:
    g=calculate_geometry(1.5,mass,'2412',wing_shape='tapered')
    prop=get_airfoil_properties('2412',Re=200000)
    test=flight_test(g,prop,get_airfoil_properties('0012',Re=200000))
    summary['mass_response'].append({'mass_kg':mass,'wing_area_m2':g['wing_area'],
        'body_length_m':g['fuselage_length'],'tail_area_m2':g['htail_area'],
        'loading_kg_m2':mass/g['wing_area'],'estimated_stall_ms':test['stall_speed'],
        'CLmax_assumed':prop['cl_max']})
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print('MATRIX',json.dumps(summary,ensure_ascii=False),flush=True)
if '--matrix-only' in sys.argv:sys.exit(0)
cs=tuple([{'x':x,'y_upper':max(0,y),'y_lower':min(0,y)} for x,y in naca_4_digit_coordinates(code)] for code in ['2412','0012'])
for preset,span,shape,tail in [('atlas',1.5,'tapered','conventional'),('seyir',1.5,'tapered','ttail'),
    ('akin',1.5,'ste_tapered','vtail'),('combat',1.5,'ste_tapered','conventional'),
    ('vtol',2.,'ste_tapered','vtail'),('vtol5',1.5,'ste_tapered','conventional')]:
    g=calculate_geometry(span,4 if preset=='vtol' else 2.5,'2412',wing_shape=shape,tail_type=tail,
        airframe='vtol_fixed' if preset=='vtol' else 'combat' if preset in ('combat','vtol5') else 'standard')
    data=request_data(cs,preset=preset,geometry=g)
    parts,manifest,rings=generate(data)
    body=next(p for p in parts if p.name=='body');b=np.asarray(body.solid.bounding_box())/1000
    sample={'preset':preset,'span_m':span,'layout_length_m':g['fuselage_length'],
        'assembled_body_bounds_m':b.tolist(),'assembled_body_length_m':float(b[3]-b[0]),
        'printed_main_pod_end_m':(manifest.get('carbon_boom') or {}).get('body_end_mm',0)/1000 or None,
        'wing_root_blend_lengths_m':[j['blend_length_mm']/1000 for j in manifest['wing_root_fairings']]}
    summary['native_samples'].append(sample);print('NATIVE',json.dumps(sample),flush=True)
    if preset=='vtol':
        printed=printable_parts(parts,manifest,rings)
        body_parts=[p for p in printed if p.name.startswith('body')]
        sample['printed_body_bounds_m']=[min(p.assembled.bounding_box()[i]/1000 for p in body_parts) for i in range(3)]+[max(p.assembled.bounding_box()[i]/1000 for p in body_parts) for i in range(3,6)]
stress=calculate_geometry(3.,4.,'2412',wing_shape='ste_tapered',tail_type='vtail',airframe='vtol_fixed')
try:
    generate(request_data(cs,preset='vtol',geometry=stress))
    summary['tria_3m_stress']={'generated':True}
except ManufacturingError as exc:
    summary['tria_3m_stress']={'generated':False,'error':str(exc)}
print('STRESS',json.dumps(summary['tria_3m_stress'],ensure_ascii=False),flush=True)
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: read-only dimensional audit; application/project files unchanged',flush=True)
