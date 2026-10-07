/* One panel layout for visualization and manufactured STL parts. */
function aircraftPanelSpecs(g, wingCoords, hCoords, vCoords) {
  const rad = d => d * Math.PI / 180;
  const specs = [];
  const add = (name, kind, root, tip, chord, tipChord, up, coords, parent = 'body') => {
    specs.push({name, kind, root, tip, chord, tipChord, up, coords, parent});
  };
  const half = g.wingspan / 2, wx = g.wing_x_pos, wy = g.wing_position_offset || 0;
  const tipChord = g.root_chord * g.taper_ratio;
  const dx = g.straight_te ? g.root_chord - tipChord : half * Math.tan(rad(g.sweep_angle));
  for (const s of [1,-1]) add(`wing_${s > 0 ? 'right':'left'}`, 'wing', [wx,wy,0], [wx+dx,wy+half*Math.sin(rad(g.dihedral_angle)),s*half], g.root_chord, tipChord, [0,1,0], wingCoords);
  const tx = g.tail_x_pos, vs = g.vtail_span, hs = g.htail_span / 2;
  const vd = Math.tan(rad(g.vtail_sweep ?? 5)), hd = Math.tan(rad(g.htail_sweep ?? 3));
  const vt = g.vtail_tip_chord ?? g.vtail_chord * g.vtail_taper;
  const ht = g.htail_tip_chord ?? g.htail_chord * g.htail_taper;
  const horizontal = (x,y,span,rootChord,tipChord,parent) => {
    for (const s of [1,-1]) add(`tail_horizontal_${s>0?'right':'left'}`, 'tail', [x,y,0], [x+span*hd,y,s*span], rootChord,tipChord,[0,1,0],hCoords,parent);
    if (parent === 'tail_vertical') for (const p of specs.slice(-2)) p.mountChordFraction=.25;
  };
  if (g.tail_booms) {
    const b=g.tail_booms, y=wy+b.y*Math.sin(rad(g.dihedral_angle)), a=rad(35);
    if (g.tail_type==='vtail') {
      for (const s of [1,-1]) add(`tail_v_${s>0?'right':'left'}`, 'tail', [tx,y,s*b.y], [tx+b.y*vd,y+b.y*Math.tan(a),0], g.vtail_chord,vt,[0,Math.cos(a),s*Math.sin(a)],hCoords,`boom_${s>0?'right':'left'}`);
    } else {
      const fx=tx+g.htail_chord-g.vtail_chord;
      for (const s of [1,-1]) add(`tail_vertical_${s>0?'right':'left'}`, 'tail', [fx,y,s*b.y], [fx+vs*vd,y+vs,s*b.y],g.vtail_chord,vt,[0,0,1],vCoords,`boom_${s>0?'right':'left'}`);
      const top=g.tail_type==='ttail';
      if(top)for(const s of [1,-1])add(`tail_horizontal_${s>0?'right':'left'}`,'tail',
        [fx+vs*vd+.25*(vt-g.htail_chord),y+vs,s*b.y],
        [fx+vs*vd+.25*(vt-g.htail_chord)+b.y*hd,y+vs,0],g.htail_chord,g.htail_chord,[0,1,0],hCoords,`tail_vertical_${s>0?'right':'left'}`);
      else horizontal(tx,y,b.y,g.htail_chord,g.htail_chord,'tail_bridge');
    }
  } else if (g.tail_type==='vtail') {
    const a=rad(35), span=vs/2;
    for (const s of [1,-1]) add(`tail_v_${s>0?'right':'left'}`, 'tail', [tx,0,0], [tx+span*vd,span*Math.sin(a),s*span*Math.cos(a)],g.vtail_chord,vt,[0,Math.cos(a),-s*Math.sin(a)],hCoords);
  } else {
    add('tail_vertical','tail',[tx,0,0],[tx+vs*vd,vs,0],g.vtail_chord,vt,[0,0,1],vCoords);
    // Align the quarter-chord of the stabilizer with the fin's tip quarter-chord.
    horizontal(g.tail_type==='ttail'?tx+vs*vd+.25*(vt-g.htail_chord):tx,g.tail_type==='ttail'?vs:0,hs,g.htail_chord,ht,g.tail_type==='ttail'?'tail_vertical':'body');
  }
  return specs;
}

let manufacturingResult = null;
let manufacturingOverlay = null;
let manufacturingTimer=null, manufacturingRevision=0;
function previewStatus(message) {
  for(const id of ['manufacturingStatus','modelPreviewStatus']) {const el=$(id);if(el)el.textContent=message;}
}
function scheduleManufacturingPreview() {
  clearTimeout(manufacturingTimer);
  const revision=++manufacturingRevision;
  if(!state.geometry || !scene)return;
  previewStatus('STL parçalarının gerçek 3D önizlemesi hazırlanıyor…');
  manufacturingTimer=setTimeout(async()=>{
    try {
      const stamp=JSON.stringify(manufacturingPayload());
      const res=await fetch('/api/manufacturing?mode=preview&part=all',{method:'POST',headers:{'Content-Type':'application/json'},body:stamp});
      const data=await res.json();
      if(revision!==manufacturingRevision || stamp!==JSON.stringify(manufacturingPayload()))return;
      if(!res.ok)throw new Error(data.error||'STL önizlemesi oluşturulamadı.');
      manufacturingResult=data;showManufacturingPreview(data,false);
      previewStatus('STL ile aynı parçalar gösteriliyor. Turuncu parçalar sökülebilir motor kapaklarıdır.');
    } catch(e) {if(revision===manufacturingRevision)previewStatus('STL önizlemesi hazır değil: '+e.message);}
  },750);
}
const MOTOR_FIELDS=['motorLayout','motorPattern','motorDiameter','motorLength','motorSpacingY','motorSpacingZ','motorBore','motorScrew','motorPlate','motorWire','propDiameter','propOffset','motorStation'];
function motorMountSettings() {
  return Object.fromEntries(MOTOR_FIELDS.map(id=>[id,['motorLayout','motorPattern'].includes(id)?$(id).value:Number($(id).value)]));
}
function motorPreviewSpecs(g,settings,sections) {
  if(!settings || settings.motorLayout==='none')return [];
  const radius=Math.max(settings.motorDiameter/2+3,
    (settings.motorPattern==='rectangle'?Math.hypot(settings.motorSpacingY/2,settings.motorSpacingZ/2):Math.max(settings.motorSpacingY,settings.motorSpacingZ)/2)+(settings.motorScrew+.3)/2+3,
    ((settings.motorBore??8)+.3)/2+(settings.motorWire??6)+4);
  let faces=[];
  if(settings.motorLayout==='single') {
    const ring=g.tail_booms?sections[sections.length-1]:sections[0];
    faces=[{parent:'body',axis:g.tail_booms?[-1,0,0]:[1,0,0],face_mm:[ring[0].x*1000,ring.reduce((n,p)=>n+p.y,0)/ring.length*1000,0]}];
  }
  else for(const p of aircraftPanelSpecs(g,[],[],[]).filter(p=>p.kind==='wing')) {
    const s=settings.motorStation/100,le=p.root.map((v,i)=>(v+(p.tip[i]-v)*s)*1000);
    faces.push({parent:p.name,face_mm:[le[0]-20,le[1]-settings.motorDiameter*.35,le[2]]});
  }
  return faces.map(p=>({...p,motor_diameter_mm:settings.motorDiameter,motor_length_mm:settings.motorLength,prop_diameter_mm:settings.propDiameter,prop_plane_x_mm:p.face_mm[0]-(p.axis?.[0]??1)*(settings.motorLength+(settings.propOffset??8)),plate_radius_mm:radius,plate_thickness_mm:settings.motorPlate}));
}
function manufacturingPayload() {
  if (!checkGeom()) throw new Error('Önce Hesapla düğmesine basın.');
  const g=state.geometry;
  const options={};
  Object.assign(options,motorMountSettings());
  for (const [key,id] of Object.entries({bedX:'printBedX',bedY:'printBedY',bedZ:'printBedZ',wall:'wallThickness',clearance:'fitClearance',screw:'mountScrew',nutFlat:'mountNutFlat',nutHeight:'mountNutHeight',sparMain:'sparMainDia',sparRear:'sparRearDia',ribSpacing:'ribSpacing',ribThickness:'ribThickness'})) options[key]=Number($(id).value);
  return {geometry:g, options, fuselage:buildFuselageSections(g,g.fuse_type,state.airfoilCoords).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000])), panels:aircraftPanelSpecs(g,state.airfoilCoords,state.tailCoords,state.vtailCoords||state.tailCoords)};
}

function showManufacturingPreview(data,focus=true) {
  if (!scene) return;
  if (manufacturingOverlay) {scene.remove(manufacturingOverlay);disposeModel(manufacturingOverlay);}
  manufacturingOverlay=new THREE.Group();
  for (const part of data.parts) {
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.map(v=>v/1000),3));
    geo.setIndex(part.faces);geo.computeVertexNormals();
    const color=part.name.includes('_service_cover')?0xef9353:part.name.startsWith('hatch')?0x34424d:part.name.startsWith('body')?MODEL_COLORS.fuselage:MODEL_COLORS.airframe;
    const mesh=new THREE.Mesh(geo,modelMaterial(color));mesh.userData.partName=part.name;
    if(part.name.includes('_service_cover'))mesh.visible=$('motorCoverView').checked;
    manufacturingOverlay.add(mesh);
  }
  addMotorHardware(manufacturingOverlay,data.manifest.motors||[]);
  wingGroup.visible=false;tailGroup.visible=false;fuseGroup.visible=false;
  scene.add(manufacturingOverlay);
  if(!focus)return;
  switchTab('viewer');
  const box=new THREE.Box3().setFromObject(manufacturingOverlay), sphere=box.getBoundingSphere(new THREE.Sphere());
  viewTarget.copy(sphere.center);viewDist=sphere.radius/Math.sin(Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect)))*1.05;
  setCameraDirection(HOME_VIEW);
  notify('Gerçek üretim geometrisi gösteriliyor: kapak, delikler ve montaj yuvaları dahil.');
}

function invalidateManufacturingPreview() {
  manufacturingResult=null;
  if (manufacturingOverlay && scene) {scene.remove(manufacturingOverlay);disposeModel(manufacturingOverlay);manufacturingOverlay=null;}
  if (wingGroup) wingGroup.visible=true;
  if (tailGroup) tailGroup.visible=true;
  if (fuseGroup) fuseGroup.visible=true;
  const status=$('manufacturingStatus');if(status) status.textContent='Ayarları değiştirdikten sonra üretim kontrolünü yeniden çalıştırın.';
  scheduleManufacturingPreview();
}

async function runManufacturing(mode='preview',filter='all') {
  const status=$('manufacturingStatus'), buttons=Array.from(document.querySelectorAll('#manufacturingPreview, #manufacturingDownload, .stl-list button'));
  buttons.forEach(b=>b.disabled=true);
  status.textContent='Parçalar oluşturuluyor; delikler, bağlantılar ve kapalı yüzeyler kontrol ediliyor…';
  try {
    const stamp=JSON.stringify(manufacturingPayload());
    const res=await fetch(`/api/manufacturing?mode=${mode}&part=${filter}`,{method:'POST',headers:{'Content-Type':'application/json'},body:stamp});
    if (!res.ok) {const err=await res.json();throw new Error(err.error||'Üretim hesabı tamamlanamadı.');}
    if(stamp!==JSON.stringify(manufacturingPayload())) throw new Error('Hesaplama sırasında ölçüler değişti. Yeni ayarlarla yeniden üretin.');
    if (mode==='preview') {
      manufacturingResult=await res.json();showManufacturingPreview(manufacturingResult);
      status.textContent=manufacturingResult.summary;
    } else {
      downloadBlob(await res.blob(),`zeta_${filter}_montajli_stl.zip`);
      status.textContent='Parçalı STL paketi indirildi. ZIP dosyasını açın: her baskı parçası ayrı bir STL dosyasıdır. Önce küçük geçme deneme parçalarını basın.';
    }
  } catch(e) {status.textContent=e.message;notify(e.message);}
  finally {buttons.forEach(b=>b.disabled=false);}
}

function setupManufacturing() {
  $('manufacturingPreview').addEventListener('click',()=>runManufacturing('preview'));
  $('manufacturingDownload').addEventListener('click',()=>runManufacturing('zip'));
  let saved=null;try {saved=JSON.parse(store.get('zeta-manufacturing')||'null');} catch(e) { /* damaged local settings */ }
  const ids=['printBedX','printBedY','printBedZ','fitClearance','mountScrew','mountNutFlat','mountNutHeight',...MOTOR_FIELDS];
  const read=id=>['motorLayout','motorPattern'].includes(id)?$(id).value:Number($(id).value);
  for (const id of ids) {
    if(saved && (Number.isFinite(saved[id]) || (['motorLayout','motorPattern'].includes(id) && Array.from($(id).options).some(o=>o.value===saved[id])))) $(id).value=saved[id];
    $(id).addEventListener('change',()=>{
      invalidateManufacturingPreview();store.set('zeta-manufacturing',JSON.stringify(Object.fromEntries(ids.map(k=>[k,read(k)]))));
      if(state.geometry && MOTOR_FIELDS.includes(id)) {
        state.geometry.motor_mount=motorMountSettings();
        if(scene && fuseGroup) {scene.remove(fuseGroup);disposeModel(fuseGroup);fuseGroup=buildFuselageGroup(state.geometry,state.geometry.fuse_type,state.airfoilCoords);scene.add(fuseGroup);}
        if(scene && wingGroup) {scene.remove(wingGroup);disposeModel(wingGroup);wingGroup=buildWingGroup(state.geometry,state.airfoilCoords);scene.add(wingGroup);}
      }
    });
  }
  $('motorHardwareView').addEventListener('change',()=>{
    for(const root of [fuseGroup,wingGroup,manufacturingOverlay]) if(root)root.traverse(o=>{if(o.userData.motorHardware)o.visible=$('motorHardwareView').checked;});
  });
  $('motorCoverView').addEventListener('change',()=>{
    if(manufacturingOverlay)for(const mesh of manufacturingOverlay.children)if(mesh.userData.partName?.includes('_service_cover'))mesh.visible=$('motorCoverView').checked;
  });
  for(const id of ['wallThickness','sparMainDia','sparRearDia','ribSpacing','ribThickness']) $(id).addEventListener('change',invalidateManufacturingPreview);
}
window.addEventListener('DOMContentLoaded',setupManufacturing);
