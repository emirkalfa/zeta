const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../static/js/app.js'),'utf8');
test('disk settings work when browser storage is unavailable; failed saves retry latest value',async()=>{
  const status={textContent:''},writes=[];let fail=false;
  const c=vm.createContext({window:{addEventListener(){}},document:{documentElement:{dataset:{}},getElementById:()=>status},
    localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},
    fetch:async(url,opts)=>{if(!opts)return {ok:true,json:async()=>({'zeta-project':'saved'})};writes.push(JSON.parse(opts.body));return {ok:!fail};}});
  vm.runInContext(source,c);await vm.runInContext('store.load()',c);
  assert.equal(vm.runInContext("store.get('zeta-project')",c),'saved');
  fail=true;vm.runInContext("store.set('zeta-project','edited')",c);
  await assert.rejects(vm.runInContext('store.flush()',c));
  assert.match(status.textContent,/tamamlanamadı/);
  fail=false;await vm.runInContext('store.flush()',c);
  assert.equal(writes.at(-1)['zeta-project'],'edited');assert.match(status.textContent,/kaydedildi/);
});
