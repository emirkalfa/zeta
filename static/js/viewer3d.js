let viewer = null;
let scene, camera, renderer, controls;
let wingGroup, fuseGroup, tailGroup;
let autoRotate = false;
let animFrame;

function initViewer(geom, wingCoords, tailCoords, airfoilCode, junction, tailType, fuseType) {
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
  scene.add(new THREE.DirectionalLight(0xffffff, 0.3).position.set(-5, 0, -5));

  const grid = new THREE.GridHelper(5, 20, 0x888888, 0x444444);
  grid.position.y = -0.3;
  scene.add(grid);

  addAxes(geom.fuselage_length);

  wingGroup = new THREE.Group();
  fuseGroup = new THREE.Group();
  tailGroup = new THREE.Group();

  const wingX = geom.wing_x_pos || geom.fuselage_length * 0.35;
  const tailX = geom.tail_x_pos || geom.fuselage_length * 0.82;

  buildWing(geom, wingCoords, junction, wingX);
  buildFuselage(geom, fuseType || 'elliptic');
  buildTail(geom, tailCoords, tailType, tailX);

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
function buildWing(geom, coords, junction, wingX) {
  const halfSpan = geom.wingspan / 2;
  const rootChord = geom.root_chord;
  const taper = geom.taper_ratio || 0.5;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle || 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle || 3);
  const wingPos = geom.wing_position_offset || 0;

  const nSec = 35;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);

  const makeHalf = (sign) => {
    const secs = [];
    for (let i = 0; i <= nSec; i++) {
      const eta = i / nSec;
      const yPos = eta * halfSpan;
      const chord = rootChord * (1 - eta * (1 - taper));
      const xOff = yPos * Math.tan(sweep) + wingX;
      const zOff = yPos * Math.sin(dihedral);
      const pts = [];
      for (const idx of uIdx) {
        pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_upper * chord + wingPos, sign * (yPos + zOff)));
      }
      for (const idx of lIdx) {
        pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_lower * chord + wingPos, sign * (yPos + zOff)));
      }
      secs.push(pts);
    }
    return secs;
  };

  const right = makeHalf(1);
  const left = makeHalf(-1);
  const nPts = right[0].length;

  const verts = [];
  const idxs = [];

  for (const secs of [right, left]) {
    const offset = verts.length / 3;
    for (const sec of secs) {
      for (const p of sec) verts.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < nPts; j++) {
        const jn = (j + 1) % nPts;
        const a = offset + i * nPts + j;
        const b = offset + i * nPts + jn;
        const c = offset + (i + 1) * nPts + j;
        const d = offset + (i + 1) * nPts + jn;
        idxs.push(a, b, c);
        idxs.push(b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0x3b82f6, side: THREE.DoubleSide, flatShading: false,
    transparent: junction === 'surface', opacity: junction === 'surface' ? 0.9 : 1.0,
  }));
  wingGroup.add(mesh);

  const eg = new THREE.EdgesGeometry(geo);
  wingGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1e40af, transparent: true, opacity: 0.3 })));
}

// --- FUSELAGE ---
function buildFuselage(geom, fuseType) {
  if (fuseType === 'pod_boom') buildPodBoom(geom);
  else if (fuseType === 'twin_boom') buildTwinBoom(geom);
  else if (fuseType === 'flying_wing') buildFlyingWing(geom);
}

function addMeshToFuse(verts, idxs, color, edgeColor, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();
  fuseGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
  if (edgeColor) {
    const eg = new THREE.EdgesGeometry(geo);
    fuseGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: opacity || 0.10 })));
  }
}

function buildCylinderSections(radiusFn, nSegs, nCirc) {
  // radiusFn(eta) returns radius at normalized position
  const verts = [];
  const idxs = [];
  for (let i = 0; i <= nSegs; i++) {
    const eta = i / nSegs;
    const r = radiusFn(eta);
    const xPos = eta;
    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      verts.push(xPos, r * Math.sin(th), r * Math.cos(th));
    }
  }
  for (let i = 0; i < nSegs; i++) {
    for (let j = 0; j < nCirc; j++) {
      const jn = (j + 1) % nCirc;
      const a = i * nCirc + j, b = i * nCirc + jn;
      const c = (i + 1) * nCirc + j, d = (i + 1) * nCirc + jn;
      idxs.push(a, b, c); idxs.push(b, d, c);
    }
  }
  return { verts, idxs };
}

// === POD & BOOM ===
function buildPodBoom(geom) {
  const L = geom.fuselage_length;
  const W = geom.fuselage_max_width;
  const H = geom.fuselage_max_height;
  const nSpan = 48;
  const nCirc = 28;
  const verts = [];
  const idxs = [];
  const ss = (t) => t * t * (3 - 2 * t);

  const profile = (eta) => {
    // Pod: 0 → 0.42, Transition: 0.42 → 0.52, Boom: 0.52 → 1.0
    let ws, hs;
    if (eta < 0.42) {
      // Pod nose: quarter-sine to 1, then hold
      const u = eta / 0.42;
      ws = u < 0.35 ? Math.sin((u / 0.35) * Math.PI / 2) : 1 - 0.03 * Math.pow((u - 0.35) / 0.65, 2);
      hs = u < 0.35 ? Math.sin((u / 0.35) * Math.PI / 2) : 1 - 0.02 * Math.pow((u - 0.35) / 0.65, 2);
    } else if (eta < 0.52) {
      // Transition from pod to boom
      const u = (eta - 0.42) / 0.10;
      const s = ss(u);
      ws = (1 - s) * 0.97 + s * 0.08;
      hs = (1 - s) * 0.98 + s * 0.08;
    } else {
      // Boom: thin circular tube, slight taper toward tail
      const u = (eta - 0.52) / 0.48;
      ws = 0.08 * (1 - 0.3 * u);
      hs = 0.08 * (1 - 0.3 * u);
    }
    return { ws, hs };
  };

  const wingEta = (geom.wing_x_pos || 0.35 * L) / L;

  for (let i = 0; i <= nSpan; i++) {
    const eta = i / nSpan;
    const xPos = eta * L;
    let { ws, hs } = profile(eta);
    const dw = (eta - wingEta) / 0.10;
    if (Math.abs(dw) < 1) {
      const bell = 0.5 - 0.5 * Math.cos(dw * Math.PI);
      ws *= 1 - 0.05 * bell;
      hs *= 1 - 0.02 * bell;
    }
    const w = W / 2 * ws;
    const h = H / 2 * hs;
    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      const y = h * Math.sin(th);
      const z = w * Math.cos(th);
      verts.push(xPos, y, z);
    }
  }
  for (let i = 0; i < nSpan; i++) {
    for (let j = 0; j < nCirc; j++) {
      const jn = (j + 1) % nCirc;
      const a = i * nCirc + j, b = i * nCirc + jn;
      const c = (i + 1) * nCirc + j, d = (i + 1) * nCirc + jn;
      idxs.push(a, b, c); idxs.push(b, d, c);
    }
  }
  addMeshToFuse(verts, idxs, 0x94a3b8, 0x475569, 0.08);
}

// === TWIN-BOOM ===
function buildTwinBoom(geom) {
  const L = geom.fuselage_length;
  const W = geom.fuselage_max_width;
  const H = geom.fuselage_max_height;
  const nCirc = 20;

  // Center pod (0 → 25% of length)
  const podEnd = 0.25;
  const nPod = 20;
  (function() {
    const verts = []; const idxs = [];
    for (let i = 0; i <= nPod; i++) {
      const eta = i / nPod;
      const xPos = eta * podEnd * L;
      const u = eta;
      let ws = u < 0.35 ? Math.sin((u / 0.35) * Math.PI / 2) : 1 - 0.55 * Math.pow((u - 0.35) / 0.65, 1.3);
      let hs = u < 0.35 ? ws : 1 - 0.50 * Math.pow((u - 0.35) / 0.65, 1.3);
      const w = W / 2 * ws;
      const h = H / 2 * hs;
      for (let j = 0; j < nCirc; j++) {
        const th = (j / nCirc) * 2 * Math.PI;
        const st = Math.sin(th), ct = Math.cos(th);
        verts.push(xPos, h * st * (st >= 0 ? 1 : 0.25), w * ct);
      }
    }
    for (let i = 0; i < nPod; i++) {
      for (let j = 0; j < nCirc; j++) {
        const jn = (j + 1) % nCirc;
        const a = i * nCirc + j, b = i * nCirc + jn;
        const c = (i + 1) * nCirc + j, d = (i + 1) * nCirc + jn;
        idxs.push(a, b, c); idxs.push(b, d, c);
      }
    }
    addMeshToFuse(verts, idxs, 0x94a3b8, 0x475569, 0.08);
  })();

  // Two booms
  const boomR = W * 0.05;
  const boomOff = W * 0.30;
  const boomStart = 0.23;
  const nBoom = 28;

  const makeBoom = (sign) => {
    const verts = []; const idxs = [];
    for (let i = 0; i <= nBoom; i++) {
      const eta = i / nBoom;
      const xPos = (boomStart + eta * (1 - boomStart)) * L;
      const r = boomR * (1 - 0.25 * eta);
      for (let j = 0; j < nCirc; j++) {
        const th = (j / nCirc) * 2 * Math.PI;
        const st = Math.sin(th), ct = Math.cos(th);
        verts.push(xPos, r * st, sign * boomOff + r * ct);
      }
    }
    for (let i = 0; i < nBoom; i++) {
      for (let j = 0; j < nCirc; j++) {
        const jn = (j + 1) % nCirc;
        const a = i * nCirc + j, b = i * nCirc + jn;
        const c = (i + 1) * nCirc + j, d = (i + 1) * nCirc + jn;
        idxs.push(a, b, c); idxs.push(b, d, c);
      }
    }
    addMeshToFuse(verts, idxs, 0x8da3b8, 0x475569, 0.08);
  };
  makeBoom(-1);
  makeBoom(1);
}

// === FLYING WING ===
function buildFlyingWing(geom) {
  const L = geom.fuselage_length;
  const W = geom.fuselage_max_width;
  const H = geom.fuselage_max_height;
  const nSpan = 24;
  const nCirc = 24;
  const verts = [];
  const idxs = [];

  // Flying wing: short blended center body, wide and flat
  // Effective length is 30% of normal fuse_length
  const effLen = L * 0.30;
  const wingEta = (geom.wing_x_pos || 0.20 * L) / L;

  for (let i = 0; i <= nSpan; i++) {
    const eta = i / nSpan;
    const xPos = eta * effLen;
    const u = eta;

    // Teardrop profile but very short and wide
    let ws = u < 0.2 ? Math.sin((u / 0.2) * Math.PI / 2) : 1 - Math.pow((u - 0.2) / 0.8, 1.8);
    let hs = u < 0.2 ? Math.sin((u / 0.2) * Math.PI / 2) * 0.5 : (0.5 - 0.4 * Math.pow((u - 0.2) / 0.8, 1.5));

    // Blend into wing at the rear
    if (u > 0.6) {
      const t = (u - 0.6) / 0.4;
      ws *= 1 - 0.5 * t;
      hs *= 0.3 + 0.7 * (1 - t);
    }

    const dw = (eta - wingEta) / 0.12;
    if (Math.abs(dw) < 1) {
      const bell = 0.5 - 0.5 * Math.cos(dw * Math.PI);
      ws *= 1 - 0.04 * bell;
    }

    const w = W * 0.7 * ws;
    const h = H * 0.3 * hs;
    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      // Flat bottom, rounded top profile
      const st = Math.sin(th);
      const ct = Math.cos(th);
      const y = st >= 0 ? h * st : h * st * 0.4;
      const z = w * ct;
      verts.push(xPos, y, z);
    }
  }
  for (let i = 0; i < nSpan; i++) {
    for (let j = 0; j < nCirc; j++) {
      const jn = (j + 1) % nCirc;
      const a = i * nCirc + j, b = i * nCirc + jn;
      const c = (i + 1) * nCirc + j, d = (i + 1) * nCirc + jn;
      idxs.push(a, b, c); idxs.push(b, d, c);
    }
  }
  addMeshToFuse(verts, idxs, 0xa0aab8, 0x475569, 0.08);
}

// --- TAIL ---
function buildTail(geom, coords, tailType, tailX) {
  const nSec = 20;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);

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
      for (const idx of uIdx) {
        pts.push(new THREE.Vector3(
          coords[idx].x * chord + xOff,
          yPos,
          coords[idx].y_upper * chord * 0.5
        ));
      }
      // Left side (-Z) from airfoil lower surface
      for (const idx of lIdx) {
        pts.push(new THREE.Vector3(
          coords[idx].x * chord + xOff,
          yPos,
          coords[idx].y_lower * chord * 0.5
        ));
      }
      secs.push(pts);
    }
    return secs;
  };

  // Render
  if (tailType === 'ttail') {
    // Vertical tail first, then horizontal on top
    buildMesh(buildVTailFn(), 0xf59e0b, tailGroup, 0x92400e);
    const hSecs = buildHTail();
    const vHalfSpan = geom.vtail_span;
    for (const s of hSecs) {
      for (const p of s) {
        p.y += vHalfSpan * 0.6; // lift to top of vertical fin
        p.z *= 0.8; // slightly narrower T-tail
      }
    }
    buildMesh(hSecs, 0xf59e0b, tailGroup, 0x92400e);

  } else if (tailType === 'vtail') {
    const vAngle = THREE.MathUtils.degToRad(35);
    const vHalf = geom.vtail_span * 0.7;
    for (const sign of [-1, 1]) {
      const secs = [];
      for (let i = 0; i <= nSec; i++) {
        const eta = i / nSec;
        const chord = hChord * (1 - eta * (1 - hTaper));
        const xOff = tailX + eta * vHalf * Math.tan(hSweep);
        const rLen = eta * vHalf;
        const pts = [];
        for (const idx of uIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_upper * chord * 0.7 + rLen * Math.sin(vAngle) * 0.3,
            sign * rLen * Math.cos(vAngle)
          ));
        }
        for (const idx of lIdx) {
          pts.push(new THREE.Vector3(
            coords[idx].x * chord + xOff,
            coords[idx].y_lower * chord * 0.7 + rLen * Math.sin(vAngle) * 0.3,
            sign * rLen * Math.cos(vAngle)
          ));
        }
        secs.push(pts);
      }
      buildMesh(secs, 0xf59e0b, tailGroup, 0x92400e);
    }

  } else {
    // Conventional: horizontal + vertical tail
    buildMesh(buildHTail(), 0xf59e0b, tailGroup, 0x92400e);
    buildMesh(buildVTailFn(), 0xf59e0b, tailGroup, 0x92400e);
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
