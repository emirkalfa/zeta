let viewer = null;
let scene, camera, renderer, controls;
let wingGroup, fuseGroup, tailGroup;
let autoRotate = false;
let animFrame;
let grid;
const viewTarget = new THREE.Vector3(0.6, 0, 0);
let viewDist = 4;
const HOME_VIEW = [0.55, 0.35, 0.75];

function cssColor(name) {
  return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

// Tema renklerinde zemin ızgarası; boyut bilgisi tema değişiminde yeniden kurmak için saklanır
function makeGrid(size, divisions) {
  const g = new THREE.GridHelper(size, divisions, cssColor('--border-strong'), cssColor('--border'));
  g.userData = { size, divisions };
  return g;
}

function setCameraDirection(dir) {
  const v = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize().multiplyScalar(viewDist);
  camera.position.copy(viewTarget).add(v);
  controls.target.copy(viewTarget);
  controls.update();
}

function initViewer(geom, wingCoords, tailCoords, vtailCoords, airfoilCode, tailType) {
  if (viewer) disposeViewer();

  const container = document.getElementById('three-container');
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 500;

  scene = new THREE.Scene();
  scene.background = cssColor('--bg');

  camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 2.0;

  wingGroup = buildWingGroup(geom, wingCoords);
  fuseGroup = buildFuselageGroup(geom, geom.fuse_type, wingCoords);
  tailGroup = buildTailGroup(geom, tailCoords, vtailCoords || tailCoords);
  scene.add(wingGroup, fuseGroup, tailGroup);

  // Kamerayı ve ızgarayı modelin gerçek boyutuna göre yerleştir
  const box = new THREE.Box3().setFromObject(wingGroup).union(new THREE.Box3().setFromObject(fuseGroup)).union(new THREE.Box3().setFromObject(tailGroup));
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  viewTarget.copy(sphere.center);
  // Dar (dikey) ekranlarda yatay görüş açısı belirleyici olur
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  viewDist = sphere.radius / Math.sin(Math.min(halfV, halfH)) * 0.85;
  setCameraDirection(HOME_VIEW);

  const cell = sphere.radius > 3 ? 1 : 0.1;
  const cells = Math.ceil(sphere.radius * 3 / cell / 2) * 2;
  grid = makeGrid(cells * cell, cells);
  grid.position.set(Math.round(sphere.center.x / cell) * cell, box.min.y - sphere.radius * 0.05, 0);
  scene.add(grid);

  // Modelin zemine düşen gölgesi
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(cells * cell, cells * cell),
    new THREE.ShadowMaterial({ opacity: 0.16 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.copy(grid.position);
  ground.receiveShadow = true;
  scene.add(ground);
  addModelLights(scene, sphere.center, sphere.radius, true);

  addAxes(sphere.radius * 0.16);

  window.addEventListener('resize', onResize);
  viewer = { scene, camera, renderer, controls, container };
  animate();
}

function addAxes(axLen) {
  const makeArrow = (dir, clr, label) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(), new THREE.Vector3(0, 0, 0), axLen, clr, axLen * 0.25, axLen * 0.12);
    scene.add(a);
    const s = makeTextSprite(label, clr);
    s.scale.multiplyScalar(axLen / 0.4);
    s.position.set(dir[0]*axLen*1.3, dir[1]*axLen*1.3, dir[2]*axLen*1.3);
    scene.add(s);
  };
  makeArrow([1,0,0], 0xd9534f, 'X');
  makeArrow([0,1,0], 0x3f9d5a, 'Y');
  makeArrow([0,0,1], 0x3b7dd8, 'Z');
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

function rebuildFuselage(geom, wingCoords) {
  const visible = fuseGroup.visible;
  scene.remove(fuseGroup);
  disposeModel(fuseGroup);
  fuseGroup = buildFuselageGroup(geom, geom.fuse_type, wingCoords);
  fuseGroup.visible = visible;
  scene.add(fuseGroup);
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
  if (typeof manufacturingOverlay !== 'undefined' && manufacturingOverlay) {
    const bodies=manufacturingOverlay.children.filter(m=>/^(body|hatch)(_|$)/.test(m.userData.partName||''));
    const visible= !bodies[0]?.visible;
    bodies.forEach(m=>m.visible=visible);
    document.getElementById('toggleFuse')?.setAttribute('aria-pressed',visible);
    return;
  }
  if (!fuseGroup) return;
  fuseGroup.visible = !fuseGroup.visible;
  document.getElementById('toggleFuse')?.setAttribute('aria-pressed', fuseGroup.visible);
}

function animate() {
  animFrame = requestAnimationFrame(animate);
  if (!viewerPaneVisible('three-container')) return;
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function viewerPaneVisible(id) {
  if(document.hidden)return false;
  const container=document.getElementById(id);
  return !!(container && container.clientWidth && container.clientHeight);
}

function onResize() {
  if (!viewer) return;
  const c = document.getElementById('three-container');
  if (!c || !c.clientWidth || !c.clientHeight) return;
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
}

function viewerSetView(axis) {
  if (!viewer) return;
  // y: tam tepeden bakışta OrbitControls kilitlenmesin diye hafif eğik
  const dir = { x: [-1, 0, 0], y: [0, 1, 0.001], z: [0, 0, 1] }[axis] || HOME_VIEW;
  setCameraDirection(dir);
}

function viewerToggleRotate() {
  if (!viewer) return;
  controls.autoRotate = !controls.autoRotate;
  document.getElementById('viewAutoRotate')?.setAttribute('aria-pressed', controls.autoRotate);
}

function viewerReset() {
  if (!viewer) return;
  controls.autoRotate = false;
  document.getElementById('viewAutoRotate')?.setAttribute('aria-pressed', 'false');
  setCameraDirection(HOME_VIEW);
}

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
  const cy = section.reduce((sum, p) => sum + p.y, 0) / nCirc;
  const radius = Math.min(...section.map(p => Math.hypot(p.y - cy, p.z)));
  const inset = Math.min(wallM, radius * .45);
  const inner = new Array(nCirc);
  for (let i = 0; i < nCirc; i++) {
    const p = section[i], prev = section[(i + nCirc - 1) % nCirc], next = section[(i + 1) % nCirc];
    const normal = (a, b) => {
      const dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dy, dz);
      return { y: -dz / len, z: dy / len };
    };
    const a = normal(prev, p), b = normal(p, next);
    const len = Math.hypot(a.y + b.y, a.z + b.z);
    const ny = (a.y + b.y) / len, nz = (a.z + b.z) / len;
    const off = inset / Math.max(.5, ny * a.y + nz * a.z);
    inner[i] = { x: p.x, y: p.y - off * ny, z: p.z - off * nz };
  }
  return inner;
}

function buildThickFuselage(verts, idxs, sections, innerSections, nCirc) {
  buildTubeSkin(verts, idxs, sections, nCirc, false);
  const innerStart = buildTubeSkin(verts, idxs, innerSections, nCirc, true);
  buildAnnulus(verts, idxs, 0, innerStart, nCirc, true);
  const outerTip = (sections.length - 1) * nCirc;
  const innerTip = innerStart + (innerSections.length - 1) * nCirc;
  buildAnnulus(verts, idxs, outerTip, innerTip, nCirc, false);
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
  fuseViewerScene.background = cssColor('--bg');

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

  addModelLights(fuseViewerScene, new THREE.Vector3(0, 0.2, 0), 1, false);

  fuseViewerGridHelper = makeGrid(2, 20);
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
    if (!c || !c.clientWidth || !c.clientHeight) return;
    fuseViewerCamera.aspect = c.clientWidth / c.clientHeight;
    fuseViewerCamera.updateProjectionMatrix();
    fuseViewerRenderer.setSize(c.clientWidth, c.clientHeight);
  }
  window.addEventListener('resize', onFuseResize);
  fuseViewerRenderer._onResize = onFuseResize;
}

// Gövde sekmesi ana 3D görünüm ve STL ile aynı seçili gövdeyi gösterir.
function buildFuseViewerFuselage(geom, wingCoords) {
  disposeModel(fuseViewerGroup);
  fuseViewerGroup.clear();
  const showAircraft = document.getElementById('fuseShowAircraft')?.checked;
  const production=typeof manufacturingResult!=='undefined'?manufacturingResult:null;
  if(production?.parts?.length){
    for(const part of production.parts){
      if(!showAircraft&&!/^(body|hatch)(_|$)/.test(part.name))continue;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.map(v=>v/1000),3));
      geometry.setIndex(part.faces);geometry.computeVertexNormals();
      const color=part.name.includes('_join_')?0x9b85c4:part.name.startsWith('hatch')?0x34424d:part.name.startsWith('body')?MODEL_COLORS.fuselage:MODEL_COLORS.airframe;
      const mesh=new THREE.Mesh(geometry,modelMaterial(color));mesh.material.flatShading=true;mesh.userData.partName=part.name;
      fuseViewerGroup.add(mesh);
    }
  }else{
  fuseViewerGroup.add(buildFuselageGroup(geom, geom.fuse_type, wingCoords));
  if (showAircraft && fuseViewerWingGrid) fuseViewerGroup.add(buildWingGroup(geom, fuseViewerWingGrid));
  if (showAircraft && fuseViewerTailCoords) {
    fuseViewerGroup.add(buildTailGroup(geom, fuseViewerTailCoords, fuseViewerVtailCoords || fuseViewerTailCoords));
  }
  }

  // Modeli ızgaranın ortasına, zemine oturacak şekilde yerleştir
  fuseViewerGroup.position.set(0, 0, 0);
  const box = new THREE.Box3().setFromObject(fuseViewerGroup);
  const c = box.getCenter(new THREE.Vector3());
  fuseViewerGroup.position.set(-c.x, -box.min.y, -c.z);
}

function updateFuseViewer(geom, wingCoords) {
  if (!fuseViewerRunning || !fuseViewerGroup) return;
  buildFuseViewerFuselage(geom, wingCoords);
  fitFuseViewerToModel();
}

function animateFuseViewer() {
  if (!fuseViewerRunning) return;
  fuseViewerAnimFrame = requestAnimationFrame(animateFuseViewer);
  if (!viewerPaneVisible('fuse-three-container')) return;
  fuseViewerControls.update();
  fuseViewerRenderer.render(fuseViewerScene, fuseViewerCamera);
}

function disposeFuseViewer() {
  if (fuseViewerAnimFrame) cancelAnimationFrame(fuseViewerAnimFrame);
  if (fuseViewerScene) disposeViewerScene(fuseViewerScene);
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
  window.removeEventListener('resize', onResize);
  if (scene) disposeViewerScene(scene);
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

function disposeViewerScene(root) {
  const geometries=new Set(),materials=new Set();
  root.traverse(obj=>{
    if(obj.geometry)geometries.add(obj.geometry);
    for(const material of (Array.isArray(obj.material)?obj.material:[obj.material]))if(material)materials.add(material);
    if(obj.shadow)obj.shadow.dispose();
  });
  geometries.forEach(item=>item.dispose());
  materials.forEach(item=>item.dispose());
}

function updateViewerTheme() {
  const bg = cssColor('--bg');
  if (scene) scene.background = bg;
  if (fuseViewerScene) fuseViewerScene.background = bg;

  const regrid = (parent, old) => {
    const g = makeGrid(old.userData.size, old.userData.divisions);
    g.position.copy(old.position);
    parent.remove(old);
    old.geometry.dispose();
    old.material.dispose();
    parent.add(g);
    return g;
  };
  if (grid && scene) grid = regrid(scene, grid);
  if (fuseViewerGridHelper && fuseViewerScene) fuseViewerGridHelper = regrid(fuseViewerScene, fuseViewerGridHelper);
}
