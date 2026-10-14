const VTOL_FIELDS={
  triaTailVh:['Kuyruk yatay hacim hedefi',.45,.2,1.2,''],triaTailVv:['Kuyruk dikey hacim hedefi',.03,.01,.12,''],
  vtolMotorDiameter:['Motor dış çapı',28,16,65,'mm'],vtolMotorLength:['Motor uzunluğu',30,10,70,'mm'],
  vtolPropDiameter:['Pervane çapı',180,80,500,'mm'],vtolHoleX:['Motor vida aralığı X',16,8,45,'mm'],
  vtolHoleZ:['Motor vida aralığı Z',19,8,45,'mm'],vtolScrew:['Motor vidası çapı',3,2,5,'mm'],vtolBore:['Mil açıklığı',8,3,20,'mm'],
  vtolStation:['Ön motor konumu',52,30,70,'% yarı kanat'],vtolForward:['Kanat önünden uzaklık',75,45,350,'mm'],
  vtolHeight:['Ön pivot yüksekliği',25,20,130,'mm'],vtolRearHeight:['Arka taşıyıcı yüksekliği',35,25,100,'mm'],vtolRearStation:['Arka motor konumu',50,0,100,'% açık boru'],
  vtolPivot:['Metal pivot mili çapı',4,3,6,'mm'],vtolServoLength:['Servo kasa uzunluğu',23,18,45,'mm'],
  vtolServoWidth:['Servo kasa genişliği',12,8,25,'mm'],vtolServoHeight:['Servo kasa yüksekliği',24,15,45,'mm'],
  vtolServoSpacing:['Servo kulak vida aralığı',28,22,60,'mm'],
  vtolServoShaftOffset:['Servo önünden mil merkezine uzaklık',6,3,15,'mm'],
  vtolHornRadius:['Metal servo kolu vida yarıçapı',8,6,12,'mm'],vtolHornScrew:['Servo kolu bağlantı vidası',2,1.6,3,'mm'],
  vtolBoomDiameter:['Karbon kuyruk borusu dış çapı',20,12,40,'mm'],vtolBoomInnerDiameter:['Karbon kuyruk borusu iç çapı',16,8,38,'mm'],vtolBoomInsertion:['Borunun gövdeye girme uzunluğu',60,40,100,'mm'],
  quadClearance:['Kanat önünde ve arkasında boşluk',30,15,150,'mm'],
};
function vtolSettings(){return Object.fromEntries(Object.keys(VTOL_FIELDS).map(id=>[id,Number($(id)?.value??VTOL_FIELDS[id][1])]))}
function restoreVtolSettings(project){
  for(const [id,def] of Object.entries(VTOL_FIELDS)){
    let value=project.vtol?.[id]??def[1];
    // Migrate only the former default; keep explicitly saved newer/custom values.
    if(id==='vtolForward'&&!project.vtolLayoutVersion&&Number(value)===150)value=75;
    if(id==='vtolHeight'&&(project.vtolLayoutVersion??0)<2&&Number(value)===60)value=25;
    if(id==='vtolRearStation'&&(project.vtolLayoutVersion??0)<3)value=50;
    if($(id))$(id).value=value;
  }
}
function setupVtol(){
  $('vtolFields').innerHTML=Object.entries(VTOL_FIELDS).map(([id,[label,value,min,max,unit]])=>
    `<div class="field"><label for="${id}">${label}</label><div class="input-wrap"><input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${id.startsWith('triaTail')?'.01':'.1'}"/><span class="unit">${unit}</span></div></div>`).join('');
  const fieldHost=$('vtolFields');fieldHost.className='vtol-groups';
  const groups=[
    ['Motor ve pervane',['vtolMotorDiameter','vtolMotorLength','vtolPropDiameter','vtolHoleX','vtolHoleZ','vtolScrew','vtolBore'],true],
    ['Motor yerleşimi',['vtolStation','vtolForward','vtolHeight','vtolRearHeight','vtolRearStation','quadClearance'],false],
    ['Servo ve döner mekanizma',['vtolPivot','vtolServoLength','vtolServoWidth','vtolServoHeight','vtolServoSpacing','vtolServoShaftOffset','vtolHornRadius','vtolHornScrew'],false],
    ['Karbon kuyruk borusu',['vtolBoomDiameter','vtolBoomInnerDiameter','vtolBoomInsertion'],false],
    ['Kuyruk boyutlandırma',['triaTailVh','triaTailVv'],false]
  ];
  for(const [title,ids,open] of groups){
    const card=document.createElement('details');card.className='settings-card vtol-option-group';card.open=open;
    const summary=document.createElement('summary');summary.textContent=title;card.append(summary);
    const grid=document.createElement('div');grid.className='form-grid';card.append(grid);
    for(const id of ids)grid.append($(id).closest('.field'));
    fieldHost.append(card);
  }
  const form=$('paramForm'),actions=form.querySelector('.form-actions');
  const configuration=$('lblTailType').closest('.form-section');configuration.classList.add('configuration-card');configuration.after($('vtolSettingsPanel'));
  const notice=document.createElement('details');notice.className='settings-card analysis-scope';
  notice.innerHTML='<summary>Analiz kapsamı</summary>';notice.append($('vtolAnalysisNotice'));$('vtolSettingsPanel').append(notice);
  const save=$('saveProjectButton').closest('.form-section');
  $('projectManager').append(save);save.className='project-save-row';
  form.insertBefore($('projectManager'),actions);
  $('aircraftFamily').addEventListener('change',async()=>{
    if($('calculateBtn').disabled)return;
    state.fusePreset=['vtol','vtol5'].includes($('aircraftFamily').value)?$('aircraftFamily').value:'atlas';
    setRadio('fuse_type','conventional');setRadio('mission_profile','general');
    if(state.fusePreset==='vtol')setRadio('tail_type','vtail');
    if(state.fusePreset==='vtol5'){setRadio('tail_type','conventional');$('motorLayout').value='single';}
    syncFuseLibrary();saveProject();
    if(state.geometry)await calculateAll();
  });
  for(const id of Object.keys(VTOL_FIELDS))$(id).addEventListener('change',()=>{
    if(['vtol','vtol5'].includes(state.geometry?.fuse_preset)){state.geometry.vtol=vtolSettings();invalidateManufacturingPreview();}
    saveProject();
    if(id.startsWith('triaTail')&&state.geometry?.fuse_preset==='vtol')calculateAll();
  });
  for(const id of ['vtolTiltRight','vtolTiltLeft'])$(id).addEventListener('input',applyVtolTilt);
}
function syncVtolPanel(){
  if(!$('aircraftFamily'))return;
  const quad=state.fusePreset==='vtol5',active=quad||state.fusePreset==='vtol';$('aircraftFamily').value=active?state.fusePreset:'standard';
  const fixed=active;
  for(const input of document.querySelectorAll('input[name="wing_pos"]'))input.disabled=state.fusePreset==='vtol';
  for(const input of document.querySelectorAll('input[name="fuse_type"]'))input.disabled=fixed;
  if(state.fusePreset==='vtol')setRadio('wing_pos','mid');
  if(fixed){setRadio('fuse_type','conventional');state.fuseWidthScale=1;state.fuseHeightScale=1;}
  $('fuseCustomBtn').hidden=fixed;
  $('vtolSettingsPanel').hidden=!active;$('vtolAnalysisNotice').hidden=!active;
  const regular=$('motorLayout')?.closest('details');if(regular)regular.hidden=active&&!quad;
  if(regular){
    const summary=regular.querySelector('summary');
    if(!regular.dataset.normalTitle)regular.dataset.normalTitle=summary.textContent;
    summary.textContent=quad?'Beşinci motor: arka itici BLDC':regular.dataset.normalTitle;
    if(quad&&regular.dataset.quadActive!=='yes')regular.open=true;
    regular.dataset.quadActive=quad?'yes':'no';
  }
  $('motorLayout').closest('.field').hidden=quad;
  $('motorStation').closest('.field').hidden=quad;
  if(quad)$('motorLayout').value='single';
  $('vtolSettingsTitle').textContent=quad?'Penta VTOL kaldırma motorları':'Tria VTOL özel ayarları';
  $('vtolSettingsDescription').textContent=quad?'Kanat açıklığı, veter ve motor ölçüsüne otomatik uyarlanan kısa gövde. Üst, orta ve alt kanat konumu seçilebilir; dört kaldırma motorunun bağlantıları kanadı takip eder. Bu ölçüler dört kaldırma motoruna uygulanır; arkadaki beşinci itici motorun ölçülerini BLDC bölümünden gir. Çift bom ve ikiz finli yatay kuyruk otomatik oluşturulur.':'Sabit gövde ve orta kanat yuvası. Gövde oranları ve kanat yüksekliği değiştirilemez. İki bağımsız döner ön motor, bir sabit dikey arka motor; donanım ölçüleri ayarlanabilir.';
  $('vtolMechanismInfo').hidden=quad;
  $('vtolAnalysisNotice').textContent=(quad?'Penta':'Tria')+' VTOL mekanik prototipi. Grafikler sabit kanat ön hesabıdır; dikey kalkış ve geçiş uçuşu doğrulanmış değildir.';
  const common=['vtolMotorDiameter','vtolMotorLength','vtolPropDiameter','vtolHoleX','vtolHoleZ','vtolScrew','vtolBore'];
  for(const id of Object.keys(VTOL_FIELDS))$(id).closest('.field').hidden=quad?!common.includes(id)&&!id.startsWith('quad'):id.startsWith('quad');
  for(const card of $('vtolFields').querySelectorAll('.vtol-option-group'))card.hidden=Array.from(card.querySelectorAll('.field')).every(field=>field.hidden);
}
function applyVtolTilt(){
  const joints=manufacturingResult?.manifest?.vtol_joints||[];
  const roots=[manufacturingOverlay];
  if(typeof fuseViewerGroup!=='undefined'&&fuseViewerGroup)roots.push(fuseViewerGroup);
  for(const joint of joints){
    const id=joint.part.includes('right')?'vtolTiltRight':'vtolTiltLeft';
    const angle=Number($(id).value);$(id+'Value').textContent=angle+'°';
    const p=new THREE.Vector3(...joint.pivot_mm).multiplyScalar(.001);
    const matrix=new THREE.Matrix4().makeTranslation(p.x,p.y,p.z)
      .multiply(new THREE.Matrix4().makeRotationZ(angle*Math.PI/180))
      .multiply(new THREE.Matrix4().makeTranslation(-p.x,-p.y,-p.z));
    for(const root of roots)root?.traverse(obj=>{
      const name=obj.userData.partName||obj.userData.vtolPart;
      if(name===joint.part||name?.startsWith(joint.part+'_')){obj.matrixAutoUpdate=false;obj.matrix.copy(matrix);obj.matrixWorldNeedsUpdate=true;}
    });
  }
}
