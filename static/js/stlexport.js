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

function buildFuselageSections(geom, type, airfoilCoords) {
  // One generator for the two viewers and every fuselage STL export.
  return type === 'manual' ? motorSizedFuselageSections(geom,loftFuselage(geom.fuse_sections || [], geom.fuse_section_exponent || 2)) : libraryFuselageSections(geom);
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
