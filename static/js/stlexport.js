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

function buildVTOLShelledFuselage(geom, wallM) {
  const nCirc = 32;
  const podLen = geom.vtol_pod_length;
  const noseLen = geom.vtol_nose_length || geom.nose_length;
  const tailLen = geom.tailcone_length;
  const cylLen = Math.max(0, podLen - noseLen - tailLen);
  const maxW = geom.fuselage_max_width / 2;
  const maxH = geom.fuselage_max_height / 2;
  const boomR = (geom.vtol_boom_diameter || 0.03) / 2;
  const boomStart = geom.vtol_boom_start || (podLen * 0.8);
  const boomLen = geom.vtol_boom_length || 0.4;
  const upperFrac = 0.85;
  const lowerScale = 1.12;
  const noseRfrac = 0.28;
  const tailRfrac = 0.35;
  const nSecs = 30;
  const ventralPeak = 0.18;
  const ventralWidth = 0.22;
  const ventralCenter = 0.45;

  const nExpPts = [
    [0.00, 2.0],
    [0.12, 2.4],
    [0.25, 3.0],
    [0.40, 3.2],
    [0.60, 3.2],
    [0.78, 2.8],
    [0.90, 2.4],
    [1.00, 2.2],
  ];

  const wPts = [
    [0.00, noseRfrac],
    [0.10, 0.30],
    [0.20, 0.55],
    [0.30, 0.82],
    [0.40, 1.00],
    [0.75, 1.00],
    [0.85, 0.72],
    [0.93, 0.48],
    [1.00, tailRfrac],
  ];

  const hPts = [
    [0.00, noseRfrac * 0.80],
    [0.10, 0.25],
    [0.22, 0.50],
    [0.35, 0.82],
    [0.48, 1.00],
    [0.75, 0.95],
    [0.85, 0.65],
    [0.93, 0.42],
    [1.00, tailRfrac * 0.88],
  ];

  const catmullRom = (eta, pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      if (eta <= pts[i + 1][0]) {
        const t = (eta - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const dx = pts[i + 1][0] - pts[i][0];
        const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * dx;
        const m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * dx;
        const t2 = t * t, t3 = t2 * t;
        return (2*t3 - 3*t2 + 1) * p1[1] + (t3 - 2*t2 + t) * m1 +
               (-2*t3 + 3*t2) * p2[1] + (t3 - t2) * m2;
      }
    }
    return pts[pts.length - 1][1];
  };

  const ventralEnvelope = (eta) => {
    if (eta < 0.20 || eta > 0.65) return 0;
    const c = (eta - ventralCenter) / ventralWidth;
    return ventralPeak * Math.exp(-4 * c * c);
  };

  const superellipsePt = (xPos, a, b, theta, nVal) => {
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const nInv = 2 / nVal;
    const absSin = Math.abs(st);
    const absCos = Math.abs(ct);
    const ventral = b * ventralEnvelope(xPos / (noseLen + cylLen + tailLen));

    let y;
    if (st >= 0) {
      y = b * upperFrac * Math.pow(absSin, nInv);
    } else {
      const yBase = b * (-lowerScale) * Math.pow(absSin, nInv);
      const ventralPush = ventral * (1 - Math.pow(absSin, 0.5));
      y = yBase - ventralPush;
    }
    const z = a * Math.sign(ct) * Math.pow(absCos, nInv);
    return new THREE.Vector3(xPos, y, z);
  };

  const section = (xPos, a, b) => {
    const pts = [];
    for (let j = 0; j < nCirc; j++) {
      const theta = (j / nCirc) * 2 * Math.PI;
      pts.push(superellipsePt(xPos, a, b, theta, 0));
    }
    return pts;
  };

  const innerSection = (xPos, a, b) => {
    const ia = Math.max(a - wallM, 0.0001);
    const ib = Math.max(b - wallM, 0.0001);
    const pts = [];
    for (let j = 0; j < nCirc; j++) {
      const theta = (j / nCirc) * 2 * Math.PI;
      pts.push(superellipsePt(xPos, ia, ib, theta, 0));
    }
    return pts;
  };

  // Build pod sections
  const podOuter = [];
  const podInner = [];
  const podLenTotal = noseLen + cylLen + tailLen;

  for (let i = 0; i <= nSecs; i++) {
    const eta = i / nSecs;
    const xPos = eta * podLenTotal;
    const a_ = maxW * catmullRom(eta, wPts);
    const b_ = maxH * catmullRom(eta, hPts);
    const nVal = catmullRom(eta, nExpPts);
    const outer = [];
    const inner = [];
    for (let j = 0; j < nCirc; j++) {
      const theta = (j / nCirc) * 2 * Math.PI;
      outer.push(superellipsePt(xPos, a_, b_, theta, nVal));
      const ia = Math.max(a_ - wallM, 0.0001);
      const ib = Math.max(b_ - wallM, 0.0001);
      inner.push(superellipsePt(xPos, ia, ib, theta, nVal));
    }
    podOuter.push(outer);
    podInner.push(inner);
  }

  const verts = [];
  const idxs = [];
  const nPts = nCirc;

  // Pod outer skin
  const podOuterStart = buildTubeSkin(verts, idxs, podOuter, nPts, false);
  // Pod inner skin (reversed)
  const podInnerStart = buildTubeSkin(verts, idxs, podInner, nPts, true);
  // Annulus at nose (front cap)
  buildAnnulus(verts, idxs, podOuterStart, podInnerStart, nPts, false);
  // Annulus at tail (rear cap)
  const outerTailStart = podOuterStart + (podOuter.length - 1) * nPts;
  const innerTailStart = podInnerStart + (podInner.length - 1) * nPts;
  buildAnnulus(verts, idxs, outerTailStart, innerTailStart, nPts, true);

  // Boom sections (just outer surface, no wall thickness for simplicity)
  const boomOuter = [];
  const nBoom = 12;
  for (let i = 0; i <= nBoom; i++) {
    const eta = i / nBoom;
    const xPos = boomStart + eta * boomLen;
    boomOuter.push(section(xPos, boomR, boomR));
  }
  for (const sec of boomOuter) {
    for (const p of sec) verts.push(p.x, p.y, p.z);
  }
  const boomVStart = podOuterStart + podOuter.length * nPts + podInner.length * nPts;
  for (let i = 0; i < nBoom; i++) {
    for (let j = 0; j < nPts; j++) {
      const jn = (j + 1) % nPts;
      const a = boomVStart + i * nPts + j;
      const b = boomVStart + i * nPts + jn;
      const c = boomVStart + (i + 1) * nPts + j;
      const d = boomVStart + (i + 1) * nPts + jn;
      idxs.push(a, c, b);
      idxs.push(b, c, d);
    }
  }

  // Cap boom ends
  const boomTipStart = boomVStart + nBoom * nPts;
  const boomCenter = new THREE.Vector3(boomStart + boomLen, 0, 0);
  makeCapFan(verts, idxs, boomVStart, nPts, new THREE.Vector3(boomStart, 0, 0), new THREE.Vector3(-1, 0, 0));
  makeCapFan(verts, idxs, boomTipStart, nPts, boomCenter, new THREE.Vector3(1, 0, 0));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0x94a3b8, side: THREE.DoubleSide, flatShading: false,
  }));
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
        meshes.push(buildWingSegment(geom, coords, 0, halfSpan, 1, false, false, wallM, true));
        meshes.push(buildWingSegment(geom, coords, 0, halfSpan, -1, false, false, wallM, true));
        break;
      }
      case 'tail': {
        const coords = state.tailCoords;
        const vCoords = state.vtailCoords || state.tailCoords;
        const hHalf = geom.htail_span / 2;
        meshes.push(buildHTailSegment(geom, coords, 0, hHalf, 1, false, false, wallM, true));
        meshes.push(buildHTailSegment(geom, coords, 0, hHalf, -1, false, false, wallM, true));
        meshes.push(buildVTailSegment(geom, vCoords, 0, geom.vtail_span, false, false, wallM, true));
        break;
      }
      case 'fuselage':
        if (geom.fuse_type === 'vtol') {
          meshes.push(buildVTOLShelledFuselage(geom, wallM));
        } else {
          meshes = getAllMeshes();
        }
        break;
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
