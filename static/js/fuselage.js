/* ZETA original fuselage families. Dimensions are normalized, never imported meshes. */
const FUSELAGE_PRESETS = {
  combat: {
    name: 'Savaşan İHA', tag: 'Çift bom · arkadan itici motor',
    description: 'Kısa ekipman gövdesi, geniş arka motor plakası ve iki kuyruk bomu.',
    exponent: 2.5, width: 1.3, height: 1.4,
    stations: [[0,.20,.25,0],[.08,.52,.56,.02],[.22,.88,.92,.04],
      [.38,1,1,.03],[.56,.95,.88,0],[.72,.78,.72,0],[.87,.57,.59,0],[1,.45,.50,0]],
  },
  atlas: {
    name: 'Atlas', tag: 'Geniş ekipman gövdesi',
    description: 'Dolgun ön hacim, yuvarlatılmış omuzlar ve ince kuyruk geçişi.',
    exponent: 2.65, width: 1.3, height: 1.4,
    stations: [
      [0, .24, .28, 0], [.06, .56, .60, .02], [.17, .88, .92, .045],
      [.32, 1, 1, .025], [.48, .94, .91, 0], [.63, .64, .65, -.025],
      [.78, .32, .34, -.015], [.9, .18, .20, 0], [1, .09, .11, 0],
    ],
  },
  seyir: {
    name: 'Seyir', tag: 'İnce, akıcı siluet',
    description: 'Oval kesit, uzun burun ve kesintisiz daralan arka gövde.',
    exponent: 2.05, width: 1, height: 1.05,
    stations: [
      [0, .15, .18, 0], [.09, .43, .48, 0], [.24, .80, .85, .025],
      [.38, 1, 1, .045], [.52, .91, .86, .02], [.67, .59, .52, 0],
      [.81, .28, .25, 0], [.92, .13, .14, 0], [1, .07, .08, 0],
    ],
  },
  akin: {
    name: 'Akın', tag: 'Sportif omuz çizgisi',
    description: 'Kısa burun, belirgin üst hat ve kompakt arka geçiş.',
    exponent: 2.35, width: 1.15, height: 1.3,
    stations: [
      [0, .27, .30, 0], [.05, .50, .51, .01], [.15, .80, .88, .09],
      [.28, 1, 1, .12], [.43, .96, .78, .035], [.58, .66, .51, -.02],
      [.74, .33, .28, -.01], [.88, .18, .18, 0], [1, .09, .10, 0],
    ],
  },
};

// Shape-preserving cubic interpolation: no bulges past a station's dimensions.
function fuseInterpolate(keys, x, prop) {
  if (x <= keys[0].t) return keys[0][prop] || 0;
  const last = keys.length - 1;
  if (x >= keys[last].t) return keys[last][prop] || 0;
  const secant = i => ((keys[i + 1][prop] || 0) - (keys[i][prop] || 0)) / (keys[i + 1].t - keys[i].t);
  const slope = i => {
    if (i === 0) return secant(0);
    if (i === last) return secant(last - 1);
    const a = secant(i - 1), b = secant(i);
    if (a * b <= 0) return 0;
    const ha = keys[i].t - keys[i - 1].t, hb = keys[i + 1].t - keys[i].t;
    const wa = 2 * hb + ha, wb = hb + 2 * ha;
    return (wa + wb) / (wa / a + wb / b);
  };
  const i = keys.findIndex((k, j) => j < last && x <= keys[j + 1].t);
  const a = keys[i], b = keys[i + 1], h = b.t - a.t, u = (x - a.t) / h;
  return (2*u**3 - 3*u*u + 1) * (a[prop] || 0) + (u**3 - 2*u*u + u) * h * slope(i)
    + (-2*u**3 + 3*u*u) * (b[prop] || 0) + (u**3 - u*u) * h * slope(i + 1);
}

function presetFuseKeys(geom, id) {
  const preset = FUSELAGE_PRESETS[id] || FUSELAGE_PRESETS.atlas;
  const width = geom.fuselage_max_width * preset.width * (geom.fuse_width_scale || 1);
  const height = geom.fuselage_max_height * preset.height * (geom.fuse_height_scale || 1);
  return preset.stations.map(([t, w, h, cy]) => ({
    t: t * geom.fuselage_length, w: w * width, h: h * height, cy: cy * height,
  }));
}

function loftFuselage(keys, exponent = 2) {
  // Sort/deduplicate legacy custom stations before interpolation.
  const ordered = [...new Map(keys.filter(s => [s.t, s.w, s.h].every(Number.isFinite))
    .map(s => [s.t, { ...s, w: Math.max(.0001, s.w), h: Math.max(.0001, s.h) }])).values()]
    .sort((a, b) => a.t - b.t);
  if (ordered.length < 2) return { sections: [], nCirc: 64, totalLen: 0 };
  const nCirc = 64, nLong = 120;
  const start = ordered[0].t, end = ordered[ordered.length - 1].t;
  // Include the exact key stations, preserving dimensions and joins in STL slices.
  const positions = [...new Set([...ordered.map(s => s.t), ...Array.from({length: nLong + 1}, (_, i) => start + (end - start) * i / nLong)]
    .map(x => Math.round(x * 1e9) / 1e9))].sort((a,b) => a-b);
  const sections = positions.map(x => {
    const w = fuseInterpolate(ordered, x, 'w') / 2;
    const h = fuseInterpolate(ordered, x, 'h') / 2;
    const cy = fuseInterpolate(ordered, x, 'cy');
    // Oval nose/tail, progressively broader shoulders through the main cabin.
    const u = (x - start) / (end - start);
    const n = 2 + (exponent - 2) * Math.sin(Math.PI * u) ** 2;
    return Array.from({length:nCirc}, (_, j) => {
      const angle = j / nCirc * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      return new THREE.Vector3(x, cy + h * Math.sign(s) * Math.abs(s) ** (2 / n), w * Math.sign(c) * Math.abs(c) ** (2 / n));
    });
  });
  return { sections, nCirc, totalLen: end - start };
}

function libraryFuselageSections(geom) {
  const id = FUSELAGE_PRESETS[geom.fuse_preset] ? geom.fuse_preset : 'atlas';
  return loftFuselage(presetFuseKeys(geom, id), FUSELAGE_PRESETS[id].exponent);
}

function fusePresetThumbnail(id) {
  const keys = FUSELAGE_PRESETS[id].stations.map(([t,w,h,cy]) => ({t,w,h,cy}));
  const top = [], bottom = [];
  for (let i = 0; i <= 60; i++) {
    const x = i / 60, h = fuseInterpolate(keys, x, 'h'), cy = fuseInterpolate(keys,x,'cy');
    top.push(`${12 + x*216},${44 - (cy + h/2)*49}`);
    bottom.unshift(`${12 + x*216},${44 - (cy - h/2)*49}`);
  }
  return `<svg viewBox="0 0 240 84" aria-hidden="true"><path class="fuse-datum" d="M8 44H232"/><path class="fuse-silhouette" d="M${top.join(' L')} L${bottom.join(' L')}Z"/></svg>`;
}
