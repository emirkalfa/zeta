const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../static/js/assembly.js'),'utf8');
function setup() {
  const status={textContent:''},rendered=[];let callback;
  const ctx=vm.createContext({window:{addEventListener(){}},state:{geometry:{},version:1},scene:{},
    $:()=>status,setTimeout:f=>{callback=f;return 1;},clearTimeout(){},
    fetch:async()=>({ok:true,json:async()=>({parts:[],manifest:{}})}),rendered});
  vm.runInContext(source,ctx);
  vm.runInContext('manufacturingPayload=()=>({version:state.version});showManufacturingPreview=(data,focus)=>rendered.push({data,focus});',ctx);
  return {ctx,status,rendered,run:()=>callback()};
}
test('automatic preview renders the production response without changing tabs',async()=>{
  const s=setup();vm.runInContext('scheduleManufacturingPreview()',s.ctx);await s.run();
  assert.equal(s.rendered.length,1);assert.equal(s.rendered[0].focus,false);
  assert.match(s.status.textContent,/STL ile aynı/);
});
test('old response cannot overwrite newer dimensions',async()=>{
  const s=setup();let release;
  s.ctx.fetch=()=>new Promise(resolve=>{release=resolve;});
  vm.runInContext('scheduleManufacturingPreview()',s.ctx);const pending=s.run();
  s.ctx.state.version=2;vm.runInContext('scheduleManufacturingPreview()',s.ctx);
  release({ok:true,json:async()=>({parts:[]})});await pending;
  assert.equal(s.rendered.length,0);
});
test('manufacturing error is visible and never labeled STL ready',async()=>{
  const s=setup();s.ctx.fetch=async()=>({ok:false,json:async()=>({error:'Pervane çakışıyor'})});
  vm.runInContext('scheduleManufacturingPreview()',s.ctx);await s.run();
  assert.equal(s.rendered.length,0);assert.match(s.status.textContent,/hazır değil.*Pervane/);
});
test('motor inputs occur once and all belong to the first parameter form',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../templates/index.html'),'utf8');
  const form=html.match(/<form id="paramForm"[\s\S]*?<\/form>/)[0];
  const s=setup();const fields=vm.runInContext('MOTOR_FIELDS',s.ctx);
  for(const id of fields) {
    assert.equal(html.split(`id="${id}"`).length-1,1,id);
    assert.ok(form.includes(`id="${id}"`),id);
  }
});
test('3D meshes use server STL vertices and split cover visibility',()=>{
  const THREE=require('../static/vendor/three.min.js');
  const ctx=vm.createContext({THREE,window:{addEventListener(){}},scene:new THREE.Scene(),
    wingGroup:new THREE.Group(),tailGroup:new THREE.Group(),fuseGroup:new THREE.Group(),
    $:()=>({checked:false}),MODEL_COLORS:{fuselage:0xaaaaaa,airframe:0xbbbbbb},
    modelMaterial:color=>new THREE.MeshBasicMaterial({color}),addMotorHardware(){}});
  vm.runInContext(source,ctx);
  ctx.data={parts:[{name:'motor_wing_right_service_cover_01of02',vertices:[0,0,0,100,0,0,0,100,0],faces:[0,1,2]}],manifest:{motors:[]}};
  vm.runInContext('showManufacturingPreview(data,false)',ctx);
  const mesh=vm.runInContext('manufacturingOverlay.children[0]',ctx);
  assert.equal(mesh.visible,false);
  assert.equal(mesh.material.color.getHex(),0xef9353);
  assert.equal(mesh.geometry.index.array[2],2);
  assert.ok(Math.abs(mesh.geometry.attributes.position.array[3]-.1)<1e-7);
  assert.equal(ctx.wingGroup.visible,false);
});
