const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('combat selection recalculates topology and returning to Atlas restores standard mode',async()=>{
  const nodes={},buttons=['atlas','seyir','akin','combat'].map(id=>({dataset:{preset:id},addEventListener(type,fn){this.click=fn;}}));
  const document={getElementById(id){return nodes[id]??=( {value:id==='motorLayout'?'none':'100',disabled:false,addEventListener(){},dispatchEvent(){this.changed=true;}} );},querySelectorAll(){return buttons;}};
  const c=vm.createContext({document,window:{addEventListener(){}},Event:class {},calls:[],profile:'general'});
  for(const file of ['fuselage.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/'+file),'utf8'),c);
  vm.runInContext("state.geometry={};fusePresetThumbnail=()=>'';syncFuseLibrary=()=>{};setRadio=(name,value)=>{if(name==='mission_profile')profile=value;};radioValue=()=>profile;calculateAll=async()=>calls.push({preset:state.fusePreset,profile});switchTab=()=>{};setupFuseLibrary();",c);
  await buttons.find(b=>b.dataset.preset==='combat').click();
  assert.equal(c.calls[0].preset,'combat');assert.equal(c.calls[0].profile,'competition');
  assert.equal(nodes.motorLayout.value,'single');assert.equal(nodes.motorLayout.changed,true);
  await buttons.find(b=>b.dataset.preset==='atlas').click();
  assert.equal(c.calls[1].preset,'atlas');assert.equal(c.calls[1].profile,'general');
});
