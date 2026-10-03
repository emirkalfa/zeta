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
 * ayrı renkli paneller olarak, ucu da yuvarlatılmış olarak üretilir.
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
  // Yuvarlatılmış uç: kalınlık çeyrek daire boyunca sıfıra iner
  const maxThick = Math.max(...xs.map(x => prof.upper(x) - prof.lower(x)));
  const tipRadius = 0.5 * maxThick * def.tipChord;
  const N_TIP = 5;
  for (let k = 1; k <= N_TIP; k++) {
    const a = (k / N_TIP) * Math.PI / 2;
    stations.push({
      eta: 1,
      tipCap: true,
      le: def.tipLE.clone().addScaledVector(spanDir, tipRadius * Math.sin(a)),
      chord: def.tipChord,
      thick: Math.cos(a),
    });
  }

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
  for (const [key, part] of parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(part.verts, 3));
    geo.setIndex(part.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, modelMaterial(key === -1 ? MODEL_COLORS.airframe : controls[key].color));
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
  const halfSpan = geom.wingspan / 2;
  const rootChord = geom.root_chord;
  const taper = geom.taper_ratio != null ? geom.taper_ratio : 0.5;
  const tipChord = rootChord * taper;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle != null ? geom.sweep_angle : 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle != null ? geom.dihedral_angle : 3);
  const wingY = geom.wing_position_offset || 0;
  const wingX = geom.wing_x_pos || geom.fuselage_length * 0.35;
  const tipX = geom.straight_te ? rootChord - tipChord : halfSpan * Math.tan(sweep);

  const cs = geom.control_surfaces || {};
  const controls = [
    { ...cs.flap, defaults: [0.08, 0.50, 0.30], color: MODEL_COLORS.flap },
    { ...cs.aileron, defaults: [0.55, 0.90, 0.25], color: MODEL_COLORS.aileron },
  ].map(c => ({
    etaStart: c.eta_start ?? c.defaults[0],
    etaEnd: c.eta_end ?? c.defaults[1],
    chordRatio: c.chord_ratio ?? c.defaults[2],
    color: c.color,
  }));

  for (const sign of [1, -1]) {
    buildSurface(group, {
      rootLE: new THREE.Vector3(wingX, wingY, 0),
      tipLE: new THREE.Vector3(wingX + tipX, wingY + halfSpan * Math.sin(dihedral), sign * halfSpan),
      rootChord, tipChord, coords, controls,
      up: new THREE.Vector3(0, 1, 0),
    });
  }
  return group;
}

function buildTailGroup(geom, hCoords, vCoords) {
  const group = new THREE.Group();
  const tailX = geom.tail_x_pos || geom.fuselage_length * 0.82;
  const cs = geom.control_surfaces || {};
  const fullSpan = (ratio, color) => [{ etaStart: 0, etaEnd: 1, chordRatio: ratio ?? 0.3, color }];
  const elevator = fullSpan(cs.elevator?.chord_ratio, MODEL_COLORS.elevator);
  const rudder = fullSpan(cs.rudder?.chord_ratio, MODEL_COLORS.rudder);

  const hHalf = geom.htail_span / 2;
  const hTip = geom.htail_chord * (geom.htail_taper || 0.5);
  const hSweep = Math.tan(THREE.MathUtils.degToRad(geom.htail_sweep || 3));
  const vSpan = geom.vtail_span;
  const vTip = geom.vtail_chord * (geom.vtail_taper || 0.4);
  const vSweep = Math.tan(THREE.MathUtils.degToRad(geom.vtail_sweep || 5));

  const horizontal = (root) => {
    for (const sign of [1, -1]) {
      buildSurface(group, {
        rootLE: root,
        tipLE: root.clone().add(new THREE.Vector3(hHalf * hSweep, 0, sign * hHalf)),
        rootChord: geom.htail_chord, tipChord: hTip, coords: hCoords, controls: elevator,
        up: new THREE.Vector3(0, 1, 0),
      });
    }
  };
  const vertical = () => {
    buildSurface(group, {
      rootLE: new THREE.Vector3(tailX, 0, 0),
      tipLE: new THREE.Vector3(tailX + vSpan * vSweep, vSpan, 0),
      rootChord: geom.vtail_chord, tipChord: vTip, coords: vCoords, controls: rudder,
      up: new THREE.Vector3(0, 0, 1),
    });
  };

  if (geom.tail_type === 'vtail') {
    // V-kuyruk: iki eğik panel hem elevator hem rudder görevi görür (ruddervator)
    const angle = THREE.MathUtils.degToRad(35);
    const panel = vSpan / 2;
    for (const sign of [1, -1]) {
      buildSurface(group, {
        rootLE: new THREE.Vector3(tailX, 0, 0),
        tipLE: new THREE.Vector3(tailX + panel * vSweep, panel * Math.sin(angle), sign * panel * Math.cos(angle)),
        rootChord: geom.vtail_chord, tipChord: vTip, coords: hCoords, controls: elevator,
        up: new THREE.Vector3(0, Math.cos(angle), -sign * Math.sin(angle)),
      });
    }
  } else if (geom.tail_type === 'ttail') {
    vertical();
    // Yatay kuyruk dikey kuyruğun tepesinde, firar kenarları hizalı
    horizontal(new THREE.Vector3(tailX + vSpan * vSweep + vTip - geom.htail_chord, vSpan, 0));
  } else {
    vertical();
    horizontal(new THREE.Vector3(tailX, 0, 0));
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
      idx.push(a, b, c, b, d, c);
    }
  }
  // Uç kapakları
  for (const si of [0, sections.length - 1]) {
    const center = sections[si].reduce((acc, p) => acc.add(new THREE.Vector3(p.x, p.y, p.z)), new THREE.Vector3()).divideScalar(nCirc);
    const ci = verts.length / 3;
    verts.push(center.x, center.y, center.z);
    for (let j = 0; j < nCirc; j++) idx.push(si * nCirc + j, si * nCirc + (j + 1) % nCirc, ci);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, modelMaterial(MODEL_COLORS.fuselage));
  body.castShadow = true;
  group.add(body);

  // Burun: spinner ve iki palli pervane
  const length = sections[sections.length - 1][0].x - sections[0][0].x;
  const spinLen = length * 0.04;
  const ref = sections.find(sec => sec[0].x >= spinLen) || sections[1];
  const centerY = ref.reduce((s, p) => s + p.y, 0) / nCirc;
  const radius = Math.max(...ref.map(p => Math.hypot(p.y - centerY, p.z))) * 1.06;
  const profile = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    profile.push(new THREE.Vector2(radius * Math.sqrt(t), t * spinLen * 1.25));
  }
  const dark = new THREE.MeshStandardMaterial({ color: MODEL_COLORS.dark, roughness: 0.4, metalness: 0.3 });
  const spinner = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), dark);
  spinner.rotation.z = -Math.PI / 2;   // lathe ekseni +y → +x
  spinner.position.set(-spinLen * 0.25, centerY, 0);
  spinner.castShadow = true;
  group.add(spinner);

  const propRadius = Math.max(geom.wingspan * 0.11, radius * 2.5);
  const blade = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), dark);
  blade.scale.set(radius * 0.12, propRadius, radius * 0.55);
  blade.rotation.x = Math.PI / 5;
  blade.position.set(spinLen * 0.25, centerY, 0);
  blade.castShadow = true;
  group.add(blade);

  return group;
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
