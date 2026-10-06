// Run with node --test tests/test_fuselage.cjs (no additional dependencies).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const THREE = require(path.join(root, 'static/vendor/three.min.js'));
const ctx = vm.createContext({THREE, console});
for (const f of ['fuselage.js', 'aircraftmodel.js', 'viewer3d.js', 'stlexport.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'static/js', f), 'utf8'), ctx);
}
const run = code => vm.runInContext(code, ctx);
const base = {fuselage_length:1.2, fuselage_max_width:.135, fuselage_max_height:.135, wingspan:1.5};

function checkClosed(mesh) {
  const p = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
  const edges = new Map();
  let volume = 0;
  for (let i=0; i<idx.length; i+=3) {
    const ids = [idx[i],idx[i+1],idx[i+2]];
    const [a,b,c] = ids.map(j => new THREE.Vector3().fromBufferAttribute(p,j));
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    assert(cross.lengthSq() > 1e-24, 'nondegenerate triangle');
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let j=0;j<3;j++) {
      const x=ids[j], y=ids[(j+1)%3], key=`${Math.min(x,y)},${Math.max(x,y)}`;
      const edge=edges.get(key)||{count:0,balance:0};
      edge.count++; edge.balance += x<y ? 1 : -1; edges.set(key,edge);
    }
  }
  for (const e of edges.values()) {
    assert.equal(e.count,2,'each edge shared by two faces');
    assert.equal(e.balance,0,'consistent outward winding');
  }
  assert(volume > 0, 'positive enclosed volume');
  return volume;
}

for (const id of ['atlas','seyir','akin']) test(`${id}: dimensions, preview/export match and closed meshes`, () => {
  ctx.geom = {...base, fuse_preset:id, fuse_type:'conventional'};
  const loft = run("buildFuselageSections(geom, 'conventional')");
  const keys = run('presetFuseKeys(geom, geom.fuse_preset)');
  const points = loft.sections.flat();
  assert.equal(points[0].x,0);
  assert.equal(loft.sections.at(-1)[0].x,base.fuselage_length);
  assert(Math.abs(Math.max(...points.map(p=>p.z))*2-Math.max(...keys.map(k=>k.w))) < 1e-8);
  assert(points.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
  const body = run("buildFuselageGroup(geom, 'conventional')").children[0];
  const solid = run("buildFuselageMesh(buildFuselageSections(geom,'conventional').sections,64,0)");
  assert.deepEqual(Array.from(body.geometry.attributes.position.array),Array.from(solid.geometry.attributes.position.array));
  const volume = checkClosed(solid);
  const hollow = run("buildFuselageMesh(buildFuselageSections(geom,'conventional').sections,64,.0012)");
  assert(checkClosed(hollow) < volume, 'hollow shell has less material');
});

test('custom conversion preserves the preset surface', () => {
  ctx.geom = {...base,fuse_preset:'atlas'};
  const original = run('libraryFuselageSections(geom)');
  run("geom.fuse_sections=presetFuseKeys(geom,'atlas'); geom.fuse_section_exponent=FUSELAGE_PRESETS.atlas.exponent");
  const custom = run("buildFuselageSections(geom,'manual')");
  assert.equal(JSON.stringify(custom),JSON.stringify(original));
});

test('duplicate/out-of-order legacy stations remain finite', () => {
  const result = run('loftFuselage([{t:1,w:0,h:0},{t:0,w:.1,h:.1},{t:0,w:.2,h:.2}])');
  assert(result.sections.flat().every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
});
