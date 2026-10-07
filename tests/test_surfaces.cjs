const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
const THREE = require(path.join(root,'static/vendor/three.min.js'));
const ctx = vm.createContext({THREE,window:{addEventListener(){}}});
for (const f of ['assembly.js','aircraftmodel.js']) vm.runInContext(fs.readFileSync(path.join(root,'static/js',f),'utf8'),ctx);
const run = code => vm.runInContext(code,ctx);
const upper = Array.from({length:77},(_,i)=>{
  const x=(1-Math.cos(Math.PI*i/76))/2;
  const y=.6*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1015*x**4);
  return {x,y_upper:y,y_lower:-y};
});
ctx.coords=[...upper,...upper.slice().reverse()];
const base={wingspan:1.5,wing_x_pos:.36,wing_position_offset:.04,root_chord:.28,taper_ratio:.5,sweep_angle:5,dihedral_angle:3,tail_x_pos:.98,htail_span:.6,htail_chord:.23,htail_tip_chord:.115,htail_taper:.5,htail_sweep:3,vtail_span:.375,vtail_chord:.124,vtail_tip_chord:.05,vtail_taper:.4,vtail_sweep:5};

for (const tail of ['conventional','ttail','vtail']) test(`${tail}: finite symmetric panels and flat end normals`,()=>{
  ctx.g={...base,tail_type:tail};
  const panels=run('aircraftPanelSpecs(g,coords,coords,coords)');
  for (const p of panels) {
    ctx.p=p;
    const group=run('(()=>{const group=new THREE.Group();buildSurface(group,{rootLE:new THREE.Vector3(...p.root),tipLE:new THREE.Vector3(...p.tip),rootChord:p.chord,tipChord:p.tipChord,up:new THREE.Vector3(...p.up),coords:p.coords,controls:[{etaStart:0,etaEnd:1,chordRatio:.3,color:0xabcdef}]});return group;})()');
    const capNormal=new THREE.Vector3(1,0,0).cross(new THREE.Vector3(...p.up)).normalize();
    for(const mesh of group.children.filter(c=>c.isMesh)) {
      const pos=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal;
      assert(Array.from(pos.array).every(Number.isFinite));
      assert(Array.from(normal.array).every(Number.isFinite));
      if(mesh.userData.surfacePart.endsWith('cap')) for(let i=0;i<normal.count;i++) {
        const n=new THREE.Vector3().fromBufferAttribute(normal,i);
        assert(Math.abs(n.dot(capNormal))>.9999,'flat cap must not inherit skin normals');
      }
    }
  }
  for(const p of panels.filter(p=>p.name.endsWith('right'))) {
    const left=panels.find(q=>q.name===p.name.replace('right','left'));
    assert(left);
    for(const end of ['root','tip']) {
      assert.equal(left[end][0],p[end][0]);assert.equal(left[end][1],p[end][1]);
      assert(Math.abs(left[end][2]+p[end][2])<1e-12);
    }
  }
});

test('T stabilizer quarter-chord sits over the fin tip and mount follows it',()=>{
  ctx.g={...base,tail_type:'ttail'};
  const panels=run('aircraftPanelSpecs(g,coords,coords,coords)');
  const fin=panels.find(p=>p.name==='tail_vertical');
  const h=panels.find(p=>p.name==='tail_horizontal_right');
  assert(Math.abs(h.root[0]+h.chord*.25-fin.tip[0]-fin.tipChord*.25)<1e-10);
  assert.equal(h.root[1],fin.tip[1]);
  assert.equal(h.mountChordFraction,.25);
});

for(const shape of ['rectangular','tapered','ste_tapered']) test(`${shape}: wing tip follows the requested planform`,()=>{
  ctx.g={...base,tail_type:'conventional',taper_ratio:shape==='rectangular'?1:.5,straight_te:shape==='ste_tapered',sweep_angle:shape==='rectangular'?0:5};
  const p=run('aircraftPanelSpecs(g,coords,coords,coords)').find(p=>p.name==='wing_right');
  assert.equal(p.tip[2],base.wingspan/2);
  if(shape==='rectangular') {
    assert.equal(p.tipChord,p.chord);assert.equal(p.tip[0],p.root[0]);
  } else if(shape==='ste_tapered') {
    assert(Math.abs(p.tip[0]+p.tipChord-p.root[0]-p.chord)<1e-10,'straight trailing edge');
  } else assert(p.tip[0]>p.root[0] && p.tipChord<p.chord);
});

test('motor references follow span changes but retain physical motor dimensions',()=>{
  ctx.settings={motorLayout:'twin',motorDiameter:28,motorLength:30,motorPattern:'cross',motorSpacingY:16,motorSpacingZ:19,motorScrew:3,motorPlate:5,propDiameter:152,propOffset:12,motorStation:40};
  const result=[];
  for(const span of [1.2,1.8]) {
    ctx.g={...base,wingspan:span};result.push(run('motorPreviewSpecs(g,settings,[])'));
  }
  for(let i=0;i<2;i++) {
    assert.equal(result[0][i].motor_diameter_mm,28);assert.equal(result[1][i].motor_diameter_mm,28);
    assert(Math.abs(result[1][i].face_mm[2]/result[0][i].face_mm[2]-1.5)<1e-12);
    assert.equal(result[1][i].face_mm[0]-result[1][i].prop_plane_x_mm,42);
  }
});

test('combat T-tail roots mount on each actual fin quarter chord',()=>{
  ctx.g={...base,tail_type:'ttail',tail_booms:{y:.27}};
  const panels=run('aircraftPanelSpecs(g,coords,coords,coords)');
  for(const side of ['right','left']) {
    const fin=panels.find(p=>p.name==='tail_vertical_'+side),h=panels.find(p=>p.name==='tail_horizontal_'+side);
    assert.equal(h.parent,fin.name);
    assert.ok(Math.abs(h.root[0]+.25*h.chord-fin.tip[0]-.25*fin.tipChord)<1e-12);
    assert.equal(h.root[1],fin.tip[1]);assert.equal(h.root[2],fin.tip[2]);
    assert.equal(h.tip[2],0);
  }
});
test('combat V-tail retains requested physical surface span',()=>{
  ctx.g={...base,tail_type:'vtail',tail_booms:{y:base.vtail_span*Math.cos(35*Math.PI/180)/2}};
  const panels=run('aircraftPanelSpecs(g,coords,coords,coords)').filter(p=>p.kind==='tail');
  for(const p of panels)assert.ok(Math.abs(Math.hypot(p.tip[1]-p.root[1],p.tip[2]-p.root[2])-base.vtail_span/2)<1e-12);
});
test('combat single motor preview sits behind the rear firewall',()=>{
  ctx.g={...base,tail_booms:{y:.27}};ctx.settings={motorLayout:'single',motorDiameter:28,motorLength:30,motorPattern:'cross',motorSpacingY:16,motorSpacingZ:19,motorScrew:3,motorPlate:5,propDiameter:152,propOffset:8};
  const m=run('motorPreviewSpecs(g,settings,[[new THREE.Vector3(0,0,0)],[new THREE.Vector3(.75,0,0)]])[0]');
  assert.equal(m.axis[0],-1);assert.equal(m.face_mm[0],750);assert.equal(m.prop_plane_x_mm,788);
});
