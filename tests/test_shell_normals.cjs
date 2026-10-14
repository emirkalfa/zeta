const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const THREE=require('../static/vendor/three.min.js');
const c=vm.createContext({THREE,window:{addEventListener(){}}});
vm.runInContext(fs.readFileSync('static/js/assembly.js','utf8'),c);
test('shell smoothing preserves every STL coordinate and keeps drilled caps sharp',()=>{
  const input=new THREE.CylinderGeometry(1,1,2,24,1);
  const expected=input.toNonIndexed().attributes.position.array.slice();
  c.input=input;const out=vm.runInContext('creaseShellNormals(input)',c);
  assert.deepEqual(out.attributes.position.array,expected);
  const p=out.attributes.position.array,n=out.attributes.normal.array;
  for(let f=0;f<p.length;f+=9){
    const cap=Math.abs(p[f+1])===1&&p[f+1]===p[f+4]&&p[f+1]===p[f+7];
    for(let k=0;k<3;k++)assert.ok(Math.abs(n[f+k*3+1]-(cap?p[f+1]:0))<1e-6);
  }
});
