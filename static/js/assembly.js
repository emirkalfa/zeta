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
  };
  if (g.tail_booms) {
    const b=g.tail_booms, y=wy+b.y*Math.sin(rad(g.dihedral_angle)), a=rad(35);
    if (g.tail_type==='vtail') {
      for (const s of [1,-1]) add(`tail_v_${s>0?'right':'left'}`, 'tail', [tx,y,s*b.y], [tx+b.y*vd,y+b.y*Math.tan(a),0], g.vtail_chord,vt,[0,Math.cos(a),s*Math.sin(a)],hCoords,'boom');
    } else {
      const fx=tx+g.htail_chord-g.vtail_chord;
      for (const s of [1,-1]) add(`tail_vertical_${s>0?'right':'left'}`, 'tail', [fx,y,s*b.y], [fx+vs*vd,y+vs,s*b.y],g.vtail_chord,vt,[0,0,1],vCoords,'boom');
      const top=g.tail_type==='ttail';
      horizontal(top?fx+vs*vd+vt-g.htail_chord:tx,top?y+vs:y,b.y,g.htail_chord,g.htail_chord,top?'fin':'boom');
    }
  } else if (g.tail_type==='vtail') {
    const a=rad(35), span=vs/2;
    for (const s of [1,-1]) add(`tail_v_${s>0?'right':'left'}`, 'tail', [tx,0,0], [tx+span*vd,span*Math.sin(a),s*span*Math.cos(a)],g.vtail_chord,vt,[0,Math.cos(a),-s*Math.sin(a)],hCoords);
  } else {
    add('tail_vertical','tail',[tx,0,0],[tx+vs*vd,vs,0],g.vtail_chord,vt,[0,0,1],vCoords);
    horizontal(g.tail_type==='ttail'?tx+vs*vd+vt-g.htail_chord:tx,g.tail_type==='ttail'?vs:0,hs,g.htail_chord,ht,g.tail_type==='ttail'?'tail_vertical':'body');
  }
  return specs;
}

let manufacturingResult = null;
let manufacturingOverlay = null;
function manufacturingPayload() {
  if (!checkGeom()) throw new Error('Önce Hesapla düğmesine basın.');
  const g=state.geometry;
  const options={};
  for (const [key,id] of Object.entries({bedX:'printBedX',bedY:'printBedY',bedZ:'printBedZ',wall:'wallThickness',clearance:'fitClearance',screw:'mountScrew',nutFlat:'mountNutFlat',nutHeight:'mountNutHeight',sparMain:'sparMainDia',sparRear:'sparRearDia',ribSpacing:'ribSpacing',ribThickness:'ribThickness'})) options[key]=Number($(id).value);
  return {geometry:g, options, fuselage:buildFuselageSections(g,g.fuse_type,state.airfoilCoords).sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000])), panels:aircraftPanelSpecs(g,state.airfoilCoords,state.tailCoords,state.vtailCoords||state.tailCoords)};
}

function showManufacturingPreview(data) {
  if (!scene) return;
  if (manufacturingOverlay) {scene.remove(manufacturingOverlay);disposeModel(manufacturingOverlay);}
  manufacturingOverlay=new THREE.Group();
  for (const part of data.parts) {
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.map(v=>v/1000),3));
    geo.setIndex(part.faces);geo.computeVertexNormals();
    const color=part.name==='hatch'?0x34424d:part.name==='body'?MODEL_COLORS.fuselage:MODEL_COLORS.airframe;
    const mesh=new THREE.Mesh(geo,modelMaterial(color));mesh.userData.partName=part.name;
    manufacturingOverlay.add(mesh);
  }
  wingGroup.visible=false;tailGroup.visible=false;fuseGroup.visible=false;
  scene.add(manufacturingOverlay);
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
}

async function runManufacturing(mode='preview',filter='all') {
  const status=$('manufacturingStatus'), buttons=[$('manufacturingPreview'),$('manufacturingDownload')];
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
      status.textContent='STL paketi indirildi. İçindeki MONTAJ.txt ve manifest.json dosyalarını okuyun; önce tolerans denemesini basın.';
    }
  } catch(e) {status.textContent=e.message;notify(e.message);}
  finally {buttons.forEach(b=>b.disabled=false);}
}

function setupManufacturing() {
  $('manufacturingPreview').addEventListener('click',()=>runManufacturing('preview'));
  $('manufacturingDownload').addEventListener('click',()=>runManufacturing('zip'));
  let saved=null;try {saved=JSON.parse(store.get('zeta-manufacturing')||'null');} catch(e) { /* damaged local settings */ }
  const ids=['printBedX','printBedY','printBedZ','fitClearance','mountScrew','mountNutFlat','mountNutHeight'];
  for (const id of ids) {
    if(saved && Number.isFinite(saved[id])) $(id).value=saved[id];
    $(id).addEventListener('change',()=>{invalidateManufacturingPreview();store.set('zeta-manufacturing',JSON.stringify(Object.fromEntries(ids.map(k=>[k,Number($(k).value)]))));});
  }
  for(const id of ['wallThickness','sparMainDia','sparRearDia','ribSpacing','ribThickness']) $(id).addEventListener('change',invalidateManufacturingPreview);
}
window.addEventListener('DOMContentLoaded',setupManufacturing);
