let viewer = null;
let scene, camera, renderer, controls;
let wingGroup, fuseGroup, tailGroup;
let autoRotate = false;
let animFrame;

function initViewer(geom, wingCoords, tailCoords, vtailCoords, airfoilCode, junction, tailType) {
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
  buildFuselage(geom);
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
// Simple reference fuselage: elliptical ogive body
function buildFuselage(geom) {
  const L = geom.fuselage_length;
  const W = geom.fuselage_max_width;
  const H = geom.fuselage_max_height;
  const nSpan = 40;
  const nCirc = 24;
  const verts = []; const idxs = [];

  const ss = (t) => t * t * (3 - 2 * t);

  for (let i = 0; i <= nSpan; i++) {
    const eta = i / nSpan;
    const xPos = eta * L;
    let ws, hs;
    if (eta < 0.15) {
      // Ogive nose
      const u = eta / 0.15;
      ws = Math.sin(u * Math.PI / 2);
      hs = ws * 0.85;
    } else if (eta < 0.60) {
      // Constant body, slight crown
      const u = (eta - 0.15) / 0.45;
      ws = 1 - 0.01 * u * u;
      hs = 0.85 + 0.13 * u;
    } else {
      // Tail: smooth cosine taper
      const u = (eta - 0.60) / 0.40;
      ws = 0.99 * (1 - ss(u)) + 0.01;
      hs = 0.96 * (1 - ss(u)) + 0.01;
    }
    const w = W / 2 * ws;
    const h = H / 2 * hs;
    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      const st = Math.sin(th), ct = Math.cos(th);
      // Gentle flat-bottom
      const yy = st < 0 ? h * st * 0.5 : h * st;
      verts.push(xPos, yy, w * ct);
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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();
  fuseGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x94a3b8, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })));
  const eg = new THREE.EdgesGeometry(geo);
  fuseGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.12 })));
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
