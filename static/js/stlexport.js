function checkGeom() {
  if (state.geometry) return true;
  notify('STL için önce Hesapla düğmesine basın.');return false;
}
async function exportSTL(part) { return runManufacturing('zip',part==='wing'?'wing':'tail'); }
async function exportFuselageSTL() { return runManufacturing('zip','fuselage'); }
function downloadBlob(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  if (!url || !url.startsWith('blob:')) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildFuselageSections(geom, type, airfoilCoords, roundNose = true) {
  const result = type === 'manual'
    ? motorSizedFuselageSections(geom, loftFuselage(geom.fuse_sections || [], geom.fuse_section_exponent || 2))
    : libraryFuselageSections(geom);
  if (!roundNose || result.sections.length < 2) return result;

  const start = result.sections[0][0].x;
  const noseLength = .10 * result.totalLen;
  const atlas = type !== 'manual' && (!geom.fuse_preset || geom.fuse_preset === 'atlas');
  for (const section of result.sections) {
    const offset = section[0].x - start;
    if (offset >= noseLength || atlas) break;
    const x = section[0].x - .65 * offset * (1 - offset / noseLength) ** 2;
    for (const point of section) point.x = x;
  }
  const rings = result.sections;
  const shoulder = Math.min(rings.length - 2, rings.findIndex(r => r[0].x >= start + .065 * result.totalLen));
  if (shoulder < 1) return result;
  const span = rings[shoulder][0].x - start;
  const next = rings[shoulder + 1][0].x - rings[shoulder][0].x;
  const center = ring => ['y','z'].map(axis => {
    const values = ring.map(point => point[axis]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  });
  const [c0, c1, c2] = [0, shoulder, shoulder + 1].map(i => center(rings[i]));
  const count = Math.min(32, 300 - (rings.length - shoulder));
  const front = Array.from({length: count}, (_, i) => {
    const u = i / count, x = u * u;
    return rings[shoulder].map((point, index) => {
      const yz = ['y','z'].map((axis, j) => {
        const end = point[axis] - c1[j];
        const following = rings[shoulder + 1][index][axis] - c2[j];
        const tangent = 2 * span * (following - end) / next;
        const radial = (2*u**3-3*u*u+1)*.035*end + (u**3-2*u*u+u)*end
          + (-2*u**3+3*u*u)*end + (u**3-u*u)*tangent;
        return radial + (1-3*x*x+2*x**3)*c0[j] + (3*x*x-2*x**3)*c1[j]
          + (x**3-x*x)*span*(c2[j]-c1[j])/next;
      });
      return new THREE.Vector3(start + span*x, ...yz);
    });
  });
  result.sections = front.concat(rings.slice(shoulder));
  return result;
}

function meshFromSections(sections, nCirc) {
  const verts = [];
  const idxs = [];

  for (const sec of sections) {
    for (const p of sec) verts.push(p.x, p.y, p.z);
  }

  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < nCirc; j++) {
      const jn = (j + 1) % nCirc;
      const a = i * nCirc + j;
      const b = i * nCirc + jn;
      const c = (i + 1) * nCirc + j;
      const d = (i + 1) * nCirc + jn;
      idxs.push(a, c, b);
      idxs.push(b, c, d);
    }
  }

  for (const secIdx of [0, sections.length - 1]) {
    const start = secIdx * nCirc;
    const cx = new THREE.Vector3(0, 0, 0);
    for (let j = 0; j < nCirc; j++) {
      cx.x += verts[(start + j) * 3];
      cx.y += verts[(start + j) * 3 + 1];
      cx.z += verts[(start + j) * 3 + 2];
    }
    cx.divideScalar(nCirc);
    const ci = verts.length / 3;
    verts.push(cx.x, cx.y, cx.z);
    for (let j = 0; j < nCirc; j++) {
      const jn = (j + 1) % nCirc;
      if (secIdx === 0) idxs.push(start + j, start + jn, ci);
      else idxs.push(start + jn, start + j, ci);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial());
}

function buildFuselageMesh(sections, nCirc, wallM) {
  if (wallM > 0) {
    const innerSections = sections.map(s => offsetFuselageSection(s, wallM, nCirc));
    const verts = [];
    const idxs = [];
    buildThickFuselage(verts, idxs, sections, innerSections, nCirc);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idxs);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshPhongMaterial());
  }
  return meshFromSections(sections, nCirc);
}
