let viewer = null;
let scene, camera, renderer, controls;
let wingGroup, fuseGroup, tailGroup;
let autoRotate = true;
let animFrame;

function initViewer(geom, coords, airfoilCode, junction, tailType) {
  if (viewer) {
    disposeViewer();
  }

  const container = document.getElementById('three-container');
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 500;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f7fa');

  camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100);
  camera.position.set(3, 2, 4);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.0;
  controls.target.set(0, 0, 0);
  controls.update();

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);
  const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
  backLight.position.set(-5, 0, -5);
  scene.add(backLight);

  // Grid
  const gridHelper = new THREE.GridHelper(4, 20, 0x888888, 0x444444);
  gridHelper.position.y = -0.5;
  scene.add(gridHelper);

  // Axes
  addAxes();

  // Build aircraft
  wingGroup = new THREE.Group();
  fuseGroup = new THREE.Group();
  tailGroup = new THREE.Group();

  buildWing(geom, coords, junction);
  buildFuselage(geom);
  buildTail(geom, coords, tailType);

  scene.add(wingGroup);
  scene.add(fuseGroup);
  scene.add(tailGroup);

  // Auto-resize
  window.addEventListener('resize', onResize);

  viewer = { scene, camera, renderer, controls, container };
  animate();
}

function addAxes() {
  const axesLen = 0.5;
  const makeArrow = (dir, color, label) => {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(), new THREE.Vector3(0, 0, 0), axesLen, color, 0.15, 0.08);
    scene.add(arrow);
    const sprite = makeTextSprite(label, color);
    sprite.position.set(dir[0]*axesLen*1.3, dir[1]*axesLen*1.3, dir[2]*axesLen*1.3);
    scene.add(sprite);
  };
  makeArrow([1,0,0], 0xff4444, 'X');
  makeArrow([0,1,0], 0x44ff44, 'Y');
  makeArrow([0,0,1], 0x4488ff, 'Z');
}

function makeTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, 64, 64);
  ctx.font = 'Bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillText(text, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}

function buildWing(geom, coords, junction) {
  const halfSpan = geom.wingspan / 2;
  const rootChord = geom.root_chord;
  const tipChord = geom.tip_chord;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle || 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle || 3);
  const taper = geom.taper_ratio || 0.5;
  const wingPos = geom.wing_position_offset || 0;

  const nSections = 35;
  const nHalf = Math.floor(coords.length / 2);
  // Upper surface: rows 0 to nHalf-1 (LE to TE), use y_upper
  // Lower surface: rows 2*nHalf-1 down to nHalf (TE to LE), use y_lower
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);

  const makeHalfWing = (sign) => {
    const sections = [];
    for (let i = 0; i <= nSections; i++) {
      const eta = i / nSections;
      const yPos = eta * halfSpan;
      const chord = rootChord * (1 - eta * (1 - taper));
      const xOff = yPos * Math.tan(sweep);
      const zOff = yPos * Math.sin(dihedral);

      const pts = [];
      // Upper surface
      for (const idx of uIdx) {
        pts.push(new THREE.Vector3(
          coords[idx].x * chord + xOff,
          coords[idx].y_upper * chord + wingPos,
          sign * (yPos + zOff)
        ));
      }
      // Lower surface (reversed from TE to LE, using y_lower which is negative)
      for (const idx of lIdx) {
        pts.push(new THREE.Vector3(
          coords[idx].x * chord + xOff,
          coords[idx].y_lower * chord + wingPos,
          sign * (yPos + zOff)
        ));
      }
      sections.push(pts);
    }
    return sections;
  };

  const rightSec = makeHalfWing(1);
  const leftSec = makeHalfWing(-1);

  // Create geometry from sections
  const allPts = rightSec.concat(leftSec.reverse());
  const nPtsPerSec = rightSec[0].length;

  const vertices = [];
  const indices = [];

  // Right wing
  for (let i = 0; i < rightSec.length; i++) {
    for (const p of rightSec[i]) {
      vertices.push(p.x, p.y, p.z);
    }
  }

  const nSec = rightSec.length;
  for (let i = 0; i < nSec - 1; i++) {
    for (let j = 0; j < nPtsPerSec; j++) {
      const jNext = (j + 1) % nPtsPerSec;
      const a = i * nPtsPerSec + j;
      const b = i * nPtsPerSec + jNext;
      const c = (i + 1) * nPtsPerSec + j;
      const d = (i + 1) * nPtsPerSec + jNext;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  // Left wing
  const leftOffset = vertices.length / 3;
  for (let i = 0; i < leftSec.length; i++) {
    for (const p of leftSec[i]) {
      vertices.push(p.x, p.y, p.z);
    }
  }

  const nSecL = leftSec.length;
  for (let i = 0; i < nSecL - 1; i++) {
    for (let j = 0; j < nPtsPerSec; j++) {
      const jNext = (j + 1) % nPtsPerSec;
      const a = leftOffset + i * nPtsPerSec + j;
      const b = leftOffset + i * nPtsPerSec + jNext;
      const c = leftOffset + (i + 1) * nPtsPerSec + j;
      const d = leftOffset + (i + 1) * nPtsPerSec + jNext;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({
    color: 0x3b82f6,
    side: THREE.DoubleSide,
    flatShading: false,
    transparent: junction === 'surface',
    opacity: junction === 'surface' ? 0.9 : 1.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  wingGroup.add(mesh);

  // Edge lines
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x1e40af, transparent: true, opacity: 0.3 });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  wingGroup.add(edges);
}

function buildFuselage(geom) {
  const len = geom.fuselage_length;
  const maxW = geom.fuselage_max_width / 2;
  const maxH = geom.fuselage_max_height / 2;
  const nSpan = 32;
  const nCirc = 24;

  const vertices = [];
  const indices = [];

  for (let i = 0; i <= nSpan; i++) {
    const eta = i / nSpan;
    const xPos = -len * 0.4 + eta * len;

    let w, h;
    if (eta < 0.2) {
      const r = Math.sin(Math.PI * eta / 0.4);
      w = maxW * r; h = maxH * r;
    } else if (eta > 0.8) {
      const r = Math.sin(Math.PI * (1 - eta) / 0.4);
      w = maxW * r; h = maxH * r;
    } else {
      w = maxW; h = maxH;
    }

    for (let j = 0; j < nCirc; j++) {
      const theta = (j / nCirc) * 2 * Math.PI;
      vertices.push(xPos, w * Math.cos(theta), h * Math.sin(theta));
    }
  }

  for (let i = 0; i < nSpan; i++) {
    for (let j = 0; j < nCirc; j++) {
      const jNext = (j + 1) % nCirc;
      const a = i * nCirc + j;
      const b = i * nCirc + jNext;
      const c = (i + 1) * nCirc + j;
      const d = (i + 1) * nCirc + jNext;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({
    color: 0x94a3b8,
    side: THREE.DoubleSide,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  fuseGroup.add(mesh);

  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.2 });
  fuseGroup.add(new THREE.LineSegments(edgeGeo, edgeMat));
}

function buildTail(geom, coords, tailType) {
  const nSections = 20;
  const nHalf = Math.floor(coords.length / 2);
  const uIdx = Array.from({length: nHalf}, (_, i) => i);
  const lIdx = Array.from({length: nHalf}, (_, i) => coords.length - 1 - i);
  const arm = geom.htail_arm || geom.fuselage_length * 0.75;

  const getPt = (idx, chord, xOff, yScale, sign, zPos) => {
    const isUpper = idx < nHalf;
    return new THREE.Vector3(
      coords[idx].x * chord + xOff,
      (isUpper ? coords[idx].y_upper : coords[idx].y_lower) * chord * yScale,
      sign * zPos
    );
  };

  const makeHalfSurface = (secs) => {
    const nPts = secs[0].length;
    const verts = [];
    const idxs = [];
    for (const sec of secs) {
      for (const p of sec) { verts.push(p.x, p.y, p.z); }
    }
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < nPts; j++) {
        const jn = (j + 1) % nPts;
        const a = i * nPts + j, b = i * nPts + jn;
        const c = (i + 1) * nPts + j, d = (i + 1) * nPts + jn;
        idxs.push(a, b, c); idxs.push(b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idxs);
    g.computeVertexNormals();
    return g;
  };

  const buildHTailHalf = (sign) => {
    const hSpan = geom.htail_span / 2;
    const hChord = geom.htail_chord;
    const secs = [];
    for (let i = 0; i <= nSections; i++) {
      const eta = i / nSections;
      const yPos = eta * hSpan;
      const chord = hChord * (1 - eta * 0.3);
      const xOff = arm + yPos * Math.tan(THREE.MathUtils.degToRad(3));
      const pts = [];
      for (const idx of uIdx) pts.push(getPt(idx, chord, xOff, 0.8, sign, yPos));
      for (const idx of lIdx) pts.push(getPt(idx, chord, xOff, 0.8, sign, yPos));
      secs.push(pts);
    }
    return secs;
  };

  if (tailType === 'ttail') {
    buildVTail(geom, nHalf, uIdx, lIdx, nSections, arm, coords);

  } else if (tailType === 'vtail') {
    const vAngle = THREE.MathUtils.degToRad(35);
    const vHalfSpan = geom.vtail_span * 0.7;
    for (const sign of [-1, 1]) {
      const secs = [];
      for (let i = 0; i <= nSections; i++) {
        const eta = i / nSections;
        const chord = geom.htail_chord * (1 - eta * 0.3);
        const xOff = arm + eta * vHalfSpan * Math.tan(THREE.MathUtils.degToRad(5));
        const rLen = eta * vHalfSpan;
        const pts = [];
        for (const idx of uIdx) {
          const p = getPt(idx, chord, xOff, 0.8, 1, 0);
          p.y += rLen * Math.sin(vAngle) * 0.3;
          p.z = sign * rLen * Math.cos(vAngle);
          pts.push(p);
        }
        for (const idx of lIdx) {
          const p = getPt(idx, chord, xOff, 0.8, 1, 0);
          p.y += rLen * Math.sin(vAngle) * 0.3;
          p.z = sign * rLen * Math.cos(vAngle);
          pts.push(p);
        }
        secs.push(pts);
      }
      const g = makeHalfSurface(secs);
      const m = new THREE.MeshPhongMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
      tailGroup.add(new THREE.Mesh(g, m));
      const eg = new THREE.EdgesGeometry(g);
      tailGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x92400e, transparent: true, opacity: 0.25 })));
    }

  } else {
    // Conventional
    const hRight = buildHTailHalf(1);
    const hLeft = buildHTailHalf(-1);
    const all = [...hRight, ...hLeft.reverse()];
    const g = makeHalfSurface(all);
    const m = new THREE.MeshPhongMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
    tailGroup.add(new THREE.Mesh(g, m));
    const eg = new THREE.EdgesGeometry(g);
    tailGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x92400e, transparent: true, opacity: 0.25 })));
    buildVTail(geom, nHalf, uIdx, lIdx, nSections, arm, coords);
  }
}

function addSurface(sections, color, group) {
  const nPts = sections[0].length;
  const verts = [];
  const idxs = [];
  for (const sec of sections) {
    for (const p of sec) { verts.push(p.x, p.y, p.z); }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < nPts; j++) {
      const jn = (j + 1) % nPts;
      const a = i * nPts + j;
      const b = i * nPts + jn;
      const c = (i + 1) * nPts + j;
      const d = (i + 1) * nPts + jn;
      idxs.push(a, b, c);
      idxs.push(b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x92400e, transparent: true, opacity: 0.25 });
  group.add(new THREE.LineSegments(edgeGeo, edgeMat));
}

function buildVTail(geom, nHalf, uIdx, lIdx, nSections, arm, coords) {
  const vSpan = geom.vtail_span;
  const vChord = geom.vtail_chord;
  const secs = [];
  for (let i = 0; i <= nSections; i++) {
    const eta = i / nSections;
    const chord = vChord * (1 - eta * 0.2);
    const xOff = arm + 0.2 + eta * vSpan * Math.tan(THREE.MathUtils.degToRad(5));
    const zPos = eta * vSpan;
    const pts = [];
    // Right side
    for (const idx of uIdx) {
      pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_upper * chord * 0.5, zPos));
    }
    for (const idx of lIdx) {
      pts.push(new THREE.Vector3(coords[idx].x * chord + xOff, coords[idx].y_lower * chord * 0.5, zPos));
    }
    secs.push(pts);
  }
  const allSecs = [];
  for (const sec of secs) {
    allSecs.push(sec.map(p => new THREE.Vector3(p.x, -p.y, p.z)));
  }
  allSecs.reverse();
  for (const sec of secs) allSecs.push(sec);
  addSurface(allSecs, 0xf59e0b, tailGroup);
}

function animate() {
  animFrame = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  const container = document.getElementById('three-container');
  if (!container || !viewer) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function viewerSetView(axis) {
  if (!viewer) return;
  const dist = 4;
  const views = {
    x: new THREE.Vector3(dist, 0, 0),
    y: new THREE.Vector3(0, dist, 0),
    z: new THREE.Vector3(0, 0, dist),
  };
  const pos = views[axis] || views.z;
  camera.position.copy(pos);
  controls.target.set(0, 0, 0);
  controls.update();
}

function viewerToggleRotate() {
  if (!viewer) return;
  controls.autoRotate = !controls.autoRotate;
}

function viewerReset() {
  if (!viewer) return;
  camera.position.set(3, 2, 4);
  controls.target.set(0, 0, 0);
  controls.autoRotate = true;
  document.getElementById('viewAutoRotate').classList.add('active');
  controls.update();
}

function getWingMesh() {
  return wingGroup ? wingGroup.children.filter(c => c.isMesh) : [];
}
function getFuselageMesh() {
  return fuseGroup ? fuseGroup.children.filter(c => c.isMesh) : [];
}
function getTailMesh() {
  return tailGroup ? tailGroup.children.filter(c => c.isMesh) : [];
}
function getAllMeshes() {
  return [...getWingMesh(), ...getFuselageMesh(), ...getTailMesh()];
}

function disposeViewer() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (renderer) {
    renderer.dispose();
    const container = document.getElementById('three-container');
    if (container && renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }
  if (controls) controls.dispose();
  scene = null; camera = null; renderer = null; controls = null;
  wingGroup = null; fuseGroup = null; tailGroup = null;
  viewer = null;
}
