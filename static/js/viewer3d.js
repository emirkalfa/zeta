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
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dl2.position.set(-5, 0, -5);
  scene.add(dl2);

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
  buildFuselage(geom, junction);
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
  const taper = geom.taper_ratio != null ? geom.taper_ratio : 0.5;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle != null ? geom.sweep_angle : 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle != null ? geom.dihedral_angle : 3);
  const wingPos = geom.wing_position_offset != null ? geom.wing_position_offset : 0;

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

  // Tip caps as separate meshes
  let halfBase = 0;
  for (const secs of [right, left]) {
    const tip = secs[nSec];
    const cv = [];
    for (const p of tip) cv.push(p.x, p.y, p.z);
    const cent = new THREE.Vector3(0, 0, 0);
    for (const p of tip) cent.add(p);
    cent.divideScalar(nPts);
    const centIdx = nPts;
    cv.push(cent.x, cent.y, cent.z);
    const ci = [];
    for (let j = 0; j < nPts; j++) {
      const jn = (j + 1) % nPts;
      ci.push(j, centIdx, jn);
    }
    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
    capGeo.setIndex(ci);
    capGeo.computeVertexNormals();
    // Copy skin normals to cap perimeter vertices for smooth shading
    const tipStart = halfBase + nSec * nPts;
    const capNrm = capGeo.attributes.normal;
    const skinNrm = geo.attributes.normal;
    for (let j = 0; j < nPts; j++) {
      capNrm.setXYZ(j, skinNrm.getX(tipStart + j), skinNrm.getY(tipStart + j), skinNrm.getZ(tipStart + j));
    }
    capNrm.needsUpdate = true;
    wingGroup.add(new THREE.Mesh(capGeo, new THREE.MeshPhongMaterial({
      color: 0x3b82f6, side: THREE.DoubleSide,
      transparent: junction === 'surface', opacity: junction === 'surface' ? 0.9 : 1.0,
    })));
    halfBase += (nSec + 1) * nPts;
  }

  const eg = new THREE.EdgesGeometry(geo);
  wingGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1e40af, transparent: true, opacity: 0.3 })));
}

// --- FUSELAGE ---
function buildFuselage(geom, junction) {
  buildConventionalFuselage(geom, junction);
}

function tubeMesh(sections, color, edgeColor, opacity) {
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
  const addCap = (sec, dir) => {
    const off = v.length / 3;
    const c = new THREE.Vector3(0,0,0);
    for (const p of sec) c.add(p);
    c.divideScalar(nPts);
    v.push(c.x, c.y, c.z);
    for (let j = 0; j < nPts; j++) {
      const pj = sec[j], pjn = sec[(j+1)%nPts];
      const e1 = new THREE.Vector3().subVectors(pjn, pj);
      const e2 = new THREE.Vector3().subVectors(c, pj);
      const nrm = new THREE.Vector3().crossVectors(e1, e2).normalize();
      if (nrm.dot(dir) >= 0) {
        ii.push(off, pj, pjn);
      } else {
        ii.push(off, pjn, pj);
      }
    }
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(ii); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity }));
  fuseGroup.add(mesh);
  const eg = new THREE.EdgesGeometry(g);
  fuseGroup.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.15 })));
  return mesh;
}

// Conventional tube fuselage (İHA/drone optimized): elliptical cross-section, smoother curves
function buildConventionalFuselage(geom, junction) {
  const L = geom.fuselage_length;
  const W = geom.fuselage_max_width;
  const H = geom.fuselage_max_height;
  const noseLen = geom.nose_length;
  const cylLen = geom.cylindrical_length;
  const tailLen = geom.tailcone_length;
  const nCirc = 28;

  const ep = (theta, a, b) => {
    const ct = Math.cos(theta), st = Math.sin(theta);
    return { x: a * ct, y: b * st };
  };

  // Nose — more aerodynamic ogive shape
  const noseSections = [];
  const nNose = 24;
  for (let i = 0; i <= nNose; i++) {
    const eta = i / nNose;
    const xPos = eta * noseLen;
    const t = eta * eta * (3 - 2 * eta);
    const w = W / 2 * t;
    const h = H / 2 * t;
    const pts = [];
    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      const p = ep(th, w, h);
      pts.push(new THREE.Vector3(xPos, p.y, p.x));
    }
    noseSections.push(pts);
  }

  // Cylindrical section — elliptical
  const wingX = geom.wing_x_pos || L * 0.30;
  const halfSpan = geom.wingspan / 2;
  const cylSections = [];
  const nCyl = 16;
  for (let i = 0; i <= nCyl; i++) {
    const eta = i / nCyl;
    const xPos = noseLen + eta * cylLen;
    let w = W / 2;
    let h = H / 2;
    if (junction === 'through' || junction === 'surface') {
      const dx = Math.abs(xPos - wingX);
      const influence = Math.max(0, 1 - dx / (halfSpan * 0.12));
      if (influence > 0) {
        const pinch = 1 - influence * 0.15 * (1 - influence);
        w *= pinch;
      }
    }
    const pts = [];
    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      const p = ep(th, w, h);
      pts.push(new THREE.Vector3(xPos, p.y, p.x));
    }
    cylSections.push(pts);
  }

  // Tail cone — longer, smoother taper
  const tailSections = [];
  const nTail = 30;
  for (let i = 0; i <= nTail; i++) {
    const eta = i / nTail;
    const xPos = noseLen + cylLen + eta * tailLen;
    const t = 1 - eta * eta * (3 - 2 * eta);
    const w = W / 2 * t;
    const h = H / 2 * t;
    const pts = [];
    for (let j = 0; j < nCirc; j++) {
      const th = (j / nCirc) * 2 * Math.PI;
      const p = ep(th, w, h);
      pts.push(new THREE.Vector3(xPos, p.y, p.x));
    }
    tailSections.push(pts);
  }

  const allSections = [...noseSections, ...cylSections, ...tailSections];
  tubeMesh(allSections, 0x94a3b8, 0x475569, 0.55);
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
function buildWingSegment(geom, coords, yStart, yEnd, sign, hasPins, hasHoles, wallM) {
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

  const verts = [];
  const idxs = [];

  const wallMeters = (wallM > 0) ? wallM : 0;

  if (wallMeters > 0) {
    const innerSecs = secs.map(s => offsetSectionInward(s, wallMeters, nHalf, nPts, 'y'));
    buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
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

  const spanDir = new THREE.Vector3(Math.tan(sweep), Math.sin(dihedral), sign).normalize();

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
    for (const pct of pinPositions) {
      const xPos = pct * chord + yPos * Math.tan(sweep) + wingX;
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
    for (const pct of pinPositions) {
      const xPos = pct * chord + yPos * Math.tan(sweep) + wingX;
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
function buildHTailSegment(geom, coords, yStart, yEnd, sign, hasPins, hasHoles, wallM) {
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

  if (wallMeters > 0) {
    const innerSecs = secs.map(s => offsetSectionInward(s, wallMeters, nHalf, nPts, 'y'));
    buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
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

  const spanDir = new THREE.Vector3(Math.tan(hSweep), 0, sign).normalize();

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
function buildVTailSegment(geom, vCoords, yStart, yEnd, hasPins, hasHoles, wallM) {
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

  if (wallMeters > 0) {
    const innerSecs = secs.map(s => offsetSectionInward(s, wallMeters, nHalf, nPts, 'z'));
    buildThickWingSeg(verts, idxs, secs, innerSecs, nPts);
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

  const spanDir = new THREE.Vector3(Math.tan(hSweep), 1, 0).normalize();

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
