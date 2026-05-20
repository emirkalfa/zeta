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
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'Bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillText(text, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
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
  const len = geom.fuselage_length;
  const rW = geom.fuselage_max_width / 2;
  const rH = geom.fuselage_max_height / 2;
  const nSpan = 36;
  const nCirc = 28;
  const verts = [];
  const idxs = [];

  // Smooth nose profile: cubic ease-out from 0 to 1 over first 25%
  // Smooth tail profile: cubic ease-in from 1 to 0 over last 25%
  const noseProfile = (t) => { const u = Math.min(t / 0.25, 1); return -2 * u * u * u + 3 * u * u; };
  const tailProfile = (t) => { const u = Math.max((t - 0.75) / 0.25, 0); return 1 - (-2 * u * u * u + 3 * u * u); };

  for (let i = 0; i <= nSpan; i++) {
    const eta = i / nSpan;
    const xPos = eta * len;
    const taper = eta < 0.25 ? noseProfile(eta) : eta > 0.75 ? tailProfile(eta) : 1;

    let w, h;

    if (fuseType === 'circular') {
      // Dairesel kesit: w = h (boru şeklinde)
      const avgR = (rW + rH) / 2;
      w = avgR * taper; h = avgR * taper;
    } else if (fuseType === 'blended') {
      // Sivri streamline: dar burun, geniş orta, yassı
      const noseW = eta < 0.15 ? Math.pow(eta / 0.15, 0.7) : 1;
      const tailW = eta > 0.85 ? Math.pow((1 - eta) / 0.15, 0.7) : 1;
      const t2 = Math.min(noseW, tailW);
      w = rW * t2;
      // Height varies: flatter in middle
      const hFactor = 0.5 + 0.5 * (1 - Math.abs(eta - 0.5) * 2);
      h = rH * t2 * hFactor;
    } else {
      // Eliptik (default): real aircraft shape, wider than tall
      // Slightly flattened top/bottom for realistic look
      w = rW * taper;
      h = rH * taper;
    }

    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      // Slight flattening at top/bottom for elliptic type
      let y = w * Math.cos(th);
      let z = h * Math.sin(th);
      if (fuseType === 'elliptic') {
        // Flatten top/bottom by 15% for realistic aircraft look
        const flat = 1 - 0.15 * Math.abs(Math.sin(th)) * (1 - Math.abs(Math.sin(th)));
        y *= flat;
        z *= flat;
      }
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

  // Subtle color variation by type
  const colors = { elliptic: 0x94a3b8, circular: 0x8ba3b8, blended: 0xa0aab8 };
  const color = colors[fuseType] || 0x94a3b8;

  fuseGroup.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide })));
  const eg = new THREE.EdgesGeometry(geo);
  fuseGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.15 })));
}

// --- TAIL ---
function buildTail(geom, coords, tailType, tailX) {
  const nSec = 20;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);

  const getPt = (idx, chord, xOff, yScale, sign, zPos) => ({
    x: coords[idx].x * chord + xOff,
    y: (idx < nHalf ? coords[idx].y_upper : coords[idx].y_lower) * chord * yScale,
    z: sign * zPos,
  });

  const buildMesh = (secs, color, group) => {
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
    group.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x92400e, transparent: true, opacity: 0.25 })));
  };

  // Horizontal tail
  const hSpan = geom.htail_span / 2;
  const hChord = geom.htail_chord;

  const buildHTailHalf = (sign) => {
    const secs = [];
    for (let i = 0; i <= nSec; i++) {
      const eta = i / nSec;
      const yPos = eta * hSpan;
      const chord = hChord * (1 - eta * 0.3);
      const xOff = tailX + yPos * Math.tan(THREE.MathUtils.degToRad(3));
      const pts = [];
      for (const idx of uIdx) { const p = getPt(idx, chord, xOff, 0.8, sign, yPos); pts.push(new THREE.Vector3(p.x, p.y, p.z)); }
      for (const idx of lIdx) { const p = getPt(idx, chord, xOff, 0.8, sign, yPos); pts.push(new THREE.Vector3(p.x, p.y, p.z)); }
      secs.push(pts);
    }
    return secs;
  };

  if (tailType === 'ttail') {
    buildVTail(geom, coords, nHalf, uIdx, lIdx, nSec, tailX);
    const hR = buildHTailHalf(1);
    const hL = buildHTailHalf(-1);
    const vSpan = geom.vtail_span;
    for (const sec of [...hR, ...hL]) {
      for (const p of sec) { p.z += vSpan * 0.5; p.y += vSpan * 0.25; }
    }
    buildMesh([...hR, ...hL.reverse()], 0xf59e0b, tailGroup);

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
          const p = getPt(idx, chord, xOff, 0.8, 1, 0);
          pts.push(new THREE.Vector3(p.x, p.y + rLen * Math.sin(vAngle) * 0.3, sign * rLen * Math.cos(vAngle)));
        }
        for (const idx of lIdx) {
          const p = getPt(idx, chord, xOff, 0.8, 1, 0);
          pts.push(new THREE.Vector3(p.x, p.y + rLen * Math.sin(vAngle) * 0.3, sign * rLen * Math.cos(vAngle)));
        }
        secs.push(pts);
      }
      buildMesh(secs, 0xf59e0b, tailGroup);
    }
  } else {
    const hR = buildHTailHalf(1);
    const hL = buildHTailHalf(-1);
    buildMesh([...hR, ...hL.reverse()], 0xf59e0b, tailGroup);
    buildVTail(geom, coords, nHalf, uIdx, lIdx, nSec, tailX);
  }
}

function buildVTail(geom, coords, nHalf, uIdx, lIdx, nSec, tailX) {
  const vSpan = geom.vtail_span;
  const vChord = geom.vtail_chord;
  const secs = [];
  for (let i = 0; i <= nSec; i++) {
    const eta = i / nSec;
    const chord = vChord * (1 - eta * 0.3);
    const xOff = tailX + eta * vSpan * Math.tan(THREE.MathUtils.degToRad(5));
    const zPos = eta * vSpan;
    const pts = [];
    for (const idx of uIdx) pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_upper * chord * 0.4, zPos));
    for (const idx of lIdx) pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_lower * chord * 0.4, zPos));
    secs.push(pts);
  }
  // Mirror for left side
  const all = [];
  for (const s of secs) all.push(s.map(p => new THREE.Vector3(p.x, -p.y, p.z)));
  all.reverse();
  for (const s of secs) all.push(s);

  const nP = all[0].length;
  const v = []; const ii = [];
  for (const s of all) { for (const p of s) v.push(p.x, p.y, p.z); }
  for (let i = 0; i < all.length - 1; i++) {
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
  tailGroup.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })));
  const eg = new THREE.EdgesGeometry(g);
  tailGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x92400e, transparent: true, opacity: 0.25 })));
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
