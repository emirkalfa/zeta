function syncWingPlacement(g,sections) {
  if(!sections?.length)return;
  const heightAt = x => {
    let j = sections.findIndex(ring => ring[0].x >= x);
    if (j < 0) j = sections.length - 1;
    const a = sections[Math.max(0, j - 1)], b = sections[j];
    const u = a === b ? 0 : Math.max(0, Math.min(1, (x - a[0].x) / (b[0].x - a[0].x)));
    const low = ring => Math.min(...ring.map(point => point.y));
    const high = ring => Math.max(...ring.map(point => point.y));
    return [low(a) + (low(b) - low(a)) * u, high(a) + (high(b) - high(a)) * u];
  };
  const [lo, hi] = heightAt(g.wing_x_pos + g.root_chord * .4);
  g.wing_position_offset=(hi+lo)/2+(g.fuse_preset==='vtol5'?0:({low:-.65,mid:0,high:.65}[g.wing_position]??0))*(hi-lo)/2;
  if (g.fuse_preset==='akin') {
    g.wing_position_offset = lo+.92*(hi-lo);
    g.tail_position_offset = akinTubeHeight(g);
  } else if (!g.tail_booms && !g.vtol_fixed_body) {
    const [bottom, top] = heightAt(g.tail_x_pos + .4 * g.htail_chord);
    g.tail_position_offset = (bottom + top) / 2;
  }
}

function refreshWingAndTailGroups() {
  const g=state.geometry;if(!g)return;
  syncWingPlacement(g,buildFuselageSections(g,g.fuse_type,state.airfoilCoords).sections);
  if(scene && wingGroup){scene.remove(wingGroup);disposeModel(wingGroup);wingGroup=buildWingGroup(g,state.airfoilCoords);scene.add(wingGroup);}
  if(scene && tailGroup){scene.remove(tailGroup);disposeModel(tailGroup);tailGroup=buildTailGroup(g,state.tailCoords,state.vtailCoords||state.tailCoords);scene.add(tailGroup);}
  if(typeof requestViewerFrame==='function')requestViewerFrame();
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
  const ty = g.tail_position_offset || 0;
  const tx = g.tail_x_pos, vs = g.vtail_span, hs = g.htail_span / 2;
  const hd = Math.tan(rad(g.htail_sweep ?? 3));
  const vt = g.vtail_tip_chord ?? g.vtail_chord * g.vtail_taper;
  const ht = g.htail_tip_chord ?? g.htail_chord * g.htail_taper;
  const straightTail = g.tail_type !== 'vtail';
  const finRun = g.vtail_chord-vt;
  const mount = g.tail_mount_fraction ?? .27;
  const mountRun = finRun * mount;
  const mountChord = g.vtail_chord - mountRun;
  const elevatorX = finX => Math.max(finX+mountRun+.25*(mountChord-g.htail_chord),
    finX+g.vtail_chord-.65*g.htail_chord);
  const horizontal = (x,y,span,rootChord,tipChord,parent) => {
    const run = straightTail ? rootChord-tipChord : span*hd;
    for (const s of [1,-1]) add(`tail_horizontal_${s>0?'right':'left'}`, 'tail', [x,y,0], [x+run,y,s*span], rootChord,tipChord,[0,1,0],hCoords,parent);
    if (parent === 'tail_vertical') for (const p of specs.slice(-2)) p.mountChordFraction=.25;
  };
  if (g.tail_booms) {
    const b=g.tail_booms, y=wy+b.y*Math.sin(rad(g.dihedral_angle)), a=rad(35);
    if (g.tail_type==='vtail') {
      for (const s of [1,-1]) add(`tail_v_${s>0?'right':'left'}`, 'tail', [tx,y,s*b.y], [tx+finRun,y+b.y*Math.tan(a),0], g.vtail_chord,vt,[0,Math.cos(a),s*Math.sin(a)],hCoords,`boom_${s>0?'right':'left'}`);
    } else {
      const fx=g.tail_type==='ttail'?tx+g.htail_chord-1.20*g.vtail_chord:tx+(straightTail ? g.htail_chord : b.y*hd+ht)-g.vtail_chord;
      for (const s of [1,-1]) add(`tail_vertical_${s>0?'right':'left'}`, 'tail', [fx,y,s*b.y], [fx+finRun,y+vs,s*b.y],g.vtail_chord,vt,[0,0,1],vCoords,`${g.tail_type==='ttail'?'boom':'tail_horizontal'}_${s>0?'right':'left'}`);
      const top=g.tail_type==='ttail';
      if(top)for(const s of [1,-1]){
        const x=elevatorX(fx);
        const height=y+vs*mount;
        add(`tail_horizontal_${s>0?'right':'left'}`,'tail',[x,height,s*b.y],
          [x+g.htail_chord-ht,height,0],g.htail_chord,ht,[0,1,0],hCoords,`tail_vertical_${s>0?'right':'left'}`);
      }
      else horizontal(tx,y,b.y,g.htail_chord,ht,'tail_bridge');
    }
  } else if (g.tail_type==='vtail') {
    const a=rad(35), span=vs/2;
    for (const s of [1,-1]) add(`tail_v_${s>0?'right':'left'}`, 'tail', [tx,ty,0], [tx+finRun,ty+span*Math.sin(a),s*span*Math.cos(a)],g.vtail_chord,vt,[0,Math.cos(a),-s*Math.sin(a)],hCoords);
  } else {
    const finX = g.tail_type === 'conventional' ? tx + g.htail_chord - g.vtail_chord : tx-.20*g.vtail_chord;
    add('tail_vertical','tail',[finX,ty,0],[finX+finRun,ty+vs,0],g.vtail_chord,vt,[0,0,1],vCoords);
    const tTail = g.tail_type==='ttail';
    horizontal(tTail ? elevatorX(finX) : tx,
      ty+(tTail?vs*mount:0),hs,g.htail_chord,ht,tTail?'tail_vertical':'body');
  }
  return specs;
}

let manufacturingResult = null;
var manufacturingOverlay = null;
let detailViewVisibility=null;
let mountingDetailTargets=[];
let manufacturingTimer=null, manufacturingRevision=0;
let manufacturingRequestActive=null;
async function requestManufacturing(mode,filter,stamp,revision=null) {
  const key=mode+'|'+filter+'|'+stamp;
  while(manufacturingRequestActive) {
    const active=manufacturingRequestActive;
    if(active.key===key) return active.promise;
    try {await active.promise;} catch(e) {   }
    if(revision!==null && revision!==manufacturingRevision)return null;
  }
  if(revision!==null && revision!==manufacturingRevision)return null;
  const active={key};
  active.promise=(async()=>{
    const endpointMode=mode==='preview'?'preview_packed':mode;
    const res=await fetch(`/api/manufacturing?mode=${endpointMode}&part=${filter}`,{method:'POST',headers:{'Content-Type':'application/json'},body:stamp});
    const data=['zip','merkusim'].includes(mode) && res.ok?await res.blob():await res.json();
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
function scheduleManufacturingPreview(calculated=false) {
  clearTimeout(manufacturingTimer);
  const revision=++manufacturingRevision;
  if(!state.geometry||!scene||(!calculated&&typeof calculationActive!=='undefined'&&calculationActive))return;
  displayPrintedControlAreas();
  previewStatus('STL hazırlanıyor: parçalar ve bağlantılar kontrol ediliyor.','busy');
  manufacturingTimer=setTimeout(async()=>{
    try {
      const stamp=JSON.stringify(manufacturingPayload());
      const data=await requestManufacturing('preview','all',stamp,revision);
      if(!data)return;
      if(revision!==manufacturingRevision)return;
      manufacturingResult=data;
      if(typeof viewerPaneVisible!=='function'||viewerPaneVisible('three-container')||viewerPaneVisible('fuse-three-container')){
        showManufacturingPreview(data,false);
      }
      previewStatus(`STL ile aynı detaylı model hazır. ${data.parts.length} baskı parçası.`,'ready');
    } catch(e) {if(revision===manufacturingRevision){
      displayPrintedControlAreas(null,true);
      previewStatus('STL önizlemesi hazır değil: '+e.message,'error');
    }}
  },750);
}
const CONTROL_SERVO_FIELDS=['controlServoMount','controlServoLength','controlServoWidth','controlServoHeight'];
const CAMERA_FIELDS=['cameraMount','cameraWidth','cameraHeight','cameraDepth','cameraScrew','cameraHoleX','cameraHoleY','cameraLensDiameter'];
const MOTOR_FIELDS=['motorLayout','motorPattern','motorDiameter','motorLength','motorSpacingY','motorSpacingZ','motorBore','motorScrew','motorPlate','motorWire','propDiameter','propOffset','motorStation'];
function syncMotorLayoutAvailability() {
  const field = $('motorLayout');
  const rearOption = field.querySelector('option[value="rear"]');
  const rearAllowed = state.fusePreset !== 'vtol';
  field.disabled = state.fusePreset==='akin';
  if (field.disabled) field.value='rear';
  rearOption.disabled = rearOption.hidden = !rearAllowed;
  if (!rearAllowed && field.value === 'rear') field.value = 'none';
  syncGimbalOption();
}

function syncGimbalOption() {
  const field=$('cameraMount'), option=field.querySelector('option[value="3"]');
  const supported=['atlas','vtol'].includes(state.fusePreset);
  option.disabled=option.hidden=!supported;
  if(!supported && state.projectRestored && field.value==='3')field.value='0';
  for(const id of CAMERA_FIELDS.slice(1))$(id).closest('.field').hidden=field.value==='3';
}

function motorMountSettings() {
  return Object.fromEntries(MOTOR_FIELDS.map(id=>[id,['motorLayout','motorPattern','wingJoinMode','hatchFastening'].includes(id)?$(id).value:Number($(id).value)]));
}
function motorPreviewSpecs(g,settings,sections) {
  if (!settings || settings.motorLayout === 'none') return [];
  const radius = motorPlateRadius(g, settings);
  let faces=[];
  if(settings.motorLayout==='rear') {
    const ring = sections.at(-1);
    faces=[{parent:'body',axis:[-1,0,0],face_mm:[ring[0].x*1000,ring.reduce((n,p)=>n+p.y,0)/ring.length*1000,0]}];
  }
  else for(const p of aircraftPanelSpecs(g,[],[],[]).filter(p=>p.kind==='wing')) {
    const s=settings.motorStation/100,le=p.root.map((v,i)=>(v+(p.tip[i]-v)*s)*1000);
    faces.push({parent:p.name,face_mm:[le[0]-20,le[1]-settings.motorDiameter*.35,le[2]]});
  }
  return faces.map(p=>({...p,motor_diameter_mm:settings.motorDiameter,motor_length_mm:settings.motorLength,prop_diameter_mm:settings.propDiameter,prop_plane_x_mm:p.face_mm[0]-(p.axis?.[0]??1)*(settings.motorLength+(settings.propOffset??8)),plate_radius_mm:radius,plate_thickness_mm:settings.motorPlate}));
}
function manufacturingPayload() {
  if (!checkGeom()) throw new Error('Önce Hesapla düğmesine basın.');
  const g={...state.geometry};
  const options={wingJoinMode:$('wingJoinMode')?.value||'bolted',hatchFastening:$('hatchFastening').value};
  options.designMode=typeof radioValue==='function'?radioValue('mode','auto'):'auto';
  Object.assign(options,motorMountSettings());
  if(['vtol','vtol5'].includes(g.fuse_preset)&&typeof vtolSettings==='function')Object.assign(options,vtolSettings());
  if(g.fuse_preset==='vtol5')options.motorLayout='rear';
  for(const id of [...CAMERA_FIELDS,...CONTROL_SERVO_FIELDS])options[id]=Number($(id).value);
  for (const [key,id] of Object.entries({bedX:'printBedX',bedY:'printBedY',bedZ:'printBedZ',wall:'wallThickness',clearance:'fitClearance',screw:'mountScrew',wingPin:'wingPin',wingSeatDepth:'wingSeatDepth',nutFlat:'mountNutFlat',nutHeight:'mountNutHeight',sparMain:'sparMainDia',sparRear:'sparRearDia',sparRearPosition:'sparRearPosition',sparMainPosition:'sparMainPosition',ribSpacing:'ribSpacing',ribThickness:'ribThickness',hingePin:'hingePin',controlTravel:'controlTravel'})) options[key]=Number($(id).value);
  const sections=buildFuselageSections(g,g.fuse_type,state.airfoilCoords,false).sections;
  syncWingPlacement(g,sections);
  return {geometry:g, options, fuselage:sections.map(r=>r.map(p=>[p.x*1000,p.y*1000,p.z*1000])), panels:aircraftPanelSpecs(g,state.airfoilCoords,state.tailCoords,state.vtailCoords||state.tailCoords)};
}

function creaseShellNormals(geometry,angle=75*Math.PI/180,angleWeighted=false) {
  if(!geometry.index)return geometry;
  const p=geometry.attributes.position.array,index=geometry.index.array;
  const groups=new Map(),vertexGroup=[],adj=[];
  for(let v=0;v<p.length/3;v++) {
    const key=[p[v*3],p[v*3+1],p[v*3+2]].map(x=>x.toFixed(7)).join(',');
    if(!groups.has(key)){groups.set(key,adj.length);adj.push([]);}
    vertexGroup[v]=groups.get(key);
  }
  const faces=new Float32Array(index.length),planes=new Uint8Array(index.length/3);
  const weights=new Float32Array(index.length).fill(1);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),n=new THREE.Vector3();
  for(let f=0;f<index.length/3;f++) {
    const ia=index[f*3]*3,ib=index[f*3+1]*3,ic=index[f*3+2]*3;
    a.set(p[ib]-p[ia],p[ib+1]-p[ia+1],p[ib+2]-p[ia+2]);
    b.set(p[ic]-p[ia],p[ic+1]-p[ia+1],p[ic+2]-p[ia+2]);n.crossVectors(a,b).normalize();
    faces.set([n.x,n.y,n.z],f*3);
    planes[f]=Math.abs(n.x)>.999999?1:Math.abs(n.z)>.999999?2:0;
    for(let k=0;k<3;k++){
      const corner=f*3+k,base=index[corner]*3;
      if(angleWeighted){
        const left=index[f*3+(k+1)%3]*3,right=index[f*3+(k+2)%3]*3;
        a.set(p[left]-p[base],p[left+1]-p[base+1],p[left+2]-p[base+2]);
        b.set(p[right]-p[base],p[right+1]-p[base+1],p[right+2]-p[base+2]);
        weights[corner]=a.angleTo(b);
      }
      adj[vertexGroup[index[corner]]].push(corner);
    }
  }
  const out=geometry.toNonIndexed(),normals=new Float32Array(index.length*3),threshold=Math.cos(angle);
  for(let corner=0;corner<index.length;corner++) {
    const f=Math.floor(corner/3)*3;n.set(0,0,0);
    for(const neighbor of adj[vertexGroup[index[corner]]]) {
      const face=Math.floor(neighbor/3),j=face*3;
      if(planes[Math.floor(corner/3)]!==planes[face])continue;
      if(faces[f]*faces[j]+faces[f+1]*faces[j+1]+faces[f+2]*faces[j+2]>=threshold)
        n.addScaledVector(a.set(faces[j],faces[j+1],faces[j+2]),weights[neighbor]);
    }
    n.normalize();normals.set([n.x,n.y,n.z],corner*3);
  }
  if(angleWeighted){
    const raw=normals.slice();
    for(let corner=0;corner<index.length;corner++){
      const base=corner*3,face=Math.floor(corner/3);
      if(planes[face])continue;
      n.set(raw[base],raw[base+1],raw[base+2]).multiplyScalar(2);
      const point=index[corner]*3,seen=new Set();
      for(const incident of adj[vertexGroup[index[corner]]]){
        const start=Math.floor(incident/3)*3;
        for(let j=start;j<start+3;j++){
          const vertex=index[j],group=vertexGroup[vertex];
          if(group===vertexGroup[index[corner]]||seen.has(group)||planes[Math.floor(j/3)])continue;
          const q=vertex*3,dist=Math.hypot(p[q]-p[point],p[q+1]-p[point+1],p[q+2]-p[point+2]);
          if(dist>=.009)continue;
          const k=j*3;
          a.set(raw[k],raw[k+1],raw[k+2]);
          if(a.x*raw[base]+a.y*raw[base+1]+a.z*raw[base+2]<.50)continue;
          seen.add(group);
          n.addScaledVector(a,1-dist/.009);
        }
      }
      n.normalize();normals.set([n.x,n.y,n.z],base);
    }
  }
  out.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.dispose();return out;
}

function isPrintedControl(name,control) {
  return name.replace(/(?:_(?:split)?\d+of\d+)+$/,'')===control.part;
}

function manufacturedPartColor(name, manifest) {
  if ((manifest.controls || []).some(control => isPrintedControl(name,control))) {
    return MODEL_COLORS.control;
  }
  if (name.includes('_join_') || name.startsWith('wing_root_brace_')) return 0x9b85c4;
  if (/^body_gimbal_(?:camera_adapter|vtx_tray)$/.test(name)) return MODEL_COLORS.control;
  if (name.includes('tail_center_joint')) return 0x2a9d8f;
  if (name.includes('_service_cover')) return 0xef9353;
  return /^(body|hatch)(_|$)/.test(name) ? MODEL_COLORS.fuselage : MODEL_COLORS.airframe;
}

function displayPrintedControlAreas(controls,failed=false) {
  const list=$('printed-control-areas'), status=$('printed-control-area-status');
  if(!list||!status)return;
  const names={flap:'Flap',aileron:'Aileron',flaperon:'Flaperon',
    elevator:'İrtifa dümeni',rudder:'Yön dümeni',ruddervator:'V-kuyruk dümeni'};
  const side={left:'Sol',right:'Sağ'};
  const segment={inboard:'İç parça',outboard:'Dış parça'};
  const measured=(controls||[]).filter(item=>Number.isFinite(item.printed_planform_area_m2));
  function areaRow(words,area) {
    const row=document.createElement('div'), label=document.createElement('dt'), value=document.createElement('dd');
    for (const word of words.filter(Boolean)) {
      const part=document.createElement('span');
      part.textContent=word;
      if(label.childNodes.length)label.append(' · ');
      label.append(part);
    }
    value.append(measurementValue(area*10000,'cm²',2));
    row.append(label,value);
    return row;
  }
  const rows=[];
  for (const [kind,name] of Object.entries(names)) {
    const items=measured.filter(item=>item.kind===kind);
    for (const item of items) {
      const prefix=item.parents ? null : side[item.parent.split('_').at(-1)];
      const detail=item.parents ? 'Tek parça' : segment[item.segment];
      rows.push(areaRow([name,prefix,detail],item.printed_planform_area_m2));
    }
    if(items.length>1)rows.push(areaRow([name,'Toplam'],items.reduce((sum,item)=>sum+item.printed_planform_area_m2,0)));
  }
  list.replaceChildren(...rows);
  list.hidden=!rows.length;
  status.hidden=Boolean(rows.length);
  status.textContent=failed ? 'STL üretimi tamamlanamadı. Alan ölçülemedi.'
    : controls ? 'Ölçülebilen hareketli yüzey bulunamadı.' : 'STL önizlemesi hazırlanıyor.';
}
function previewBytes(encoded){
  if(typeof Uint8Array.fromBase64==='function')return Uint8Array.fromBase64(encoded).buffer;
  const bytes=atob(encoded);
  const result=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++)result[i]=bytes.charCodeAt(i);
  return result.buffer;
}
function showManufacturingPreview(data,focus=true) {
  displayPrintedControlAreas(data.manifest.controls);
  if (!scene) return;
  resetMountDetail(false);
  if (manufacturingOverlay) {scene.remove(manufacturingOverlay);disposeModel(manufacturingOverlay);}
  manufacturingOverlay=new THREE.Group();
  for (const part of data.parts) {
    let geo=new THREE.BufferGeometry();
    if(part.positions_m_f32){
      geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(previewBytes(part.positions_m_f32)),3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(previewBytes(part.indices_u32)),1));
    }else{
      geo.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.map(v=>v/1000),3));
      geo.setIndex(part.faces);
    }
    if(part.name.startsWith('body')||/^wing_(right|left)(?:$|_\d)/.test(part.name)){
      const triaBody=state.geometry?.fuse_preset==='vtol' && /^body(?:$|_\d)/.test(part.name);
      geo=creaseShellNormals(geo,triaBody ? 105*Math.PI/180 : undefined,triaBody);
    }
    const color = manufacturedPartColor(part.name, data.manifest);
    const mesh=new THREE.Mesh(geo,modelMaterial(color));mesh.material.flatShading=!(part.name.startsWith('body')||/^wing_(right|left)(?:$|_\d)/.test(part.name));mesh.userData.partName=part.name;
    if(part.name.includes('_service_cover')||part.name.includes('_servo_cover'))mesh.visible=$('motorCoverView').checked;
    manufacturingOverlay.add(mesh);
  }
  if (!data.manifest.nose_module && typeof state !== 'undefined' && state.geometry) {
    addManufacturedNoseGrille(manufacturingOverlay, state.geometry.fuselage_length);
  }
  addMotorHardware(manufacturingOverlay,data.manifest.motors||[]);
  if(data.manifest.vtol_joints?.length)addVtolServoHardware(manufacturingOverlay,data.manifest.vtol_joints);
  if(data.manifest.carbon_boom)addCarbonBoomHardware(manufacturingOverlay,data.manifest.carbon_boom,data.manifest.carbon_boom.structural);
  for (const boom of data.manifest.booms || []) {
    if (!boom.purchased) continue;
    const [x,y,z] = boom.center_mm;
    addCarbonBoomHardware(manufacturingOverlay,{...boom,start_mm:[x,y,z],end_mm:[boom.end_x_mm,y,z]},true);
  }
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
  const servoSeats=data.manifest.control_servos||[];
  const fittedServos=servoSeats.filter(seat=>seat.status==='ready').length;
  $('controlServoStatus').textContent=servoSeats.length
    ? (document.documentElement.lang==='en'
      ? `${fittedServos}/${servoSeats.length} servo seats fit the current geometry.`
      : `${servoSeats.length} yuvadan ${fittedServos} tanesi mevcut geometriye sığdı.`) : '';
  setupMountingDetails(data.manifest||{});
  let hatchPanel=$('serviceHatchPanel');
  if(!hatchPanel){
    hatchPanel=document.createElement('details');hatchPanel.id='serviceHatchPanel';hatchPanel.className='settings-card';
    hatchPanel.innerHTML='<summary>Servis kapakları</summary><label><input id="showFrontHatch" type="checkbox" checked> Ön servis kapağını göster</label> <label><input id="showRearHatch" type="checkbox" checked> Arka servis kapağını göster</label> <label><input id="showNoseVentCover" type="checkbox" checked> Burun kapağını göster</label>';
    $('controlPreviewPanel').before(hatchPanel);
    for(const id of ['showFrontHatch','showRearHatch','showNoseVentCover'])$(id).addEventListener('change',()=>{
      resetMountDetail(false);
      applyServiceHatchVisibility();
    });
  }
  const hasServiceHatches=Boolean(data.manifest.service_hatches?.length);
  const hasNoseVentCover=data.parts.some(part=>isNoseVentCover(part.name));
  for(const id of ['showFrontHatch','showRearHatch'])$(id).closest('label').hidden=!hasServiceHatches;
  $('showNoseVentCover').closest('label').hidden=!hasNoseVentCover;
  hatchPanel.hidden=!(hasServiceHatches||hasNoseVentCover);
  if($('vtolBalancePanel')){
    const balance=data.manifest.hover_balance;$('vtolBalancePanel').hidden=!balance;
    if(balance){
      const shares=['vtol_wing_right','vtol_wing_left','vtol_rear'].map(name=>(balance.vertical_thrust_fraction[name]*100).toFixed(1)+'%').join(', ');
      const rear=data.manifest.motors.find(m=>m.name==='vtol_rear');
      const rearInfo=rear?`Arka motor burundan ${(rear.face_mm[0]/10).toFixed(1)} cm uzakta, açık karbon boru üzerinde. `:'';
      const front=data.manifest.motors.find(m=>m.name==='vtol_wing_right');
      const rise=front ? front.motor_face_offset_mm-15 : 0;
      const frontInfo=rise>0?`Kısa motor için ön plaka ${rise.toFixed(1)} mm yükseltildi. `:'';
      $('vtolBalanceInfo').textContent=frontInfo+rearInfo+`Varsayılan CG: ${(balance.assumed_cg_mm[0]/10).toFixed(1)} cm; motor üçgeni merkezi: ${(balance.triangle_centroid_mm[0]/10).toFixed(1)} cm (burundan). CG ${balance.inside_triangle?'üçgenin içinde':'üçgenin dışında'}. Sağ ön, sol ön ve arka motor için statik dikey itki payı: ${shares}. ${balance.assumption}`;
    }
  }
  if(typeof updateFuseViewer==='function'&&typeof state!=='undefined')updateFuseViewer(state.geometry,state.airfoilCoords);
  applyServiceHatchVisibility();
  if(typeof requestViewerFrame==='function')requestViewerFrame();
  if(!focus)return;
  switchTab('viewer');
  const box=new THREE.Box3().setFromObject(manufacturingOverlay), sphere=box.getBoundingSphere(new THREE.Sphere());
  viewTarget.copy(sphere.center);viewDist=modelViewDistance(camera,sphere.radius);
  setCameraDirection(MODEL_HOME_VIEW);
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
  (manifest.spar_channels||[]).forEach(c=>{
    if(!c.start_mm||!c.axis)return;
    const root=(manifest.interfaces||[]).find(j=>j.part===c.part)?.root_trim_mm||0;
    const point=c.start_mm.map((v,i)=>v+c.axis[i]*root*c.path_scale);
    add(`${c.part==='wing_right'?'Sağ':'Sol'} ${c.role==='rear'?'arka':'ana'} karbon kanalı (Ø${Number(c.hole_diameter_mm).toFixed(1)} mm, %${Math.round(c.chord_position*100)})`,c.part,c.part,point,c.axis.map(v=>-v),'bore');
  });
  (manifest.motors||[]).forEach(m=>{
    const [x,y,z]=m.face_mm||[],axis=m.axis||[1,0,0];
    if(![x,y,z].every(Number.isFinite))return;
    (m.hole_centers_yz_mm||[]).forEach(([dy,dz],i)=>add(`${m.name}, motor vidası ${i+1} (Ø${Number(m.hole_diameter_mm).toFixed(1)} mm)`,m.parent,m.parent,[x,y+dy,z+dz],axis,'bolt'));
    (m.hole_points_mm||[]).forEach((p,i)=>add(`${m.name}, motor vidası ${i+1}`,m.parent,m.parent,p,m.out_axis||axis,'bolt'));
    (m.tube_clamp_bolt_points_mm||[]).forEach((p,i)=>add(`Karbon boru kelepçesi, vida ${i+1}`,m.parent,m.parent+'_lower',p,[0,1,0],'bolt'));
    (m.clamp_bolt_points_mm||[]).forEach((p,i)=>add(`${m.name.startsWith('vtol5_')?'Kaldırma rayı':'Arka motor kelepçesi'}, vida ${i+1}`,m.parent,m.clamp_part,p,[0,1,0],'bolt'));
    add(`${m.name}, motor mili deliği (Ø${Number(m.center_bore_mm).toFixed(1)} mm)`,m.parent,m.parent,[x,y,z],m.out_axis||axis,'bore');
    (m.service_screws?.positions_xz_mm||[]).forEach(([sx,sz],i)=>add(`${m.name}, servis kapağı vidası ${i+1}`,m.service_cover||m.parent,m.parent,[sx,y,sz],[0,1,0],'bolt'));
  });
  (manifest.landing_mounts?.mounts||[]).forEach(leg=>(leg.bolt_points_mm||[]).forEach((p,i)=>add(`${manifest.landing_mounts.layout==='tricycle_wheel_mounts'?'Teker bağlantısı':'Harici ayak yuvası'} (${leg.label||leg.name}), vida ${i+1}`,leg.part,leg.parent,p,[0,1,0],'bolt')));
  for (const [index, hole] of (manifest.nose_module?.holes || []).entries()) {
    add(`Sökülebilir burun · yan vida ${index + 1}`, 'body_nose', 'body', hole.point_mm, hole.axis, 'bolt');
  }
  for (const [index, hole] of (manifest.nose_module?.vent_cover?.holes || []).entries()) {
    add(`Burun kapağı · vida ${index + 1}`, manifest.nose_module.vent_cover.part, 'body_nose', hole.point_mm, hole.axis, 'bolt');
  }
  const gimbal = manifest.nose_module?.gimbal;
  for (const [index, hole] of (gimbal?.mounts || []).entries()) {
    add(`Gimbal montaj plakası · M2 vida ${index + 1}`, gimbal.adapter_part, gimbal.part, hole.point_mm, hole.axis, 'bolt');
  }
  for (const [index, hole] of (gimbal?.tray_holes || []).entries()) {
    add(`VTX tepsisi · M2 vida ${index + 1}`, gimbal.tray_part, gimbal.cover_part, hole.point_mm, hole.axis, 'bolt');
  }
  for (const camera of manifest.cameras || []) {
    if (camera.lens) {
      add(`Kamera lens açıklığı (Ø${camera.lens.diameter_mm} mm)`, camera.parent, camera.parent, camera.lens.point_mm, [-1,0,0], 'bore');
    }
    (camera.holes || []).forEach((hole, i) =>
      add(`Kamera yuvası, yan vida ${i+1} (Ø${camera.hole_diameter_mm} mm)`,
        camera.parent, camera.parent, hole.point_mm, hole.axis, 'bolt'));
  }
  (manifest.vtol_joints||[]).forEach(j=>{
    const servoAxis=j.servo_output_axis?.map(v=>-v)||j.axis;
    add(`${j.part}, VTOL pivot mili`,j.part,j.parent,j.pivot_mm,j.axis,'hinge');
    (j.bolt_points_mm||[]).forEach((p,i)=>add(`${j.parent}, kanat bağlantı vidası ${i+1}`,j.parent,j.wing,p,[0,1,0],'bolt'));
    (j.horn_holes_mm||[]).forEach((p,i)=>add(`${j.part}, metal servo kolu vidası ${i+1}`,j.part,j.parent,p,servoAxis,'bolt'));
    (j.servo_mount_holes_mm||[]).forEach((p,i)=>add(`${j.parent}, servo kasa vidası ${i+1}`,j.parent,j.parent,p,servoAxis,'bolt'));
    (j.cover_holes_mm||[]).forEach((p,i)=>add(`${j.cover_part}, kapak vidası ${i+1}`,j.cover_part,j.parent,p,servoAxis,'bolt'));
  });
  (manifest.wing_segment_joints||[]).forEach(j=>(j.holes||[]).forEach((h,i)=>add(`Kanat iç geçme kilidi ${j.seam} (${j.parent==='wing_right'?'sağ':'sol'}), vida ${i+1}`,j.bridge,j.parent,h.point_mm,h.axis,'bolt')));
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
    viewDist=modelViewDistance(camera,sphere.radius);setCameraDirection(MODEL_HOME_VIEW);
  }
  const status=$('mountDetailStatus');if(status&&restoreCamera)status.textContent='Tüm gövde, kanat ve kuyruk parçaları gösteriliyor.';
}

function controlLabel(c){
  if(c.part==='tail_elevator_one_piece')return 'İrtifa dümeni · tek parça';
  const kind={flaperon:'Flaperon',flap:'Flap',aileron:'Aileron',elevator:'Elevator',rudder:'Rudder',ruddervator:'V kuyruk kontrolü'}[c.kind]||c.kind;
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
  const area = $('controlPreviewArea');
  if (area) area.textContent = control.planform_area_m2 ? (control.planform_area_m2 * 10000).toFixed(1) + ' cm²' : '';
  const input=$('controlPreviewAngle');[input.min,input.max]=control.travel_deg;
  const angle=Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)));input.value=angle;
  $('controlPreviewValue').textContent=angle+'°';
  const p=new THREE.Vector3(...control.hinge_point_mm.map(v=>v/1000)),axis=new THREE.Vector3(...control.hinge_axis);
  const transform=new THREE.Matrix4().makeTranslation(p.x,p.y,p.z).multiply(new THREE.Matrix4().makeRotationAxis(axis,THREE.MathUtils.degToRad(angle))).multiply(new THREE.Matrix4().makeTranslation(-p.x,-p.y,-p.z));
  const groups=[manufacturingOverlay,typeof fuseViewerGroup==='undefined'?null:fuseViewerGroup];
  for(const group of groups)for(const mesh of group?.children||[]){
    if(!mesh.userData.partName)continue;mesh.matrixAutoUpdate=false;mesh.matrix.identity();
    if(isPrintedControl(mesh.userData.partName,control))mesh.matrix.copy(transform);
    mesh.matrixWorldNeedsUpdate=true;
  }
  if(typeof requestViewerFrame==='function')requestViewerFrame();
  if(typeof requestFuseFrame==='function')requestFuseFrame();
}

function invalidateManufacturingPreview(reschedule=true) {
  clearTimeout(manufacturingTimer);
  ++manufacturingRevision;
  const hadProduction=Boolean(manufacturingResult);
  for(const id of ['controlPreviewPanel','serviceHatchPanel','vtolBalancePanel']){
    if($(id))$(id).hidden=true;
  }
  if($('vtolTiltPanel'))$('vtolTiltPanel').hidden=true;
  resetMountDetail(false);
  manufacturingResult=null;
  if (manufacturingOverlay && scene) {scene.remove(manufacturingOverlay);disposeModel(manufacturingOverlay);manufacturingOverlay=null;}
  if (wingGroup) wingGroup.visible=true;
  if (tailGroup) tailGroup.visible=true;
  if (fuseGroup) fuseGroup.visible=true;
  const status=$('manufacturingStatus');if(status) status.textContent='Ayarları değiştirdikten sonra üretim kontrolünü yeniden çalıştırın.';
  if(hadProduction&&typeof updateFuseViewer==='function')updateFuseViewer(state.geometry,state.airfoilCoords);
  if(typeof requestViewerFrame==='function')requestViewerFrame();
  if(reschedule)scheduleManufacturingPreview();
  else {
    displayPrintedControlAreas();
    previewStatus('Yeni ölçüler hazırlanıyor…','busy');
  }
}

async function runManufacturing(mode='preview',filter='all') {
  if(typeof calculationActive!=='undefined'&&(calculationActive||pendingPlacement)){
    notify('Yeni ölçüler hesaplanıyor. Üretim için hesabın tamamlanmasını bekleyin.');
    return;
  }
  clearTimeout(manufacturingTimer);
  const revision=++manufacturingRevision;
  if(typeof showManufacturingIssue==='function')showManufacturingIssue('');
  if(mode==='preview')displayPrintedControlAreas();
  const buttons=Array.from(document.querySelectorAll('#manufacturingPreview, #manufacturingDownload, #merkusimDownload, .stl-list button'));
  buttons.forEach(b=>b.disabled=true);
  previewStatus('STL hazırlanıyor: parçalar ve bağlantılar kontrol ediliyor.','busy');
  try {
    const stamp=JSON.stringify(manufacturingPayload());
    const data=await requestManufacturing(mode,filter,stamp,mode==='preview'?revision:null);
    if(!data||revision!==manufacturingRevision)return;
    if(mode!=='preview' && stamp!==JSON.stringify(manufacturingPayload())) throw new Error('Hesaplama sırasında ölçüler değişti. Yeni ayarlarla yeniden üretin.');
    if (mode==='preview') {
      manufacturingResult=data;showManufacturingPreview(manufacturingResult);
      previewStatus(`Detaylı model hazır. ${data.parts.length} baskı parçası.`,'ready');
    } else if(mode==='merkusim') {
      downloadBlob(data,'zeta_merkusim_mm.stl');
      previewStatus('Merkusim STL dosyası indirildi. Model türü ve kütle için ZETA proje dosyanı da Merkusim’e yükleyebilirsin.','ready');
    } else {
      downloadBlob(data,`zeta_${filter}_montajli_stl.zip`);
      previewStatus('STL paketi indirildi. ZIP içinde parçalar ve montaj kılavuzu var.','ready');
    }
  } catch(e) {
    if(revision!==manufacturingRevision)return;
    if(mode==='preview')displayPrintedControlAreas(null,true);
    previewStatus(e.message,'error');notify(e.message);
    if(typeof showManufacturingIssue==='function'){
      showManufacturingIssue(e.message);switchTab('stl');
      $('manufacturingIssue')?.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }
  finally {buttons.forEach(b=>b.disabled=false);}
}

const MANUFACTURING_FIELDS=['wingJoinMode','hatchFastening','printBedX','printBedY','printBedZ','fitClearance','mountScrew','wingPin','wingSeatDepth','mountNutFlat','mountNutHeight','wallThickness','sparMainDia','sparRearDia','sparRearPosition','sparMainPosition','ribSpacing','ribThickness','hingePin','controlTravel',...MOTOR_FIELDS,...CAMERA_FIELDS,...CONTROL_SERVO_FIELDS];
function captureManufacturingSettings() {
  return Object.fromEntries(MANUFACTURING_FIELDS.map(id=>[id,['motorLayout','motorPattern','wingJoinMode','hatchFastening'].includes(id)?$(id).value:Number($(id).value)]));
}
function setupManufacturing() {
  $('manufacturingPreview').addEventListener('click',()=>runManufacturing('preview'));
  $('merkusimDownload').addEventListener('click',()=>runManufacturing('merkusim'));
  $('manufacturingDownload').addEventListener('click',()=>runManufacturing('zip'));
  let saved=null;try {saved=JSON.parse(store.get('zeta-manufacturing')||'null');} catch(e) {   }
  if (Number(saved?.cameraMount) === 2) saved.cameraMount = 0;
  const ids=MANUFACTURING_FIELDS;
  const read=id=>['motorLayout','motorPattern','wingJoinMode','hatchFastening'].includes(id)?$(id).value:Number($(id).value);
  for (const id of ids) {
    const field=$(id);
    const validNumber=saved && Number.isFinite(saved[id]) && (!field.min || saved[id]>=Number(field.min)) && (!field.max || saved[id]<=Number(field.max));
    if (id === 'motorLayout' && saved?.[id] === 'single') saved[id] = 'rear';
    if(saved && (validNumber || (['motorLayout','motorPattern','wingJoinMode','hatchFastening'].includes(id) && Array.from(field.options).some(o=>o.value===saved[id])))) field.value=saved[id];
    $(id).addEventListener('change',()=>{
      if(id==='motorDiameter')clearTimeout(motorInputTimer);
      if(id==='cameraMount')syncGimbalOption();
      invalidateManufacturingPreview();store.set('zeta-manufacturing',JSON.stringify(Object.fromEntries(ids.map(k=>[k,read(k)]))));
      if(state.geometry && MOTOR_FIELDS.includes(id) && id!=='motorLayout' && state.fusePreset!=='vtol5') {
        state.geometry.motor_mount=motorMountSettings();
        refreshWingAndTailGroups();
        if(typeof updateFuseViewer==='function')updateFuseViewer(state.geometry,state.airfoilCoords);
        if(scene && fuseGroup) {scene.remove(fuseGroup);disposeModel(fuseGroup);fuseGroup=buildFuselageGroup(state.geometry,state.geometry.fuse_type,state.airfoilCoords);scene.add(fuseGroup);}
      }
    });
  }
  $('motorHardwareView').addEventListener('change',()=>{
    for(const root of [fuseGroup,wingGroup,manufacturingOverlay,typeof fuseViewerGroup==='undefined'?null:fuseViewerGroup]) if(root)root.traverse(o=>{if(o.userData.motorHardware)o.visible=$('motorHardwareView').checked;});
  });
  let motorInputTimer;
  $('motorDiameter').addEventListener('input',()=>{
    clearTimeout(motorInputTimer);
    motorInputTimer=setTimeout(()=>{
      if($('motorDiameter').checkValidity?.()===false)return;
      $('motorDiameter').dispatchEvent(new Event('change'));
    },180);
  });
  $('motorCoverView').addEventListener('change',()=>{
    for(const group of [manufacturingOverlay,typeof fuseViewerGroup==='undefined'?null:fuseViewerGroup]){
      for(const mesh of group?.children||[]){
        if(mesh.userData.partName?.includes('_service_cover')||mesh.userData.partName?.includes('_servo_cover'))mesh.visible=$('motorCoverView').checked;
      }
    }
  });
  $('controlPreviewAngle')?.addEventListener('input',applyControlPreviewAngle);
  $('internalStructureView')?.addEventListener('change',applyInternalStructureView);
  $('controlPreviewSelect')?.addEventListener('change',()=>{$('controlPreviewAngle').value='0';applyControlPreviewAngle();});
  $('focusMountDetail')?.addEventListener('click',focusMountingDetail);
  $('mountDetailSelect')?.addEventListener('change',focusMountingDetail);
  $('resetMountDetail')?.addEventListener('click',()=>resetMountDetail(true));
}

function isNoseVentCover(name){
  return /^body_(?:nose_vent|gimbal_vtx_(?:cover|tray))(?:$|_)/.test(name);
}

function applyServiceHatchVisibility(){
  for(const group of [manufacturingOverlay,typeof fuseViewerGroup!=='undefined'?fuseViewerGroup:null]){
    group?.traverse(mesh=>{
      const name=mesh.userData.partName||'';
      if(name.startsWith('hatch_front'))mesh.visible=$('showFrontHatch')?.checked??true;
      if(name.startsWith('hatch_rear'))mesh.visible=$('showRearHatch')?.checked??true;
      if(isNoseVentCover(name))mesh.visible=$('showNoseVentCover')?.checked??true;
    });
  }
  if(typeof requestViewerFrame==='function')requestViewerFrame();
  if(typeof requestFuseFrame==='function')requestFuseFrame();
}
