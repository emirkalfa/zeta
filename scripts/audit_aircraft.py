"""Reproducible standard-aircraft audit; requires dev dependencies and Node.js.
Run: python scripts/audit_aircraft.py --output PATH
Geometry/STL validity is not an airworthiness finding.
"""
import argparse,csv,io,itertools,json,sys,zipfile
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'tests')]
from app import app
from backend.geometry import calculate_geometry
from backend.airfoil import get_airfoil_properties
from backend.analysis import calculate_polars,lifting_line_analysis
from backend.stability import flight_test
from backend.mission import mission_performance
from backend.manufacturing import generate,package,printable_parts
from test_manufacturing import request_data,assert_stl

def write_csv(path,rows):
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True)
    args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    c=app.test_client();airfoils=c.get('/api/airfoils').json
    def coords(code):return c.get('/api/airfoil/'+str(next(a['id'] for a in airfoils if a['code']==code))).json['coordinates']
    co=(coords('2412'),coords('0012'));geometry=[];scenarios=[];polar_checks=[]
    # Seven supported four-digit profiles, all three wing planforms, three Re values.
    for code,shape,re in itertools.product([a['code'] for a in airfoils],['rectangular','tapered','ste_tapered'],[100000,200000,500000]):
        g=calculate_geometry(1.5,1.2,code,wing_shape=shape);p=get_airfoil_properties(code,re)
        results=lifting_line_analysis(g,p,n_stations=80)
        r=next(r for r in results if r['alpha']==5)
        d=r['lift_distribution'];integral=np.trapezoid([v['cl_local']*v['chord'] for v in d],[v['y'] for v in d])/g['wing_area']
        error=abs(integral-r['CL'])/max(abs(r['CL']),1e-9)
        finite=all(np.isfinite([r['CL'],r['CD'],r['Cm'],r['CL_CD']]).all() for r in results)
        polar_checks.append(dict(profile=code,wing=shape,Re=re,lift_conservation_error_pct=error*100,finite=finite,
                                 accepted=bool(finite and error<.02),experimental_validation=False))
    write_csv(out/'polar-kontrolleri.csv',polar_checks)
    designs=list(itertools.product(['atlas','seyir','akin'],['rectangular','tapered','ste_tapered'],['conventional','ttail','vtail'],['low','mid','high']))
    for n,(body,shape,tail,pos) in enumerate(designs,1):
        data=request_data(co,tail,preset=body,wing_shape=shape)
        g=calculate_geometry(1.5,1.2,'2412',tail_type=tail,wing_shape=shape,wing_position=pos)
        g.update(fuse_preset=body,fuse_width_scale=1.,fuse_height_scale=1.)
        # Frontend recomputes body rings and panel placement from the same geometry.
        import subprocess
        script="""const fs=require('fs'),vm=require('vm');const c=vm.createContext({THREE:require('./static/vendor/three.min.js'),window:{addEventListener(){}}});for(const f of ['fuselage.js','assembly.js'])vm.runInContext(fs.readFileSync('./static/js/'+f,'utf8'),c);Object.assign(c,JSON.parse(fs.readFileSync(0,'utf8')));console.log(JSON.stringify(vm.runInContext('({geometry:g,panels:aircraftPanelSpecs(g,w,h,h),fuselage:libraryFuselageSections(g).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000]))})',c)));"""
        result=subprocess.run(['node','-e',script],input=json.dumps({'g':g,'w':co[0],'h':co[1]}),text=True,capture_output=True,cwd=ROOT,check=True)
        payload=json.loads(result.stdout);payload['options']=data['options']
        row=dict(body=body,wing=shape,tail=tail,position=pos,geometry_ok=False,stl_ok=False,
                 part_count=0,material_volume_cm3=0,interface_overlap_mm3=0,slice_overlap_mm3=0,error='')
        try:
            parts,report,rings=generate(payload);named={p.name:p.solid for p in parts}
            overlaps=[(named[j['parent']]^named[j['part']]).volume() for j in report['interfaces'] if j['parent'] in named]
            row['interface_overlap_mm3']=max(overlaps,default=0)
            row['geometry_ok']=row['interface_overlap_mm3']<.1
            slices=printable_parts([p for p in parts if p.name=='body'],report,rings)
            row['slice_overlap_mm3']=max(((a.assembled^b.assembled).volume() for a,b in zip(slices,slices[1:])),default=0)
            archive=zipfile.ZipFile(io.BytesIO(package(parts,report,rings)))
            for filename in archive.namelist():
                if filename.endswith('.stl'):assert_stl(archive.read(filename))
            manifest=json.loads(archive.read('manifest.json'))
            row['part_count']=len(manifest['parts'])
            row['material_volume_cm3']=sum(p['volume_mm3'] for p in manifest['parts'])/1000
            row['stl_ok']=row['geometry_ok'] and row['slice_overlap_mm3']<.1
        except Exception as e:
            row['error']=str(e)
            (out/f'failed-{body}-{shape}-{tail}-{pos}.json').write_text(json.dumps(payload),encoding='utf-8')
        geometry.append(row);write_csv(out/'geometri-stl-kontrolleri.csv',geometry)
        print(f"{n}/{len(designs)} {body}/{shape}/{tail}/{pos}: {'PASS' if row['stl_ok'] else 'FAIL '+row['error']}",flush=True)
        for mass,power in itertools.product([.8,1.2,2.5],[100,400,800]):
            trial=dict(g,weight=mass);props=get_airfoil_properties('2412',200000)
            m=mission_performance(trial,props,power,50,prop_efficiency=.6)
            s=flight_test(trial,props,get_airfoil_properties('0012'),power_available=power*.6)
            scenarios.append(dict(body=body,wing=shape,tail=tail,position=pos,mass_kg=mass,motor_electrical_w=power,
                                  stall_speed_ms=m['stall_speed'],max_speed_ms=m['max_speed'],cruise_speed_ms=m['cruise_speed'],
                                  climb_ms=m['climb_rate'],endurance_min=m['endurance_min'],static_margin_pct=s['static_margin'],
                                  power_envelope_exists=m['can_fly'],cruise_margin=m['cruise_stall_margin_met'],
                                  preliminary_criteria=s['overall_passed'],airworthiness_confirmed=False))
    write_csv(out/'ucus-senaryolari.csv',scenarios)
    summary=dict(geometry_total=len(geometry),geometry_pass=sum(r['geometry_ok'] for r in geometry),stl_pass=sum(r['stl_ok'] for r in geometry),
                 polar_total=len(polar_checks),polar_pass=sum(r['accepted'] for r in polar_checks),scenario_total=len(scenarios),
                 all_airworthiness_unconfirmed=True)
    (out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print(json.dumps(summary),flush=True)

if __name__=='__main__':main()
