/* Ekranda gösterilen uçak modeli (ana 3D sahne ve gövde önizlemesi ortak kullanır).
 * STL çıktısı bu ağlardan üretilmez; yalnızca görselleştirme içindir.
 */

const MODEL_COLORS = {
  airframe: 0xeceef1,
  fuselage: 0xd3d8de,
  flap: 0x3b7dd8,
  aileron: 0xe8590c,
  elevator: 0x2a9d8f,
  rudder: 0xd4a017,
  dark: 0x4a5058,
  carbon: 0x2e3238,
  glass: 0x1c2733,
};

function modelMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
    // Panel çizgileri yüzeyle aynı derinlikte; yüzeyi biraz geri iterek çizgileri öne alır
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

// Airfoil koordinatlarından üst/alt yüzey fonksiyonları (satırlar: üst x 0→1, sonra alt x 1→0)
function profileFunctions(coords) {
  const nHalf = Math.floor(coords.length / 2);
  const upper = coords.slice(0, nHalf).map(c => [c.x, c.y_upper]).sort((a, b) => a[0] - b[0]);
  const lower = coords.slice(nHalf).map(c => [c.x, c.y_lower]).sort((a, b) => a[0] - b[0]);
  const interp = (arr, x) => {
    if (x <= arr[0][0]) return arr[0][1];
    for (let i = 1; i < arr.length; i++) {
      if (x <= arr[i][0]) {
        const [x0, y0] = arr[i - 1];
        const [x1, y1] = arr[i];
        return x1 > x0 ? y0 + (y1 - y0) * (x - x0) / (x1 - x0) : y1;
      }
    }
    return arr[arr.length - 1][1];
  };
  return { upper: x => interp(upper, x), lower: x => interp(lower, x) };
}

/**
 * Tek bir taşıyıcı yüzey paneli (kanat yarısı, stabilize, dikey kuyruk…).
 * def: { rootLE, tipLE, rootChord, tipChord, up, coords, controls: [{ etaStart, etaEnd, chordRatio, color }] }
 * Veter +x yönündedir; `up` profil kalınlığının yönüdür. Kontrol yüzeyleri firar kenarında
 * ayrı renkli paneller olarak üretilir; kök ve uç kesitlerinin düz kapakları vardır.
 */
function buildSurface(group, def) {
  const prof = profileFunctions(def.coords);
  const controls = def.controls || [];
  const uniq = arr => [...new Set(arr.map(v => +v.toFixed(5)))].sort((a, b) => a - b);

  const N_CHORD = 22;
  const xs = uniq([
    ...Array.from({ length: N_CHORD + 1 }, (_, k) => (1 - Math.cos(Math.PI * k / N_CHORD)) / 2),
    ...controls.map(c => 1 - c.chordRatio),
  ]);
  const N_SPAN = 14;
  const etas = uniq([
    ...Array.from({ length: N_SPAN + 1 }, (_, k) => k / N_SPAN),
    ...controls.flatMap(c => [c.etaStart, c.etaEnd]),
  ]);

  const spanDir = def.tipLE.clone().sub(def.rootLE).normalize();
  const stations = etas.map(eta => ({
    eta,
    le: def.rootLE.clone().lerp(def.tipLE, eta),
    chord: def.rootChord + (def.tipChord - def.rootChord) * eta,
    thick: 1,
  }));
  // Kesit halkası: üst yüzey firar→hücum, ardından alt yüzey hücum→firar
  const loop = [];
  for (let k = xs.length - 1; k >= 0; k--) loop.push({ x: xs[k], y: prof.upper(xs[k]) });
  for (let k = 1; k < xs.length; k++) loop.push({ x: xs[k], y: prof.lower(xs[k]) });
  const M = loop.length;

  const pointAt = (st, x, y) => st.le.clone()
    .addScaledVector(new THREE.Vector3(1, 0, 0), x * st.chord)
    .addScaledVector(def.up, y * st.chord * st.thick);

  // Dörtgenleri ait oldukları parçaya (ana yüzey ya da bir kontrol yüzeyi) dağıt
  const parts = new Map();
  const partFor = (key) => {
    if (!parts.has(key)) parts.set(key, { verts: [], idx: [], lookup: new Map() });
    return parts.get(key);
  };
  const vertex = (part, i, j) => {
    const id = i * M + j;
    if (!part.lookup.has(id)) {
      const p = pointAt(stations[i], loop[j].x, loop[j].y);
      part.lookup.set(id, part.verts.length / 3);
      part.verts.push(p.x, p.y, p.z);
    }
    return part.lookup.get(id);
  };
  for (let i = 0; i < stations.length - 1; i++) {
    const etaMid = (stations[i].eta + stations[i + 1].eta) / 2;
    for (let j = 0; j < M; j++) {
      const jn = (j + 1) % M;
      const xMid = (loop[j].x + loop[jn].x) / 2;
      const ctrl = stations[i + 1].tipCap ? -1 : controls.findIndex(c =>
        etaMid > c.etaStart && etaMid < c.etaEnd && xMid > 1 - c.chordRatio);
      const part = partFor(ctrl);
      const a = vertex(part, i, j), b = vertex(part, i, jn);
      const c = vertex(part, i + 1, j), d = vertex(part, i + 1, jn);
      part.idx.push(a, b, c, b, d, c);
    }
  }
  // Flat, closed tips match the manufactured panel. Mirrored left panels need
  // reversed winding; otherwise their normals point inward despite DoubleSide.
  const caps = THREE.ShapeUtils.triangulateShape(loop.map(p => new THREE.Vector2(p.x,p.y)), []);
  // Caps use separate vertices so smoothing cannot bend the flat end visually.
  const rootCap = partFor(-2), tipCap = partFor(-3);
  for (const tri of caps) {
    rootCap.idx.push(vertex(rootCap,0,tri[2]),vertex(rootCap,0,tri[1]),vertex(rootCap,0,tri[0]));
    const end=stations.length-1;
    tipCap.idx.push(vertex(tipCap,end,tri[0]),vertex(tipCap,end,tri[1]),vertex(tipCap,end,tri[2]));
  }
  const orientation = new THREE.Vector3(1,0,0).cross(def.up).dot(spanDir);
  if (orientation < 0) for (const p of parts.values()) {
    for(let i=0;i<p.idx.length;i+=3) [p.idx[i+1],p.idx[i+2]]=[p.idx[i+2],p.idx[i+1]];
  }
  for (const [key, part] of parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(part.verts, 3));
    geo.setIndex(part.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, modelMaterial(key < 0 ? MODEL_COLORS.airframe : controls[key].color));
    mesh.userData.surfacePart = key === -2 ? 'root_cap' : key === -3 ? 'tip_cap' : 'skin';
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Kontrol yüzeylerinin panel çizgileri (menteşe hattı ve iki yan kenar; üstte ve altta)
  const line = [];
  const at = (eta, x, side) => {
    const st = {
      le: def.rootLE.clone().lerp(def.tipLE, eta),
      chord: def.rootChord + (def.tipChord - def.rootChord) * eta,
      thick: 1,
    };
    return pointAt(st, x, prof[side](x));
  };
  for (const c of controls) {
    const hinge = 1 - c.chordRatio;
    for (const side of ['upper', 'lower']) {
      line.push(at(c.etaStart, hinge, side), at(c.etaEnd, hinge, side));
      for (const eta of [c.etaStart, c.etaEnd]) {
        const aft = xs.filter(x => x >= hinge);
        for (let k = 0; k < aft.length - 1; k++) line.push(at(eta, aft[k], side), at(eta, aft[k + 1], side));
      }
    }
  }
  if (line.length) {
    group.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(line),
      new THREE.LineBasicMaterial({ color: MODEL_COLORS.dark, transparent: true, opacity: 0.55 })
    ));
  }
}

function buildWingGroup(geom, coords) {
  const group = new THREE.Group();
  const cs = geom.control_surfaces || {};
  const controls = [
    { etaStart: cs.flap?.eta_start ?? .08, etaEnd: cs.flap?.eta_end ?? .5, chordRatio: cs.flap?.chord_ratio ?? .3, color: MODEL_COLORS.flap },
    { etaStart: cs.aileron?.eta_start ?? .55, etaEnd: cs.aileron?.eta_end ?? .9, chordRatio: cs.aileron?.chord_ratio ?? .25, color: MODEL_COLORS.aileron },
  ];
  for (const p of aircraftPanelSpecs(geom,coords,coords,coords).filter(p=>p.kind==='wing')) {
    buildSurface(group,{rootLE:new THREE.Vector3(...p.root),tipLE:new THREE.Vector3(...p.tip),rootChord:p.chord,tipChord:p.tipChord,up:new THREE.Vector3(...p.up),coords:p.coords,controls});
  }
  if(geom.motor_mount?.motorLayout==='twin') addMotorHardware(group,motorPreviewSpecs(geom,geom.motor_mount,[]));
  return group;
}

function buildTailGroup(geom, hCoords, vCoords) {
  const group = new THREE.Group();
  if (geom.tail_booms) {
    const b=geom.tail_booms;
    const y=(geom.wing_position_offset||0)+b.y*Math.sin(THREE.MathUtils.degToRad(geom.dihedral_angle));
    for(const sign of [1,-1]) {
      const boom=new THREE.Mesh(new THREE.CylinderGeometry(b.diameter/2,b.diameter/2,b.length,20),modelMaterial(MODEL_COLORS.carbon));
      boom.rotation.z=Math.PI/2;boom.position.set((b.x_start+b.x_end)/2,y,sign*b.y);group.add(boom);
    }
  }
  for (const p of aircraftPanelSpecs(geom,hCoords,hCoords,vCoords).filter(p=>p.kind==='tail')) {
    const vertical=p.name.includes('vertical');
    const control=vertical?geom.control_surfaces?.rudder:geom.control_surfaces?.elevator;
    buildSurface(group,{rootLE:new THREE.Vector3(...p.root),tipLE:new THREE.Vector3(...p.tip),rootChord:p.chord,tipChord:p.tipChord,up:new THREE.Vector3(...p.up),coords:p.coords,controls:[{etaStart:0,etaEnd:1,chordRatio:control?.chord_ratio??.3,color:vertical?MODEL_COLORS.rudder:MODEL_COLORS.elevator}]});
  }
  return group;
}

function buildFuselageGroup(geom, type, wingCoords) {
  const group = new THREE.Group();
  const { sections } = buildFuselageSections(geom, type, wingCoords);
  if (sections.length < 2) return group;
  const nCirc = sections[0].length;

  const verts = [];
  const idx = [];
  for (const sec of sections) for (const p of sec) verts.push(p.x, p.y, p.z);
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < nCirc; j++) {
      const jn = (j + 1) % nCirc;
      const a = i * nCirc + j, b = i * nCirc + jn;
      const c = (i + 1) * nCirc + j, d = (i + 1) * nCirc + jn;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Uç kapakları
  for (const si of [0, sections.length - 1]) {
    const center = sections[si].reduce((acc, p) => acc.add(new THREE.Vector3(p.x, p.y, p.z)), new THREE.Vector3()).divideScalar(nCirc);
    const ci = verts.length / 3;
    verts.push(center.x, center.y, center.z);
    for (let j = 0; j < nCirc; j++) {
      const a = si * nCirc + j, b = si * nCirc + (j + 1) % nCirc;
      if (si === 0) idx.push(a, b, ci);
      else idx.push(b, a, ci);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, modelMaterial(MODEL_COLORS.fuselage));
  body.castShadow = true;
  group.add(body);
  if (type !== 'manual') addFuselagePanel(group, sections);
  if (geom.motor_mount && geom.motor_mount.motorLayout !== 'none') {
    if(geom.motor_mount.motorLayout==='single') addMotorHardware(group,motorPreviewSpecs(geom,geom.motor_mount,sections));
    return group;
  }

  // Pervane: standart yerleşimde burunda (çekici), yarışma yerleşiminde gövde arkasında (itici)
  const pusher = geom.airframe === 'combat';
  const x0 = sections[0][0].x;
  const x1 = sections[sections.length - 1][0].x;
  const length = x1 - x0;
  const spinLen = length * 0.04;
  const sectionAt = (x) => sections.reduce((best, sec) =>
    (Math.abs(sec[0].x - x) < Math.abs(best[0].x - x) ? sec : best));
  const extent = (sec) => {
    const ys = sec.map(p => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const centerY = (minY + maxY) / 2;
    return { minY, maxY, centerY, radius: Math.max(...sec.map(p => Math.hypot(p.y - centerY, p.z))) };
  };

  const hub = extent(sectionAt(pusher ? x1 - spinLen : x0 + spinLen));
  const radius = hub.radius * 1.06;
  const profile = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    profile.push(new THREE.Vector2(radius * Math.sqrt(t), t * spinLen * 1.25));
  }
  const dark = new THREE.MeshStandardMaterial({ color: MODEL_COLORS.dark, roughness: 0.4, metalness: 0.3 });
  const spinner = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), dark);
  // Lathe ekseni +y: çekicide ucu öne (−x), iticide arkaya (+x) bakar
  spinner.rotation.z = pusher ? Math.PI / 2 : -Math.PI / 2;
  spinner.position.set(pusher ? x1 + spinLen * 0.25 : x0 - spinLen * 0.25, hub.centerY, 0);
  spinner.castShadow = true;
  group.add(spinner);

  let propRadius = Math.max(geom.wingspan * 0.11, radius * 2.5);
  if (geom.tail_booms) propRadius = Math.min(propRadius, geom.tail_booms.y * 0.85);
  const blade = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), dark);
  blade.scale.set(radius * 0.12, propRadius, radius * 0.55);
  blade.rotation.x = Math.PI / 5;
  blade.position.set(pusher ? x1 - spinLen * 0.25 : x0 + spinLen * 0.25, hub.centerY, 0);
  blade.castShadow = true;
  group.add(blade);

  if (pusher) {
    // Burun altında öne bakan kamera kubbesi (hedef takibi için burun boş bırakılır)
    const nose = extent(sectionAt(x0 + length * 0.12));
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(nose.radius * 0.5, 24, 16),
      new THREE.MeshStandardMaterial({ color: MODEL_COLORS.glass, roughness: 0.15, metalness: 0.6 })
    );
    dome.position.set(x0 + length * 0.12, nose.minY + nose.radius * 0.15, 0);
    dome.castShadow = true;
    group.add(dome);
  }

  return group;
}

// A flush upper access-panel finish; the manufacturing shell remains continuous.
function addFuselagePanel(group, sections) {
  const first = sections[0][0].x, length = sections[sections.length - 1][0].x - first;
  const sample = (x, theta) => {
    let i = sections.findIndex(sec => sec[0].x >= x);
    i = Math.max(1, i);
    const a = sections[i - 1], b = sections[i];
    const u = (x - a[0].x) / (b[0].x - a[0].x);
    const f = theta / (2 * Math.PI) * a.length, j = Math.floor(f), v = f - j;
    const at = sec => new THREE.Vector3().lerpVectors(sec[j % a.length], sec[(j + 1) % a.length], v);
    const p = at(a).lerp(at(b), u);
    p.y += length * .00045;
    return p;
  };
  const rows = 40, cols = 20, vertices = [], indices = [], left = [], right = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows, x = first + length * (.12 + .32 * u);
    const halfAngle = .48 * (.3 + .7 * Math.sin(Math.PI * u) ** .55);
    for (let j = 0; j <= cols; j++) {
      const p = sample(x, Math.PI / 2 + halfAngle * (2 * j / cols - 1));
      vertices.push(p.x, p.y, p.z);
      if (j === 0) left.push(p);
      if (j === cols) right.push(p);
      if (i < rows && j < cols) {
        const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1;
        indices.push(a, c, b, b, c, c + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, modelMaterial(0x34424d)));
  const edge = new THREE.BufferGeometry().setFromPoints([...left, ...right.reverse()]);
  group.add(new THREE.LineLoop(edge, new THREE.LineBasicMaterial({color: 0xc48554})));
}

function addMotorHardware(group,motors) {
  const references=new THREE.Group();references.userData.motorHardware=true;
  references.visible=typeof $==='function' && $('motorHardwareView') ? $('motorHardwareView').checked : true;
  for(const m of motors) {
    const [x,y,z]=m.face_mm.map(v=>v/1000),r=m.motor_diameter_mm/2000,l=m.motor_length_mm/1000;
    const material=new THREE.MeshStandardMaterial({color:0xef9353,transparent:true,opacity:.65,roughness:.5});
    const motor=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,32),material);
    motor.rotation.z=-Math.PI/2;motor.position.set(x-l/2,y,z);references.add(motor);
    const propRadius=m.prop_diameter_mm/2000;
    const prop=new THREE.Mesh(new THREE.BoxGeometry(.002,m.prop_diameter_mm/1000,.012),modelMaterial(0x34424d));
    prop.position.set(m.prop_plane_x_mm/1000,y,z);prop.rotation.x=.6;references.add(prop);
    const circle=new THREE.Mesh(new THREE.RingGeometry(propRadius-.0008,propRadius,64),new THREE.MeshBasicMaterial({color:0xef9353,side:THREE.DoubleSide,transparent:true,opacity:.5}));
    circle.rotation.y=Math.PI/2;circle.position.copy(prop.position);references.add(circle);
  }
  group.add(references);
}

function disposeModel(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}

// Sahne ışıkları: yumuşak gökyüzü dolgusu + gölge düşüren ana ışık + karşı dolgu
function addModelLights(scene, center, radius, withShadows) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 0.62));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.copy(center).add(new THREE.Vector3(-0.6, 1.6, 0.9).multiplyScalar(radius * 2));
  key.target.position.copy(center);
  if (withShadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const cam = key.shadow.camera;
    cam.left = cam.bottom = -radius * 1.2;
    cam.right = cam.top = radius * 1.2;
    cam.near = radius * 0.1;
    cam.far = radius * 6;
    cam.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
  }
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.copy(center).add(new THREE.Vector3(0.8, 0.3, -1).multiplyScalar(radius * 2));
  scene.add(fill);
}
