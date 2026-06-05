const STL_SCALE = 1000;

function getNumSegments(id) {
  return parseInt(document.getElementById(id).value) || 1;
}

function checkGeom() {
  if (!state.geometry) {
    alert('STL için model bulunamadı. Önce HESAPLA butonuna tıklayın.');
    return false;
  }
  return true;
}

function exportMeshAsSTL(mesh, fileName) {
  mesh.scale.setScalar(STL_SCALE);
  mesh.updateMatrixWorld(true);
  const stlData = new THREE.STLExporter().parse(mesh, { binary: true });
  downloadBlob(stlData, fileName);
}

function exportSTL(part) {
  if (!checkGeom()) return;
  const wallM = (state.wallThickness || 0) / 1000;
  const geom = state.geometry;
  let meshes = [];

  if (wallM > 0) {
    switch (part) {
      case 'wing': {
        const coords = state.airfoilCoords;
        const halfSpan = geom.wingspan / 2;
        meshes.push(buildWingSegment(geom, coords, 0, halfSpan, 1, false, false, wallM));
        meshes.push(buildWingSegment(geom, coords, 0, halfSpan, -1, false, false, wallM));
        break;
      }
      case 'tail': {
        const coords = state.tailCoords;
        const vCoords = state.vtailCoords || state.tailCoords;
        const hHalf = geom.htail_span / 2;
        meshes.push(buildHTailSegment(geom, coords, 0, hHalf, 1, false, false, wallM));
        meshes.push(buildHTailSegment(geom, coords, 0, hHalf, -1, false, false, wallM));
        meshes.push(buildVTailSegment(geom, vCoords, 0, geom.vtail_span, false, false, wallM));
        break;
      }
      default:
        meshes = getAllMeshes();
    }
  } else {
    switch (part) {
      case 'wing':
        meshes = getWingMesh();
        break;
      case 'fuselage':
        meshes = getFuselageMesh();
        break;
      case 'tail':
        meshes = getTailMesh();
        break;
      default:
        meshes = getAllMeshes();
    }
  }

  if (!meshes.length) {
    alert('STL için model bulunamadı. Önce HESAPLA butonuna tıklayın.');
    return;
  }

  const merged = mergeMeshes(meshes);
  if (!merged) return;

  if (part === 'wing') {
    exportMeshAsSTL(merged, `z_wing.stl`);
  } else {
    exportMeshAsSTL(merged, `zeta_${part}.stl`);
  }
}

function exportSlicedWing() {
  if (!checkGeom()) return;
  const n = getNumSegments('sliceCount');
  if (n <= 1) { alert('Parça sayısı en az 2 olmalıdır.'); return; }

  const geom = state.geometry;
  const coords = state.airfoilCoords;
  const halfSpan = geom.wingspan / 2;
  const segLen = halfSpan / n;
  const wallM = (state.wallThickness || 0) / 1000;

  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    const sideName = side === 0 ? 'right' : 'left';

    for (let seg = 0; seg < n; seg++) {
      const yStart = seg * segLen;
      const yEnd = (seg + 1) * segLen;
      const capTip = seg === n - 1;

      const mesh = buildWingSegment(geom, coords, yStart, yEnd, sign, false, false, wallM, capTip);
      exportMeshAsSTL(mesh, `z_wing_${sideName}_${seg+1}of${n}.stl`);
    }
  }
}

function exportSlicedTail() {
  if (!checkGeom()) return;
  const n = getNumSegments('tailSliceCount');
  if (n <= 1) { alert('Parça sayısı en az 2 olmalıdır.'); return; }

  const geom = state.geometry;
  const tailType = geom.tail_type || 'conventional';
  const wallM = (state.wallThickness || 0) / 1000;

  if (tailType === 'vtail') {
    const vAngle = THREE.MathUtils.degToRad(35);
    const vHalf = geom.vtail_span * 0.7;
    const segLen = vHalf / n;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const sideName = side === 0 ? 'sag' : 'sol';
      for (let seg = 0; seg < n; seg++) {
        const ys = seg * segLen;
        const ye = (seg + 1) * segLen;
        const hp = false, hh = false;
        const secs = [];
        const nHalf = Math.floor(state.tailCoords.length / 2);
        const uIdx = Array.from({length: nHalf}, (_, i) => i);
        const lIdx = Array.from({length: nHalf}, (_, i) => state.tailCoords.length - 1 - i);
        const nPts = state.tailCoords.length;
        const nSec = 16;
        const hChord = geom.htail_chord;
        const hTaper = geom.htail_taper || 0.5;
        const hSweep = THREE.MathUtils.degToRad(geom.htail_sweep || 3);
        const tailX = geom.tail_x_pos || geom.fuselage_length * 0.82;

        for (let i = 0; i <= nSec; i++) {
          const eta = i / nSec;
          const rLen = ys + (ye - ys) * eta;
          const chord = hChord * (1 - (rLen / vHalf) * (1 - hTaper));
          const xOff = tailX + rLen * Math.tan(hSweep);
          const pts = [];
          for (const idx of uIdx) {
            pts.push(new THREE.Vector3(
              state.tailCoords[idx].x * chord + xOff,
              state.tailCoords[idx].y_upper * chord * 0.7 + rLen * Math.sin(vAngle) * 0.3,
              sign * rLen * Math.cos(vAngle)
            ));
          }
          for (const idx of lIdx) {
            pts.push(new THREE.Vector3(
              state.tailCoords[idx].x * chord + xOff,
              state.tailCoords[idx].y_upper * chord * 0.7 + rLen * Math.sin(vAngle) * 0.3,
              sign * rLen * Math.cos(vAngle)
            ));
          }
          secs.push(pts);
        }

        const verts = []; const idxs = [];
        const sdir = new THREE.Vector3(0, Math.sin(vAngle), sign * Math.cos(vAngle)).normalize();

        if (wallM > 0) {
          const innerSecs = secs.map(s => offsetSectionInward(s, wallM, nHalf, nPts, 'y'));
          const tipInfo = buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
          if (seg === n - 1) {
            const inwardDir = sdir.clone().negate();
            const capDepth = wallM;
            const capBackStart = verts.length / 3;
            for (let j = 0; j < nPts; j++) {
              const idx = (tipInfo.innerTipStart + j) * 3;
              verts.push(
                verts[idx] + inwardDir.x * capDepth,
                verts[idx+1] + inwardDir.y * capDepth,
                verts[idx+2] + inwardDir.z * capDepth
              );
            }
            buildAnnulus(verts, idxs, tipInfo.innerTipStart, capBackStart, nPts, true);
            const backCenter = new THREE.Vector3(0, 0, 0);
            for (let j = 0; j < nPts; j++) {
              const idx = (capBackStart + j) * 3;
              backCenter.x += verts[idx];
              backCenter.y += verts[idx+1];
              backCenter.z += verts[idx+2];
            }
            backCenter.divideScalar(nPts);
            makeCapFan(verts, idxs, capBackStart, nPts, backCenter, inwardDir);
            const frontCenter = new THREE.Vector3(0, 0, 0);
            for (let j = 0; j < nPts; j++) {
              const idx = (tipInfo.innerTipStart + j) * 3;
              frontCenter.x += verts[idx];
              frontCenter.y += verts[idx+1];
              frontCenter.z += verts[idx+2];
            }
            frontCenter.divideScalar(nPts);
            makeCapFan(verts, idxs, tipInfo.innerTipStart, nPts, frontCenter, sdir);
          }
        } else {
          for (const s of secs) { for (const p of s) verts.push(p.x, p.y, p.z); }
          for (let i = 0; i < nSec; i++) {
            for (let j = 0; j < nPts; j++) {
              const jn = (j + 1) % nPts;
              const a = i * nPts + j, b = i * nPts + jn, c = (i+1) * nPts + j, d = (i+1) * nPts + jn;
              idxs.push(a, c, b); idxs.push(b, c, d);
            }
          }
        }
        if (wallM <= 0) {
          const rc = new THREE.Vector3(0,0,0);
          for (const p of secs[0]) rc.add(p);
          rc.divideScalar(nPts);
          makeCapFan(verts, idxs, 0, nPts, rc, sdir.clone().negate());
        }
        if (hh) {
          const crd = hChord * (1 - (ys / vHalf) * (1 - hTaper));
          const rr = Math.max(crd * 0.02, 0.0015), dd = Math.max(crd * 0.04, 0.003);
          for (const pct of [0.30, 0.65]) {
            const cx = pct * crd + tailX + ys * Math.tan(hSweep);
            const cy = ys * Math.sin(vAngle) * 0.3;
            const cz = sign * ys * Math.cos(vAngle);
            addDimple(verts, idxs, new THREE.Vector3(cx, cy, cz), sdir, rr, dd, 8);
          }
        }
        if (wallM <= 0) {
          const tc = new THREE.Vector3(0,0,0);
          for (const p of secs[nSec]) tc.add(p);
          tc.divideScalar(nPts);
          makeCapFan(verts, idxs, nSec * nPts, nPts, tc, sdir);
        }
        if (hp) {
          const crd = hChord * (1 - (ye / vHalf) * (1 - hTaper));
          const rr = Math.max(crd * 0.02, 0.0015), hh = Math.max(crd * 0.04, 0.003);
          for (const pct of [0.30, 0.65]) {
            const cx = pct * crd + tailX + ye * Math.tan(hSweep);
            const cy = ye * Math.sin(vAngle) * 0.3;
            const cz = sign * ye * Math.cos(vAngle);
            addCylinder(verts, idxs, new THREE.Vector3(cx, cy, cz), sdir, rr, hh, 8);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(idxs);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial());
        exportMeshAsSTL(mesh, `zeta_vtail_${sideName}_${seg+1}of${n}.stl`);
      }
    }
    return;
  }

  const hSpan = geom.htail_span / 2;
  const segLen = hSpan / n;
  if (tailType === 'ttail') {
    const vHalf = geom.vtail_span;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const sn = side === 0 ? 'sag' : 'sol';
      for (let seg = 0; seg < n; seg++) {
        const ys = seg * segLen, ye = (seg + 1) * segLen;
        const hp = false, hh = false;
        const capTip = seg === n - 1;
        const mesh = buildHTailSegment(geom, state.tailCoords, ys, ye, sign, hp, hh, wallM, capTip);
        mesh.position.y += vHalf * 0.6;
        mesh.position.z *= 0.8;
        exportMeshAsSTL(mesh, `zeta_htail_${sn}_${seg+1}of${n}.stl`);
      }
    }
  } else {
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const sn = side === 0 ? 'sag' : 'sol';
      for (let seg = 0; seg < n; seg++) {
        const ys = seg * segLen, ye = (seg + 1) * segLen;
        const hp = false, hh = false;
        const capTip = seg === n - 1;
        const mesh = buildHTailSegment(geom, state.tailCoords, ys, ye, sign, hp, hh, wallM, capTip);
        exportMeshAsSTL(mesh, `zeta_htail_${sn}_${seg+1}of${n}.stl`);
      }
    }
  }

  const vSpan = geom.vtail_span;
  const vSegLen = vSpan / n;
  for (let seg = 0; seg < n; seg++) {
    const ys = seg * vSegLen, ye = (seg + 1) * vSegLen;
    const hp = false, hh = false;
    const capTip = seg === n - 1;
    const mesh = buildVTailSegment(geom, state.vtailCoords || state.tailCoords, ys, ye, hp, hh, wallM, capTip);
    exportMeshAsSTL(mesh, `zeta_vtail_${seg+1}of${n}.stl`);
  }
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
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
