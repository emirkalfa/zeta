/* İçi boş, rib'li ve spar delikli kanat STL geometrisi.
 *
 * Kanat yarısı (ya da bir dilimi) şu parçalardan oluşan tek bir kapalı katıdır:
 *   - dış kabuk (duvar kalınlığı kadar et),
 *   - açıklık boyunca aralıklı rib'ler (iç boşluğu bölmelere ayırır),
 *   - rib'lerden geçen dairesel spar delikleri (karbon boru / çubuk iskelet için).
 * Kanat doğrusal daraldığı için istasyonlar arası yüzeyler düz çizgilerle birleştirilir.
 */

const SPAR_MAIN_POS = 0.28;   // veter oranı — profilin en kalın bölgesi
const SPAR_REAR_POS = 0.62;
const SPAR_CLEARANCE = 0.0006; // delik ile iç kabuk arasında bırakılan en az et (m)
const PROFILE_POINTS = 40;
const HOLE_SEGMENTS = 24;

function airfoilProfile(coords) {
  // Koordinat satırları: ilk yarı üst yüzey (x 0→1), ikinci yarı alt yüzey (x 1→0)
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
  const xs = [];
  for (let k = 0; k <= PROFILE_POINTS; k++) xs.push((1 - Math.cos(Math.PI * k / PROFILE_POINTS)) / 2);
  return {
    xs,
    yu: xs.map(x => interp(upper, x)),
    yl: xs.map(x => interp(lower, x)),
    camberAt: x => (interp(upper, x) + interp(lower, x)) / 2,
  };
}

function signedArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInLoop(pt, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * opts (hepsi metre): wall, ribSpacing, ribThickness, spars: [{ pos, dia }], capTip
 * Dönüş: { mesh, ribCount, sparReach: [spar başına deliğin ulaştığı açıklık konumu] }
 * Kanat, istenen duvar kalınlığıyla içi boşaltılamayacak kadar inceyse null döner.
 */
function buildRibbedWingSegment(geom, coords, yStart, yEnd, sign, opts) {
  const halfSpan = geom.wingspan / 2;
  const rootChord = geom.root_chord;
  const taper = geom.taper_ratio != null ? geom.taper_ratio : 0.5;
  const sweep = THREE.MathUtils.degToRad(geom.sweep_angle != null ? geom.sweep_angle : 5);
  const dihedral = THREE.MathUtils.degToRad(geom.dihedral_angle != null ? geom.dihedral_angle : 3);
  const wingPos = geom.wing_position_offset != null ? geom.wing_position_offset : 0;
  const wingX = geom.wing_x_pos != null ? geom.wing_x_pos : geom.fuselage_length * 0.35;
  const prof = airfoilProfile(coords);
  const N = PROFILE_POINTS;

  // Açıklık konumundaki kesitin yerleşimi (buildWingSegment ile aynı)
  const frame = (yPos) => {
    const chord = rootChord * (1 - (yPos / halfSpan) * (1 - taper));
    return {
      chord,
      x0: geom.straight_te ? (rootChord - chord + wingX) : (yPos * Math.tan(sweep) + wingX),
      y0: wingPos + yPos * Math.sin(dihedral),
      z: sign * yPos,
    };
  };
  const V2 = (x, y) => new THREE.Vector2(x, y);

  const openTE = (prof.yu[N] - prof.yl[N]) > 1e-4;
  const outerLoop = (f) => {
    const pts = [];
    for (let k = N; k >= 0; k--) pts.push(V2(prof.xs[k] * f.chord + f.x0, prof.yu[k] * f.chord + f.y0));
    for (let k = 1; k <= (openTE ? N : N - 1); k++) pts.push(V2(prof.xs[k] * f.chord + f.x0, prof.yl[k] * f.chord + f.y0));
    return pts;
  };

  // Yüzey noktalarını içe doğru normal boyunca duvar kalınlığı kadar öteler
  const offsetPoints = (f) => {
    const up = [];
    const lo = [];
    for (let k = 0; k <= N; k++) {
      const a = Math.max(k - 1, 0);
      const b = Math.min(k + 1, N);
      for (const [ys, out, dir] of [[prof.yu, up, -1], [prof.yl, lo, 1]]) {
        const tx = (prof.xs[b] - prof.xs[a]) * f.chord;
        const ty = (ys[b] - ys[a]) * f.chord;
        const len = Math.hypot(tx, ty) || 1;
        // Teğete dik iki yönden profilin içine bakanı: üstte aşağı, altta yukarı
        let nx = -ty / len;
        let ny = tx / len;
        if (ny * dir < 0) { nx = -nx; ny = -ny; }
        out.push(V2(prof.xs[k] * f.chord + f.x0 + nx * opts.wall, ys[k] * f.chord + f.y0 + ny * opts.wall));
      }
    }
    return { up, lo };
  };

  // Boşluğun veter boyunca kapladığı indeks aralığı en dar kesite (uç tarafı) göre seçilir;
  // böylece tüm istasyonlarda nokta sayısı aynı kalır ve halkalar birbirine bağlanabilir.
  const minGap = Math.max(0.0004, opts.wall * 0.5);
  const tipOffsets = offsetPoints(frame(yEnd));
  const cavityIdx = [];
  let lastX = -Infinity;
  for (let k = 1; k < N; k++) {
    const u = tipOffsets.up[k];
    const l = tipOffsets.lo[k];
    if (u.y - l.y < minGap) {
      if (cavityIdx.length) break;
      continue;
    }
    if (Math.min(u.x, l.x) <= lastX) continue;
    lastX = Math.max(u.x, l.x);
    cavityIdx.push(k);
  }
  if (cavityIdx.length < 3) return null;

  const innerLoop = (f) => {
    const { up, lo } = offsetPoints(f);
    const pts = [];
    for (let i = cavityIdx.length - 1; i >= 0; i--) pts.push(up[cavityIdx[i]]);
    for (let i = 0; i < cavityIdx.length; i++) pts.push(lo[cavityIdx[i]]);
    return pts;
  };

  // Spar ekseni düz bir çizgidir; eğik eksenin z-düzlemindeki kesiti elips olur
  const sparCenter = (spar, f) => V2(spar.pos * f.chord + f.x0, prof.camberAt(spar.pos) * f.chord + f.y0);
  const sparAxis = (spar) => {
    const a = sparCenter(spar, frame(0));
    const b = sparCenter(spar, frame(halfSpan));
    return new THREE.Vector3(b.x - a.x, b.y - a.y, halfSpan).normalize();
  };
  const holeLoop = (spar, f, extra = 0) => {
    const axis = sparAxis(spar);
    const tilt = Math.hypot(axis.x, axis.y);
    const u = tilt > 1e-9 ? V2(axis.x / tilt, axis.y / tilt) : V2(1, 0);
    const r = spar.dia / 2 + extra;
    const major = r / Math.abs(axis.z);
    const c = sparCenter(spar, f);
    const pts = [];
    for (let s = 0; s < HOLE_SEGMENTS; s++) {
      const phi = (s / HOLE_SEGMENTS) * Math.PI * 2;
      const cu = Math.cos(phi) * major;
      const cv = Math.sin(phi) * r;
      pts.push(V2(c.x + u.x * cu - u.y * cv, c.y + u.y * cu + u.x * cv));
    }
    return pts;
  };

  // Rib'ler: dilimin iki ucunda birer tane, arada eşit aralıklı
  const tr = Math.min(opts.ribThickness, (yEnd - yStart) / 3);
  const usable = yEnd - yStart - tr;
  const between = Math.max(0, Math.ceil(usable / opts.ribSpacing) - 1);
  const ribs = [];
  for (let i = 0; i <= between + 1; i++) {
    const a = yStart + (i * usable) / (between + 1);
    ribs.push({ a, b: a + tr, fa: frame(a), fb: frame(a + tr), spars: [] });
  }

  // Bir spar, deliği iç boşluğa sığdığı son rib'e kadar uzanır
  const sparReach = opts.spars.map(() => yStart);
  const blocked = opts.spars.map(() => false);
  ribs.forEach((rib, ri) => {
    const closedTip = opts.capTip && ri === ribs.length - 1;
    const inner = innerLoop(rib.fb);
    opts.spars.forEach((spar, si) => {
      if (blocked[si]) return;
      const fits = !closedTip && holeLoop(spar, rib.fb, SPAR_CLEARANCE).every(p => pointInLoop(p, inner));
      if (!fits) { blocked[si] = true; return; }
      rib.spars.push(spar);
      sparReach[si] = rib.b;
    });
  });

  // ─── Üçgen üretimi ───
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const at = (p, z) => new THREE.Vector3(p.x, p.y, z);

  // Düzlemsel yüz: dış halka eksi delikler. normalZ yüzün baktığı ±z yönü.
  const face = (contour, holes, z, normalZ) => {
    const all = contour.concat(...holes);
    const tris = THREE.ShapeUtils.triangulateShape(contour.slice(), holes.map(h => h.slice()));
    for (const [i, j, k] of tris) {
      const a = all[i], b = all[j], c = all[k];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross * normalZ > 0) tri(at(a, z), at(b, z), at(c, z));
      else tri(at(a, z), at(c, z), at(b, z));
    }
  };

  // İki halka arasındaki yan yüzey. outward: normal halkanın dışına mı bakacak.
  const loft = (loopA, zA, loopB, zB, outward) => {
    const natural = signedArea(loopA) * (zB - zA) > 0;
    const n = loopA.length;
    for (let j = 0; j < n; j++) {
      const jn = (j + 1) % n;
      const a = at(loopA[j], zA), b = at(loopA[jn], zA);
      const c = at(loopB[j], zB), d = at(loopB[jn], zB);
      if (natural === outward) { tri(a, b, c); tri(b, d, c); }
      else { tri(a, c, b); tri(b, c, d); }
    }
  };

  const outward = sign;  // +açıklık yönünün z işareti
  const first = ribs[0];
  const last = ribs[ribs.length - 1];

  // Dış kabuk
  const stations = [];
  for (const rib of ribs) stations.push(rib.fa, rib.fb);
  for (let i = 0; i < stations.length - 1; i++) {
    loft(outerLoop(stations[i]), stations[i].z, outerLoop(stations[i + 1]), stations[i + 1].z, true);
  }

  // Kök ve uç yüzleri
  face(outerLoop(first.fa), first.spars.map(s => holeLoop(s, first.fa)), first.fa.z, -outward);
  face(outerLoop(last.fb), last.spars.map(s => holeLoop(s, last.fb)), last.fb.z, outward);

  ribs.forEach((rib, ri) => {
    // Rib içinden geçen spar delikleri
    for (const spar of rib.spars) {
      loft(holeLoop(spar, rib.fa), rib.fa.z, holeLoop(spar, rib.fb), rib.fb.z, false);
    }
    // Bu rib ile sonraki arasındaki boşluk
    const next = ribs[ri + 1];
    if (!next) return;
    loft(innerLoop(rib.fb), rib.fb.z, innerLoop(next.fa), next.fa.z, false);
    face(innerLoop(rib.fb), rib.spars.map(s => holeLoop(s, rib.fb)), rib.fb.z, outward);
    face(innerLoop(next.fa), next.spars.map(s => holeLoop(s, next.fa)), next.fa.z, -outward);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(Array.from({ length: pos.length / 3 }, (_, i) => i));
  geo.computeVertexNormals();
  return {
    mesh: new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x3b82f6, side: THREE.DoubleSide })),
    ribCount: ribs.length,
    sparReach,
  };
}
