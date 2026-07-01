const STL_SCALE = 1000;

function getWingRootZ(geom) {
  const wo = Math.abs(geom.wing_position_offset || 0);
  let hw, hh;

  if (geom.fuse_type === 'manual' && geom.fuse_sections && geom.fuse_sections.length >= 2) {
    const wingX = geom.wing_x_pos || (geom.fuselage_length || 1.2) * 0.35;
    const secs = geom.fuse_sections;
    const totalLen = Math.max(secs[secs.length - 1].t, 0.01);
    const t = Math.max(0, Math.min(1, wingX / totalLen));

    let i = 0;
    for (i = 0; i < secs.length - 1; i++) {
      if (t >= secs[i].t / totalLen && t <= secs[i + 1].t / totalLen) break;
    }
    i = Math.min(i, secs.length - 2);

    const a = secs[i], b = secs[i + 1];
    const aT = a.t / totalLen, bT = b.t / totalLen;
    const localT = bT !== aT ? (t - aT) / (bT - aT) : 0;
    const s = Math.max(0, Math.min(1, localT));
    const sm = s * s * (3 - 2 * s);

    const actW = a.w + (b.w - a.w) * sm;
    const actH = a.h + (b.h - a.h) * sm;
    hw = actW / 2;
    hh = actH / 2;
  } else {
    hw = (geom.fuselage_max_width || 0.14) / 2;
    hh = (geom.fuselage_max_height || 0.14) / 2;
  }

  if (hh <= 0 || hw <= 0) return 0;
  if (wo >= hh) return hw * 0.15;
  return hw * Math.sqrt(1 - (wo / hh) * (wo / hh));
}

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


function buildVTailPanel(geom, coords, vAngle, sign, wallM) {
  const vHalf = geom.vtail_span / 2;
  const vChord = geom.vtail_chord;
  const vTaper = geom.vtail_taper || 0.6;
  const vSweep = THREE.MathUtils.degToRad(geom.vtail_sweep || 5);
  const tailX = geom.tail_x_pos || geom.fuselage_length * 0.82;

  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);
  const nPts = coords.length;
  const nSec = 16;

  const secs = [];
  for (let i = 0; i <= nSec; i++) {
    const eta = i / nSec;
    const rLen = eta * vHalf;
    const chord = vChord * (1 - (rLen / vHalf) * (1 - vTaper));
    const xOff = tailX + rLen * Math.tan(vSweep);
    const pts = [];
    for (const idx of uIdx) {
      pts.push(new THREE.Vector3(
        coords[idx].x * chord + xOff,
        coords[idx].y_upper * chord * 0.8 + rLen * Math.sin(vAngle),
        sign * rLen * Math.cos(vAngle)
      ));
    }
    for (const idx of lIdx) {
      pts.push(new THREE.Vector3(
        coords[idx].x * chord + xOff,
        coords[idx].y_lower * chord * 0.8 + rLen * Math.sin(vAngle),
        sign * rLen * Math.cos(vAngle)
      ));
    }
    secs.push(pts);
  }

  const verts = [];
  const idxs = [];
  const wallMeters = (wallM > 0) ? wallM : 0;
  const spanDir = new THREE.Vector3(Math.tan(vSweep), Math.sin(vAngle), sign * Math.cos(vAngle)).normalize();

  if (wallMeters > 0) {
    const innerSecs = secs.map(s => offsetSectionInward(s, wallMeters, nHalf, nPts, 'z'));
    const tipInfo = buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
    const inwardDir = spanDir.clone().negate();
    const capDepth = wallMeters;
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
    makeCapFan(verts, idxs, tipInfo.innerTipStart, nPts, frontCenter, spanDir);
  } else {
    for (const sec of secs) {
      for (const p of sec) verts.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < nPts; j++) {
        const jn = (j + 1) % nPts;
        const a = i * nPts + j;
        const b = i * nPts + jn;
        const c = (i + 1) * nPts + j;
        const d = (i + 1) * nPts + jn;
        idxs.push(a, c, b);
        idxs.push(b, c, d);
      }
    }
  }

  if (wallMeters <= 0) {
    const rootC = new THREE.Vector3(0, 0, 0);
    for (const p of secs[0]) rootC.add(p);
    rootC.divideScalar(nPts);
    makeCapFan(verts, idxs, 0, nPts, rootC, spanDir.clone().negate());
    const tipC = new THREE.Vector3(0, 0, 0);
    for (const p of secs[nSec]) tipC.add(p);
    tipC.divideScalar(nPts);
    makeCapFan(verts, idxs, nSec * nPts, nPts, tipC, spanDir);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0xf59e0b, side: THREE.DoubleSide, flatShading: false,
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
        const wingRootZ = getWingRootZ(geom);
        meshes.push(buildWingSegment(geom, coords, wingRootZ, halfSpan, 1, false, false, wallM, true, true));
        meshes.push(buildWingSegment(geom, coords, wingRootZ, halfSpan, -1, false, false, wallM, true, true));
        break;
      }
      case 'tail': {
        const tailType = geom.tail_type || 'conventional';
        const coords = state.tailCoords;
        if (tailType === 'vtail') {
          const vAngle = THREE.MathUtils.degToRad(35);
          for (const sign of [1, -1]) {
            meshes.push(buildVTailPanel(geom, coords, vAngle, sign, wallM));
          }
        } else {
          const vCoords = state.vtailCoords || state.tailCoords;
          const hHalf = geom.htail_span / 2;
          meshes.push(buildHTailSegment(geom, coords, 0, hHalf, 1, false, false, wallM, true));
          meshes.push(buildHTailSegment(geom, coords, 0, hHalf, -1, false, false, wallM, true));
          meshes.push(buildVTailSegment(geom, vCoords, 0, geom.vtail_span, false, false, wallM, true));
        }
        break;
      }
      case 'fuselage':
        meshes = getAllMeshes();
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

function buildFuselageSections(geom, type, airfoilCoords) {
  if (type === 'conventional') {
    const L = geom.fuselage_length || 1.2;
    const maxW = (geom.fuselage_max_width || 0.14) / 2;
    const maxH = (geom.fuselage_max_height || 0.14) / 2;
    const nSecs = 64;
    const nCirc = 40;

    function smoothstep(a, b, x) {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    function widthProfile(x) {
      const t = x / L;
      const bR = 1.0, tR = 0.35;
      if (t < 0.30) { const u = t / 0.30; return bR * Math.sqrt(u); }
      else if (t < 0.75) return bR;
      else { const u = (t - 0.75) / 0.25; return bR - (bR - tR) * Math.sin(u * Math.PI / 2); }
    }
    function heightProfile(x) {
      const t = x / L;
      const bR = 1.0, tR = 0.30;
      if (t < 0.32) { const u = t / 0.32; return bR * Math.sqrt(u); }
      else if (t < 0.72) return bR;
      else { const u = (t - 0.72) / 0.28; return bR - (bR - tR) * Math.sin(u * Math.PI / 2); }
    }
    function upperShape(x) { const t = x / L; return 0.82 - 0.08 * Math.exp(-Math.pow((t - 0.55) / 0.20, 2)); }
    function lowerShape(x) { const t = x / L; return 1.12 + 0.10 * Math.exp(-Math.pow((t - 0.50) / 0.25, 2)); }
    function ventralPod(x) {
      const t = x / L, center = 0.45, width = 0.20, peak = 0.25;
      return peak * Math.exp(-Math.pow((t - center) / width, 2) * 4);
    }
    function superellipse(theta, n) {
      const ct = Math.cos(theta), st = Math.sin(theta), ex = 2 / n;
      return { x: Math.sign(ct) * Math.pow(Math.abs(ct), ex), y: Math.sign(st) * Math.pow(Math.abs(st), ex) };
    }

    const sections = [];
    for (let i = 0; i <= nSecs; i++) {
      const t = i / nSecs, x = t * L;
      const w = maxW * widthProfile(x), h = maxH * heightProfile(x);
      const up = upperShape(x), low = lowerShape(x), vent = ventralPod(x);
      const sec = [];
      for (let j = 0; j < nCirc; j++) {
        const theta = (j / nCirc) * Math.PI * 2;
        const sp = superellipse(theta, 2.4 + 0.8 * Math.sin(t * Math.PI));
        let y = sp.y * h;
        let z = sp.x * w;
        if (y > 0) y *= up;
        else y = y * low - h * vent * (1 - Math.pow(Math.abs(sp.x), 0.6));
        sec.push({ x, y, z });
      }
      sections.push(sec);
    }
    if (airfoilCoords) applyWingRootCutout(sections, nCirc, geom, airfoilCoords);
    return { sections, nCirc };
  }

  // Manual (özgün) fuselage
  const raw = (geom.fuse_sections && geom.fuse_sections.length >= 2)
    ? geom.fuse_sections.map(s => ({ t: s.t, w: s.w, h: s.h }))
    : [
        { t: 0.00, w: 0.143, h: 0.111 },
        { t: 0.15, w: 0.571, h: 0.667 },
        { t: 0.45, w: 1.000, h: 1.000 },
        { t: 0.90, w: 0.429, h: 0.444 },
        { t: 1.10, w: 0.100, h: 0.100 },
        { t: 1.20, w: 0.057, h: 0.044 },
      ];

  const totalLen = Math.max(raw[raw.length - 1].t, 0.01);
  const keyframes = raw.map(s => ({ t: s.t / totalLen, w: s.w, h: s.h }));
  keyframes.sort((a, b) => a.t - b.t);

  function interpolate(t) {
    if (t <= keyframes[0].t) return { w: keyframes[0].w, h: keyframes[0].h };
    if (t >= keyframes[keyframes.length - 1].t) return { w: keyframes[keyframes.length - 1].w, h: keyframes[keyframes.length - 1].h };
    for (let i = 0; i < keyframes.length - 1; i++) {
      const a = keyframes[i], b = keyframes[i + 1];
      if (t >= a.t && t <= b.t) {
        const localT = (t - a.t) / (b.t - a.t);
        const smoothT = localT * localT * (3 - 2 * localT);
        return { w: a.w + (b.w - a.w) * smoothT, h: a.h + (b.h - a.h) * smoothT };
      }
    }
    return { w: keyframes[keyframes.length - 1].w, h: keyframes[keyframes.length - 1].h };
  }

  const nSecs = 48;
  const nCirc = 32;
  const sections = [];
  for (let i = 0; i <= nSecs; i++) {
    const t = i / nSecs, x = t * totalLen;
    const prof = interpolate(t);
    const w = prof.w / 2, h = prof.h / 2;
    const sec = [];
    for (let j = 0; j < nCirc; j++) {
      const theta = (j / nCirc) * Math.PI * 2;
      sec.push({ x, y: h * Math.sin(theta), z: w * Math.cos(theta) });
    }
    sections.push(sec);
  }
  if (airfoilCoords) applyWingRootCutout(sections, nCirc, geom, airfoilCoords);
  return { sections, nCirc };
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
      idxs.push(start + j, start + jn, ci);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial());
}

function exportFuselageSTL(type) {
  if (!checkGeom()) return;
  const geom = state.geometry;

  if (type !== 'conventional' && type !== 'manual') return;

  const { sections, nCirc } = buildFuselageSections(geom, type, state.airfoilCoords);
  if (!sections.length) {
    alert('Gövde modeli oluşturulamadı.');
    return;
  }

  const mesh = meshFromSections(sections, nCirc);
  const fileName = type === 'conventional' ? 'zeta_fuselage_conventional.stl' : 'zeta_fuselage_manual.stl';
  exportMeshAsSTL(mesh, fileName);
}

function exportSlicedFuselage(type) {
  if (!checkGeom()) return;
  const n = getNumSegments(type === 'conventional' ? 'fuseConvSliceCount' : 'fuseManualSliceCount');
  if (n <= 1) { alert('Parça sayısı en az 2 olmalıdır.'); return; }

  const geom = state.geometry;
  const { sections, nCirc } = buildFuselageSections(geom, type, state.airfoilCoords);
  if (!sections.length) { alert('Gövde modeli oluşturulamadı.'); return; }

  const totalSecs = sections.length;
  const segSize = totalSecs / n;
  const ext = type === 'conventional' ? 'conv' : 'manual';

  for (let seg = 0; seg < n; seg++) {
    const iStart = Math.round(seg * segSize);
    const iEnd = Math.round((seg + 1) * segSize);
    const segSections = sections.slice(iStart, iEnd + 1);
    if (segSections.length < 2) continue;
    const mesh = meshFromSections(segSections, nCirc);
    exportMeshAsSTL(mesh, `zeta_fuselage_${ext}_${seg+1}of${n}.stl`);
  }
}

function exportSlicedWing() {
  if (!checkGeom()) return;
  const n = getNumSegments('sliceCount');
  if (n <= 1) { alert('Parça sayısı en az 2 olmalıdır.'); return; }

  const geom = state.geometry;
  const coords = state.airfoilCoords;
  const halfSpan = geom.wingspan / 2;
  const wingRootZ = getWingRootZ(geom);
  const wingSpan = halfSpan - wingRootZ;
  const segLen = wingSpan / n;
  const wallM = (state.wallThickness || 0) / 1000;

  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    const sideName = side === 0 ? 'right' : 'left';

    for (let seg = 0; seg < n; seg++) {
      const yStart = wingRootZ + seg * segLen;
      const yEnd = wingRootZ + (seg + 1) * segLen;
      const capTip = seg === n - 1;
      const capRoot = seg === 0;

      const mesh = buildWingSegment(geom, coords, yStart, yEnd, sign, false, false, wallM, capTip, capRoot);
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
