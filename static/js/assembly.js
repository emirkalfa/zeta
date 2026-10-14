/* One panel layout for visualization and manufactured STL parts. */
function syncWingPlacement(g,sections) {
  if(!sections?.length)return;
  const x=g.wing_x_pos+g.root_chord*.4;
  let j=sections.findIndex(r=>r[0].x>=x);if(j<0)j=sections.length-1;
  const a=sections[Math.max(0,j-1)],b=sections[j],u=a===b?0:Math.max(0,Math.min(1,(x-a[0].x)/(b[0].x-a[0].x)));
  const low=r=>Math.min(...r.map(p=>p.y)),high=r=>Math.max(...r.map(p=>p.y));
  const lo=low(a)+(low(b)-low(a))*u,hi=high(a)+(high(b)-high(a))*u;
  g.wing_position_offset=(hi+lo)/2+({low:-.65,mid:0,high:.65}[g.wing_position]??0)*(hi-lo)/2;
}

function refreshWingAndTailGroups() {
  const g=state.geometry;if(!g)return;
  syncWingPlacement(g,buildFuselageSections(g,g.fuse_type,state.airfoilCoords).sections);
  if(scene && wingGroup){scene.remove(wingGroup);disposeModel(wingGroup);wingGroup=buildWingGroup(g,state.airfoilCoords);scene.add(wingGroup);}
  if(scene && tailGroup){scene.remove(tailGroup);disposeModel(tailGroup);tailGroup=buildTailGroup(g,state.tailCoords,state.vtailCoords||state.tailCoords);scene.add(tailGroup);}
}
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
      const fx=g.tail_type==='ttail'?tx+g.htail_chord-g.vtail_chord:tx+b.y*hd+ht-g.vtail_chord;
      for (const s of [1,-1]) add(`tail_vertical_${s>0?'right':'left'}`, 'tail', [fx,y,s*b.y], [fx+vs*vd,y+vs,s*b.y],g.vtail_chord,vt,[0,0,1],vCoords,`${g.tail_type==='ttail'?'boom':'tail_horizontal'}_${s>0?'right':'left'}`);
      const top=g.tail_type==='ttail';
      if(top)for(const s of [1,-1])add(`tail_horizontal_${s>0?'right':'left'}`,'tail',
        [fx+vs*vd+.25*(vt-g.htail_chord),y+vs,s*b.y],
        [fx+vs*vd+.25*(vt-g.htail_chord)+b.y*hd,y+vs,0],g.htail_chord,ht,[0,1,0],hCoords,`tail_vertical_${s>0?'right':'left'}`);
      else horizontal(tx,y,b.y,g.htail_chord,ht,'tail_bridge');
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
var manufacturingOverlay = null;
let detailViewVisibility=null;
let mountingDetailTargets=[];
let manufacturingTimer=null, manufacturingRevision=0;
let manufacturingRequestActive=null;
// Keep native mesh generation single-flight. Cancelling fetch would not stop
// the server's geometry work, so superseded previews wait and then disappear.
async function requestManufacturing(mode,filter,stamp,revision=null) {
  const key=mode+'|'+filter+'|'+stamp;
  while(manufacturingRequestActive) {
    const active=manufacturingRequestActive;
    if(active.key===key) return active.promise;
    try {await active.promise;} catch(e) { /* next request can still succeed */ }
    if(revision!==null && revision!==manufacturingRevision)return null;
  }
  if(revision!==null && revision!==manufacturingRevision)return null;
  const active={key};
  active.promise=(async()=>{
    const res=await fetch(`/api/manufacturing?mode=${mode}&part=${filter}`,{method:'POST',headers:{'Content-Type':'application/json'},body:stamp});
    const data=mode==='zip' && res.ok?await res.blob():await res.json();
    if(!res.ok)throw new Error(data.error||'Üretim hesabı tamamlanamadı.');
    return data;
  })();
  manufacturingRequestActive=active;
  try {return await active.promise;}
  finally {if(manufacturingRequestActive===active)manufacturingRequestActive=null;}
}
function previewStatus(message,phase='ready') {
  for(const id of ['manufacturingStatus','modelPreviewStatus','fusePreviewStatus']) {
    const el=$(id);if(!el)continue;el.textContent=message;
    const card=el.closest?.('.production-status');if(!card)continue;
    card.dataset.state=phase;
    const bar=card.querySelector('.production-progress');
    bar.hidden=phase!=='busy';card.setAttribute('aria-busy',String(phase==='busy'));
  }
}
function scheduleManufacturingPreview() {
  clearTimeout(manufacturingTimer);
  const revision=++manufacturingRevision;
  if(!state.geometry || !scene)return;
  previewStatus('STL hazırlanıyor: parçalar ve bağlantılar kontrol ediliyor.','busy');
  manufacturingTimer=setTimeout(async()=>{
    try {
      const stamp=JSON.stringify(manufacturingPayload());
      const data=await requestManufacturing('preview','all',stamp,revision);
      if(!data)return;
      if(revision!==manufacturingRevision || stamp!==JSON.stringify(manufacturingPayload()))return;
      manufacturingResult=data;showManufacturingPreview(data,false);
      previewStatus(`STL ile aynı detaylı model hazır. ${data.parts.length} baskı parçası.`,'ready');
    } catch(e) {if(revision===manufacturingRevision)previewStatus('STL önizlemesi hazır değil: '+e.message,'error');}
  },750);
}
const CAMERA_FIELDS=['cameraMount','cameraWidth','cameraHeight','cameraDepth','cameraScrew','cameraHoleX','cameraHoleY'];
const MOTOR_FIELDS=['motorLayout','motorPattern','motorDiameter','motorLength','motorSpacingY','motorSpacingZ','motorBore','motorScrew','motorPlate','motorWire','propDiameter','propOffset','motorStation'];
function motorMountSettings() {
  return Object.fromEntries(MOTOR_FIELDS.map(id=>[id,['motorLayout','motorPattern','wingJoinMode'].includes(id)?$(id).value:Number($(id).value)]));
}
function motorPreviewSpecs(g,settings,sections) {
  if(!settings || settings.motorLayout==='none')return [];
  const radius=settings.motorLayout==='single' && g.tail_booms?settings.motorDiameter/2:Math.max(settings.motorDiameter/2+3,
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
  const options={wingJoinMode:$('wingJoinMode')?.value||'bolted'};
  options.designMode=typeof radioValue==='function'?radioValue('mode','auto'):'auto';
  Object.assign(options,motorMountSettings());
  if(['vtol','vtol5'].includes(g.fuse_preset)&&typeof vtolSettings==='function')Object.assign(options,vtolSettings());
  if(g.fuse_preset==='vtol5')options.motorLayout='single';
  for(const id of CAMERA_FIELDS)options[id]=Number($(id).value);
  for (const [key,id] of Object.entries({bedX:'printBedX',bedY:'printBedY',bedZ:'printBedZ',wall:'wallThickness',clearance:'fitClearance',screw:'mountScrew',wingPin:'wingPin',wingSeatDepth:'wingSeatDepth',nutFlat:'mountNutFlat',nutHeight:'mountNutHeight',sparMain:'sparMainDia',sparRear:'sparRearDia',sparRearPosition:'sparRearPosition',ribSpacing:'ribSpacing',ribThickness:'ribThickness',hingePin:'hingePin',controlTravel:'controlTravel'})) options[key]=Number($(id).value);
  const sections=buildFuselageSections(g,g.fuse_type,state.airfoilCoords).sections;
  syncWingPlacement(g,sections);
  return {geometry:g, options, fuselage:sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000])), panels:aircraftPanelSpecs(g,state.airfoilCoords,state.tailCoords,state.vtailCoords||state.tailCoords)};
}

// Smooth the curved shell while keeping cut ends and drilled walls crisp.
// Only normals change; every triangle remains the production STL triangle.
function creaseShellNormals(geometry,angle=75*Math.PI/180) {
  if(!geometry.index)return geometry;
  const p=geometry.attributes.position.array,index=geometry.index.array;
  const groups=new Map(),vertexGroup=[],adj=[];
  for(let v=0;v<p.length/3;v++) {
    const key=[p[v*3],p[v*3+1],p[v*3+2]].map(x=>x.toFixed(7)).join(',');
    if(!groups.has(key)){groups.set(key,adj.length);adj.push([]);}
    vertexGroup[v]=groups.get(key);
  }
  const faces=new Float32Array(index.length),planes=new Uint8Array(index.length/3);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),n=new THREE.Vector3();
  for(let f=0;f<index.length/3;f++) {
    const ia=index[f*3]*3,ib=index[f*3+1]*3,ic=index[f*3+2]*3;
    a.set(p[ib]-p[ia],p[ib+1]-p[ia+1],p[ib+2]-p[ia+2]);
    b.set(p[ic]-p[ia],p[ic+1]-p[ia+1],p[ic+2]-p[ia+2]);n.crossVectors(a,b).normalize();
    faces.set([n.x,n.y,n.z],f*3);
    planes[f]=Math.abs(n.x)>.999999?1:Math.abs(n.z)>.999999?2:0;
    for(const g of new Set([vertexGroup[index[f*3]],vertexGroup[index[f*3+1]],vertexGroup[index[f*3+2]]]))adj[g].push(f);
  }
  const out=geometry.toNonIndexed(),normals=new Float32Array(index.length*3),threshold=Math.cos(angle);
  for(let corner=0;corner<index.length;corner++) {
    const f=Math.floor(corner/3)*3;n.set(0,0,0);
    for(const neighbor of adj[vertexGroup[index[corner]]]) {
      const j=neighbor*3;
      if(planes[Math.floor(corner/3)]!==planes[neighbor])continue;
      if(faces[f]*faces[j]+faces[f+1]*faces[j+1]+faces[f+2]*faces[j+2]>=threshold)
        n.add(a.set(faces[j],faces[j+1],faces[j+2]));
    }
    n.normalize();normals.set([n.x,n.y,n.z],corner*3);
  }
  out.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.dispose();return out;
}

function showManufacturingPreview(data,focus=true) {
  if (!scene) return;
  resetMountDetail(false);
  if (manufacturingOverlay) {scene.remove(manufacturingOverlay);disposeModel(manufacturingOverlay);}
  manufacturingOverlay=new THREE.Group();
  for (const part of data.parts) {
    let geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.map(v=>v/1000),3));
    geo.setIndex(part.faces);geo.computeVertexNormals();
    if(data.manifest.fixed_vtol_body&&(part.name.startsWith('body')||/^wing_(right|left)(?:$|_\d)/.test(part.name)))geo=creaseShellNormals(geo);
    const control=(data.manifest.controls||[]).find(c=>part.name===c.part||part.name.startsWith(c.part+'_'));
    const color=(part.name.includes('_join_')||part.name.startsWith('wing_root_brace_'))?0x9b85c4:control?({flap:0x3b7dd8,aileron:0xe8590c,elevator:0x2a9d8f,ruddervator:0x2a9d8f,rudder:0xd4a017}[control.kind]):part.name.includes('tail_center_joint')?0x2a9d8f:part.name.includes('_service_cover')?0xef9353:part.name.startsWith('hatch')?0x34424d:part.name.startsWith('body')?MODEL_COLORS.fuselage:MODEL_COLORS.airframe;
    const mesh=new THREE.Mesh(geo,modelMaterial(color));mesh.material.flatShading=!(part.name.startsWith('body')||/^wing_(right|left)(?:$|_\d)/.test(part.name));mesh.userData.partName=part.name;
    if(part.name.includes('_service_cover')||part.name.includes('_servo_cover'))mesh.visible=$('motorCoverView').checked;
    manufacturingOverlay.add(mesh);
  }
  addMotorHardware(manufacturingOverlay,data.manifest.motors||[]);
  if(data.manifest.vtol_joints?.length)addVtolServoHardware(manufacturingOverlay,data.manifest.vtol_joints);
  if(data.manifest.carbon_boom)addCarbonBoomHardware(manufacturingOverlay,data.manifest.carbon_boom);
  if($('vtolTiltPanel')){
    $('vtolTiltPanel').hidden=!(data.manifest.vtol_joints||[]).length;
    $('vtolTiltRight').value='0';$('vtolTiltLeft').value='0';
    $('vtolTiltRightValue').textContent='0°';$('vtolTiltLeftValue').textContent='0°';
  }
  wingGroup.visible=false;tailGroup.visible=false;fuseGroup.visible=false;
  scene.add(manufacturingOverlay);
  applyInternalStructureView();
  const panel=$('controlPreviewPanel'),select=$('controlPreviewSelect');
  if(panel&&select){
    const controls=data.manifest.controls||[];panel.hidden=!controls.length;select.replaceChildren();
    for(const c of controls){const option=document.createElement('option');option.value=c.part;option.textContent=controlLabel(c);select.append(option);}
    $('controlPreviewAngle').value='0';applyControlPreviewAngle();
  }
  setupMountingDetails(data.manifest||{});
  let hatchPanel=$('serviceHatchPanel');
  if(!hatchPanel){
    hatchPanel=document.createElement('details');hatchPanel.id='serviceHatchPanel';hatchPanel.className='settings-card';
    hatchPanel.innerHTML='<summary>Servis kapakları</summary><label><input id="showFrontHatch" type="checkbox" checked> Ön kapağı göster</label> <label><input id="showRearHatch" type="checkbox" checked> Arka kapağı göster</label>';
    $('controlPreviewPanel').before(hatchPanel);
    for(const id of ['showFrontHatch','showRearHatch'])$(id).addEventListener('change',applyServiceHatchVisibility);
  }
  hatchPanel.hidden=!data.manifest.service_hatches?.length;
  if($('vtolBalancePanel')){
    const balance=data.manifest.hover_balance;$('vtolBalancePanel').hidden=!balance;
    if(balance){
      const shares=['vtol_wing_right','vtol_wing_left','vtol_rear'].map(name=>(balance.vertical_thrust_fraction[name]*100).toFixed(1)+'%').join(', ');
      const rear=data.manifest.motors.find(m=>m.name==='vtol_rear');
      const rearInfo=rear?`Arka motor burundan ${(rear.face_mm[0]/10).toFixed(1)} cm uzakta, açık karbon boru üzerinde. `:'';
      $('vtolBalanceInfo').textContent=rearInfo+`Varsayılan CG: ${(balance.assumed_cg_mm[0]/10).toFixed(1)} cm; motor üçgeni merkezi: ${(balance.triangle_centroid_mm[0]/10).toFixed(1)} cm (burundan). CG ${balance.inside_triangle?'üçgenin içinde':'üçgenin dışında'}. Sağ ön, sol ön ve arka motor için statik dikey itki payı: ${shares}. ${balance.assumption}`;
    }
  }
  if(typeof updateFuseViewer==='function'&&typeof state!=='undefined')updateFuseViewer(state.geometry,state.airfoilCoords);
  applyServiceHatchVisibility();
  if(!focus)return;
  switchTab('viewer');
  const box=new THREE.Box3().setFromObject(manufacturingOverlay), sphere=box.getBoundingSphere(new THREE.Sphere());
  viewTarget.copy(sphere.center);viewDist=sphere.radius/Math.sin(Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect)))*1.05;
  setCameraDirection(HOME_VIEW);
  notify('Gerçek üretim geometrisi gösteriliyor: kapak, delikler ve montaj yuvaları dahil.');
}

function makeMountingDetails(manifest) {
  const targets=[];
  const add=(label,part,parent,point,axis,category)=>{
    if(!part||!Array.isArray(point)||point.length!==3||!Array.isArray(axis)||axis.length!==3)return;
    targets.push({id:`detail-${targets.length}`,label,part,parent,point:point.map(Number),axis:axis.map(Number),category});
  };
  (manifest.service_hatches||[]).forEach((h,index)=>h.bolt_points_mm.forEach((p,i)=>add(`${index?'Arka':'Ön'} servis kapağı, vida ${i+1}`,h.part,'body',p,[0,1,0],'bolt')));
  (manifest.interfaces||[]).forEach((j,i)=>add(`${j.parent} ↔ ${j.part}, ${j.fastener_type==='retaining_pin'?'kanat pimi':'bağlantı vidası'} ${i+1}`,j.part,j.parent,j.bolt_point_mm,j.bolt_axis,'bolt'));
  (manifest.motors||[]).forEach(m=>{
    const [x,y,z]=m.face_mm||[],axis=m.axis||[1,0,0];
    if(![x,y,z].every(Number.isFinite))return;
    (m.hole_centers_yz_mm||[]).forEach(([dy,dz],i)=>add(`${m.name}, motor vidası ${i+1} (Ø${Number(m.hole_diameter_mm).toFixed(1)} mm)`,m.parent,m.parent,[x,y+dy,z+dz],axis,'bolt'));
    (m.hole_points_mm||[]).forEach((p,i)=>add(`${m.name}, motor vidası ${i+1}`,m.parent,m.parent,p,m.out_axis||axis,'bolt'));
    (m.clamp_bolt_points_mm||[]).forEach((p,i)=>add(`${m.name.startsWith('vtol5_')?'Kaldırma rayı':'Arka motor kelepçesi'}, vida ${i+1}`,m.parent,m.clamp_part,p,[0,1,0],'bolt'));
    add(`${m.name}, motor mili deliği (Ø${Number(m.center_bore_mm).toFixed(1)} mm)`,m.parent,m.parent,[x,y,z],m.out_axis||axis,'bore');
    (m.service_screws?.positions_xz_mm||[]).forEach(([sx,sz],i)=>add(`${m.name}, servis kapağı vidası ${i+1}`,m.service_cover||m.parent,m.parent,[sx,y,sz],[0,1,0],'bolt'));
  });
  (manifest.landing_mounts?.mounts||[]).forEach(leg=>(leg.bolt_points_mm||[]).forEach((p,i)=>add(`${manifest.landing_mounts.layout==='tricycle_wheel_mounts'?'Teker bağlantısı':'Harici ayak yuvası'} (${leg.label||leg.name}), vida ${i+1}`,leg.part,leg.parent,p,[0,1,0],'bolt')));
  (manifest.cameras||[]).forEach(c=>(c.holes||[]).forEach((h,i)=>add(`Kamera yuvası, yan vida ${i+1} (Ø${c.hole_diameter_mm} mm)`,c.parent,c.parent,h.point_mm,h.axis,'bolt')));
  (manifest.vtol_joints||[]).forEach(j=>{
    const servoAxis=j.servo_output_axis?.map(v=>-v)||j.axis;
    add(`${j.part}, VTOL pivot mili`,j.part,j.parent,j.pivot_mm,j.axis,'hinge');
    (j.bolt_points_mm||[]).forEach((p,i)=>add(`${j.parent}, kanat bağlantı vidası ${i+1}`,j.parent,j.wing,p,[0,1,0],'bolt'));
    (j.horn_holes_mm||[]).forEach((p,i)=>add(`${j.part}, metal servo kolu vidası ${i+1}`,j.part,j.parent,p,servoAxis,'bolt'));
    (j.servo_mount_holes_mm||[]).forEach((p,i)=>add(`${j.parent}, servo kasa vidası ${i+1}`,j.parent,j.parent,p,servoAxis,'bolt'));
    (j.cover_holes_mm||[]).forEach((p,i)=>add(`${j.cover_part}, kapak vidası ${i+1}`,j.cover_part,j.parent,p,servoAxis,'bolt'));
  });
  (manifest.wing_segment_joints||[]).forEach(j=>(j.holes||[]).forEach((h,i)=>add(`Kanat dilim köprüsü ${j.seam} (${j.parent==='wing_right'?'sağ':'sol'}, köprü ${j.bridge.split('_').pop()}), vida ${i+1}`,j.bridge,j.parent,h.point_mm,h.axis,'bolt')));
  (manifest.wing_root_braces||[]).forEach(j=>(j.holes||[]).forEach((h,i)=>add(`Kanat kök desteği (${j.parent==='wing_right'?'sağ':'sol'}), vida ${i+1}`,j.bridge,j.parent,h.point_mm,h.axis,'bolt')));
  (manifest.body_segment_joints||[]).forEach(j=>(j.holes||[]).forEach((h,i)=>add(`Gövde boru giriş köprüsü, vida ${i+1}`,j.bridge,'body',h.point_mm,h.axis,'bolt')));
  if(manifest.carbon_boom){
    const tube=manifest.carbon_boom;
    (tube.body_bolt_points_mm||[]).forEach((p,i)=>add(`Gövde karbon boru sıkma vidası ${i+1}`,'body','body',p,[0,1,0],'bolt'));
    (tube.tail_bolt_points_mm||[]).forEach((p,i)=>add(`Kuyruk karbon boru sıkma vidası ${i+1}`,tube.tail_carrier,tube.tail_carrier,p,[0,1,0],'bolt'));
  }
  (manifest.controls||[]).forEach(c=>(c.link_holes_mm||[]).forEach((p,i)=>add(`${controlLabel(c)}, kumanda çubuğu deliği ${i+1}`,c.part,c.parent,p,c.link_axis,'bore')));
  (manifest.controls||[]).forEach(c=>add(`${controlLabel(c)}, menteşe pimi kanalı`,c.part,c.parent,c.hinge_point_mm,c.hinge_axis,'hinge'));
  return targets;
}

function setupMountingDetails(manifest) {
  const panel=$('mountDetailPanel'),select=$('mountDetailSelect');if(!panel||!select)return;
  const targets=makeMountingDetails(manifest);select.replaceChildren();panel.hidden=!targets.length;
  for(const t of targets){const option=document.createElement('option');option.value=t.id;option.textContent=t.label;select.append(option);}
  mountingDetailTargets=targets;
  const status=$('mountDetailStatus');if(status)status.textContent=targets.length?`${targets.length} bağlantı noktası. Seçip yakınlaştırabilirsiniz.`:'Bu ayarda vida/bağlantı noktası bulunamadı. Motor bağlantıları için önce motor yerleşimi seçin.';
}

function focusMountingDetail() {
  if(typeof applyVtolTilt==='function'&&manufacturingResult?.manifest?.vtol_joints?.length){
    $('vtolTiltRight').value='0';$('vtolTiltLeft').value='0';applyVtolTilt();
  }
  const t=mountingDetailTargets?.find(x=>x.id===$('mountDetailSelect')?.value);
  if(!t||!manufacturingOverlay||!camera||!controls)return;
  if(!detailViewVisibility)detailViewVisibility=new Map(manufacturingOverlay.children.filter(o=>o.userData.partName).map(o=>[o,o.visible]));
  const isPart=(n,id)=>n===id||n.startsWith(id+'_');
  const visibleName=n=>isPart(n,t.part)||(t.parent==='body'?isPart(n,'body'):isPart(n,t.parent))||(t.part.startsWith('wing_root_brace_')&&isPart(n,'body'));
  manufacturingOverlay.traverse(mesh=>{if(mesh.userData.partName)mesh.visible=visibleName(mesh.userData.partName);});
  const target=new THREE.Vector3(...t.point.map(v=>v/1000));viewTarget.copy(target);
  // Frame a small area around the actual opening; keep a short orbit distance so mouse zoom still works.
  viewDist=t.category==='hinge' ? .055 : .045;
  setCameraDirection(t.axis);
  controls.autoRotate=false;
  const status=$('mountDetailStatus');if(status)status.textContent=`${t.label}, gerçek STL deliğine yakın plan.`;
}

function resetMountDetail(restoreCamera=true) {
  if(detailViewVisibility&&manufacturingOverlay){
    for(const [o,visible] of detailViewVisibility)if(o.parent)o.visible=visible;
  }
  detailViewVisibility=null;
  if(restoreCamera&&manufacturingOverlay&&camera&&controls){
    const box=new THREE.Box3().setFromObject(manufacturingOverlay),sphere=box.getBoundingSphere(new THREE.Sphere());
    viewTarget.copy(sphere.center);
    const halfV=THREE.MathUtils.degToRad(camera.fov/2),halfH=Math.atan(Math.tan(halfV)*camera.aspect);
    viewDist=sphere.radius/Math.sin(Math.min(halfV,halfH))*1.05;setCameraDirection(HOME_VIEW);
  }
  const status=$('mountDetailStatus');if(status&&restoreCamera)status.textContent='Tüm gövde, kanat ve kuyruk parçaları gösteriliyor.';
}

function controlLabel(c){
  const kind={flap:'Flap',aileron:'Aileron',elevator:'Elevator',rudder:'Rudder',ruddervator:'V kuyruk kontrolü'}[c.kind]||c.kind;
  return kind+(c.parent.endsWith('_right')?', sağ':c.parent.endsWith('_left')?', sol':'')+(c.segment==='inboard'?' / iç bölüm':c.segment==='outboard'?' / dış bölüm':'');
}
function applyInternalStructureView(){
  if(!manufacturingOverlay)return;
  const transparent=$('internalStructureView')?.checked||false;
  for(const mesh of manufacturingOverlay.children){
    if(!mesh.userData.partName)continue;
    const shellTransparent=transparent&&!mesh.userData.partName.startsWith('vtol_body_join_axial_')&&!mesh.userData.partName.startsWith('wing_root_brace_');
    mesh.material.transparent=shellTransparent;mesh.material.opacity=shellTransparent ? 0.28 : 1;
    mesh.material.depthWrite=!shellTransparent;mesh.material.needsUpdate=true;
  }
}
function applyControlPreviewAngle(){
  const control=manufacturingResult?.manifest.controls?.find(c=>c.part===$('controlPreviewSelect')?.value);
  if(!control||!manufacturingOverlay)return;
  const input=$('controlPreviewAngle');[input.min,input.max]=control.travel_deg;
  const angle=Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)));input.value=angle;
  $('controlPreviewValue').textContent=angle+'°';
  const p=new THREE.Vector3(...control.hinge_point_mm.map(v=>v/1000)),axis=new THREE.Vector3(...control.hinge_axis);
  const transform=new THREE.Matrix4().makeTranslation(p.x,p.y,p.z).multiply(new THREE.Matrix4().makeRotationAxis(axis,THREE.MathUtils.degToRad(angle))).multiply(new THREE.Matrix4().makeTranslation(-p.x,-p.y,-p.z));
  for(const mesh of manufacturingOverlay.children){
    if(!mesh.userData.partName)continue;mesh.matrixAutoUpdate=false;mesh.matrix.identity();
    if(mesh.userData.partName===control.part||mesh.userData.partName.startsWith(control.part+'_'))mesh.matrix.copy(transform);
  }
}

function invalidateManufacturingPreview() {
  if($('vtolTiltPanel'))$('vtolTiltPanel').hidden=true;
  resetMountDetail(false);
  manufacturingResult=null;
  if (manufacturingOverlay && scene) {scene.remove(manufacturingOverlay);disposeModel(manufacturingOverlay);manufacturingOverlay=null;}
  if (wingGroup) wingGroup.visible=true;
  if (tailGroup) tailGroup.visible=true;
  if (fuseGroup) fuseGroup.visible=true;
  const status=$('manufacturingStatus');if(status) status.textContent='Ayarları değiştirdikten sonra üretim kontrolünü yeniden çalıştırın.';
  scheduleManufacturingPreview();
}

async function runManufacturing(mode='preview',filter='all') {
  clearTimeout(manufacturingTimer);
  ++manufacturingRevision;
  if(typeof showManufacturingIssue==='function')showManufacturingIssue('');
  const status=$('manufacturingStatus'), buttons=Array.from(document.querySelectorAll('#manufacturingPreview, #manufacturingDownload, .stl-list button'));
  buttons.forEach(b=>b.disabled=true);
  previewStatus('STL hazırlanıyor: parçalar ve bağlantılar kontrol ediliyor.','busy');
  try {
    const stamp=JSON.stringify(manufacturingPayload());
    const data=await requestManufacturing(mode,filter,stamp);
    if(stamp!==JSON.stringify(manufacturingPayload())) throw new Error('Hesaplama sırasında ölçüler değişti. Yeni ayarlarla yeniden üretin.');
    if (mode==='preview') {
      manufacturingResult=data;showManufacturingPreview(manufacturingResult);
      previewStatus(`Detaylı model hazır. ${data.parts.length} baskı parçası.`,'ready');
    } else {
      downloadBlob(data,`zeta_${filter}_montajli_stl.zip`);
      previewStatus('STL paketi indirildi. ZIP içinde parçalar ve montaj kılavuzu var.','ready');
    }
  } catch(e) {
    previewStatus(e.message,'error');notify(e.message);
    if(typeof showManufacturingIssue==='function'){
      showManufacturingIssue(e.message);switchTab('stl');
      $('manufacturingIssue')?.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }
  finally {buttons.forEach(b=>b.disabled=false);}
}

const MANUFACTURING_FIELDS=['wingJoinMode','printBedX','printBedY','printBedZ','fitClearance','mountScrew','wingPin','wingSeatDepth','mountNutFlat','mountNutHeight','wallThickness','sparMainDia','sparRearDia','sparRearPosition','ribSpacing','ribThickness','hingePin','controlTravel',...MOTOR_FIELDS,...CAMERA_FIELDS];
function captureManufacturingSettings() {
  return Object.fromEntries(MANUFACTURING_FIELDS.map(id=>[id,['motorLayout','motorPattern','wingJoinMode'].includes(id)?$(id).value:Number($(id).value)]));
}
function setupManufacturing() {
  $('manufacturingPreview').addEventListener('click',()=>runManufacturing('preview'));
  $('manufacturingDownload').addEventListener('click',()=>runManufacturing('zip'));
  let saved=null;try {saved=JSON.parse(store.get('zeta-manufacturing')||'null');} catch(e) { /* damaged local settings */ }
  const ids=MANUFACTURING_FIELDS;
  const read=id=>['motorLayout','motorPattern','wingJoinMode'].includes(id)?$(id).value:Number($(id).value);
  for (const id of ids) {
    const field=$(id);
    const validNumber=saved && Number.isFinite(saved[id]) && (!field.min || saved[id]>=Number(field.min)) && (!field.max || saved[id]<=Number(field.max));
    if(saved && (validNumber || (['motorLayout','motorPattern','wingJoinMode'].includes(id) && Array.from(field.options).some(o=>o.value===saved[id])))) field.value=saved[id];
    $(id).addEventListener('change',()=>{
      invalidateManufacturingPreview();store.set('zeta-manufacturing',JSON.stringify(Object.fromEntries(ids.map(k=>[k,read(k)]))));
      if(state.geometry && MOTOR_FIELDS.includes(id)) {
        state.geometry.motor_mount=motorMountSettings();
        refreshWingAndTailGroups();
        if(typeof updateFuseViewer==='function')updateFuseViewer(state.geometry,state.airfoilCoords);
        if(scene && fuseGroup) {scene.remove(fuseGroup);disposeModel(fuseGroup);fuseGroup=buildFuselageGroup(state.geometry,state.geometry.fuse_type,state.airfoilCoords);scene.add(fuseGroup);}
      }
    });
  }
  $('motorHardwareView').addEventListener('change',()=>{
    for(const root of [fuseGroup,wingGroup,manufacturingOverlay]) if(root)root.traverse(o=>{if(o.userData.motorHardware)o.visible=$('motorHardwareView').checked;});
  });
  $('motorDiameter').addEventListener('input',()=>$('motorDiameter').dispatchEvent(new Event('change')));
  $('motorCoverView').addEventListener('change',()=>{
    if(manufacturingOverlay)for(const mesh of manufacturingOverlay.children)if(mesh.userData.partName?.includes('_service_cover')||mesh.userData.partName?.includes('_servo_cover'))mesh.visible=$('motorCoverView').checked;
  });
  $('controlPreviewAngle')?.addEventListener('input',applyControlPreviewAngle);
  $('internalStructureView')?.addEventListener('change',applyInternalStructureView);
  $('controlPreviewSelect')?.addEventListener('change',()=>{$('controlPreviewAngle').value='0';applyControlPreviewAngle();});
  $('focusMountDetail')?.addEventListener('click',focusMountingDetail);
  $('mountDetailSelect')?.addEventListener('change',focusMountingDetail);
  $('resetMountDetail')?.addEventListener('click',()=>resetMountDetail(true));
}
// Initialized by app.js after persistent settings have been loaded.

function applyServiceHatchVisibility(){
  for(const group of [manufacturingOverlay,typeof fuseViewerGroup!=='undefined'?fuseViewerGroup:null]){
    group?.traverse(mesh=>{
      const name=mesh.userData.partName||'';
      if(name.startsWith('hatch_front'))mesh.visible=$('showFrontHatch')?.checked??true;
      if(name.startsWith('hatch_rear'))mesh.visible=$('showRearHatch')?.checked??true;
    });
  }
}
