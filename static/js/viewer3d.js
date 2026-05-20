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
  const L = geom.fuselage_length;
  const W = geom.fuselage_max_width;
  const H = geom.fuselage_max_height;
  const nSpan = 40;
  const nCirc = 32;
  const verts = [];
  const idxs = [];

  // — Profile (side silhouette) for each aircraft type —
  // Returns { widthScale, heightScale } at normalized position eta (0-1)
  const profile = (eta, type) => {
    if (type === 'cessna') {
      // Cessna 172: hemispherical dome nose, flat belly, long constant body, conical tail
      let ws, hs;
      // Width profile (top view)
      if (eta < 0.12) {
        // Nose dome: quarter ellipse
        const u = eta / 0.12;
        ws = Math.sqrt(1 - (1 - u) * (1 - u));
      } else if (eta < 0.78) {
        // Constant body
        ws = 1;
      } else {
        // Tail cone: linear to 0
        ws = 1 - (eta - 0.78) / 0.22;
      }
      // Height profile (side view): bottom is flat, top is domed
      if (eta < 0.12) {
        const u = eta / 0.12;
        hs = Math.sqrt(1 - (1 - u) * (1 - u));
      } else if (eta < 0.75) {
        hs = 1;
      } else {
        hs = 1 - (eta - 0.75) / 0.25;
      }
      return { ws, hs };
    }

    if (type === 'gulfstream') {
      // Gulfstream G650: moderate nose, wide flat body, long tailcone
      let ws, hs;
      if (eta < 0.20) {
        // Pointy nose
        const u = eta / 0.20;
        ws = Math.pow(u, 0.65);
        hs = Math.pow(u, 0.7);
      } else if (eta < 0.72) {
        // Constant wide body
        ws = 1;
        hs = 1;
      } else {
        // Tailcone
        const u = (eta - 0.72) / 0.28;
        ws = 1 - Math.pow(u, 0.75);
        hs = 1 - Math.pow(u, 0.7);
      }
      // Gulfstream is wider relative to height
      ws *= 1.15;
      return { ws, hs };
    }

    // Cirrus SR22: smooth teardrop (NACA thickness distribution)
    const sqrtE = Math.sqrt(eta);
    const tDist = 2.969 * sqrtE - 1.260 * eta - 3.516 * eta * eta
                + 2.843 * eta * eta * eta - 1.015 * eta * eta * eta * eta;
    const maxT = 0.307; // max of NACA thickness function
    const r = tDist / maxT; // normalize to 0-1
    // Cirrus is sleeker: narrower in front, pointier
    const ws = r * (0.85 + 0.15 * Math.sin(Math.PI * eta));
    const hs = r * (0.80 + 0.20 * Math.sin(Math.PI * eta));
    return { ws, hs };
  };

  // — Cross-section shape for each type —
  // Y = vertical (up), Z = spanwise (horizontal)
  const crossSection = (ws, hs, th, type) => {
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const w = W / 2 * ws;  // half-width (spanwise)
    const h = H / 2 * hs;  // half-height (vertical)

    if (type === 'cessna') {
      // Hemispherical top, flat bottom
      const topR = st >= 0 ? 1 : 1 - 0.35 * (-st) * (1 - Math.abs(ct) * 0.5);
      const y = st >= 0 ? h * st * topR : h * st * topR * 0.5;
      const z = w * ct * (st >= 0 ? 1 : 1 - 0.15 * (1 - Math.abs(ct)));
      return { y, z };
    }

    if (type === 'gulfstream') {
      // Flat bottom, rounded top, bulging sides
      const sideBulge = 1 + 0.12 * (1 - Math.abs(ct));
      const flatBot = st < -0.15 ? 0.7 + 0.3 * (st + 0.15) / 0.85 : 1;
      const y = h * st * (st > 0 ? 1.0 : 0.6);
      const z = w * ct * sideBulge * flatBot;
      return { y, z };
    }

    // Cirrus: smooth elliptical, slightly flattened bottom
    const squeeze = st < -0.2 ? 0.85 : st > 0.2 ? 1 : 1 - 0.15 * (0.2 - Math.abs(st)) / 0.2;
    return { y: h * st, z: w * ct * squeeze };
  };

  for (let i = 0; i <= nSpan; i++) {
    const eta = i / nSpan;
    const xPos = eta * L;
    const { ws, hs } = profile(eta, fuseType);

    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      const { y, z } = crossSection(ws, hs, th, fuseType);
      verts.push(xPos, y, z);
    }
  }

  for (let i = 0; i < nSpan; i++) {
    for (let j = 0; j < nCirc; j++) {
      const jn = (j + 1) % nCirc;
      const a = i * nCirc + j, b = i * nCirc + jn;
      const c = (i + 1) * nCirc + j, d = (i + 1) * nCirc + jn;
      idxs.push(a, b, c);
      idxs.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  const colors = { cessna: 0x94a3b8, cirrus: 0x8ba3b8, gulfstream: 0xa0aab8 };
  fuseGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: colors[fuseType] || 0x94a3b8, side: THREE.DoubleSide })));
  const eg = new THREE.EdgesGeometry(geo);
  fuseGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.10 })));
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
  const hElevChord = hChord * 0.3; // elevator = trailing 30%

  const buildHTail = () => {
    const allSecs = [];
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= nSec; i++) {
        const eta = i / nSec;
        const spanPos = eta * hSpan;
        const chord = hChord * (1 - eta * 0.3);
        const xOff = tailX + spanPos * Math.tan(THREE.MathUtils.degToRad(3));
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
    const secs = [];
    for (let i = 0; i <= nSec; i++) {
      const eta = i / nSec;
      const chord = vChord * (1 - eta * 0.3);
      const xOff = tailX + eta * vSpan * Math.tan(THREE.MathUtils.degToRad(5));
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
        const chord = geom.htail_chord * (1 - eta * 0.3);
        const xOff = tailX + eta * vHalf * Math.tan(THREE.MathUtils.degToRad(5));
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
