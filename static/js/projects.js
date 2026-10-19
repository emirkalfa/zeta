/* Portable design snapshots; meshes are regenerated from saved inputs. */
function projectMessage(message){$('projectLibraryStatus').textContent=message;}
async function projectAPI(url,body){
  const res=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Proje işlemi tamamlanamadı.');return data;
}
function projectSnapshot(name){
  name=name.trim();if(!name||name.length>100)throw new Error('Projene 1–100 karakterlik bir ad yaz.');
  saveProject();
  const project=JSON.parse(store.get('zeta-project'));
  project.project_name=name;
  return {format:'zeta-project',schemaVersion:1,appVersion:$('appVersion').textContent,name,
    project,manufacturing:captureManufacturingSettings()};
}
function validateProjectFile(data){
  if(!data||data.format!=='zeta-project'||data.schemaVersion!==1||typeof data.name!=='string'||!data.name.trim()||data.name.length>100)
    throw new Error('Bu dosya desteklenen bir ZETA proje dosyası değil.');
  if(!data.project||typeof data.project!=='object'||Array.isArray(data.project)||!Number.isFinite(Number(data.project.wingspan))||Number(data.project.wingspan)<=0)
    throw new Error('Proje ölçüleri eksik veya geçersiz.');
  for(const key of ['mode','wing_shape','wing_position','tail_type','fuse_type','mission_profile'])
    if(data.project[key]!==undefined && (typeof data.project[key]!=='string'||!/^[a-z_]+$/.test(data.project[key])))throw new Error('Proje seçenekleri geçersiz.');
  if(!data.manufacturing||typeof data.manufacturing!=='object'||Array.isArray(data.manufacturing))throw new Error('Üretim ayarları eksik.');
  data={...data,manufacturing:{sparMainPosition:28,...data.manufacturing}};
  for(const id of MANUFACTURING_FIELDS){
    const value=data.manufacturing[id],field=$(id);
    if(value===undefined)throw new Error('Proje dosyasında eksik ayar: '+id);
    if(field.tagName==='SELECT'){
      if(!['string','number'].includes(typeof value)||!Array.from(field.options).some(o=>o.value===String(value)))throw new Error('Geçersiz proje seçeneği: '+id);
    }else if(typeof value!=='number'||!Number.isFinite(value)||(field.min!==''&&value<Number(field.min))||(field.max!==''&&value>Number(field.max)))throw new Error('Geçersiz proje ölçüsü: '+id);
  }
  return data;
}
async function refreshProjects(selected){
  const list=await projectAPI('/api/designs'),select=$('savedProjects');
  select.replaceChildren(new Option(list.length?'Bir proje seç':'Henüz kayıtlı proje yok',''));
  for(const item of list)select.add(new Option(`${item.name} (#${item.id})`,String(item.id)));
  if(selected)select.value=String(selected);
}
async function openProject(data){
  data=validateProjectFile(data);
  // Keep the currently edited design before replacing the working draft.
  await projectAPI('/api/designs',projectSnapshot(('Otomatik yedek: '+($('projectName').value||'Adsız tasarım')).slice(0,100)));
  await store.flush();
  window.projectOpening=true;
  const previousProject=store.get('zeta-project'),previousManufacturing=store.get('zeta-manufacturing');
  try{
    const project={...data.project,project_name:data.name};
    // A single transaction replaces both sections of the working draft.
    const batch={'zeta-project':JSON.stringify(project),'zeta-manufacturing':JSON.stringify(data.manufacturing)};
    await projectAPI('/api/settings',batch);
    Object.assign(store.cache,batch);
    for(const [key,value]of Object.entries(batch))try{localStorage.setItem(key,value);}catch(e){}
    location.reload();
  }catch(e){
    store.cache['zeta-project']=previousProject;
    if(previousManufacturing!==null)store.cache['zeta-manufacturing']=previousManufacturing;
    window.projectOpening=false;throw e;
  }
}
function setupProjects(){
  const run=fn=>async()=>{
    const buttons=Array.from(document.querySelectorAll('#projectManager button'));buttons.forEach(b=>b.disabled=true);
    try{await fn();}catch(e){projectMessage(e.message);notify(e.message);}
    finally{buttons.forEach(b=>b.disabled=false);}
  };
  $('saveNamedProject').addEventListener('click',run(async()=>{
    const saved=await projectAPI('/api/designs',projectSnapshot($('projectName').value));
    await refreshProjects(saved.id);projectMessage('Proje ayrı bir kayıt olarak bu bilgisayara kaydedildi.');
  }));
  $('openSavedProject').addEventListener('click',run(async()=>{
    const id=$('savedProjects').value;if(!id)throw new Error('Önce listeden bir proje seç.');
    await openProject(await projectAPI('/api/designs/'+encodeURIComponent(id)));
  }));
  $('exportProject').addEventListener('click',run(async()=>{
    const data=projectSnapshot($('projectName').value);
    downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),data.name.replace(/[^\p{L}\p{N} _-]/gu,'_')+'.zeta.json');
    projectMessage('Proje dosyası hazırlandı. Bilgisayardan aç düğmesiyle tekrar yükleyebilirsin.');
  }));
  $('importProject').addEventListener('click',()=>$('projectFile').click());
  $('projectFile').addEventListener('change',run(async()=>{
    const file=$('projectFile').files[0];if(!file)return;
    try{
      if(file.size>400000)throw new Error('Proje dosyası çok büyük.');
      let data;try{data=JSON.parse(await file.text());}catch(e){throw new Error('Dosya okunamadı. Bir ZETA proje dosyası seç.');}
      data=validateProjectFile(data);
      await projectAPI('/api/designs',data);
      await openProject(data);
    }finally{$('projectFile').value='';}
  }));
  refreshProjects().catch(e=>projectMessage(e.message));
}
