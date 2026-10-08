const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const THREE=require('../static/vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../static/js/viewer3d.js'),'utf8');
test('hidden viewers skip drawing and resume when visible',()=>{
  const node={clientWidth:0,clientHeight:0};
  const ctx=vm.createContext({THREE,document:{hidden:false,getElementById:()=>node},requestAnimationFrame(){return 1;},draws:0,updates:0});
  vm.runInContext(source,ctx);
  vm.runInContext('scene={};camera={};renderer={render(){draws++;}};controls={update(){updates++;}};animate();',ctx);
  assert.equal(ctx.draws,0);assert.equal(ctx.updates,0);
  node.clientWidth=800;node.clientHeight=600;vm.runInContext('animate()',ctx);assert.equal(ctx.draws,1);
  ctx.document.hidden=true;vm.runInContext('animate()',ctx);assert.equal(ctx.draws,1);
  vm.runInContext('fuseViewerRunning=true;fuseViewerControls=controls;fuseViewerRenderer=renderer;fuseViewerScene=scene;fuseViewerCamera=camera;animateFuseViewer()',ctx);
  assert.equal(ctx.draws,1);
  ctx.document.hidden=false;vm.runInContext('animateFuseViewer()',ctx);assert.equal(ctx.draws,2);
});
test('scene cleanup disposes shared resources once including shadow maps',()=>{
  const ctx=vm.createContext({THREE});vm.runInContext(source,ctx);
  let geometries=0,materials=0,shadows=0;
  const geometry={dispose(){geometries++;}},material={dispose(){materials++;}};
  ctx.root={traverse(fn){fn({geometry,material:[material,material]});fn({geometry,material,shadow:{dispose(){shadows++;}}});}};
  vm.runInContext('disposeViewerScene(root)',ctx);
  assert.equal(geometries,1);assert.equal(materials,1);assert.equal(shadows,1);
});
