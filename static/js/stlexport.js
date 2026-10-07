const STL_SCALE = 1000;

function getNumSegments(id) {
  return parseInt(document.getElementById(id).value) || 1;
}

function checkGeom() {
  if (!state.geometry) {
    notify('STL için model bulunamadı. Önce hesaplama yapın.');
    return false;
  }
  return true;
}

function showDownloadConfirm(files) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('downloadModal');
    document.getElementById('downloadFileList').innerHTML = files.map(f => `<li>${f}</li>`).join('');
    dialog.returnValue = '';
    // Esc ile kapatmada returnValue boş kalır, iptal sayılır
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

function exportMeshAsSTL(mesh, fileName) {
  mesh.scale.setScalar(STL_SCALE);
  mesh.updateMatrixWorld(true);
  const stlData = new THREE.STLExporter().parse(mesh, { binary: true });
  downloadBlob(stlData, fileName);
}


function mmInput(id) {
  return (parseFloat(document.getElementById(id).value) || 0) / 1000;
}

// Kanat yarısının [yStart, yEnd] aralığını üretir. Duvar kalınlığı verilmişse içi boş,
// rib'li ve spar delikli; 0 ise (ya da kanat boşaltılamayacak kadar inceyse) dolu katı.
function buildWingPart(geom, coords, yStart, yEnd, sign, capTip) {
  const wall = (state.wallThickness || 0) / 1000;
  if (wall > 0) {
    const spars = [
      { name: 'Ana spar', pos: SPAR_MAIN_POS, dia: mmInput('sparMainDia') },
      { name: 'Arka spar', pos: SPAR_REAR_POS, dia: mmInput('sparRearDia') },
    ].filter(sp => sp.dia > 0);
    const part = buildRibbedWingSegment(geom, coords, yStart, yEnd, sign, {
      wall,
      ribSpacing: Math.max(mmInput('ribSpacing'), 0.005),
      ribThickness: Math.max(mmInput('ribThickness'), 0.0004),
      spars,
      capTip,
    });
    if (part) return { ...part, spars };
  }
  return { mesh: buildWingSegment(geom, coords, yStart, yEnd, sign, false, false, 0, capTip), solid: true };
}

// İndirilen kanat parçalarının iç yapısını özetler (kesilecek spar boyu için)
function reportWingStructure(parts) {
  if (parts.some(p => p.solid)) {
    notify(state.wallThickness > 0
      ? 'Kanat bu duvar kalınlığıyla boşaltılamayacak kadar ince; dolu katı olarak üretildi.'
      : 'Duvar kalınlığı 0: kanat dolu katı olarak üretildi (rib ve spar deliği yok).');
    return;
  }
  const ribs = parts.reduce((n, p) => n + p.ribCount, 0);
  const sparText = parts[0].spars.map((sp, i) => {
    const reach = Math.max(...parts.map(p => p.sparReach[i]));
    return `${sp.name} Ø${(sp.dia * 1000).toFixed(1)} mm, kökten ${Math.round(reach * 1000)} mm`;
  });
  notify([`Kanat yarısı başına ${ribs} rib`, ...sparText].join(' · '));
}

async function exportSTL(part) {
  return runManufacturing('zip', part === 'wing' ? 'wing' : 'tail');
}


function buildFuselageSections(geom, type, airfoilCoords) {
  // One generator for the two viewers and every fuselage STL export.
  return type === 'manual' ? loftFuselage(geom.fuse_sections || [], geom.fuse_section_exponent || 2) : libraryFuselageSections(geom);
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

async function exportFuselageSTL(type) {
  return runManufacturing('zip', 'fuselage');
}


async function exportSlicedFuselage(type) {
  return runManufacturing('zip', 'fuselage');
}


async function exportSlicedWing() {
  return runManufacturing('zip', 'wing');
}


async function exportSlicedTail() {
  return runManufacturing('zip', 'tail');
}


function mergeMeshes(meshes) {
  if (!meshes.length) return null;

  const positions = [];
  const indices = [];
  let offset = 0;

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    if (!geo) continue;

    const pos = geo.getAttribute('position');
    if (!pos) continue;

    const verts = pos.array;
    for (let i = 0; i < verts.length; i += 3) {
      const v = new THREE.Vector3(verts[i], verts[i+1], verts[i+2]);
      v.applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
    }

    const idx = geo.getIndex();
    if (idx) {
      const idxArr = idx.array;
      for (let i = 0; i < idxArr.length; i++) {
        indices.push(idxArr[i] + offset);
      }
    } else {
      for (let i = 0; i < verts.length / 3; i++) {
        indices.push(i + offset);
      }
    }

    offset += verts.length / 3;
  }

  if (!positions.length) return null;

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mergedGeo.setIndex(indices);
  mergedGeo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial();
  return new THREE.Mesh(mergedGeo, mat);
}

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
