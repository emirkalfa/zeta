let viewer = null;
let scene, camera, renderer, controls;
let wingGroup, fuseGroup, tailGroup;
let autoRotate = false;
let animFrame;
let grid;

function initViewer(geom, wingCoords, tailCoords, vtailCoords, airfoilCode, tailType) {
  if (viewer) disposeViewer();

  const container = document.getElementById('three-container');
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 500;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f7fa');

  camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100);
  camera.position.set(3, 1.5, 4);
  camera.lookAt(0.6, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 2.0;
  controls.target.set(0.6, 0, 0);
  controls.update();

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(5, 10, 7);
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dl2.position.set(-5, 0, -5);
  scene.add(dl2);

  grid = new THREE.GridHelper(5, 20, 0x888888, 0x444444);
  grid.position.y = -0.3;
  scene.add(grid);

  addAxes(geom.fuselage_length);

  wingGroup = new THREE.Group();
  fuseGroup = new THREE.Group();
  tailGroup = new THREE.Group();

  const wingX = geom.wing_x_pos || geom.fuselage_length * 0.35;
  const tailX = geom.tail_x_pos || geom.fuselage_length * 0.82;

  buildWing(geom, wingCoords, wingX);
  buildFuselage(geom, wingCoords);
  buildTail(geom, tailCoords, vtailCoords, tailType, tailX);

  scene.add(wingGroup);
  scene.add(fuseGroup);
  scene.add(tailGroup);

  window.addEventListener('resize', onResize);
  viewer = { scene, camera, renderer, controls, container };
  animate();
}

function addAxes(fuseLen) {
  const axLen = 0.4;
  const makeArrow = (dir, clr, label) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(), new THREE.Vector3(0, 0, 0), axLen, clr, 0.12, 0.06);
    scene.add(a);
    const s = makeTextSprite(label, clr);
    s.position.set(dir[0]*axLen*1.4, dir[1]*axLen*1.4, dir[2]*axLen*1.4);
    scene.add(s);
  };
  makeArrow([1,0,0], 0xff4444, 'X');
  makeArrow([0,1,0], 0x44ff44, 'Y');
  makeArrow([0,0,1], 0x4488ff, 'Z');
}

function makeTextSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.font = 'Bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillText(text, 16, 16);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.18, 0.18, 1);
  return sprite;
}

// --- WING ---
function buildWing(geom, coords, wingX) {
  const halfSpan = geom.wingspan / 2;
  const rootChord = geom.root_chord;
  const taper = geom.taper_ratio != null ? geom.taper_ratio : 0.5;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle != null ? geom.sweep_angle : 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle != null ? geom.dihedral_angle : 3);
  const wingPos = geom.wing_position_offset != null ? geom.wing_position_offset : 0;

  const nSec = 35;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);
  const nPts = coords.length;

  const cs = geom.control_surfaces || {};
  const flapES = cs.flap?.eta_start ?? 0.08;
  const flapEE = cs.flap?.eta_end ?? 0.50;
  const ailES = cs.aileron?.eta_start ?? 0.55;
  const ailEE = cs.aileron?.eta_end ?? 0.90;

  const genSecs = (sign) => {
    const secs = [];
    for (let i = 0; i <= nSec; i++) {
      const eta = i / nSec;
      const yPos = eta * halfSpan;
      const chord = rootChord * (1 - eta * (1 - taper));
      const xOff = geom.straight_te ? (rootChord - chord + wingX) : (yPos * Math.tan(sweep) + wingX);
      const yOff = yPos * Math.sin(dihedral);
      const pts = [];
      for (const idx of uIdx) {
        pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_upper * chord + wingPos + yOff, sign * yPos));
      }
      for (const idx of lIdx) {
        pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_lower * chord + wingPos + yOff, sign * yPos));
      }
      secs.push({pts, eta});
    }
    return secs;
  };

  const buildTube = (secs, color, edgeColor, capEnds) => {
    if (secs.length < 2) return;
    const v = []; const ii = [];
    const pl = secs[0].length;
    for (const s of secs) { for (const p of s) v.push(p.x, p.y, p.z); }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        const a = i * pl + j, b = i * pl + jn;
        const c = (i + 1) * pl + j, d = (i + 1) * pl + jn;
        ii.push(a, b, c); ii.push(b, d, c);
      }
    }
    const capAt = (secIdx) => {
      const start = secIdx * pl;
      const cx = new THREE.Vector3(0, 0, 0);
      for (let j = 0; j < pl; j++) {
        const idx = (start + j) * 3;
        cx.x += v[idx]; cx.y += v[idx+1]; cx.z += v[idx+2];
      }
      cx.divideScalar(pl);
      const ci = v.length / 3;
      v.push(cx.x, cx.y, cx.z);
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        ii.push(start + j, start + jn, ci);
      }
    };
    if (capEnds) { capAt(0); capAt(secs.length - 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(ii);
    geo.computeVertexNormals();
    wingGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
    const eg = new THREE.EdgesGeometry(geo);
    wingGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.25 })));
  };

  const typeAt = (eta) => {
    if (eta >= flapES && eta <= flapEE) return 'flap';
    if (eta >= ailES && eta <= ailEE) return 'aileron';
    return 'main';
  };
  const colorMap = { main: 0x3b82f6, flap: 0xf97316, aileron: 0x22c55e };
  const edgeMap = { main: 0x1e40af, flap: 0xc2410c, aileron: 0x15803d };

  for (const sign of [1, -1]) {
    const half = genSecs(sign);
    let curType = null;
    let cur = [];
    for (let i = 0; i < half.length; i++) {
      const t = typeAt(half[i].eta);
      if (t !== curType && cur.length > 0) {
        buildTube(cur, colorMap[curType], edgeMap[curType], curType === 'main');
        cur = [cur[cur.length - 1]];
      }
      cur.push(half[i].pts);
      curType = t;
    }
    if (cur.length > 0) buildTube(cur, colorMap[curType], edgeMap[curType], curType === 'main');
  }
}

// --- FUSELAGE ---
function buildFuselage(geom, wingCoords) {
  if (geom.fuse_type === 'manual') {
    buildManualFuselage(geom, wingCoords);
  } else {
    buildConventionalFuselage(geom, wingCoords);
  }
}

function rebuildFuselage(geom, wingCoords) {
  while (fuseGroup.children.length > 0) {
    const child = fuseGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    fuseGroup.remove(child);
  }
  buildFuselage(geom, wingCoords);
}

function tubeMesh(sections, color, edgeColor, opacity, capEnds) {
  if (sections.length < 2) return null;
  const nPts = sections[0].length;
  const v = []; const ii = [];
  for (const s of sections) { for (const p of s) v.push(p.x, p.y, p.z); }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < nPts; j++) {
      const jn = (j + 1) % nPts;
      const a = i * nPts + j, b = i * nPts + jn;
      const c = (i + 1) * nPts + j, d = (i + 1) * nPts + jn;
      ii.push(a, b, c); ii.push(b, d, c);
    }
  }
  if (capEnds) {
    for (const secIdx of [0, sections.length - 1]) {
      const start = secIdx * nPts;
      const cx = new THREE.Vector3(0, 0, 0);
      for (let j = 0; j < nPts; j++) {
        cx.x += v[(start + j) * 3];
        cx.y += v[(start + j) * 3 + 1];
        cx.z += v[(start + j) * 3 + 2];
      }
      cx.divideScalar(nPts);
      const ci = v.length / 3;
      v.push(cx.x, cx.y, cx.z);
      for (let j = 0; j < nPts; j++) {
        const jn = (j + 1) % nPts;
        ii.push(start + j, start + jn, ci);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(ii); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide }));
  fuseGroup.add(mesh);
  const eg = new THREE.EdgesGeometry(g);
  fuseGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.15 })));
  return mesh;
}

function buildConventionalFuselage(geom, wingCoords) {

  const L = geom.fuselage_length;
  const maxW = geom.fuselage_max_width / 2;
  const maxH = geom.fuselage_max_height / 2;

  const nSecs = 64;
  const nCirc = 40;

  // ================================
  // 1. LONGITUDINAL SHAPE FUNCTIONS
  // ================================

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function widthProfile(x) {
    const t = x / L;
    const bR = 1.0, tR = 0.35;

    if (t < 0.30) {
      const u = t / 0.30;
      return bR * Math.sqrt(u);
    } else if (t < 0.75) {
      return bR;
    } else {
      const u = (t - 0.75) / 0.25;
      return bR - (bR - tR) * Math.sin(u * Math.PI / 2);
    }
  }

  function heightProfile(x) {
    const t = x / L;
    const bR = 1.0, tR = 0.30;

    if (t < 0.32) {
      const u = t / 0.32;
      return bR * Math.sqrt(u);
    } else if (t < 0.72) {
      return bR;
    } else {
      const u = (t - 0.72) / 0.28;
      return bR - (bR - tR) * Math.sin(u * Math.PI / 2);
    }
  }

  function upperShape(x) {
    const t = x / L;
    return 0.82 - 0.08 * Math.exp(-Math.pow((t - 0.55) / 0.20, 2));
  }

  function lowerShape(x) {
    const t = x / L;
    return 1.12 + 0.10 * Math.exp(-Math.pow((t - 0.50) / 0.25, 2));
  }

  // ================================
  // 2. CROSS SECTION (REAL SHAPE)
  // ================================

  function superellipse(theta, n = 2.6) {

    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    const ex = 2 / n;

    const x = Math.sign(ct) * Math.pow(Math.abs(ct), ex);
    const y = Math.sign(st) * Math.pow(Math.abs(st), ex);

    return { x, y };

  }

  // ================================
  // 3. VENTRAL POD (EO/IR CAMERA)
  // ================================

  function ventralPod(x) {

    const t = x / L;

    const center = 0.45;
    const width = 0.20;
    const peak = 0.25;

    const d = (t - center) / width;

    return peak * Math.exp(-d * d * 4);

  }

  // ================================
  // 4. BUILD SECTIONS
  // ================================

  const sections = [];

  for (let i = 0; i <= nSecs; i++) {

    const t = i / nSecs;
    const x = t * L;

    const w = maxW * widthProfile(x);
    const h = maxH * heightProfile(x);

    const up = upperShape(x);
    const low = lowerShape(x);
    const vent = ventralPod(x);

    const sec = [];

    for (let j = 0; j < nCirc; j++) {

      const theta = (j / nCirc) * Math.PI * 2;

      const sp = superellipse(theta, 2.4 + 0.8 * Math.sin(t * Math.PI));

      let y = sp.y * h;
      let z = sp.x * w;

      // upper flattening (wing saddle realism)
      if (y > 0) y *= up;

      // lower pod bulge
      else y = y * low - h * vent * (1 - Math.pow(Math.abs(sp.x), 0.6));

      sec.push(new THREE.Vector3(x, y, z));

    }

    sections.push(sec);

  }

  // ================================
  // 5. WING ROOT CUTOUT
  // ================================

  applyWingRootCutout(sections, nCirc, geom, wingCoords);

  // ================================
  // 6. RENDER
  // ================================

  tubeMesh(
    sections,
    0x94a3b8,
    0x475569,
    1.0,
    true
  );

}

function buildManualFuselage(geom, wingCoords) {
  const length = geom.fuselage_length || 1.2;
  const maxW = (geom.fuselage_max_width || 0.14) / 2;
  const maxH = (geom.fuselage_max_height || 0.14) / 2;

  const nSecs = 48;
  const nCirc = 32;

  // Mutlak metre cinsinden kesit pozisyonlarını normalize et
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
      const a = keyframes[i];
      const b = keyframes[i + 1];
      if (t >= a.t && t <= b.t) {
        const localT = (t - a.t) / (b.t - a.t);
        const smoothT = localT * localT * (3 - 2 * localT);
        return {
          w: a.w + (b.w - a.w) * smoothT,
          h: a.h + (b.h - a.h) * smoothT,
        };
      }
    }
    return { w: keyframes[keyframes.length - 1].w, h: keyframes[keyframes.length - 1].h };
  }

  const sections = [];
  for (let i = 0; i <= nSecs; i++) {
    const t = i / nSecs;
    const x = t * totalLen;
    const prof = interpolate(t);
    const w = maxW * prof.w;
    const h = maxH * prof.h;
    const sec = [];
    for (let j = 0; j < nCirc; j++) {
      const theta = (j / nCirc) * Math.PI * 2;
      const y = h * Math.sin(theta);
      const z = w * Math.cos(theta);
      sec.push(new THREE.Vector3(x, y, z));
    }
    sections.push(sec);
  }

  applyWingRootCutout(sections, nCirc, geom, wingCoords);

  tubeMesh(sections, 0x94a3b8, 0x475569, 1.0, true);
}

function applyWingRootCutout(sections, nCirc, geom, airfoilCoords) {
  if (!airfoilCoords || !airfoilCoords.length || !geom || !geom.wing_x_pos) return;

  const wingX = geom.wing_x_pos;
  const rootChord = geom.root_chord;
  const wingOffset = geom.wing_position_offset || 0;
  const halfWidth = geom.fuselage_max_width / 2;
  const halfHeight = geom.fuselage_max_height / 2;
  const blendDist = halfWidth * 0.6;
  const xBuffer = rootChord * 0.15;
  const xStart = wingX - xBuffer;
  const xEnd = wingX + rootChord + xBuffer;
  const xMidS = wingX;
  const xMidE = wingX + rootChord;

  const nHalf = Math.floor(airfoilCoords.length / 2);
  const upperPts = airfoilCoords.slice(0, nHalf).map(c => ({x: c.x, y: c.y_upper})).sort((a,b)=>a.x-b.x);
  const lowerPts = airfoilCoords.slice(nHalf).map(c => ({x: c.x, y: c.y_lower})).sort((a,b)=>a.x-b.x);

  function interp(arr, lx) {
    if (!arr.length) return 0;
    if (lx <= arr[0].x) return arr[0].y;
    if (lx >= arr[arr.length-1].x) return arr[arr.length-1].y;
    for (let i = 0; i < arr.length-1; i++) {
      if (lx >= arr[i].x && lx <= arr[i+1].x) {
        const t = (lx - arr[i].x) / (arr[i+1].x - arr[i].x);
        return arr[i].y + (arr[i+1].y - arr[i].y) * t;
      }
    }
    return arr[arr.length-1].y;
  }

  function sstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec || !sec.length) continue;
    const x = sec[0].x;

    let bx;
    if (x <= xStart || x >= xEnd) bx = 0;
    else if (x <= xMidS) bx = sstep(xStart, xMidS, x);
    else if (x >= xMidE) bx = 1 - sstep(xMidE, xEnd, x);
    else bx = 1;
    if (bx < 1e-6) continue;

    const lx = (x - wingX) / rootChord;
    if (lx < -0.05 || lx > 1.05) continue;

    const clx = Math.max(0, Math.min(1, lx));
    const wUpper = interp(upperPts, clx) * rootChord + wingOffset;
    const wLower = interp(lowerPts, clx) * rootChord + wingOffset;
    const wingThick = Math.abs(wUpper - wLower);

    for (let j = 0; j < nCirc; j++) {
      const p = sec[j];
      const z = p.z;
      const y0 = p.y;

      const tz = Math.abs(z) / blendDist;
      const bz = tz >= 1 ? 0 : 1 - sstep(0, 1, tz);
      if (bx * bz < 1e-6) continue;

      const dyUpper = Math.abs(y0 - wUpper);
      const dyLower = Math.abs(y0 - wLower);
      const minDy = Math.min(dyUpper, dyLower);

      const sigma = Math.max(wingThick * 0.6, halfHeight * 0.15);
      const by = Math.exp(-(minDy / sigma) * (minDy / sigma));

      const inf = bx * bz * by;
      if (inf < 1e-6) continue;

      const protrusion = Math.max(wingThick * 0.35, halfWidth * 0.04);
      const sign = z >= 0 ? 1 : -1;
      p.z = z + sign * protrusion * inf;
    }
  }
}

// Toggle fuselage visibility
function toggleFuselage() {
  if (!fuseGroup) return;
  fuseGroup.visible = !fuseGroup.visible;
  const btn = document.getElementById('toggleFuse');
  if (btn) btn.classList.toggle('active');
}

// --- TAIL ---
function buildTail(geom, coords, vtailCoords, tailType, tailX) {
  const nSec = 20;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);

  // Vertical tail airfoil indices (may be same or different)
  const vCoords = vtailCoords || coords;
  const vHalf = Math.floor(vCoords.length / 2);
  const vuIdx = Array.from({length: vHalf}, (_, i) => i);
  const vlIdx = Array.from({length: vHalf}, (_, i) => vCoords.length - 1 - i);

  const buildMesh = (secs, color, group, edgeColor) => {
    if (!secs.length) return;
    const nP = secs[0].length;
    const v = []; const ii = [];
    for (const s of secs) { for (const p of s) v.push(p.x, p.y, p.z); }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < nP; j++) {
        const jn = (j + 1) % nP;
        const a = i * nP + j, b = i * nP + jn;
        const c = (i + 1) * nP + j, d = (i + 1) * nP + jn;
        ii.push(a, b, c); ii.push(b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(ii); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));

    // Tip caps as separate meshes
    const halfSize = nSec + 1;
    const nHalves = secs.length / halfSize;
    for (let h = 0; h < nHalves; h++) {
      const tip = secs[(h + 1) * halfSize - 1];
      const cv = [];
      for (const p of tip) cv.push(p.x, p.y, p.z);
      const cent = new THREE.Vector3(0, 0, 0);
      for (const p of tip) cent.add(p);
      cent.divideScalar(nP);
      const centIdx = nP;
      cv.push(cent.x, cent.y, cent.z);
      const ci = [];
      for (let j = 0; j < nP; j++) {
        const jn = (j + 1) % nP;
        ci.push(j, centIdx, jn);
      }
      const capGeo = new THREE.BufferGeometry();
      capGeo.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
      capGeo.setIndex(ci);
      capGeo.computeVertexNormals();
      const tipStart = (h + 1) * halfSize * nP - nP;
      const capNrm = capGeo.attributes.normal;
      const skinNrm = g.attributes.normal;
      for (let j = 0; j < nP; j++) {
        capNrm.setXYZ(j, skinNrm.getX(tipStart + j), skinNrm.getY(tipStart + j), skinNrm.getZ(tipStart + j));
      }
      capNrm.needsUpdate = true;
      group.add(new THREE.Mesh(capGeo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
    }

    const eg = new THREE.EdgesGeometry(g);
    group.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor || 0x92400e, transparent: true, opacity: 0.25 })));
  };

  // ========== HORIZONTAL TAIL (Yatay Stabilizatör + Elevator) ==========
  const hSpan = geom.htail_span / 2;
  const hChord = geom.htail_chord;
  const hTaper = geom.htail_taper || 0.5;
  const hSweep = THREE.MathUtils.degToRad(geom.htail_sweep || 3);
  const hElevChord = hChord * 0.3; // elevator = trailing 30%

  const buildHTail = () => {
    const allSecs = [];
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= nSec; i++) {
        const eta = i / nSec;
        const spanPos = eta * hSpan;
        const chord = hChord * (1 - eta * (1 - hTaper));
        const xOff = tailX + spanPos * Math.tan(hSweep);
        const pts = [];
        for (const idx of uIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_upper * chord * 0.8,
            sign * spanPos
          ));
        }
        for (const idx of lIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_lower * chord * 0.8,
            sign * spanPos
          ));
        }
        allSecs.push(pts);
      }
    }
    return allSecs;
  };

  // ========== VERTICAL TAIL (Dikey Stabilizatör + Rudder) ==========
  const buildVTailFn = () => {
    const vSpan = geom.vtail_span;
    const vChord = geom.vtail_chord;
    const vTaper = geom.vtail_taper || 0.4;
    const secs = [];
    for (let i = 0; i <= nSec; i++) {
      const eta = i / nSec;
      const chord = vChord * (1 - eta * (1 - vTaper));
      const xOff = tailX + eta * vSpan * Math.tan(hSweep);
      const yPos = eta * vSpan;
      const pts = [];
      // Right side (+Z) from airfoil upper surface
      for (const idx of vuIdx) {
        pts.push(new THREE.Vector3(
          vCoords[idx].x * chord + xOff,
          yPos,
          vCoords[idx].y_upper * chord * 0.5
        ));
      }
      // Left side (-Z) from airfoil lower surface
      for (const idx of vlIdx) {
        pts.push(new THREE.Vector3(
          vCoords[idx].x * chord + xOff,
          yPos,
          vCoords[idx].y_lower * chord * 0.5
        ));
      }
      secs.push(pts);
    }
    return secs;
  };

  const buildCSMesh = (secs, color, edgeColor, capEnds) => {
    if (secs.length < 2) return;
    const v = []; const ii = [];
    const pl = secs[0].length;
    for (const s of secs) { for (const p of s) v.push(p.x, p.y, p.z); }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        const a = i * pl + j, b = i * pl + jn;
        const c = (i + 1) * pl + j, d = (i + 1) * pl + jn;
        ii.push(a, b, c); ii.push(b, d, c);
      }
    }
    const capAt = (secIdx) => {
      const start = secIdx * pl;
      const cx = new THREE.Vector3(0, 0, 0);
      for (let j = 0; j < pl; j++) {
        const idx = (start + j) * 3;
        cx.x += v[idx]; cx.y += v[idx+1]; cx.z += v[idx+2];
      }
      cx.divideScalar(pl);
      const ci = v.length / 3;
      v.push(cx.x, cx.y, cx.z);
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        ii.push(start + j, start + jn, ci);
      }
    };
    if (capEnds) { capAt(0); capAt(secs.length - 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(ii);
    geo.computeVertexNormals();
    tailGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
    const eg = new THREE.EdgesGeometry(geo);
    tailGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.2 })));
  };

  const splitTE = (secs, chordRatio) => {
    const nP = secs[0].length;
    const nH = Math.floor(nP / 2);
    const cut = Math.floor(nH * (1 - chordRatio));
    const stab = []; const cs = [];
    for (const s of secs) {
      const stabPts = []; const csPts = [];
      for (let j = 0; j < cut; j++) stabPts.push(s[j].clone());
      for (let j = cut; j < nH; j++) csPts.push(s[j].clone());
      for (let j = nP - nH + cut - 1; j >= nP - nH; j--) stabPts.push(s[j].clone());
      for (let j = nP - 1; j >= nP - nH + cut; j--) csPts.push(s[j].clone());
      stab.push(stabPts);
      cs.push(csPts);
    }
    return { stab, cs };
  };

  // Render
  if (tailType === 'ttail') {
    const vSecs = buildVTailFn();
    const v = splitTE(vSecs, 0.30);
    buildCSMesh(v.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(v.cs, 0xf97316, 0xc2410c, false);
    const hSecs = buildHTail();
    const vHalfSpan = geom.vtail_span;
    for (const s of hSecs) {
      for (const p of s) {
        p.y += vHalfSpan * 0.6;
        p.z *= 0.8;
      }
    }
    const h = splitTE(hSecs, 0.30);
    buildCSMesh(h.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(h.cs, 0x22c55e, 0x15803d, false);

  } else if (tailType === 'vtail') {
    const vAngle = THREE.MathUtils.degToRad(35);
    const panelSpan = geom.vtail_span / 2;
    const vChord = geom.vtail_chord;
    const vTaper = geom.vtail_taper || 0.4;
    const vSweep = THREE.MathUtils.degToRad(geom.vtail_sweep || 5);
    for (const sign of [-1, 1]) {
      const secs = [];
      for (let i = 0; i <= nSec; i++) {
        const eta = i / nSec;
        const chord = vChord * (1 - eta * (1 - vTaper));
        const rLen = eta * panelSpan;
        const xOff = tailX + rLen * Math.tan(vSweep);
        const pts = [];
        for (const idx of uIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_upper * chord + rLen * Math.sin(vAngle),
            sign * rLen * Math.cos(vAngle)
          ));
        }
        for (const idx of lIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_lower * chord + rLen * Math.sin(vAngle),
            sign * rLen * Math.cos(vAngle)
          ));
        }
        secs.push(pts);
      }
      const r = splitTE(secs, 0.30);
      buildCSMesh(r.stab, 0xf59e0b, 0x92400e, false);
      buildCSMesh(r.cs, 0x22c55e, 0x15803d, false);
    }

  } else {
    const hSecs = buildHTail();
    const vSecs = buildVTailFn();
    const h = splitTE(hSecs, 0.30);
    const v = splitTE(vSecs, 0.30);
    buildCSMesh(h.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(h.cs, 0x22c55e, 0x15803d, false);
    buildCSMesh(v.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(v.cs, 0xf97316, 0xc2410c, false);
  }
}

function animate() {
  animFrame = requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function onResize() {
  if (!viewer) return;
  const c = document.getElementById('three-container');
  if (!c) return;
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
}

function viewerSetView(axis) {
  if (!viewer) return;
  const d = 3.5;
  const pos = { x: [d, 0, 0], y: [0, d, 0.1], z: [0, 0.1, d] }[axis] || [3, 1.5, 4];
  camera.position.set(pos[0], pos[1], pos[2]);
  controls.target.set(0.6, 0, 0);
  controls.update();
}

function viewerToggleRotate() {
  if (!viewer) return;
  controls.autoRotate = !controls.autoRotate;
}

function viewerReset() {
  if (!viewer) return;
  camera.position.set(3, 1.5, 4);
  controls.target.set(0.6, 0, 0);
  controls.autoRotate = false;
  document.getElementById('viewAutoRotate')?.classList.remove('active');
  controls.update();
}

function getWingMesh() { return wingGroup ? wingGroup.children.filter(c => c.isMesh) : []; }
function getFuselageMesh() { return fuseGroup ? fuseGroup.children.filter(c => c.isMesh) : []; }
function getTailMesh() { return tailGroup ? tailGroup.children.filter(c => c.isMesh) : []; }
function getAllMeshes() { return [...getWingMesh(), ...getFuselageMesh(), ...getTailMesh()]; }

// ========== WALL THICKNESS HELPERS ==========

function offsetSectionInward(sec, wallM, nHalf, nPts, axis) {
  const inner = new Array(nPts);
  if (axis === 'z') {
    for (let i = 0; i < nHalf; i++) {
      const u = sec[i];
      const l = sec[nPts - 1 - i];
      const halfThick = Math.abs(u.z - l.z) / 2;
      const off = Math.min(wallM, halfThick * 0.99);
      inner[i] = new THREE.Vector3(u.x, u.y, u.z - off);
      inner[nPts - 1 - i] = new THREE.Vector3(l.x, l.y, l.z + off);
    }
  } else {
    for (let i = 0; i < nHalf; i++) {
      const u = sec[i];
      const l = sec[nPts - 1 - i];
      const halfThick = Math.abs(u.y - l.y) / 2;
      const off = Math.min(wallM, halfThick * 0.99);
      inner[i] = new THREE.Vector3(u.x, u.y - off, u.z);
      inner[nPts - 1 - i] = new THREE.Vector3(l.x, l.y + off, l.z);
    }
  }
  return inner;
}

function buildTubeSkin(verts, idxs, sections, nPts, reverse) {
  const start = verts.length / 3;
  for (const sec of sections) {
    for (const p of sec) verts.push(p.x, p.y, p.z);
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < nPts; j++) {
      const jn = (j + 1) % nPts;
      const a = start + i * nPts + j;
      const b = start + i * nPts + jn;
      const c = start + (i + 1) * nPts + j;
      const d = start + (i + 1) * nPts + jn;
      if (reverse) {
        idxs.push(a, b, c);
        idxs.push(c, b, d);
      } else {
        idxs.push(a, c, b);
        idxs.push(b, c, d);
      }
    }
  }
  return start;
}

function buildAnnulus(verts, idxs, outerStart, innerStart, nPts, reverse) {
  for (let j = 0; j < nPts; j++) {
    const jn = (j + 1) % nPts;
    const a = outerStart + j;
    const b = outerStart + jn;
    const c = innerStart + j;
    const d = innerStart + jn;
    if (reverse) {
      idxs.push(a, b, c);
      idxs.push(c, b, d);
    } else {
      idxs.push(a, c, b);
      idxs.push(b, c, d);
    }
  }
}

function buildThickWingSeg(verts, idxs, secs, innerSecs, nPts) {
  buildTubeSkin(verts, idxs, secs, nPts, false);
  const innerStart = buildTubeSkin(verts, idxs, innerSecs, nPts, true);
  const outerRootStart = 0;
  buildAnnulus(verts, idxs, outerRootStart, innerStart, nPts, false);
  const outerTipStart = (secs.length - 1) * nPts;
  const innerTipStart = innerStart + (innerSecs.length - 1) * nPts;
  buildAnnulus(verts, idxs, outerTipStart, innerTipStart, nPts, true);
  return { innerTipStart };
}

function offsetFuselageSection(section, wallM, nCirc) {
  const inner = new Array(nCirc);
  for (let i = 0; i < nCirc; i++) {
    const p = section[i];
    const theta = (i / nCirc) * Math.PI * 2;
    const off = Math.min(wallM, Math.min(Math.abs(p.y), Math.abs(p.z)) * 0.99);
    inner[i] = { x: p.x, y: p.y - off * Math.sin(theta), z: p.z - off * Math.cos(theta) };
  }
  return inner;
}

function buildThickFuselage(verts, idxs, sections, innerSections, nCirc) {
  buildTubeSkin(verts, idxs, sections, nCirc, false);
  const innerStart = buildTubeSkin(verts, idxs, innerSections, nCirc, true);
  buildAnnulus(verts, idxs, 0, innerStart, nCirc, false);
  const outerTip = (sections.length - 1) * nCirc;
  const innerTip = innerStart + (innerSections.length - 1) * nCirc;
  buildAnnulus(verts, idxs, outerTip, innerTip, nCirc, true);
}

function fitFuseViewerToModel() {
  if (!fuseViewerRunning || !fuseViewerGroup || !fuseViewerRenderer || !fuseViewerCamera || !fuseViewerControls) return;
  const c = document.getElementById('fuse-three-container');
  if (!c) return;
  const w = c.clientWidth || 600;
  const h = c.clientHeight || 400;
  fuseViewerCamera.aspect = w / h;
  fuseViewerCamera.updateProjectionMatrix();
  fuseViewerRenderer.setSize(w, h);

  const box = new THREE.Box3().setFromObject(fuseViewerGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const dist = maxDim * 1.6;

  fuseViewerCamera.position.set(
    center.x + dist * 0.5,
    center.y + dist * 0.25,
    center.z + dist
  );
  fuseViewerControls.target.copy(center);
  fuseViewerControls.update();
}

// ========== SLICED SEGMENT GENERATORS ==========

function makeCapFan(verts, idxs, perimeterStart, nPts, center, outwardDir) {
  const cOff = verts.length / 3;
  verts.push(center.x, center.y, center.z);
  const triBase = [];
  for (let j = 0; j < nPts; j++) {
    const jn = (j + 1) % nPts;
    triBase.push(perimeterStart + j, cOff, perimeterStart + jn);
  }
  const refTri = new THREE.Vector3();
  const a = new THREE.Vector3(verts[triBase[1]*3], verts[triBase[1]*3+1], verts[triBase[1]*3+2]);
  const b = new THREE.Vector3(verts[triBase[0]*3], verts[triBase[0]*3+1], verts[triBase[0]*3+2]);
  const c = new THREE.Vector3(verts[triBase[2]*3], verts[triBase[2]*3+1], verts[triBase[2]*3+2]);
  refTri.crossVectors(
    new THREE.Vector3().subVectors(c, b),
    new THREE.Vector3().subVectors(a, b)
  ).normalize();
  if (refTri.dot(outwardDir) < 0) {
    for (let i = 0; i < triBase.length; i += 3) {
      idxs.push(triBase[i], triBase[i+2], triBase[i+1]);
    }
  } else {
    for (let i = 0; i < triBase.length; i += 3) {
      idxs.push(triBase[i], triBase[i+1], triBase[i+2]);
    }
  }
}

function addCylinder(verts, idxs, baseCenter, axis, radius, height, nRadial) {
  const ax = axis.clone().normalize();
  let ref = new THREE.Vector3(0, 1, 0);
  if (Math.abs(ax.dot(ref)) > 0.95) ref.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(ax, ref).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, ax).normalize();

  const start = verts.length / 3;
  const nStacks = 4;

  for (let i = 0; i <= nStacks; i++) {
    const t = i / nStacks;
    const h = t * height;
    for (let j = 0; j < nRadial; j++) {
      const theta = (j / nRadial) * Math.PI * 2;
      const p = baseCenter.clone()
        .add(right.clone().multiplyScalar(Math.cos(theta) * radius))
        .add(fwd.clone().multiplyScalar(Math.sin(theta) * radius))
        .add(ax.clone().multiplyScalar(h));
      verts.push(p.x, p.y, p.z);
    }
  }

  for (let i = 0; i < nStacks; i++) {
    for (let j = 0; j < nRadial; j++) {
      const jn = (j + 1) % nRadial;
      const a = start + i * nRadial + j;
      const b = start + i * nRadial + jn;
      const c = start + (i + 1) * nRadial + j;
      const d = start + (i + 1) * nRadial + jn;
      idxs.push(a, c, b);
      idxs.push(b, c, d);
    }
  }

  const botOff = verts.length / 3;
  verts.push(baseCenter.x, baseCenter.y, baseCenter.z);
  for (let j = 0; j < nRadial; j++) {
    const jn = (j + 1) % nRadial;
    idxs.push(botOff, start + j, start + jn);  // base: faces outward (away from wing)
  }

  const topC = baseCenter.clone().add(ax.clone().multiplyScalar(height));
  const topOff = verts.length / 3;
  verts.push(topC.x, topC.y, topC.z);
  const topRing = start + nStacks * nRadial;
  for (let j = 0; j < nRadial; j++) {
    const jn = (j + 1) % nRadial;
    idxs.push(topOff, topRing + jn, topRing + j);
  }
}

function addDimple(verts, idxs, baseCenter, axis, radius, depth, nRadial) {
  const ax = axis.clone().normalize();
  let ref = new THREE.Vector3(0, 1, 0);
  if (Math.abs(ax.dot(ref)) > 0.95) ref.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(ax, ref).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, ax).normalize();

  const start = verts.length / 3;
  const nStacks = 4;

  for (let i = 0; i <= nStacks; i++) {
    const t = i / nStacks;
    const d = t * depth;
    for (let j = 0; j < nRadial; j++) {
      const theta = (j / nRadial) * Math.PI * 2;
      const p = baseCenter.clone()
        .add(right.clone().multiplyScalar(Math.cos(theta) * radius))
        .add(fwd.clone().multiplyScalar(Math.sin(theta) * radius))
        .add(ax.clone().multiplyScalar(-d));
      verts.push(p.x, p.y, p.z);
    }
  }

  for (let i = 0; i < nStacks; i++) {
    for (let j = 0; j < nRadial; j++) {
      const jn = (j + 1) % nRadial;
      const a = start + i * nRadial + j;
      const b = start + i * nRadial + jn;
      const c = start + (i + 1) * nRadial + j;
      const d = start + (i + 1) * nRadial + jn;
      idxs.push(a, b, c);
      idxs.push(b, d, c);
    }
  }

  const botC = baseCenter.clone().add(ax.clone().multiplyScalar(-depth));
  const botOff = verts.length / 3;
  verts.push(botC.x, botC.y, botC.z);
  const botRing = start + nStacks * nRadial;
  for (let j = 0; j < nRadial; j++) {
    const jn = (j + 1) % nRadial;
    idxs.push(botOff, botRing + jn, botRing + j);
  }
}

// Build a single wing segment as a closed manifold mesh
function buildWingSegment(geom, coords, yStart, yEnd, sign, hasPins, hasHoles, wallM, capTip) {
  const halfSpan = geom.wingspan / 2;
  const rootChord = geom.root_chord;
  const taper = geom.taper_ratio != null ? geom.taper_ratio : 0.5;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle != null ? geom.sweep_angle : 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle != null ? geom.dihedral_angle : 3);
  const wingPos = geom.wing_position_offset != null ? geom.wing_position_offset : 0;
  const wingX = geom.wing_x_pos != null ? geom.wing_x_pos : geom.fuselage_length * 0.35;

  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);
  const nPts = coords.length;
  const nSec = 20;

  const secs = [];
  for (let i = 0; i <= nSec; i++) {
    const eta = i / nSec;
    const yPos = yStart + (yEnd - yStart) * eta;
    const chord = rootChord * (1 - (yPos / halfSpan) * (1 - taper));
    const xOff = geom.straight_te ? (rootChord - chord + wingX) : (yPos * Math.tan(sweep) + wingX);
    const yOff = yPos * Math.sin(dihedral);
    const pts = [];
    for (const idx of uIdx) {
      pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_upper * chord + wingPos + yOff, sign * yPos));
    }
    for (const idx of lIdx) {
      pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_lower * chord + wingPos + yOff, sign * yPos));
    }
    secs.push(pts);
  }

  const verts = [];
  const idxs = [];

  const wallMeters = (wallM > 0) ? wallM : 0;
  const spanDir = new THREE.Vector3(Math.tan(sweep), Math.sin(dihedral), sign).normalize();

  if (wallMeters > 0) {
    const innerSecs = secs.map(s => offsetSectionInward(s, wallMeters, nHalf, nPts, 'y'));
    const tipInfo = buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
    if (capTip) {
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
    }
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
    // Surface-only mode: makeCapFan caps
    const rootSec = secs[0];
    const rootC = new THREE.Vector3(0, 0, 0);
    for (const p of rootSec) rootC.add(p);
    rootC.divideScalar(nPts);
    makeCapFan(verts, idxs, 0, nPts, rootC, spanDir.clone().negate());

    const tipSec = secs[nSec];
    const tipC = new THREE.Vector3(0, 0, 0);
    for (const p of tipSec) tipC.add(p);
    tipC.divideScalar(nPts);
    makeCapFan(verts, idxs, nSec * nPts, nPts, tipC, spanDir);
  }

  // Holes on root cap (recess into the segment)
  if (hasHoles) {
    const yPos = yStart;
    const chord = rootChord * (1 - (yPos / halfSpan) * (1 - taper));
    const pinRadius = Math.max(chord * 0.015, 0.0015);
    const pinDepth = Math.max(chord * 0.035, 0.0035);
    const pinPositions = [0.30, 0.65];
    const xOffHoles = geom.straight_te ? (rootChord - chord) : (yPos * Math.tan(sweep));
    for (const pct of pinPositions) {
      const xPos = xOffHoles + pct * chord + wingX;
      const zPos = sign * (yPos + yPos * Math.sin(dihedral));
      const pinCenter = new THREE.Vector3(xPos, wingPos, zPos);
      addDimple(verts, idxs, pinCenter, spanDir, pinRadius, pinDepth, 8);
    }
  }

  // Pins on tip cap
  if (hasPins) {
    const yPos = yEnd;
    const chord = rootChord * (1 - (yPos / halfSpan) * (1 - taper));
    const pinRadius = Math.max(chord * 0.015, 0.0015);
    const pinHeight = Math.max(chord * 0.035, 0.0035);
    const pinPositions = [0.30, 0.65];
    const xOffPins = geom.straight_te ? (rootChord - chord) : (yPos * Math.tan(sweep));
    for (const pct of pinPositions) {
      const xPos = xOffPins + pct * chord + wingX;
      const zPos = sign * (yPos + yPos * Math.sin(dihedral));
      const pinCenter = new THREE.Vector3(xPos, wingPos, zPos);
      addCylinder(verts, idxs, pinCenter, spanDir, pinRadius, pinHeight, 8);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0x3b82f6, side: THREE.DoubleSide, flatShading: false,
  }));
}

// Build a single horizontal tail segment
function buildHTailSegment(geom, coords, yStart, yEnd, sign, hasPins, hasHoles, wallM, capTip) {
  const hSpan = geom.htail_span / 2;
  const hChord = geom.htail_chord;
  const hTaper = geom.htail_taper || 0.5;
  const hSweep = THREE.MathUtils.degToRad(geom.htail_sweep || 3);
  const tailX = geom.tail_x_pos || geom.fuselage_length * 0.82;

  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);
  const nPts = coords.length;
  const nSec = 16;

  const secs = [];
  for (let i = 0; i <= nSec; i++) {
    const eta = i / nSec;
    const spanPos = yStart + (yEnd - yStart) * eta;
    const chord = hChord * (1 - (spanPos / hSpan) * (1 - hTaper));
    const xOff = tailX + spanPos * Math.tan(hSweep);
    const pts = [];
    for (const idx of uIdx) {
      pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_upper * chord * 0.8, sign * spanPos));
    }
    for (const idx of lIdx) {
      pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_lower * chord * 0.8, sign * spanPos));
    }
    secs.push(pts);
  }

  const verts = [];
  const idxs = [];

  const wallMeters = (wallM > 0) ? wallM : 0;
  const spanDir = new THREE.Vector3(Math.tan(hSweep), 0, sign).normalize();

  if (wallMeters > 0) {
    const innerSecs = secs.map(s => offsetSectionInward(s, wallMeters, nHalf, nPts, 'y'));
    const tipInfo = buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
    if (capTip) {
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
    }
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
    const rootSec = secs[0];
    const rootC = new THREE.Vector3(0, 0, 0);
    for (const p of rootSec) rootC.add(p);
    rootC.divideScalar(nPts);
    makeCapFan(verts, idxs, 0, nPts, rootC, spanDir.clone().negate());

    const tipSec = secs[nSec];
    const tipC = new THREE.Vector3(0, 0, 0);
    for (const p of tipSec) tipC.add(p);
    tipC.divideScalar(nPts);
    makeCapFan(verts, idxs, nSec * nPts, nPts, tipC, spanDir);
  }

  if (hasHoles) {
    const spanPos = yStart;
    const chord = hChord * (1 - (spanPos / hSpan) * (1 - hTaper));
    const r = Math.max(chord * 0.02, 0.0015);
    const d = Math.max(chord * 0.04, 0.003);
    for (const pct of [0.30, 0.65]) {
      const cx = pct * chord + tailX + spanPos * Math.tan(hSweep);
      const cz = sign * spanPos;
      addDimple(verts, idxs, new THREE.Vector3(cx, 0, cz), spanDir, r, d, 8);
    }
  }

  if (hasPins) {
    const spanPos = yEnd;
    const chord = hChord * (1 - (spanPos / hSpan) * (1 - hTaper));
    const r = Math.max(chord * 0.02, 0.0015);
    const h = Math.max(chord * 0.04, 0.003);
    for (const pct of [0.30, 0.65]) {
      const cx = pct * chord + tailX + spanPos * Math.tan(hSweep);
      const cz = sign * spanPos;
      addCylinder(verts, idxs, new THREE.Vector3(cx, 0, cz), spanDir, r, h, 8);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0xf59e0b, side: THREE.DoubleSide, flatShading: false,
  }));
}

// Build a single vertical tail segment
function buildVTailSegment(geom, vCoords, yStart, yEnd, hasPins, hasHoles, wallM, capTip) {
  const vSpan = geom.vtail_span;
  const vChord = geom.vtail_chord;
  const vTaper = geom.vtail_taper || 0.4;
  const hSweep = THREE.MathUtils.degToRad(geom.htail_sweep || 3);
  const tailX = geom.tail_x_pos || geom.fuselage_length * 0.82;

  const nHalf = Math.floor(vCoords.length / 2);
  const vuIdx = Array.from({length: nHalf}, (_, i) => i);
  const vlIdx = Array.from({length: nHalf}, (_, i) => vCoords.length - 1 - i);
  const nPts = vCoords.length;
  const nSec = 16;

  const secs = [];
  for (let i = 0; i <= nSec; i++) {
    const eta = i / nSec;
    const spanPos = yStart + (yEnd - yStart) * eta;
    const chord = vChord * (1 - (spanPos / vSpan) * (1 - vTaper));
    const xOff = tailX + spanPos * Math.tan(hSweep);
    const pts = [];
    for (const idx of vuIdx) {
      pts.push(new THREE.Vector3(vCoords[idx].x * chord + xOff, spanPos, vCoords[idx].y_upper * chord * 0.5));
    }
    for (const idx of vlIdx) {
      pts.push(new THREE.Vector3(vCoords[idx].x * chord + xOff, spanPos, vCoords[idx].y_lower * chord * 0.5));
    }
    secs.push(pts);
  }

  const verts = [];
  const idxs = [];

  const wallMeters = (wallM > 0) ? wallM : 0;
  const spanDir = new THREE.Vector3(Math.tan(hSweep), 1, 0).normalize();

  if (wallMeters > 0) {
    const innerSecs = secs.map(s => offsetSectionInward(s, wallMeters, nHalf, nPts, 'z'));
    const tipInfo = buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
    if (capTip) {
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
    }
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
    const rootSec = secs[0];
    const rootC = new THREE.Vector3(0, 0, 0);
    for (const p of rootSec) rootC.add(p);
    rootC.divideScalar(nPts);
    makeCapFan(verts, idxs, 0, nPts, rootC, spanDir.clone().negate());

    const tipSec = secs[nSec];
    const tipC = new THREE.Vector3(0, 0, 0);
    for (const p of tipSec) tipC.add(p);
    tipC.divideScalar(nPts);
    makeCapFan(verts, idxs, nSec * nPts, nPts, tipC, spanDir);
  }

  if (hasHoles) {
    const spanPos = yStart;
    const chord = vChord * (1 - (spanPos / vSpan) * (1 - vTaper));
    const r = Math.max(chord * 0.02, 0.0015);
    const d = Math.max(chord * 0.04, 0.003);
    for (const pct of [0.30, 0.65]) {
      const cx = pct * chord + tailX + spanPos * Math.tan(hSweep);
      addDimple(verts, idxs, new THREE.Vector3(cx, spanPos, 0), spanDir, r, d, 8);
    }
  }

  if (hasPins) {
    const spanPos = yEnd;
    const chord = vChord * (1 - (spanPos / vSpan) * (1 - vTaper));
    const r = Math.max(chord * 0.02, 0.0015);
    const h = Math.max(chord * 0.04, 0.003);
    for (const pct of [0.30, 0.65]) {
      const cx = pct * chord + tailX + spanPos * Math.tan(hSweep);
      addCylinder(verts, idxs, new THREE.Vector3(cx, spanPos, 0), spanDir, r, h, 8);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0xf59e0b, side: THREE.DoubleSide, flatShading: false,
  }));
}

/* ─── Fuse Viewer (Gövde sekmesi için ayrı 3D görüntüleyici) ─── */
let fuseViewerScene, fuseViewerCamera, fuseViewerRenderer, fuseViewerControls;
let fuseViewerGroup, fuseViewerRunning = false, fuseViewerAnimFrame;
let fuseViewerWingGrid, fuseViewerTailCoords, fuseViewerVtailCoords, fuseViewerTailType;
let fuseViewerGridHelper;

function initFuseViewer(geom, wingCoords, tailCoords, vtailCoords, tailType) {
  const container = document.getElementById('fuse-three-container');
  if (!container) return;
  if (fuseViewerRunning) disposeFuseViewer();

  const w = container.clientWidth || 600;
  const h = container.clientHeight || 350;

  fuseViewerScene = new THREE.Scene();
  fuseViewerScene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f7fa');

  fuseViewerCamera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100);
  fuseViewerCamera.position.set(1.5, 0.6, 1.8);

  fuseViewerRenderer = new THREE.WebGLRenderer({ antialias: true });
  fuseViewerRenderer.setSize(w, h);
  fuseViewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(fuseViewerRenderer.domElement);

  fuseViewerControls = new THREE.OrbitControls(fuseViewerCamera, fuseViewerRenderer.domElement);
  fuseViewerControls.enableDamping = true;
  fuseViewerControls.dampingFactor = 0.1;
  fuseViewerControls.target.set(0.6, 0, 0);
  fuseViewerControls.update();

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  fuseViewerScene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 3, 4);
  fuseViewerScene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-2, 1, -3);
  fuseViewerScene.add(dir2);

  fuseViewerGridHelper = new THREE.GridHelper(2, 10, 0x888888, 0x444444);
  fuseViewerScene.add(fuseViewerGridHelper);

  fuseViewerGroup = new THREE.Group();
  fuseViewerScene.add(fuseViewerGroup);

  fuseViewerWingGrid = wingCoords || null;
  fuseViewerTailCoords = tailCoords || null;
  fuseViewerVtailCoords = vtailCoords || null;
  fuseViewerTailType = tailType || 'conventional';
  buildFuseViewerFuselage(geom, wingCoords);
  fitFuseViewerToModel();

  fuseViewerRunning = true;
  animateFuseViewer();

  function onFuseResize() {
    if (!fuseViewerRunning) return;
    const c = document.getElementById('fuse-three-container');
    if (!c) return;
    fuseViewerCamera.aspect = c.clientWidth / c.clientHeight;
    fuseViewerCamera.updateProjectionMatrix();
    fuseViewerRenderer.setSize(c.clientWidth, c.clientHeight);
  }
  window.addEventListener('resize', onFuseResize);
  fuseViewerRenderer._onResize = onFuseResize;
}

function buildFuseViewerFuselage(geom, wingCoords) {
  while (fuseViewerGroup.children.length > 0) {
    const child = fuseViewerGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    fuseViewerGroup.remove(child);
  }

  const length = geom.fuselage_length || 1.2;
  const maxW = (geom.fuselage_max_width || 0.14) / 2;
  const maxH = (geom.fuselage_max_height || 0.14) / 2;

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
    const t = i / nSecs;
    const x = t * totalLen;
    const prof = interpolate(t);
    const w = maxW * prof.w;
    const h = maxH * prof.h;
    const sec = [];
    for (let j = 0; j < nCirc; j++) {
      const theta = (j / nCirc) * Math.PI * 2;
      sec.push(new THREE.Vector3(x, h * Math.sin(theta), w * Math.cos(theta)));
    }
    sections.push(sec);
  }

  applyWingRootCutout(sections, nCirc, geom, wingCoords);

  if (sections.length < 2) return;
  const nPts = sections[0].length;
  const v = []; const ii = [];
  for (const s of sections) { for (const p of s) v.push(p.x, p.y, p.z); }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < nPts; j++) {
      const jn = (j + 1) % nPts;
      const a = i * nPts + j, b = i * nPts + jn;
      const c = (i + 1) * nPts + j, d = (i + 1) * nPts + jn;
      ii.push(a, b, c); ii.push(b, d, c);
    }
  }
  for (const secIdx of [0, sections.length - 1]) {
    const start = secIdx * nPts;
    const cx = new THREE.Vector3(0, 0, 0);
    for (let j = 0; j < nPts; j++) {
      cx.x += v[(start + j) * 3];
      cx.y += v[(start + j) * 3 + 1];
      cx.z += v[(start + j) * 3 + 2];
    }
    cx.divideScalar(nPts);
    const ci = v.length / 3;
    v.push(cx.x, cx.y, cx.z);
    for (let j = 0; j < nPts; j++) {
      const jn = (j + 1) % nPts;
      ii.push(start + j, start + jn, ci);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(ii); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x3b82f6, side: THREE.DoubleSide }));
  fuseViewerGroup.add(mesh);
  const eg = new THREE.EdgesGeometry(g);
  fuseViewerGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1e40af, transparent: true, opacity: 0.15 })));

  // Build wing on top of fuselage if wing coords are available
  if (fuseViewerWingGrid) {
    const wingX = geom.wing_x_pos || totalLen * 0.35;
    buildFuseViewerWing(geom, fuseViewerWingGrid, wingX);
  }

  // Build tail
  if (fuseViewerTailCoords) {
    const tailX = geom.tail_x_pos || totalLen * 0.82;
    buildFuseViewerTail(geom, fuseViewerTailCoords, fuseViewerVtailCoords, fuseViewerTailType, tailX);
  }

  // Center model on grid (XZ center, Y sits on ground)
  if (fuseViewerGroup.children.length > 0) {
    const box = new THREE.Box3().setFromObject(fuseViewerGroup);
    const c = box.getCenter(new THREE.Vector3());
    fuseViewerGroup.position.set(-c.x, -box.min.y, -c.z);
  }
}

function buildFuseViewerWing(geom, coords, wingX) {
  const halfSpan = geom.wingspan / 2;
  const rootChord = geom.root_chord;
  const taper = geom.taper_ratio != null ? geom.taper_ratio : 0.5;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle != null ? geom.sweep_angle : 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle != null ? geom.dihedral_angle : 3);
  const wingPos = geom.wing_position_offset != null ? geom.wing_position_offset : 0;

  const nSec = 35;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);
  const nPts = coords.length;

  const genSecs = (sign) => {
    const secs = [];
    for (let i = 0; i <= nSec; i++) {
      const eta = i / nSec;
      const yPos = eta * halfSpan;
      const chord = rootChord * (1 - eta * (1 - taper));
      const xOff = geom.straight_te ? (rootChord - chord + wingX) : (yPos * Math.tan(sweep) + wingX);
      const yOff = yPos * Math.sin(dihedral);
      const pts = [];
      for (const idx of uIdx) {
        pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_upper * chord + wingPos + yOff, sign * yPos));
      }
      for (const idx of lIdx) {
        pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_lower * chord + wingPos + yOff, sign * yPos));
      }
      secs.push({pts, eta});
    }
    return secs;
  };

  const buildTube = (secs, color, edgeColor, capEnds) => {
    if (secs.length < 2) return;
    const v = []; const ii = [];
    const pl = secs[0].length;
    for (const s of secs) { for (const p of s) v.push(p.x, p.y, p.z); }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        const a = i * pl + j, b = i * pl + jn;
        const c = (i + 1) * pl + j, d = (i + 1) * pl + jn;
        ii.push(a, b, c); ii.push(b, d, c);
      }
    }
    const capAt = (secIdx) => {
      const start = secIdx * pl;
      const cx = new THREE.Vector3(0, 0, 0);
      for (let j = 0; j < pl; j++) {
        const idx = (start + j) * 3;
        cx.x += v[idx]; cx.y += v[idx+1]; cx.z += v[idx+2];
      }
      cx.divideScalar(pl);
      const ci = v.length / 3;
      v.push(cx.x, cx.y, cx.z);
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        ii.push(start + j, start + jn, ci);
      }
    };
    if (capEnds) { capAt(0); capAt(secs.length - 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(ii);
    geo.computeVertexNormals();
    fuseViewerGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
    const eg = new THREE.EdgesGeometry(geo);
    fuseViewerGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.25 })));
  };

  const typeAt = (eta) => {
    if (eta >= 0.08 && eta <= 0.50) return 'flap';
    if (eta >= 0.55 && eta <= 0.90) return 'aileron';
    return 'main';
  };
  const colorMap = { main: 0x3b82f6, flap: 0xf97316, aileron: 0x22c55e };
  const edgeMap = { main: 0x1e40af, flap: 0xc2410c, aileron: 0x15803d };

  for (const sign of [1, -1]) {
    const half = genSecs(sign);
    let curType = null;
    let cur = [];
    for (let i = 0; i < half.length; i++) {
      const t = typeAt(half[i].eta);
      if (t !== curType && cur.length > 0) {
        buildTube(cur, colorMap[curType], edgeMap[curType], curType === 'main');
        cur = [cur[cur.length - 1]];
      }
      cur.push(half[i].pts);
      curType = t;
    }
    if (cur.length > 0) buildTube(cur, colorMap[curType], edgeMap[curType], curType === 'main');
  }
}

function buildFuseViewerTail(geom, coords, vtailCoords, tailType, tailX) {
  const nSec = 20;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);

  const vCoords = vtailCoords || coords;
  const vHalf = Math.floor(vCoords.length / 2);
  const vuIdx = Array.from({length: vHalf}, (_, i) => i);
  const vlIdx = Array.from({length: vHalf}, (_, i) => vCoords.length - 1 - i);

  const buildMesh = (secs, color, edgeColor) => {
    if (!secs.length) return;
    const nP = secs[0].length;
    const v = []; const ii = [];
    for (const s of secs) { for (const p of s) v.push(p.x, p.y, p.z); }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < nP; j++) {
        const jn = (j + 1) % nP;
        const a = i * nP + j, b = i * nP + jn;
        const c = (i + 1) * nP + j, d = (i + 1) * nP + jn;
        ii.push(a, b, c); ii.push(b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(ii); g.computeVertexNormals();
    fuseViewerGroup.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));

    const halfSize = nSec + 1;
    const nHalves = secs.length / halfSize;
    for (let h = 0; h < nHalves; h++) {
      const tip = secs[(h + 1) * halfSize - 1];
      const cv = [];
      for (const p of tip) cv.push(p.x, p.y, p.z);
      const cent = new THREE.Vector3(0, 0, 0);
      for (const p of tip) cent.add(p);
      cent.divideScalar(nP);
      const centIdx = nP;
      cv.push(cent.x, cent.y, cent.z);
      const ci = [];
      for (let j = 0; j < nP; j++) {
        const jn = (j + 1) % nP;
        ci.push(j, centIdx, jn);
      }
      const capGeo = new THREE.BufferGeometry();
      capGeo.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
      capGeo.setIndex(ci);
      capGeo.computeVertexNormals();
      const tipStart = (h + 1) * halfSize * nP - nP;
      const capNrm = capGeo.attributes.normal;
      const skinNrm = g.attributes.normal;
      for (let j = 0; j < nP; j++) {
        capNrm.setXYZ(j, skinNrm.getX(tipStart + j), skinNrm.getY(tipStart + j), skinNrm.getZ(tipStart + j));
      }
      capNrm.needsUpdate = true;
      fuseViewerGroup.add(new THREE.Mesh(capGeo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
    }

    const eg = new THREE.EdgesGeometry(g);
    fuseViewerGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor || 0x92400e, transparent: true, opacity: 0.25 })));
  };

  const buildCSMesh = (secs, color, edgeColor, capEnds) => {
    if (secs.length < 2) return;
    const v = []; const ii = [];
    const pl = secs[0].length;
    for (const s of secs) { for (const p of s) v.push(p.x, p.y, p.z); }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        const a = i * pl + j, b = i * pl + jn;
        const c = (i + 1) * pl + j, d = (i + 1) * pl + jn;
        ii.push(a, b, c); ii.push(b, d, c);
      }
    }
    const capAt = (secIdx) => {
      const start = secIdx * pl;
      const cx = new THREE.Vector3(0, 0, 0);
      for (let j = 0; j < pl; j++) {
        const idx = (start + j) * 3;
        cx.x += v[idx]; cx.y += v[idx+1]; cx.z += v[idx+2];
      }
      cx.divideScalar(pl);
      const ci = v.length / 3;
      v.push(cx.x, cx.y, cx.z);
      for (let j = 0; j < pl; j++) {
        const jn = (j + 1) % pl;
        ii.push(start + j, start + jn, ci);
      }
    };
    if (capEnds) { capAt(0); capAt(secs.length - 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(ii);
    geo.computeVertexNormals();
    fuseViewerGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
    const eg = new THREE.EdgesGeometry(geo);
    fuseViewerGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.2 })));
  };

  const hSpan = geom.htail_span / 2;
  const hChord = geom.htail_chord;
  const hTaper = geom.htail_taper || 0.5;
  const hSweep = THREE.MathUtils.degToRad(geom.htail_sweep || 3);

  const buildHTail = () => {
    const allSecs = [];
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= nSec; i++) {
        const eta = i / nSec;
        const spanPos = eta * hSpan;
        const chord = hChord * (1 - eta * (1 - hTaper));
        const xOff = tailX + spanPos * Math.tan(hSweep);
        const pts = [];
        for (const idx of uIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_upper * chord * 0.8,
            sign * spanPos
          ));
        }
        for (const idx of lIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_lower * chord * 0.8,
            sign * spanPos
          ));
        }
        allSecs.push(pts);
      }
    }
    return allSecs;
  };

  const buildVTailFn = () => {
    const vSpan = geom.vtail_span;
    const vChord = geom.vtail_chord;
    const vTaper = geom.vtail_taper || 0.4;
    const secs = [];
    for (let i = 0; i <= nSec; i++) {
      const eta = i / nSec;
      const chord = vChord * (1 - eta * (1 - vTaper));
      const xOff = tailX + eta * vSpan * Math.tan(hSweep);
      const yPos = eta * vSpan;
      const pts = [];
      for (const idx of vuIdx) {
        pts.push(new THREE.Vector3(
          vCoords[idx].x * chord + xOff,
          yPos,
          vCoords[idx].y_upper * chord * 0.5
        ));
      }
      for (const idx of vlIdx) {
        pts.push(new THREE.Vector3(
          vCoords[idx].x * chord + xOff,
          yPos,
          vCoords[idx].y_lower * chord * 0.5
        ));
      }
      secs.push(pts);
    }
    return secs;
  };

  const splitTE = (secs, chordRatio) => {
    const nP = secs[0].length;
    const nH = Math.floor(nP / 2);
    const cut = Math.floor(nH * (1 - chordRatio));
    const stab = []; const cs = [];
    for (const s of secs) {
      const stabPts = []; const csPts = [];
      for (let j = 0; j < cut; j++) stabPts.push(s[j].clone());
      for (let j = cut; j < nH; j++) csPts.push(s[j].clone());
      for (let j = nP - nH + cut - 1; j >= nP - nH; j--) stabPts.push(s[j].clone());
      for (let j = nP - 1; j >= nP - nH + cut; j--) csPts.push(s[j].clone());
      stab.push(stabPts);
      cs.push(csPts);
    }
    return { stab, cs };
  };

  if (tailType === 'ttail') {
    const vSecs = buildVTailFn();
    const v = splitTE(vSecs, 0.30);
    buildCSMesh(v.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(v.cs, 0xf97316, 0xc2410c, false);
    const hSecs = buildHTail();
    const vHalfSpan = geom.vtail_span;
    for (const s of hSecs) {
      for (const p of s) {
        p.y += vHalfSpan * 0.6;
        p.z *= 0.8;
      }
    }
    const h = splitTE(hSecs, 0.30);
    buildCSMesh(h.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(h.cs, 0x22c55e, 0x15803d, false);

  } else if (tailType === 'vtail') {
    const vAngle = THREE.MathUtils.degToRad(35);
    const panelSpan = geom.vtail_span / 2;
    const vChord = geom.vtail_chord;
    const vTaper = geom.vtail_taper || 0.4;
    const vSweep = THREE.MathUtils.degToRad(geom.vtail_sweep || 5);
    for (const sign of [-1, 1]) {
      const secs = [];
      for (let i = 0; i <= nSec; i++) {
        const eta = i / nSec;
        const chord = vChord * (1 - eta * (1 - vTaper));
        const rLen = eta * panelSpan;
        const xOff = tailX + rLen * Math.tan(vSweep);
        const pts = [];
        for (const idx of uIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_upper * chord + rLen * Math.sin(vAngle),
            sign * rLen * Math.cos(vAngle)
          ));
        }
        for (const idx of lIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_lower * chord + rLen * Math.sin(vAngle),
            sign * rLen * Math.cos(vAngle)
          ));
        }
        secs.push(pts);
      }
      const r = splitTE(secs, 0.30);
      buildCSMesh(r.stab, 0xf59e0b, 0x92400e, false);
      buildCSMesh(r.cs, 0x22c55e, 0x15803d, false);
    }

  } else {
    const hSecs = buildHTail();
    const vSecs = buildVTailFn();
    const h = splitTE(hSecs, 0.30);
    const v = splitTE(vSecs, 0.30);
    buildCSMesh(h.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(h.cs, 0x22c55e, 0x15803d, false);
    buildCSMesh(v.stab, 0xf59e0b, 0x92400e, false);
    buildCSMesh(v.cs, 0xf97316, 0xc2410c, false);
  }
}

function updateFuseViewer(geom, wingCoords) {
  if (!fuseViewerRunning || !fuseViewerGroup) return;
  buildFuseViewerFuselage(geom, wingCoords);
  fitFuseViewerToModel();
}

function animateFuseViewer() {
  if (!fuseViewerRunning) return;
  fuseViewerAnimFrame = requestAnimationFrame(animateFuseViewer);
  fuseViewerControls.update();
  fuseViewerRenderer.render(fuseViewerScene, fuseViewerCamera);
}

function disposeFuseViewer() {
  if (fuseViewerAnimFrame) cancelAnimationFrame(fuseViewerAnimFrame);
  if (fuseViewerRenderer) {
    fuseViewerRenderer.dispose();
    const c = document.getElementById('fuse-three-container');
    if (c && fuseViewerRenderer.domElement.parentNode === c) c.removeChild(fuseViewerRenderer.domElement);
    if (fuseViewerRenderer._onResize) window.removeEventListener('resize', fuseViewerRenderer._onResize);
  }
  if (fuseViewerControls) fuseViewerControls.dispose();
  fuseViewerScene = null; fuseViewerCamera = null; fuseViewerRenderer = null; fuseViewerControls = null;
  fuseViewerGroup = null; fuseViewerRunning = false;
}

function disposeViewer() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (renderer) {
    renderer.dispose();
    const c = document.getElementById('three-container');
    if (c && renderer.domElement.parentNode === c) c.removeChild(renderer.domElement);
  }
  if (controls) controls.dispose();
  scene = null; camera = null; renderer = null; controls = null;
  wingGroup = null; fuseGroup = null; tailGroup = null;
  viewer = null;
}

function updateViewerTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (isDark ? '#0f172a' : '#f5f7fa');
  const gridColor = isDark ? 0x4a5568 : 0x888888;
  const centerColor = isDark ? 0x2d3748 : 0x444444;

  if (scene) {
    scene.background = new THREE.Color(bg);
  }
  if (fuseViewerScene) {
    fuseViewerScene.background = new THREE.Color(bg);
  }
  if (grid && scene) {
    scene.remove(grid);
    grid.dispose && grid.dispose();
    grid = new THREE.GridHelper(5, 20, gridColor, centerColor);
    grid.position.y = -0.3;
    scene.add(grid);
  }
  if (fuseViewerGridHelper && fuseViewerScene) {
    fuseViewerScene.remove(fuseViewerGridHelper);
    fuseViewerGridHelper.dispose && fuseViewerGridHelper.dispose();
    fuseViewerGridHelper = new THREE.GridHelper(2, 10, gridColor, centerColor);
    fuseViewerScene.add(fuseViewerGridHelper);
  }
}
