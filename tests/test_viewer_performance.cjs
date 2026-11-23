const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const THREE=require('../static/vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../static/js/viewer3d.js'),'utf8');
test('viewers coalesce redraws and remain idle while hidden or unchanged',()=>{
  const node={clientWidth:0,clientHeight:0},frames=[];
  const ctx=vm.createContext({THREE,document:{hidden:false,getElementById:()=>node},
    requestAnimationFrame(fn){frames.push(fn);return frames.length;},draws:0,updates:0});
  vm.runInContext(source,ctx);
  vm.runInContext('scene={};camera={};renderer={render(){draws++;}};controls={update(){updates++;}};requestViewerFrame();',ctx);
  assert.equal(frames.length,0);
  node.clientWidth=800;node.clientHeight=600;
  vm.runInContext('requestViewerFrame();requestViewerFrame()',ctx);
  assert.equal(frames.length,1);
  frames.shift()();assert.equal(ctx.draws,1);assert.equal(frames.length,0);
  ctx.document.hidden=true;
  vm.runInContext('fuseViewerRunning=true;fuseViewerControls=controls;fuseViewerRenderer=renderer;fuseViewerScene=scene;fuseViewerCamera=camera;requestFuseFrame()',ctx);
  assert.equal(frames.length,0);
  ctx.document.hidden=false;vm.runInContext('requestFuseFrame()',ctx);
  frames.shift()();assert.equal(ctx.draws,2);assert.equal(frames.length,0);
});
test('scene cleanup disposes shared resources once including shadow maps',()=>{
  const ctx=vm.createContext({THREE});vm.runInContext(source,ctx);
  let geometries=0,materials=0,shadows=0;
  const geometry={dispose(){geometries++;}},material={dispose(){materials++;}};
  ctx.root={traverse(fn){fn({geometry,material:[material,material]});fn({geometry,material,shadow:{dispose(){shadows++;}}});}};
  vm.runInContext('disposeViewerScene(root)',ctx);
  assert.equal(geometries,1);assert.equal(materials,1);assert.equal(shadows,1);
});

test('recalculating releases both old WebGL contexts instead of accumulating them',()=>{
  const ctx=vm.createContext({THREE,window:{removeEventListener(){}},document:{getElementById:()=>null}});
  vm.runInContext(source,ctx);
  let released=0,disposed=0;
  ctx.oldRenderer={dispose(){disposed++;},forceContextLoss(){released++;},domElement:{}};
  vm.runInContext('renderer=oldRenderer;disposeViewer();fuseViewerRenderer=oldRenderer;disposeFuseViewer()',ctx);
  assert.equal(disposed,2);assert.equal(released,2);
});
