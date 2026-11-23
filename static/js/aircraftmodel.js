
const TAIL_TIP_START = .94;

function tailChordScale(eta) {
  const u = Math.max(0,(eta - TAIL_TIP_START)/(1-TAIL_TIP_START));
  return 1 - .32*eta**1.25 - .12*(1-Math.sqrt(Math.max(0,1-u*u)));
}
const MODEL_BACKGROUND = 0xe9eef3;
const MODEL_HOME_VIEW = [-.9, 1.1, -.6];
const MODEL_COLORS = {
  airframe: 0xadc0ce,
  fuselage: 0xadc0ce,
  control: 0x325b73,
  dark: 0x4a5058,
  carbon: 0x2e3238,
};

function modelMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

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
    ...(def.roundedTip ? Array.from({length:13}, (_,i) => TAIL_TIP_START + (1-TAIL_TIP_START)*Math.sin(Math.PI*i/24)) : []),
  ]);

  const spanDir = def.tipLE.clone().sub(def.rootLE).normalize();
  const stations = etas.map(eta => {
    const chord = def.rootChord + (def.tipChord - def.rootChord) * eta;
    const u = def.roundedTip ? Math.max(0, (eta - TAIL_TIP_START)/(1-TAIL_TIP_START)) : 0;
    const scale = def.roundedTip ? tailChordScale(eta) : 1;
    const le = def.rootLE.clone().lerp(def.tipLE, eta);
    le.x += chord * (1-scale);
    return {eta, le, chord: chord*scale, nominalChord: chord, thick: 1, tipCap: u > 0};
  });
  if (def.wingtip) {
    const panel = def.tipLE.clone().sub(def.rootLE);
    const extension = panel.clone().multiplyScalar(.055);
    const angle = 70*Math.PI/180;
    for (let i=1; i<=24; i++) {
      const theta = angle*i/24;
      const travel = Math.sin(theta)/Math.sin(angle);
      const bend = (1-Math.cos(theta))/(1-Math.cos(angle));
      const nominal = def.tipChord*Math.exp((def.tipChord-def.rootChord)/def.tipChord*.055*travel);
      const chord = nominal*(1-.5*bend);
      const le = def.tipLE.clone().addScaledVector(extension,travel)
        .addScaledVector(def.up,extension.length()*.72*bend);
      le.x += .30*(nominal-chord);
      stations.push({eta:1+.055*travel,le,chord,thick:1,tipCap:true});
    }
  }
  const loop = [];
  for (let k = xs.length - 1; k >= 0; k--) loop.push({ x: xs[k], y: prof.upper(xs[k]) });
  for (let k = 1; k < xs.length; k++) loop.push({ x: xs[k], y: prof.lower(xs[k]) });
  const M = loop.length;
  const hingeAt = (st, hinge) => {
    const reference = def.straightTail ? def.tipChord : st.nominalChord;
    return 1 - (1-hinge)*reference/st.chord;
  };
  const sectionX = (st, x) => {
    if ((!def.straightTail && !def.roundedTip) || !controls.length || st.tipCap) return x;
    const base = +(1-controls[0].chordRatio).toFixed(5);
    const hinge = hingeAt(st, base);
    return x <= base ? x*hinge/base : hinge+(x-base)*(1-hinge)/(1-base);
  };

  const pointAt = (st, x, y) => st.le.clone()
    .addScaledVector(new THREE.Vector3(1, 0, 0), x * st.chord)
    .addScaledVector(def.up, y * st.chord * st.thick);

  const parts = new Map();
  const partFor = (key) => {
    if (!parts.has(key)) parts.set(key, { verts: [], idx: [], lookup: new Map() });
    return parts.get(key);
  };
  const vertex = (part, i, j) => {
    const id = i * M + j;
    if (!part.lookup.has(id)) {
      const st = stations[i], x = sectionX(st, loop[j].x);
      const y = (def.straightTail || def.roundedTip) ? prof[j < xs.length ? 'upper' : 'lower'](x) : loop[j].y;
      const p = pointAt(st, x, y);
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
  const caps = THREE.ShapeUtils.triangulateShape(loop.map(p => new THREE.Vector2(p.x,p.y)), []);
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

  const line = [];
  const at = (eta, x, side) => {
    const st = stations.find(station => Math.abs(station.eta-eta)<.000006);
    if (!st) return pointAt(stations.at(-1), x, prof[side](x));
    const section = sectionX(st, x);
    return pointAt(st, section, prof[side](section));
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
  const controls = cs.flaperon ? [{
    etaStart: cs.flaperon.eta_start, etaEnd: cs.flaperon.eta_end,
    chordRatio: cs.flaperon.chord_ratio, color: MODEL_COLORS.control,
  }] : [
    { etaStart: cs.flap?.eta_start ?? .08, etaEnd: cs.flap?.eta_end ?? .5, chordRatio: cs.flap?.chord_ratio ?? .3, color: MODEL_COLORS.control },
    { etaStart: cs.aileron?.eta_start ?? .55, etaEnd: cs.aileron?.eta_end ?? .9, chordRatio: cs.aileron?.chord_ratio ?? .25, color: MODEL_COLORS.control },
  ];
  for (const p of aircraftPanelSpecs(geom,coords,coords,coords).filter(p=>p.kind==='wing')) {
    const rootLE = new THREE.Vector3(...p.root);
    const tipLE = new THREE.Vector3(...p.tip);
    const up = new THREE.Vector3(...p.up);
    buildSurface(group,{rootLE,tipLE,rootChord:p.chord,tipChord:p.tipChord,up,coords:p.coords,controls,wingtip:true});
  }
  if(geom.motor_mount?.motorLayout==='twin') addMotorHardware(group,motorPreviewSpecs(geom,geom.motor_mount,[]));
  return group;
}

function buildTailGroup(geom, hCoords, vCoords) {
  const group = new THREE.Group();
  if (geom.fuse_preset === 'akin') {
    const y=akinTubeHeight(geom)*1000;
    const x=akinPodLength(geom)*1000-8;
    const end=(geom.tail_x_pos+.4*geom.htail_chord)*1000+23;
    addCarbonBoomHardware(group,{start_mm:[x,y,0],end_mm:[end,y,0],
      length_mm:end-x,outer_diameter_mm:16},true);
  }
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
    const key=vertical ? 'rudder' : geom.tail_type==='vtail' ? 'ruddervator' : 'elevator';
    const control=geom.control_surfaces?.[key];
    const roundedTip = geom.tail_type === 'conventional'
      ? !geom.tail_booms || vertical : geom.tail_type === 'vtail' || (!geom.tail_booms && !vertical);
    buildSurface(group,{rootLE:new THREE.Vector3(...p.root),tipLE:new THREE.Vector3(...p.tip),rootChord:p.chord,tipChord:p.tipChord,up:new THREE.Vector3(...p.up),coords:p.coords,roundedTip,straightTail:true,controls:[{etaStart:control?.eta_start ?? (roundedTip ? .12 : 0),etaEnd:Math.min(roundedTip ? TAIL_TIP_START : 1,control?.eta_end ?? (roundedTip ? (vertical ? .78 : .90) : 1)),chordRatio:control?.chord_ratio??.3,color:MODEL_COLORS.control}]});
  }
  return group;
}

function addNoseGrille(body, length) {
  if (!(length > 0)) return;
  body.geometry.computeBoundingBox();
  const bounds = body.geometry.boundingBox;
  const width = bounds.max.z - bounds.min.z;
  const start = bounds.min.x;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const positions = [];
  const face = (x, z) => {
    ray.set(new THREE.Vector3(x, bounds.max.y + length, z), down);
    const hit = ray.intersectObject(body, false)[0];
    return hit && [x, hit.point.y + .00045, z];
  };
  for (let slot = -4; slot <= 4; slot++) {
    const centerZ = (bounds.min.z + bounds.max.z) / 2 + width * .035 * slot;
    const shorten = Math.abs(slot) / 4 * .012;
    const left = centerZ - width * .009;
    const right = centerZ + width * .009;
    const leading = start + length * (.025 + shorten);
    const span = length * (.047 - shorten * 1.7);
    for (let step = 0; step < 12; step++) {
      const x0 = leading + span * step / 12;
      const x1 = leading + span * (step + 1) / 12;
      const a = face(x0, left), b = face(x0, right), c = face(x1, left), d = face(x1, right);
      if (a && b && c && d) positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const grille = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: MODEL_COLORS.control, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  grille.name = 'nose_grille';
  body.add(grille);
}

function addManufacturedNoseGrille(group, length) {
  const front = group.children.filter(part => /^body(_|$)/.test(part.userData.partName || ''))
    .reduce((first, part) => {
      part.geometry.computeBoundingBox();
      return !first || part.geometry.boundingBox.min.x < first.geometry.boundingBox.min.x ? part : first;
    }, null);
  if (front) addNoseGrille(front, length);
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
  addNoseGrille(body, sections.at(-1)[0].x - sections[0][0].x);
  group.add(body);
  addFuselagePanel(group, body, sections, geom.fuse_preset);
  if (geom.motor_mount?.motorLayout === 'rear') {
    addMotorHardware(group, motorPreviewSpecs(geom, geom.motor_mount, sections));
  }
  return group;
}

function addFuselagePanel(group, body, sections, preset) {
  const start = sections[0][0].x, length = sections.at(-1)[0].x - start;
  const hatchStart = ['vtol5','akin'].includes(preset) ? .16 : .13;
  const first = start + hatchStart * length, last = start + (hatchStart + .30) * length;
  const between = sections.filter(ring => ring[0].x >= first && ring[0].x <= last);
  if (!between.length) return;
  const width = Math.min(...between.map(ring => {
    const width = ring.map(point => point.z);
    return Math.max(...width) - Math.min(...width);
  }));
  const center = (first + last) / 2, halfBridge = .004;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const outline = new THREE.LineBasicMaterial({color: 0x708491, transparent: true, opacity: .8});
  const rearShift=preset==='vtol' ? .0125*length : 0;
  for (const [front, rear] of [[first, center - halfBridge], [center + halfBridge + rearShift, last + rearShift]]) {
    const halfWidth = width * (['seyir','vtol'].includes(preset) && front === first ? .30 : .26);
    const radius = Math.min(.012, halfWidth * .34, (rear - front) * .2);
    const shape = new THREE.Shape();
    shape.moveTo(front + radius, -halfWidth);
    shape.lineTo(rear - radius, -halfWidth);
    shape.absarc(rear - radius, -halfWidth + radius, radius, -Math.PI / 2, 0, false);
    shape.lineTo(rear, halfWidth - radius);
    shape.absarc(rear - radius, halfWidth - radius, radius, 0, Math.PI / 2, false);
    shape.lineTo(front + radius, halfWidth);
    shape.absarc(front + radius, halfWidth - radius, radius, Math.PI / 2, Math.PI, false);
    shape.lineTo(front, -halfWidth + radius);
    shape.absarc(front + radius, -halfWidth + radius, radius, Math.PI, 3 * Math.PI / 2, false);
    shape.closePath();
    const points = shape.getSpacedPoints(108).flatMap(({x, y: z}) => {
      ray.set(new THREE.Vector3(x, length, z), down);
      const hit = ray.intersectObject(body, false)[0];
      if (!hit) return [];
      hit.point.y += .0005;
      return [hit.point];
    });
    if (points.length > 2) {
      group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), outline));
    }
  }
}

function addMotorHardware(group,motors) {
  const references=new THREE.Group();references.userData.motorHardware=true;
  references.visible=typeof $==='function' && $('motorHardwareView') ? $('motorHardwareView').checked : true;
  for(const m of motors) {
    if(m.out_axis){
      const assembly=new THREE.Group();assembly.userData.vtolPart=m.parent;
      const axis=new THREE.Vector3(...m.out_axis).normalize(),face=new THREE.Vector3(...m.face_mm).multiplyScalar(.001);
      const length=m.motor_length_mm/1000,radius=m.motor_diameter_mm/2000;
      const motor=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,32),new THREE.MeshStandardMaterial({color:0xe6b388,transparent:true,opacity:.7}));
      motor.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);motor.position.copy(face).addScaledVector(axis,length/2);assembly.add(motor);
      const propCenter=new THREE.Vector3(...m.prop_center_mm).multiplyScalar(.001),propRadius=m.prop_diameter_mm/2000;
      const prop=new THREE.Mesh(new THREE.BoxGeometry(propRadius*2,.012,.002),modelMaterial(0x34424d));
      prop.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axis);prop.position.copy(propCenter);assembly.add(prop);
      const circle=new THREE.Mesh(new THREE.RingGeometry(propRadius-.0008,propRadius,64),new THREE.MeshBasicMaterial({color:0xe6b388,side:THREE.DoubleSide,transparent:true,opacity:.45}));
      circle.quaternion.copy(prop.quaternion);circle.position.copy(propCenter);assembly.add(circle);references.add(assembly);continue;
    }
    const [x,y,z]=m.face_mm.map(v=>v/1000),r=m.motor_diameter_mm/2000,l=m.motor_length_mm/1000;
    const material=new THREE.MeshStandardMaterial({color:0xef9353,transparent:true,opacity:.65,roughness:.5});
    const motor=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,32),material);
    motor.rotation.z=-Math.PI/2;motor.position.set(x-(m.axis?.[0]??1)*l/2,y,z);references.add(motor);
    const propRadius=m.prop_diameter_mm/2000;
    const prop=new THREE.Mesh(new THREE.BoxGeometry(.002,m.prop_diameter_mm/1000,.012),modelMaterial(0x34424d));
    prop.position.set(m.prop_plane_x_mm/1000,y,z);prop.rotation.x=.6;references.add(prop);
    const circle=new THREE.Mesh(new THREE.RingGeometry(propRadius-.0008,propRadius,64),new THREE.MeshBasicMaterial({color:0xef9353,side:THREE.DoubleSide,transparent:true,opacity:.5}));
    circle.rotation.y=Math.PI/2;circle.position.copy(prop.position);references.add(circle);
  }
  group.add(references);
}

function addVtolServoHardware(group,joints){
  const refs=new THREE.Group();refs.userData.motorHardware=true;
  refs.visible=$('motorHardwareView')?.checked??true;
  for(const joint of joints){
    if(!joint.servo_center_mm)continue;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...joint.servo_mm.map(v=>v/1000)),modelMaterial(0x3c4651));
    mesh.position.set(...joint.servo_center_mm.map(v=>v/1000));refs.add(mesh);
    const side=joint.servo_output_axis[2]<0?1:-1;
    const badge=new THREE.Mesh(new THREE.BoxGeometry(joint.servo_mm[0]*.00055,joint.servo_mm[1]*.0004,.001),modelMaterial(0xc97a9a));
    badge.position.copy(mesh.position);badge.position.z+=side*(joint.servo_mm[2]/2000+.0006);refs.add(badge);
  }
  group.add(refs);
}

function addCarbonBoomHardware(group,tube,structural=false){
  if(!tube)return;
  const refs=new THREE.Group();refs.userData.motorHardware=!structural;
  refs.visible=structural || ($('motorHardwareView')?.checked??true);
  const start=new THREE.Vector3(...tube.start_mm).multiplyScalar(.001),end=new THREE.Vector3(...tube.end_mm).multiplyScalar(.001);
  const axis=end.clone().sub(start).normalize(),center=start.clone().add(end).multiplyScalar(.5);
  const material=modelMaterial(0x3c4651);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(tube.outer_diameter_mm/2000,tube.outer_diameter_mm/2000,tube.length_mm/1000,48,1,true),material);
  mesh.position.copy(center);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);refs.add(mesh);group.add(refs);
}

function disposeModel(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}

function modelViewDistance(camera, radius) {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  return .85 * radius / Math.sin(Math.min(vertical, horizontal));
}

function addModelLights(scene, center, radius) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9baa, .68));
  const key = new THREE.DirectionalLight(0xffffff, .70);
  key.position.copy(center).add(new THREE.Vector3(-.6, .85, .3).multiplyScalar(radius));
  key.target.position.copy(center);
  scene.add(key, key.target);
}
