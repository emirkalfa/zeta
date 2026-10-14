/* ZETA original fuselage families. Dimensions are normalized, never imported meshes. */
const FUSELAGE_PRESETS = {
  vtol5: {
    name:'Penta VTOL',tag:'Dört kaldırma motoru · bir itici motor',
    description:'Kanat ve motor ölçüsüne otomatik uyarlanan kısa gövde, seçilebilir kanat konumu ve pürüzsüz merkez kanat geçişi. Çift bom, dört kaldırma motoru ve bir arka itici motor.',
    exponent:2.5,width:1.3,height:1.4,
    stations:[[0,.20,.25,0],[.08,.52,.56,.02],[.22,.88,.92,.04],[.38,1,1,.03],[.56,.95,.88,0],[.72,.78,.72,0],[.87,.57,.59,0],[1,.45,.50,0]],
  },
  vtol: {
    name:'Tria VTOL',tag:'İki döner ön motor · sabit arka motor',
    description:'Sabit ve alçak gövde profili, orta kanat yuvası, yumuşak merkez kanat geçişi ve karbon kuyruk borusu. Gövde ölçüleri ve kanat yüksekliği değiştirilemez.',
    exponent:2.2,width:1.4,height:1.6,
    stations:[[0,.035,.05,0],[.06,.58,.62,0],[.18,.94,.95,.04],[.30,1,1,.04],
      [.43,.9,.85,.02],[.55,.48,.48,0],[.65,.2,.25,0],[.8,.17,.22,0],[1,.13,.18,0]],
  },
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
  if(id==='vtol5')return preset.stations.map(([t,w,h,cy])=>({t:t*(geom.fuselage_length||1),w:w*(geom.fuselage_max_width||.18),h:h*(geom.fuselage_max_height||.14),cy:cy*(geom.fuselage_max_height||.14)}));
  if(id==='vtol')return preset.stations.map(([t,w,h,cy])=>({t:t*1.2,w:w*.17,h:h*.11,cy:cy*.11}));
  const width = geom.fuselage_max_width * preset.width * (geom.fuse_width_scale || 1);
  const height = geom.fuselage_max_height * preset.height * (geom.fuse_height_scale || 1);
  return preset.stations.map(([t, w, h, cy]) => ({
    t: t * geom.fuselage_length, w: w * width, h: h * height, cy: cy * height,
  }));
}

function loftFuselage(keys, exponent = 2, nLong = 120) {
  // Sort/deduplicate legacy custom stations before interpolation.
  const ordered = [...new Map(keys.filter(s => [s.t, s.w, s.h].every(Number.isFinite))
    .map(s => [s.t, { ...s, w: Math.max(.0001, s.w), h: Math.max(.0001, s.h) }])).values()]
    .sort((a, b) => a.t - b.t);
  if (ordered.length < 2) return { sections: [], nCirc: 64, totalLen: 0 };
  const nCirc = 64;
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
  const result=loftFuselage(presetFuseKeys(geom,id),FUSELAGE_PRESETS[id].exponent,id==='vtol5'?127:120);
  if(id==='vtol5'){
    const keys=presetFuseKeys(geom,id), length=geom.fuselage_length||1;
    const roofKeys=keys.map((k,i)=>({...k,top:[.25,.36,.44,.46,.44,.40,.35,.50][i]*(geom.fuselage_max_height||.14)/2}));
    const smooth=u=>{u=Math.max(0,Math.min(1,u));return 6*u**5-15*u**4+10*u**3;};
    for(const ring of result.sections){const x=ring[0].x,t=x/length,cy=fuseInterpolate(keys,x,'cy');
      const roof=fuseInterpolate(roofKeys,x,'top')/(fuseInterpolate(keys,x,'h')/2);
      const u=Math.max(0,Math.min(1,(t-.80)/.20)), blend=smooth(u);
      const diameter=(geom.motor_mount?.motorDiameter||geom.penta_motor_diameter||28)/1000;
      for(const p of ring){if(p.y>cy)p.y=cy+(p.y-cy)*roof;
        const radius=Math.hypot(p.y,p.z), target=diameter/(2*Math.max(radius,1e-12));
        p.y=p.y*(1-blend)+p.y*target*blend;p.z=p.z*(1-blend)+p.z*target*blend;
      }
    }
  }
  return motorSizedFuselageSections(geom,result);
}

function motorSizedFuselageSections(geom,result) {
  if(['vtol','vtol5'].includes(geom.fuse_preset))return result;
  const motor=geom.motor_mount;
  if(!geom.tail_booms || motor?.motorLayout!=='single' || !(motor.motorDiameter>0) || !result.sections.length)return result;
  const sections=result.sections,end=sections[sections.length-1],radius=motor.motorDiameter/2000;
  const cy=end.reduce((s,p)=>s+p.y,0)/end.length,cz=end.reduce((s,p)=>s+p.z,0)/end.length;
  if(end.every(p=>Math.abs(Math.hypot(p.y-cy,p.z-cz)-radius)<.00001))return result;
  const first=sections[0][0].x,last=end[0].x,start=first+.8*(last-first);
  for(const ring of sections)for(const p of ring) {
    const u=Math.max(0,Math.min(1,(p.x-start)/(last-start))),blend=u*u*(3-2*u);
    const dy=p.y-cy,dz=p.z-cz,n=Math.hypot(dy,dz);
    if(n>0){p.y+=blend*(cy+radius*dy/n-p.y);p.z+=blend*(cz+radius*dz/n-p.z);}
  }
  return result;
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
