const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const THREE=require('../static/vendor/three.min.js');
test('height selection moves twin motors and combat tail with the wing',()=>{
  const c=vm.createContext({THREE,window:{addEventListener(){}}});
  for(const f of ['fuselage.js','assembly.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/'+f),'utf8'),c);
  const base={wingspan:1.5,root_chord:.25,taper_ratio:1,dihedral_angle:3,sweep_angle:0,wing_x_pos:.3,
    fuselage_length:.75,fuselage_max_width:.135,fuselage_max_height:.135,fuse_preset:'combat',
    tail_type:'vtail',tail_x_pos:1.05,vtail_span:.6,vtail_chord:.282,vtail_tip_chord:.17,
    tail_booms:{y:.246},htail_span:.54,htail_chord:.17,htail_tip_chord:.17};
  c.settings={motorLayout:'twin',motorDiameter:28,motorLength:30,motorPattern:'cross',motorSpacingY:16,motorSpacingZ:19,motorScrew:3,motorPlate:5,propDiameter:152,motorStation:40};
  const snapshots=[];
  for(const position of ['low','mid','high']){
    c.g={...base,wing_position:position};
    snapshots.push(vm.runInContext('syncWingPlacement(g,libraryFuselageSections(g).sections);({offset:g.wing_position_offset,panels:aircraftPanelSpecs(g,[],[],[]),motors:motorPreviewSpecs(g,settings,[])})',c));
  }
  assert(snapshots[0].offset<snapshots[1].offset && snapshots[1].offset<snapshots[2].offset);
  for(const s of [snapshots[0],snapshots[2]]) {
    const delta=s.offset-snapshots[1].offset;
    for(let i=0;i<s.panels.length;i++)assert(Math.abs(s.panels[i].root[1]-snapshots[1].panels[i].root[1]-delta)<1e-12);
    for(let i=0;i<2;i++)assert(Math.abs(s.motors[i].face_mm[1]-snapshots[1].motors[i].face_mm[1]-delta*1000)<1e-9);
    assert.equal(s.motors[0].motor_diameter_mm,28);
  }
});
test('changing wing position automatically recalculates and retains the current tab',async()=>{
  const nodes={},radios=['low','mid','high'].map(value=>({value,addEventListener(type,fn){this.change=fn;}}));
  const document={getElementById(id){return nodes[id]??={disabled:false,addEventListener(){}};},
    querySelectorAll(selector){return selector.includes('wing_pos')?radios:[];},querySelector(){return {dataset:{tab:'viewer'}};}};
  const c=vm.createContext({document,window:{addEventListener(){}},calls:0,tabs:[],exportSlicedWing(){},exportSlicedTail(){},viewerToggleRotate(){},viewerReset(){},toggleFuselage(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/app.js'),'utf8'),c);
  vm.runInContext('state.geometry={};calculateAll=async()=>calls++;switchTab=tab=>tabs.push(tab);setupEventListeners();',c);
  radios[2].change();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.calls,1);assert.deepEqual(Array.from(c.tabs),['viewer']);
});
test('Penta dimensions and pusher hardware automatically recalculate and retain the page',async()=>{
 const nodes={};
 const document={getElementById(id){return nodes[id]??={disabled:false,addEventListener(type,fn){this[type]=fn;}};},querySelectorAll(){return [];},querySelector(){return {dataset:{tab:'input'}};}};
 const c=vm.createContext({document,window:{addEventListener(){}},calls:0,tabs:[],exportSlicedWing(){},exportSlicedTail(){},viewerToggleRotate(){},viewerReset(){},toggleFuselage(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/app.js'),'utf8'),c);
 vm.runInContext("state.geometry={};state.fusePreset='vtol5';calculateAll=async()=>calls++;switchTab=tab=>tabs.push(tab);setupEventListeners();",c);
 for(const id of ['wingspan','motorDiameter','motorLength','propDiameter','propOffset']){
  nodes[id].change();await new Promise(resolve=>setImmediate(resolve));
 }
 assert.equal(c.calls,5);assert.deepEqual(Array.from(c.tabs),Array(5).fill('input'));
});
