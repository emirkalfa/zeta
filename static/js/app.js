const store = {
  cache:{}, pending:{}, active:null, initialized:false, timer:null,
  async load() {
    try {
      const res=await fetch('/api/settings');
      if(!res.ok)throw new Error('Kayıtlar okunamadı.');
      this.cache=await res.json();
      this.initialized=true;
      for(const key of ['zeta-project','zeta-manufacturing','zeta-theme','zeta-language']) {
        if(this.cache[key]===undefined) {
          const old=this.get(key);
          if(old!==null)this.set(key,old);
        }
      }
      if(this.cache['zeta-theme'])document.documentElement.dataset.theme=this.cache['zeta-theme'];
    } catch(e) {this.status('Kayıtlar okunamadı. Yeniden açmadan önce bağlantıyı kontrol edin.');}
  },
  status(message) {const el=document.getElementById('projectSaveStatus');if(el)el.textContent=message;},
  get(key) {
    if(this.cache[key]!==undefined)return this.cache[key];
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    if(this.cache[key]===value)return;
    this.cache[key]=value;
    try { localStorage.setItem(key, value); } catch (e) {   }
    this.pending[key]=value;
    clearTimeout(this.timer);
    if(this.initialized)this.timer=setTimeout(()=>this.flush().catch(()=>{}),220);
  },
  async flush() {
    clearTimeout(this.timer);
    if(!this.initialized)throw new Error('Kalıcı kayıt bağlantısı kurulamadı. Sayfayı yenileyin.');
    if(this.active){await this.active;return this.flush();}
    if(!Object.keys(this.pending).length)return;
    const batch=this.pending;this.pending={};
    this.status('Kaydediliyor…');
    this.active=(async()=>{
      const res=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(batch),keepalive:true});
      if(!res.ok)throw new Error('Kayıt tamamlanamadı. Kaydet düğmesiyle yeniden deneyin.');
    })();
    try {await this.active;this.status('Bu bilgisayara kaydedildi.');}
    catch(e){this.pending={...batch,...this.pending};this.status(e.message);throw e;}
    finally {this.active=null;}
    if(Object.keys(this.pending).length)return this.flush();
  },
};

const MANUAL_FIELDS = [
  'root_chord', 'tip_chord', 'sweep', 'dihedral',
  'htail_span', 'htail_root', 'htail_tip', 'htail_sweep',
  'vtail_span', 'vtail_root', 'vtail_tip',
];
const FUSE_DEFAULT_SHAPE = [
  { t: 0.000, w: 0.143, h: 0.111 },
  { t: 0.125, w: 0.571, h: 0.667 },
  { t: 0.375, w: 1.000, h: 1.000 },
  { t: 0.750, w: 0.429, h: 0.444 },
  { t: 0.917, w: 0.100, h: 0.100 },
  { t: 1.000, w: 0.057, h: 0.044 },
];
const RESULT_TABS = ['results', 'viewer', 'fuse', 'charts', 'flight', 'mission', 'stl'];
const MISSION_FIELDS = ['propEfficiency', 'motorPower', 'batteryWh', 'avionicsPower', 'nLimit', 'targetEndurance', 'targetTurnRate', 'targetStall'];
const PROP_EFFICIENCY = 0.6;
let wingPlacementRequest=0;
let placementTimer, pendingPlacement=false, calculationActive=false;
let chartsDirty=false, missionChartsDirty=false;

const state = {
  geometry: null,
  polars: null,
  stability: null,
  mission: null,
  airfoils: [],
  airfoilCoords: null,
  tailCoords: null,
  vtailCoords: null,
  cgFuselagePercent: null,
  legacyCgPercent: 25,
  airfoilCode: '2412',
  wallThickness: 1.2,
  fuseSections: scaleFuseShape(1.2, 0.14, 0.14),
  fuseSectionsEdited: false,
  fusePreset: 'atlas',
  fuseWidthScale: 1,
  fuseHeightScale: 1,
  fuseSectionExponent: 2,
};

function scaleFuseShape(length, maxWidth, maxHeight) {
  const round = v => Math.round(v * 1000) / 1000;
  return FUSE_DEFAULT_SHAPE.map(s => ({
    t: round(s.t * length), w: round(s.w * maxWidth), h: round(s.h * maxHeight),
  }));
}

async function fetchAPI(url, body = null) {
  const opts = { headers: { 'Content-Type': 'application/json' } };
  if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function radioValue(name, fallback) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function setRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.innerHTML = busy ? '<span class="loading"></span> Hesaplanıyor…' : 'Hesapla';
}

function showFormError(message) {
  const el = $('formError');
  el.textContent = message || '';
  el.hidden = !message;
}

let toastTimer;
function notify(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.tab === tabId);
  });
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const active = link.dataset.tab === tabId;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
      const nav = link.closest('#sidebar-nav');
      if (nav) {
        if (window.innerWidth <= 760) nav.scrollLeft = Math.max(0, link.parentElement.offsetLeft - nav.offsetLeft - 8);
        else nav.scrollTop = Math.max(0, link.parentElement.offsetTop - nav.offsetTop - 8);
      }
    }
    if (!active) link.removeAttribute('aria-current');
  });
  const content = $('content');
  if (content) content.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  window.dispatchEvent(new Event('resize'));
  if((tabId==='viewer'||tabId==='fuse')&&manufacturingResult&&!manufacturingOverlay){
    showManufacturingPreview(manufacturingResult,false);
  }
  if(tabId==='fuse'&&state.geometry) {
    if(!fuseViewerRunning)initFuseViewer(state.geometry,state.airfoilCoords,state.tailCoords,state.vtailCoords,state.geometry.tail_type);
    else if(fuseViewerDirty)updateFuseViewer(state.geometry,state.airfoilCoords);
  }
  if(tabId==='charts'&&chartsDirty&&state.polars){displayCharts(state.polars);chartsDirty=false;}
  if(tabId==='mission'&&missionChartsDirty&&state.mission){displayMissionCharts(state.mission);missionChartsDirty=false;}
  if(tabId==='viewer')requestViewerFrame();
  if(tabId==='fuse')requestFuseFrame();

}

function enableResultTabs() {
  for (const tab of RESULT_TABS) {
    document.querySelector(`.sidebar-link[data-tab="${tab}"]`).disabled = false;
  }
  $('navHint').hidden = true;
}

function setupSidebar() {
  const tooltip = $('navTooltip');
  const hideTooltip = () => { if (tooltip) tooltip.hidden = true; };
  const showTooltip = link => {
    if (!tooltip) return;
    tooltip.textContent = link.getAttribute('aria-label') +
      (link.disabled ? ', ilk hesaplamadan sonra açılır' : '');
    tooltip.hidden = false;
    const rect = link.getBoundingClientRect();
    const mobile = window.innerWidth <= 760;
    const left = mobile ? rect.left + (rect.width - tooltip.offsetWidth) / 2 : rect.right + 12;
    const top = mobile ? rect.bottom + 10 : rect.top + (rect.height - tooltip.offsetHeight) / 2;
    tooltip.style.left = Math.max(8, Math.min(left, window.innerWidth - tooltip.offsetWidth - 8)) + 'px';
    tooltip.style.top = Math.max(8, Math.min(top, window.innerHeight - tooltip.offsetHeight - 8)) + 'px';
  };
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.parentElement.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') showTooltip(link);
    });
    link.parentElement.addEventListener('pointerleave', hideTooltip);
    link.addEventListener('focus', () => showTooltip(link));
    link.addEventListener('blur', hideTooltip);
    link.addEventListener('click', () => { hideTooltip(); switchTab(link.dataset.tab); });
  });
  window.addEventListener('resize', hideTooltip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
}

function setupFuseLibrary() {
  $('fuse-preset-grid').innerHTML = Object.entries(FUSELAGE_PRESETS).map(([id, p]) =>
    `<button type="button" class="fuse-preset" data-preset="${id}" aria-pressed="false" aria-label="${p.name} gövdesi">
      <span class="fuse-preset-top"><strong>${p.name}</strong><span class="fuse-preset-check" aria-hidden="true">✓</span></span>
      ${fusePresetThumbnail(id)}<span class="fuse-preset-tag">${p.tag}</span>
    </button>`).join('');
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', async () => {
    if($('calculateBtn').disabled)return;
    const previous=state.fusePreset;
    state.fusePreset = button.dataset.preset;
    setRadio('fuse_type', 'conventional');
    if (state.geometry) state.geometry.fuse_type = 'conventional';
    if(state.fusePreset==='vtol')setRadio('tail_type','vtail');
    if(state.fusePreset==='vtol5'){setRadio('tail_type','conventional');$('motorLayout').value='rear';}
    if(state.fusePreset==='akin'){setRadio('tail_type','ttail');setRadio('wing_pos','high');$('motorLayout').value='rear';}
    if(['combat','vtol','vtol5','akin'].includes(state.fusePreset) || ['combat','vtol','vtol5','akin'].includes(previous)) {
      setRadio('mission_profile',state.fusePreset==='combat'?'competition':'general');
      updateMissionProfile();
      if(state.fusePreset==='combat' && $('motorLayout').value==='none') {
        $('motorLayout').value='rear';$('motorLayout').dispatchEvent(new Event('change'));
      }
    }
    if(state.geometry && previous!==state.fusePreset) {
      await calculateAll();switchTab('fuse');return;
    }
    updateFuselageViews();
  }));
  let fuselageEditFrame;
  for (const [id, prop] of [['fuseWidthScale', 'fuseWidthScale'], ['fuseHeightScale', 'fuseHeightScale']]) {
    $(id).addEventListener('input', () => {
      state[prop] = Number($(id).value) / 100;
      if(fuselageEditFrame)return;
      fuselageEditFrame=requestAnimationFrame(()=>{
        fuselageEditFrame=null;
        updateFuselageViews();
      });
    });
  }
  $('fuseShowAircraft').addEventListener('change', () => {
    if (state.geometry) {
      updateFuseViewer(state.geometry, state.airfoilCoords);
      fitFuseViewerToModel();
    }
  });
  $('fuseCustomBtn').addEventListener('click', () => {
    if (!state.geometry || state.fusePreset==='vtol') return;
    if (state.fusePreset !== 'custom') {
      state.fuseSections = presetFuseKeys(state.geometry, state.fusePreset);
      state.fuseSectionExponent = FUSELAGE_PRESETS[state.fusePreset].exponent;
      state.fuseSectionsEdited = true;
    }
    state.fusePreset = 'custom';
    state.geometry.fuse_type = 'manual';
    setRadio('fuse_type', 'manual');
    renderFuseControls();
    updateFuselageViews();
    $('fuse-custom-details').open = true;
  });
  syncFuseLibrary();
}

function syncFuseLibrary() {
  syncMotorLayoutAvailability();
  if(typeof syncVtolPanel==='function')syncVtolPanel();
  const custom = state.fusePreset === 'custom';
  const preset = FUSELAGE_PRESETS[state.fusePreset];
  document.querySelectorAll('[data-preset]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.preset === state.fusePreset));
  });
  $('fuse-model-name').textContent = custom ? 'Özgün gövde' : preset.name;
  $('fuse-model-description').textContent = custom ? 'Kesitleri aşağıdan değiştirin. Her düzenleme iki 3D görünüme ve gövde çıktısına yansır.' : preset.description;
  $('fuse-preset-controls').hidden = custom||['vtol','vtol5'].includes(state.fusePreset);
  $('fuse-custom-details').hidden = !custom;
  $('fuseWidthScale').value = Math.round(state.fuseWidthScale * 100);
  $('fuseHeightScale').value = Math.round(state.fuseHeightScale * 100);
  $('fuseWidthValue').textContent = '%' + Math.round(state.fuseWidthScale * 100);
  $('fuseHeightValue').textContent = '%' + Math.round(state.fuseHeightScale * 100);
  if (state.geometry) {
    const envelope = fuselageEnvelopeDimensions(state.geometry);
    const dims = [['Uzunluk', envelope.length], ['Azami genişlik', envelope.width],
      ['Azami yükseklik', envelope.height]];
    if(state.fusePreset==='vtol')dims[0]=['Ana gövde uzunluğu',.56*state.geometry.fuselage_length];
    $('fuse-dimensions').innerHTML = dims.map(([label, value]) => `<div><dt>${label}</dt><dd>${Math.round(value * 1000)} <span>mm</span></dd></div>`).join('');
  }
}

const FUSE_SECTION_NAMES = ['Burun', 'Ön', 'Orta', 'Arka', 'Arka kuyruk', 'Kuyruk ucu'];
const FUSE_PARAMS = [
  { key: 'pos', prop: 't', label: 'Konum' },
  { key: 'w', prop: 'w', label: 'Genişlik' },
  { key: 'h', prop: 'h', label: 'Yükseklik' },
];

function renderFuseControls() {
  $('fuse-manual-controls').innerHTML = state.fuseSections.map((_, i) => {
    const rows = FUSE_PARAMS.map(({ key, label }) => {
      const id = `sec_${i}_${key}`;
      return `<div class="fuse-row">
        <label for="${id}">${label}</label>
        <input type="range" id="${id}" min="0" step="0.001">
        <div class="input-wrap"><input type="number" id="${id}_inp" min="0" step="0.001" aria-label="K${i + 1} ${label}"><span class="unit">m</span></div>
      </div>`;
    }).join('');
    return `<fieldset class="fuse-section">
      <legend><span class="num">K${i + 1}</span> ${FUSE_SECTION_NAMES.length === state.fuseSections.length ? FUSE_SECTION_NAMES[i] : 'Kesit ' + (i + 1)}</legend>
      ${rows}
    </fieldset>`;
  }).join('');

  state.fuseSections.forEach((_, i) => {
    for (const { key, prop } of FUSE_PARAMS) {
      const slider = $(`sec_${i}_${key}`);
      const input = $(`sec_${i}_${key}_inp`);
      const onChange = (value) => {
        if (isNaN(value) || value < 0) return;
        state.fuseSections[i][prop] = value;
        state.fuseSectionsEdited = true;
        state.fusePreset = 'custom';
        setRadio('fuse_type', 'manual');
        if (state.geometry) state.geometry.fuse_type = 'manual';
        syncFuseControls();
        updateFuselageViews();
      };
      slider.addEventListener('input', () => onChange(parseFloat(slider.value)));
      input.addEventListener('change', () => onChange(parseFloat(input.value)));
    }
  });
  syncFuseControls();
}

function syncFuseControls() {
  const secs = state.fuseSections;
  const range = {
    t: Math.max(1, Math.ceil(Math.max(...secs.map(s => s.t)) * 2)),
    w: Math.max(0.2, Math.ceil(Math.max(...secs.map(s => s.w)) * 30) / 10),
    h: Math.max(0.2, Math.ceil(Math.max(...secs.map(s => s.h)) * 30) / 10),
  };
  secs.forEach((sec, i) => {
    for (const { key, prop } of FUSE_PARAMS) {
      const slider = $(`sec_${i}_${key}`);
      if (document.activeElement !== slider) slider.max = range[prop];
      slider.value = sec[prop];
      const input = $(`sec_${i}_${key}_inp`);
      if (document.activeElement !== input) input.value = sec[prop].toFixed(3);
    }
  });
}

function updateFuselageViews() {
  if (typeof invalidateManufacturingPreview === 'function') invalidateManufacturingPreview();
  const geom = state.geometry;
  if (!geom) return;
  geom.fuse_sections = state.fuseSections.map(s => ({ ...s }));
  geom.fuse_preset = state.fusePreset;
  geom.fuse_width_scale = state.fuseWidthScale;
  geom.fuse_height_scale = state.fuseHeightScale;
  geom.fuse_section_exponent = state.fuseSectionExponent;
  refreshWingAndTailGroups();
  updateFuseViewer(geom, state.airfoilCoords);
  if (typeof rebuildFuselage === 'function' && fuseGroup) {
    rebuildFuselage(geom, state.airfoilCoords);
  }
  displayResults(geom);
  syncFuseLibrary();
  saveProject();
}

async function init() {
  const refreshVisibleScenes=()=>{requestViewerFrame();requestFuseFrame();};
  for(const event of ['change','input','click','visibilitychange'])document.addEventListener(event,refreshVisibleScenes);
  store.ready=store.load();
  await store.ready;
  setupVtol();
  setupManufacturing();
  setupTheme();
  setupLanguage();
  setupSidebar();
  renderFuseControls();
  setupFuseLibrary();
  setupEventListeners();
  loadVersion();
  setupDesktopPresence();
  try {
    await loadAirfoils();
  } catch (err) {
    showFormError('Airfoil listesi yüklenemedi. Sunucunun çalıştığından emin olup sayfayı yenileyin.');
    return;
  }
  restoreProject();
  state.projectRestored=true;
  syncMotorLayoutAvailability();
  setupProjects();
  $('saveProjectButton').addEventListener('click',async()=>{
    saveProject();
    try {await store.flush();notify('Tasarım bu bilgisayara kaydedildi.');}
    catch(e){notify(e.message);}
  });
  document.addEventListener('change',e=>{
    if(e.target.matches('input,select') && !e.target.closest('#fuse-manual-controls'))saveProject();
  });
  let draftTimer;
  document.addEventListener('input',e=>{
    if(!e.target.matches('input,select'))return;
    clearTimeout(draftTimer);draftTimer=setTimeout(saveProject,400);
  });
  window.addEventListener('pagehide',()=>{
    if(window.projectOpening)return;
    saveProject();
    if(store.initialized&&Object.keys(store.pending).length){
      navigator.sendBeacon('/api/settings',new Blob([JSON.stringify(store.pending)],{type:'application/json'}));
    }
  });
  if(store.initialized && store.get('zeta-project'))store.status('Son tasarım yüklendi. Modeli açmak için Hesapla’ya basın.');
}

async function setupDesktopPresence() {
  const beat = () => fetch('/api/heartbeat', { method: 'POST' }).then(r => r.json());
  try {
    const { desktop } = await beat();
    if (!desktop) return;
    setInterval(() => beat().catch(() => {}), 5000);
    window.addEventListener('pagehide', () => navigator.sendBeacon('/api/closing'));
  } catch (e) {   }
}

async function loadVersion() {
  try {
    const { version } = await fetchAPI('/api/version');
    $('appVersion').textContent = 'v' + version;
  } catch (e) {   }
}

async function loadAirfoils() {
  state.airfoils = await fetchAPI('/api/airfoils');
  const opts = state.airfoils.map(a =>
    `<option value="${escapeHtml(a.code)}">${escapeHtml(a.name)} · %${(a.max_thickness * 100).toFixed(0)} kalınlık</option>`
  ).join('');
  for (const [id, code] of [['airfoil', '2412'], ['htailAirfoil', '0012'], ['vtailAirfoil', '0012']]) {
    $(id).innerHTML = opts;
    $(id).value = code;
  }
}

const airfoilRequests=new Map();
function fetchAirfoilCoords(code) {
  const found=state.airfoils.find(a=>a.code===code)||state.airfoils[0];
  if(!airfoilRequests.has(found.id)){
    airfoilRequests.set(found.id,fetchAPI(`/api/airfoil/${found.id}`).then(data=>data.coordinates).catch(error=>{
      airfoilRequests.delete(found.id);
      throw error;
    }));
  }
  return airfoilRequests.get(found.id);
}

function setupLanguage() {
  const toggle = $('languageToggle');
  const apply = language => {
    setStudioLanguage(language);
    toggle.textContent = language === 'en' ? 'TR' : 'EN';
    toggle.setAttribute('aria-label', language === 'en' ? 'Switch to Turkish' : 'İngilizceye geç');
    if(state.polars)displayCharts(state.polars);
    if(state.mission)displayMissionCharts(state.mission);
  };
  apply(store.get('zeta-language') === 'en' ? 'en' : 'tr');
  toggle.addEventListener('click', () => {
    const language = document.documentElement.lang === 'en' ? 'tr' : 'en';
    store.set('zeta-language', language);
    apply(language);
  });
}

function setupTheme() {
  applyTheme();
  $('darkToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('zeta-theme', next);
    applyTheme();
  });
}

function applyTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('darkToggle').querySelector('i').className = dark ? 'ph ph-sun' : 'ph ph-moon';
  $('darkToggle').setAttribute('aria-label', dark ? 'Açık temaya geç' : 'Koyu temaya geç');
  $('darkToggle').title = dark ? 'Açık temaya geç' : 'Koyu temaya geç';
  if (state.polars) displayCharts(state.polars);
  if (state.mission) displayMissionCharts(state.mission);
}

function restoreProject() {
  let data;
  try { data = JSON.parse(store.get('zeta-project')); } catch (e) { return; }
  if (!data || !data.wingspan) return;
  if(typeof restoreVtolSettings==='function')restoreVtolSettings(data);
  if($('projectName'))$('projectName').value=data.project_name||'';
  setRadio('mode',data.mode||'auto');
  toggleManualCategories((data.mode||'auto')==='manual');
  for(const id of MANUAL_FIELDS)if(data.manual?.[id]!=null)$('man_'+id).value=data.manual[id];

  $('wingspan').value = data.wingspan;
  $('weight').value = data.weight;
  if (data.airfoil_code) $('airfoil').value = data.airfoil_code;
  if (data.tail_airfoil_code) $('htailAirfoil').value = data.tail_airfoil_code;
  if (data.vtail_airfoil_code) $('vtailAirfoil').value = data.vtail_airfoil_code;
  setRadio('wing_shape', data.wing_shape);
  $('flightStyle').value = data.flight_style === 'calm' ? 'calm' : 'standard';
  $('wingControls').value = data.wing_controls === 'single' ? 'single' : 'dual';
  for(const id of CONTROL_SIZE_FIELDS) $(id).value=data[id]??'';
  setRadio('wing_pos', data.wing_position);
  const legacyAkin = data.fuse_preset==='akin' && data.larkLayoutVersion!==2;
  setRadio('tail_type', legacyAkin ? 'ttail' : data.tail_type);
  setRadio('fuse_type', data.fuse_type);
  if (data.reynolds) $('reynolds').value = data.reynolds;
  state.legacyCgPercent = Number.isFinite(data.cg_percent) ? data.cg_percent : 25;
  state.cgFuselagePercent = Number.isFinite(data.cg_fuselage_percent) ? data.cg_fuselage_percent : null;
  if (data.max_alpha) $('maxAlpha').value = data.max_alpha;
  setRadio('mission_profile', data.mission_profile);
  for (const id of MISSION_FIELDS) {
    if (data.mission?.[id] != null) $(id).value = data.mission[id];
  }
  updateMissionProfile();

  state.fusePreset = FUSELAGE_PRESETS[data.fuse_preset] ? data.fuse_preset : (data.fuse_type === 'manual' ? 'custom' : 'atlas');
  state.fuseWidthScale = Math.max(.7, Math.min(1.5, Number(data.fuse_width_scale) || 1));
  state.fuseHeightScale = Math.max(.7, Math.min(1.5, Number(data.fuse_height_scale) || 1));
  state.fuseSectionExponent = Math.max(2, Math.min(3, Number(data.fuse_section_exponent) || 2));
  if (Array.isArray(data.fuse_sections_m) && data.fuse_sections_m.length >= 2 && data.fuse_sections_m.length <= 24
      && data.fuse_sections_m.every(s => s && [s.t, s.w, s.h].every(v => Number.isFinite(v) && v >= 0))) {
    state.fuseSections = data.fuse_sections_m;
    state.fuseSectionsEdited = true;
    renderFuseControls();
  }
  syncFuseLibrary();
}

function saveProject() {
  if(window.projectOpening)return;
  store.set('zeta-project', JSON.stringify({
    vtol:typeof vtolSettings==='function'?vtolSettings():undefined,
    vtolLayoutVersion:3,
    larkLayoutVersion:state.fusePreset==='akin' ? 2 : undefined,
    project_name:$('projectName')?.value||'',
    mode:radioValue('mode','auto'),
    manual:Object.fromEntries(MANUAL_FIELDS.map(id=>[id,$('man_'+id).value])),
    wingspan: $('wingspan').value,
    weight: $('weight').value,
    airfoil_code: $('airfoil').value,
    tail_airfoil_code: $('htailAirfoil').value,
    vtail_airfoil_code: $('vtailAirfoil').value,
    wing_shape: radioValue('wing_shape', 'tapered'),
    ...controlSizeSettings(),
    wing_controls: $('wingControls').value, flight_style: $('flightStyle').value,
    wing_position: radioValue('wing_pos', 'mid'),
    tail_type: radioValue('tail_type', 'conventional'),
    fuse_type: radioValue('fuse_type', 'conventional'),
    fuse_preset: state.fusePreset,
    fuse_width_scale: state.fuseWidthScale,
    fuse_height_scale: state.fuseHeightScale,
    fuse_section_exponent: state.fuseSectionExponent,
    fuse_sections_m: state.fuseSectionsEdited ? state.fuseSections : undefined,
    reynolds: parseInt($('reynolds').value) || 200000,
    cg_percent: state.legacyCgPercent,
    cg_fuselage_percent: state.cgFuselagePercent,
    max_alpha: parseInt($('maxAlpha').value) || 20,
    mission_profile: radioValue('mission_profile', 'general'),
    mission: Object.fromEntries(MISSION_FIELDS.map(id => [id, $(id).value])),
  }));
}

function updateManualTailFields() {
  const tail = radioValue('tail_type', 'conventional');
  const linked = tail === 'conventional';
  for (const id of ['man_htail_sweep','man_vtail_root','man_vtail_tip']) {
    const input = $(id);
    input.disabled = linked || (id === 'man_htail_sweep' && tail === 'ttail');
    input.closest('.field').hidden = input.disabled;
  }
  $('manualTailHint').hidden = !linked;
  for(const group of document.querySelectorAll('[data-tail-control]')) {
    group.hidden=(group.dataset.tailControl==='ruddervator')!==(tail==='vtail');
    for(const input of group.querySelectorAll('input'))input.disabled=group.hidden;
  }
}

function updateMissionProfile() {
  updateManualTailFields();
  if(radioValue('mission_profile','general')==='general' && state.fusePreset==='combat')state.fusePreset='atlas';
  syncMotorLayoutAvailability();
  const combat=radioValue('mission_profile','general')==='competition';
  $('competition-inputs').hidden = !combat;
  const labels=combat?{conventional:'H kuyruk (ikiz fin)',ttail:'Π kuyruk (üst köprü)',vtail:'Ters V kuyruk'}:TAIL_TYPE_LABELS;
  for(const input of document.querySelectorAll('input[name="tail_type"]'))if(input.nextElementSibling)input.nextElementSibling.textContent=labels[input.value];
  $('tailLayoutHint').textContent=combat?'Çift bomlu modelde H, üst köprülü Π ve ters V yerleşimleri kullanılır. Π ve ters V ortasında ayrı vidalı bağlantı vardır.':'Klasik gövdede konvansiyonel, T ve V kuyruk yerleşimleri kullanılır.';
}

function loadCompetitionPreset() {
  const values = { wingspan: 2.0, weight: 5.0, motorPower: 1200, batteryWh: 222, avionicsPower: 30, nLimit: 4 };
  for (const [id, value] of Object.entries(values)) $(id).value = value;
}

function drawCGLayout(geom, wingX, cgX) {
  const length = geom.fuselage_length;
  const x = value => 20 + 278 * value / length;
  const root = x(wingX);
  const rootEnd = x(wingX + geom.root_chord);
  const sweep = geom.straight_te ? geom.root_chord - geom.tip_chord
    : geom.wingspan / 2 * Math.tan(geom.sweep_angle * Math.PI / 180);
  const tip = x(wingX + sweep);
  const tipEnd = x(wingX + sweep + geom.tip_chord);
  $('cgWingPlan').setAttribute('d', `M${root} 48 L${tip} 9 L${tipEnd} 9 L${rootEnd} 48 L${tipEnd} 87 L${tip} 87 Z`);
  $('cgPoint').setAttribute('cx', x(cgX));
}

function previewCGTarget() {
  const geom = state.geometry;
  const [fore, aft] = geom.cg_placement.limits;
  const progress = (state.cgFuselagePercent - fore.cg_percent) / (aft.cg_percent - fore.cg_percent);
  const t = Math.max(0, Math.min(1, progress));
  const cg = (fore.cg_percent + t * (aft.cg_percent - fore.cg_percent)) * geom.fuselage_length / 100;
  drawCGLayout(geom, fore.wing_x + t * (aft.wing_x - fore.wing_x), cg);
  $('cgValue').textContent = `Hedef: burundan ${Math.round(cg * 1000)} mm`;
}

function updateCGDisplay(geom, requested) {
  const balance = geom.cg_placement;
  if (!balance) return;
  const length = geom.fuselage_length;
  drawCGLayout(geom, geom.wing_x_pos, balance.cg_x);
  const slider = $('cgSlider');
  slider.disabled = !balance.available;
  if (requested === state.cgFuselagePercent) slider.value = 100 * balance.cg_x / length;
  $('cgValue').textContent = `Burundan ${Math.round(1000 * balance.cg_x)} mm`;
  document.querySelectorAll('[data-cg-option]').forEach(button => {
    const option = balance.options[Number(button.dataset.cgOption)];
    button.disabled = !option;
    if (option) {
      button.setAttribute('aria-pressed', String(Math.abs(option.wing_x - geom.wing_x_pos) < .001 &&
                                                  state.cgFuselagePercent !== null));
      button.title = `CG burundan ${Math.round(option.cg_percent * length * 10)} mm`;
    }
  });
  $('cgPlacementStatus').textContent = balance.available
    ? `Statik marj %${balance.static_margin.toFixed(1)} MAC · Mevcut kanat için hedef CG burundan ${Math.round(1000 * balance.recommendation_x)} mm.${balance.limited ? ' Kanat bağlantı aralığına ulaşıldı.' : ''}`
    : 'Bu gövdede boyuna kanat konumu sabit. Şema hesaplanan CG konumunu gösterir.';
}

function toggleManualCategories(enabled) {
  document.querySelectorAll('[data-manual-category]').forEach(section => { section.hidden = !enabled; });
}

const CONTROL_SIZE_FIELDS = ['flap','elevator','rudder','ruddervator']
  .flatMap(surface=>['start','length','width'].map(dimension=>`${surface}_${dimension}_percent`));

function controlSizeSettings(activeOnly=false) {
  return Object.fromEntries(CONTROL_SIZE_FIELDS.filter(id=>!activeOnly||!$(id).disabled)
    .map(id=>[id,$(id).value==='' ? null : $(id).valueAsNumber]));
}

function setupEventListeners() {
  $('paramForm').addEventListener('submit', (e) => { e.preventDefault(); calculateAll(); });
  const geometryFields=['wingspan','weight','targetStall','airfoil','htailAirfoil','vtailAirfoil','reynolds',
    'motorLayout','flightStyle','wingControls','triaTailVh','triaTailVv',...MANUAL_FIELDS.map(id=>'man_'+id)];
  for(const id of geometryFields)$(id)?.addEventListener('change',recalculatePlacement);
  document.querySelectorAll('input[name="wing_pos"],input[name="wing_shape"],input[name="tail_type"],input[name="mode"]')
    .forEach(input=>input.addEventListener('change',recalculatePlacement));
  for(const id of ['motorDiameter','motorLength','propDiameter','propOffset']){
    $(id)?.addEventListener('change',()=>{if(state.fusePreset==='vtol5')recalculatePlacement();});
  }
  let cgTimer;
  for(const id of CONTROL_SIZE_FIELDS) $(id).addEventListener('change', recalculatePlacement);
  $('cgSlider').addEventListener('input', event => {
    if (!state.geometry?.cg_placement?.available) return;
    state.cgFuselagePercent = Number(event.target.value);
    previewCGTarget();
    clearTimeout(cgTimer);
    cgTimer = setTimeout(recalculatePlacement, 180);
  });
  document.querySelectorAll('[data-cg-option]').forEach(button => button.addEventListener('click', () => {
    const option = state.geometry?.cg_placement?.options[Number(button.dataset.cgOption)];
    if (!option) return;
    clearTimeout(cgTimer);
    state.cgFuselagePercent = option.cg_percent;
    previewCGTarget();
    recalculatePlacement();
  }));
  document.querySelectorAll('input[name="mode"]').forEach(input => {
    input.addEventListener('change', () => {
      toggleManualCategories(radioValue('mode') === 'manual');
    });
  });

  document.querySelectorAll('input[name="tail_type"]').forEach(input => input.addEventListener('change', updateManualTailFields));
  updateManualTailFields();
  document.querySelectorAll('input[name="mission_profile"]').forEach(input => {
    input.addEventListener('change',()=>{updateMissionProfile();recalculatePlacement();});
  });
  $('loadCompetitionPreset').addEventListener('click', loadCompetitionPreset);

  $('viewX').addEventListener('click', () => viewerSetView('x'));
  $('viewY').addEventListener('click', () => viewerSetView('y'));
  $('viewZ').addEventListener('click', () => viewerSetView('z'));
  $('viewAutoRotate').addEventListener('click', viewerToggleRotate);
  $('viewReset').addEventListener('click', () => viewerReset());
  $('toggleFuse').addEventListener('click', toggleFuselage);

  $('stlWing').addEventListener('click', () => exportSTL('wing'));
  $('stlTail').addEventListener('click', () => exportSTL('tail'));
  $('stlFuseConv').addEventListener('click', () => exportFuselageSTL('conventional'));
  $('wallThickness').addEventListener('input', () => {
    state.wallThickness = parseFloat($('wallThickness').value) || 0;
  });

}

function recalculatePlacement() {
  if(!state.geometry&&!calculationActive)return;
  ++wingPlacementRequest;
  invalidateManufacturingPreview(false);
  pendingPlacement=true;
  clearTimeout(placementTimer);
  placementTimer=setTimeout(()=>{
    if(pendingPlacement&&!calculationActive)calculateAll(true);
  },180);
}

async function calculateAll(keepTab=false) {
  if(calculationActive){recalculatePlacement();return;}
  clearTimeout(placementTimer);
  pendingPlacement=false;
  const revision=++wingPlacementRequest;
  invalidateManufacturingPreview(false);
  const btn = $('calculateBtn');
  showFormError('');

  if ($('paramForm').checkValidity && !$('paramForm').checkValidity()) {
    const invalid=$('paramForm').querySelector(':invalid');
    invalid?.closest('details')?.setAttribute('open','');
    $('paramForm').reportValidity();previewStatus('Ölçüleri kontrol edin.','idle');return;
  }
  const wingspan = parseFloat($('wingspan').value);
  const weight = parseFloat($('weight').value);
  if (!(wingspan > 0) || !(weight > 0)) {
    showFormError('Kanat açıklığı ve ağırlık sıfırdan büyük olmalı.');
    previewStatus('Ölçüleri kontrol edin.','idle');
    return;
  }

  const airfoil_code = $('airfoil').value;
  const htail_airfoil = $('htailAirfoil').value;
  const vtail_airfoil = $('vtailAirfoil').value;
  const tail_type = radioValue('tail_type', 'conventional');
  const fuse_type = radioValue('fuse_type', 'conventional');
  const manual_mode = radioValue('mode', 'auto') === 'manual';
  const reynolds_number = parseInt($('reynolds').value) || 200000;
  const motor_power = parseFloat($('motorPower').value);
  const prop_efficiency = parseFloat($('propEfficiency')?.value ?? '60')/100;
  const battery_wh = parseFloat($('batteryWh').value);
  if (!(motor_power > 0) || !(battery_wh > 0)) {
    showFormError('Motor gücü ve batarya enerjisi sıfırdan büyük olmalı.');
    previewStatus('Motor ve batarya ayarlarını kontrol edin.','idle');
    return;
  }
  const competition = !['vtol','vtol5'].includes(state.fusePreset) && (radioValue('mission_profile', 'general') === 'competition' || state.fusePreset==='combat');
  if(competition && fuse_type!=='manual')state.fusePreset='combat';

  const body = {
    wingspan, weight, airfoil_code, tail_airfoil_code: tail_type === 'vtail' ? vtail_airfoil : htail_airfoil, tail_type, fuse_type, manual_mode,
    target_stall_speed: Number($('targetStall').value), reynolds_number,
    ...controlSizeSettings(true),
    wing_shape: radioValue('wing_shape', 'tapered'),
    wing_controls: $('wingControls').value, flight_style: $('flightStyle').value,
    wing_position: radioValue('wing_pos', 'mid'),
    rear_pusher: $('motorLayout').value === 'rear',
    lark_layout: state.fusePreset==='akin',
    fuse_preset: state.fusePreset,
    cg_percent: state.legacyCgPercent,
    cg_fuselage_percent: state.cgFuselagePercent,
    airframe: state.fusePreset==='vtol'?'vtol_fixed':state.fusePreset==='vtol5'?'vtol5_fixed':competition ? 'combat' : 'standard',
  };
  if(state.fusePreset==='vtol5'){body.penta_pusher_clearance=(Number($('motorLength').value)+Number($('propOffset').value)+Math.max(40,.15*Number($('propDiameter').value)))/1000;body.penta_motor_diameter=Number($('motorDiameter').value);}
  if(state.fusePreset==='vtol'){body.tria_tail_vh=Number($('triaTailVh').value);body.tria_tail_vv=Number($('triaTailVv').value);}
  if (manual_mode) {
    for (const f of MANUAL_FIELDS) {
      const input = $('man_' + f);
      const manualValue = input.disabled ? NaN : parseFloat(input.value);
      body['man_' + f] = Number.isFinite(manualValue) ? manualValue : undefined;
    }
  }

  calculationActive=true;
  setBusy(btn, true);
  try {
    const [[wingCoords,tailCoords,vtailCoords],geometry] = await Promise.all([
      Promise.all([airfoil_code,htail_airfoil,vtail_airfoil].map(fetchAirfoilCoords)),
      fetchAPI('/api/calculate',body),
    ]);
    if(revision!==wingPlacementRequest)return;
    const [polars,stability,mission] = await Promise.all([
      fetchAPI('/api/analyze', {
        geometry, airfoil_code, reynolds_number,
        max_alpha: parseInt($('maxAlpha').value) || 20,
      }),
      fetchAPI('/api/stability', {
        geometry, airfoil_code, tail_airfoil_code: body.tail_airfoil_code, reynolds_number,
        motor_power, prop_efficiency,
      }),
      fetchAPI('/api/mission', {
        geometry, airfoil_code, reynolds_number,
        motor_power, battery_wh, prop_efficiency,
        avionics_power: parseFloat($('avionicsPower').value) || 0,
        n_limit: parseFloat($('nLimit').value) || 4,
        targets: competition ? {
          endurance_min: parseFloat($('targetEndurance').value) || undefined,
          turn_rate_deg: parseFloat($('targetTurnRate').value) || undefined,
          stall_speed: geometry.wing_sizing.target_stall_speed,
        } : undefined,
      }),
    ]);

    if(revision!==wingPlacementRequest)return;
    Object.assign(state,{geometry,airfoilCode:airfoil_code,airfoilCoords:wingCoords,tailCoords,vtailCoords,
      polars,stability,mission,wallThickness:parseFloat($('wallThickness').value)||0});

    if (!state.fuseSectionsEdited) {
      const g = state.geometry;
      state.fuseSections = scaleFuseShape(g.fuselage_length, g.fuselage_max_width, g.fuselage_max_height);
      syncFuseControls();
    }
    state.geometry.fuse_type = fuse_type;
    if (fuse_type === 'manual') state.fusePreset = 'custom';
    else if (!FUSELAGE_PRESETS[state.fusePreset]) state.fusePreset = 'atlas';
    state.geometry.fuse_preset = state.fusePreset;
    state.geometry.fuse_width_scale = state.fuseWidthScale;
    state.geometry.fuse_height_scale = state.fuseHeightScale;
    state.geometry.fuse_section_exponent = state.fuseSectionExponent;
    state.geometry.fuse_sections = state.fuseSections.map(s => ({ ...s }));
    syncFuseLibrary();
    state.geometry.motor_mount=motorMountSettings();
    if(state.fusePreset==='vtol'){state.geometry.motor_mount={motorLayout:'none'};state.geometry.vtol=vtolSettings();}
    if(state.fusePreset==='vtol5'){state.geometry.motor_mount.motorLayout='rear';state.geometry.vtol=vtolSettings();}
    syncWingPlacement(state.geometry,buildFuselageSections(state.geometry,fuse_type,state.airfoilCoords).sections);
    saveProject();

    updateCGDisplay(state.geometry, body.cg_fuselage_percent);
    displayResults(state.geometry);
    displayFlightTest(state.stability);
    displayMission(state.mission);
    enableResultTabs();

    initViewer(state.geometry,state.airfoilCoords,state.tailCoords,state.vtailCoords,airfoil_code,tail_type);
    if(fuseViewerRunning){
      fuseViewerWingGrid=state.airfoilCoords;
      fuseViewerTailCoords=state.tailCoords;
      fuseViewerVtailCoords=state.vtailCoords;
      fuseViewerTailType=tail_type;
      updateFuseViewer(state.geometry,state.airfoilCoords);
    }
    chartsDirty=missionChartsDirty=true;
    const activeTab=document.querySelector('.tab-pane.active')?.dataset.tab;
    if(!keepTab&&activeTab==='input')switchTab('results');
    else if(activeTab==='charts'||activeTab==='mission')switchTab(activeTab);
    scheduleManufacturingPreview(true);
  } catch (err) {
    if(revision===wingPlacementRequest){
      showFormError('Hesaplama sırasında bir hata oluştu: '+err.message);
      previewStatus(err.message,'error');
    }
  } finally {
    calculationActive=false;
    setBusy(btn,false);
    if(pendingPlacement){
      clearTimeout(placementTimer);
      placementTimer=setTimeout(()=>calculateAll(true),0);
    }
  }
}

const WING_POSITION_LABELS = { low: 'Alçak', mid: 'Orta', high: 'Yüksek' };
const TAIL_TYPE_LABELS = { conventional: 'Konvansiyonel', ttail: 'T-tail', vtail: 'V-tail' };

function measurementValue(value, unit = '', decimals = null) {
  const result = document.createElement('span');
  result.className = 'measurement-value num';
  const number = document.createElement('span');
  number.className = 'measurement-number';
  number.textContent = value == null || (typeof value === 'number' && !Number.isFinite(value))
    ? '—' : typeof value === 'number' && decimals !== null ? value.toFixed(decimals) : String(value);
  result.append(number);
  if (unit) {
    const suffix = document.createElement('span');
    suffix.className = 'unit';
    suffix.textContent = unit;
    result.append(document.createTextNode(' '), suffix);
  }
  return result;
}

function fuselageEnvelopeDimensions(geom) {
  const {sections,totalLen} = buildFuselageSections(geom,geom.fuse_type,state.airfoilCoords);
  const sectionSize = axis => Math.max(0,...sections.map(ring => {
    const values=ring.map(point=>point[axis]);
    return Math.max(...values)-Math.min(...values);
  }));
  return {length:totalLen||0,width:sectionSize('z'),height:sectionSize('y')};
}

function displayResults(geom) {
  const fuse = fuselageEnvelopeDimensions(geom);
  const summary = [
    ['Brüt referans kanat alanı', geom.wing_area, 'm²', 4],
    ['Açıklık oranı', geom.aspect_ratio, '', 3],
    ['MAC', geom.mac, 'm', 3],
    ['Kanat yüklemesi', geom.weight / geom.wing_area, 'kg/m²', 2],
  ];

  const groups = [
    ['Kanat', [
      ['Açıklık', geom.wingspan, 'm'],
      ...(geom.wing_sizing?.flight_style === 'calm' ? [
        ['Hedef stall hızı', geom.wing_sizing.target_stall_speed, 'm/s'],
        ['Hedef için kanat alanı', geom.wing_sizing.required_area, 'm²'],
        ['Mevcut alan için AR 8 açıklığı', geom.wing_sizing.glide_span_m, 'm'],
      ] : []),
      ['Kök veter', geom.root_chord, 'm'],
      ['Uç veter', geom.tip_chord, 'm'],
      ['Daralma oranı', geom.taper_ratio, ''],
      ['Ok açısı', geom.sweep_angle, '°'],
      ['Dihedral', geom.dihedral_angle, '°'],
      ['Konum', WING_POSITION_LABELS[geom.wing_position] || 'Orta', ''],
      ['X pozisyonu', geom.wing_x_pos, 'm'],
    ]],
    ['Yatay kuyruk', [
      ['Açıklık', geom.htail_span, 'm'],
      ['Kök veter', geom.htail_chord, 'm'],
      ['Uç veter', (geom.htail_tip_chord || 0).toFixed(3), 'm'],
      ['Daralma oranı', geom.htail_taper, ''],
      ['Alan', geom.htail_area, 'm²'],
      ['Kuyruk kolu', geom.effective_tail_arm ?? geom.htail_arm, 'm'],
      ['X pozisyonu', geom.tail_x_pos, 'm'],
      ['Kuyruk tipi', (geom.tail_booms?{conventional:'H kuyruk (ikiz fin)',ttail:'Π kuyruk (üst köprü)',vtail:'Ters V kuyruk'}:TAIL_TYPE_LABELS)[geom.tail_type] || 'Konvansiyonel', ''],
    ]],
    [geom.fuse_type === 'manual' ? 'Gövde (özgün) ve denge' : 'Gövde ve denge', [
      ['Gövde uzunluğu', Number(fuse.length.toFixed(3)), 'm'],
      ['Gövde genişliği', Number(fuse.width.toFixed(3)), 'm'],
      ['Gövde yüksekliği', Number(fuse.height.toFixed(3)), 'm'],
      ['CG pozisyonu', geom.cg_position, 'm'],
    ]],
    [geom.vtail_count === 2 ? 'Dikey kuyruk (ikiz, her biri)' : 'Dikey kuyruk', [
      ['Açıklık', geom.vtail_span, 'm'],
      ['Kök veter', geom.vtail_chord, 'm'],
      ['Uç veter', (geom.vtail_tip_chord || 0).toFixed(3), 'm'],
      ['Daralma oranı', geom.vtail_taper, ''],
      ['Alan', geom.vtail_area, 'm²'],
    ]],
  ];

  if (geom.tail_type === 'vtail') {
    groups.splice(3,1);
    groups[1] = ['V kuyruk (iki eğik yüzey)', [
      ['Toplam eğik açıklık',geom.vtail_span,'m'],
      ['Yatay izdüşüm açıklığı',geom.htail_span,'m'],
      ['Eğim açısı',geom.vtail_angle ?? 35,'°'],
      ['Kök veter',geom.vtail_chord,'m'],
      ['Uç veter',geom.vtail_tip_chord,'m'],
      ['Toplam fiziksel alan',geom.vtail_surface_area,'m²'],
      ['Her bir yüzeyin alanı',geom.vtail_panel_area,'m²'],
      ['Yatay etkin alan',geom.htail_effective_area,'m²'],
      ['Dikey etkin alan',geom.vtail_effective_area,'m²'],
      ['Kuyruk kolu',geom.effective_tail_arm ?? geom.htail_arm,'m'],
    ]];
  }

  if (geom.tail_booms) {
    groups.push(['Kuyruk bomları (karbon boru, 2 adet)', [
      ['Uzunluk', geom.tail_booms.length, 'm'],
      ['Çap', geom.tail_booms.diameter, 'm'],
      ['Merkezden uzaklık', geom.tail_booms.y, 'm'],
    ]]);
  }

  const cs = geom.control_surfaces;
  if (cs) {
    const areaRow=(label,area)=>[label,Number.isFinite(area) ? Math.round(area*10000) : null,'cm²'];
    groups.push(['Hareketli yüzey hedef alanları', [
      ...(cs.flaperon ? [areaRow('Flaperon, iki kanat toplamı',cs.flaperon.area),
        ...(cs.flaperon.target_area == null ? [] : [areaRow('Flaperon alan hedefi',cs.flaperon.target_area)])]
        : [areaRow('Aileron, iki kanat toplamı',cs.aileron.area),areaRow('Flap, iki kanat toplamı',cs.flap.area)]),
      ...(geom.tail_type === 'vtail'
        ? [areaRow('Ruddervator (iki yüzey toplam)',cs.ruddervator?.area ?? geom.vtail_surface_area*.3)]
        : [areaRow('İrtifa dümeni',cs.elevator.area),
           areaRow(geom.tail_booms && geom.tail_type==='conventional' ? 'Yön dümeni, tek dikey fin' : 'Yön dümeni',cs.rudder.area)]),
    ]]);
  }

  $('results-summary').replaceChildren(...summary.map(([label, value, unit, decimals]) => {
    const stat = document.createElement('div');
    stat.className = 'stat';
    const heading = document.createElement('div');
    heading.className = 'stat-label';
    heading.textContent = label;
    const content = document.createElement('div');
    content.className = 'stat-value';
    content.append(measurementValue(value, unit, decimals));
    stat.append(heading, content);
    return stat;
  }));

  $('results-grid').replaceChildren(...groups.map(([title, rows]) => {
    const section = document.createElement('section');
    section.className = 'spec-group';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const list = document.createElement('dl');
    for (const [label, value, unit] of rows) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.append(measurementValue(value, unit));
      row.append(term, detail);
      list.append(row);
    }
    section.append(heading, list);
    return section;
  }));
}

const STATUS = {
  pass: { label: 'Uygun', icon: 'ph-check-circle' },
  warn: { label: 'Sınırda', icon: 'ph-warning' },
  fail: { label: 'Yetersiz', icon: 'ph-x-circle' },
};
const FLIGHT_CHECKS = {
  stall_speed: { label: 'Stall hızı', unit: 'm/s', limit: '15 m/s üzeri dikkat' },
  climb_rate: { label: 'Tırmanma oranı', unit: 'm/s', limit: '> 0 m/s' },
  static_margin: { label: 'Statik marj', unit: '% MAC', limit: '%5–20 tasarım hedefi' },
};

function displayFlightTest(stab) {
  const passed = stab.overall_passed;
  const warnings = stab.checks.filter(c => c.status === 'warn').length;
  const failures = stab.checks.filter(c => c.status === 'fail').length;
  const summary = failures
    ? `${stab.checks.length} kriterden ${failures} tanesi karşılanmıyor.`
    : warnings
      ? `Tüm kriterler karşılanıyor, ${warnings} tanesi sınırda.`
      : 'Tüm kriterler karşılanıyor.';

  const rows = stab.checks.map(c => {
    const def = FLIGHT_CHECKS[c.key];
    const st = STATUS[c.status];
    return `<tr>
      <th scope="row">${def.label}</th>
      <td class="num">${escapeHtml(String(stab[c.key]))} <span class="unit">${def.unit}</span></td>
      <td class="limit">${def.limit}</td>
      <td><span class="status ${c.status}"><i class="ph ${st.icon}"></i>${st.label}</span></td>
      <td class="note">${escapeHtml(c.message)}</td>
    </tr>`;
  }).join('');

  const details = [
    ['Seyir hızı', stab.cruise_speed, 'm/s'],
    ['CL maks', stab.cl_max, ''],
    ['Seyir CL', stab.cl_opt, ''],
    ['Seyir CD', stab.cd_cruise, ''],
    ['Seyir sürüklemesi', stab.drag_cruise, 'N'],
    ['Gerekli güç', stab.power_required, 'W'],
    ['Mevcut güç (itki)', stab.power_available, 'W'],
    ['Nötr nokta', (stab.neutral_point * 100).toFixed(1), '% MAC'],
    ['Ağırlık merkezi', (stab.cg_position * 100).toFixed(1), '% MAC'],
    ['Reynolds sayısı', stab.Reynolds.toLocaleString('tr-TR'), ''],
  ];

  $('flight-results').innerHTML =
    `<div class="verdict ${passed ? 'pass' : 'fail'}">
      <i class="ph ${passed ? 'ph-check-circle' : 'ph-x-circle'}"></i>
      <div>
        <strong>${passed ? 'Ön hesap kriterleri karşılanıyor' : 'Ön hesap kriterleri karşılanmıyor'}</strong>
        <p>${summary}</p>
      </div>
    </div>
    <div class="table-scroll">
      <table class="check-table">
        <thead><tr><th>Kriter</th><th>Değer</th><th>Sınır</th><th>Durum</th><th>Değerlendirme</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <section class="spec-group flight-details">
      <h3>Hesap ayrıntıları</h3>
      <dl>${details.map(([label, value, unit]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd class="num">${escapeHtml(String(value))}${unit ? ` <span class="unit">${unit}</span>` : ''}</dd></div>`
      ).join('')}</dl>
    </section>`;
}

const MISSION_TARGETS = {
  endurance_min: { label: 'Havada kalış', unit: 'dk', sign: '≥' },
  turn_rate_deg: { label: 'Sürekli dönüş hızı', unit: '°/s', sign: '≥' },
  stall_speed: { label: 'Stall hızı', unit: 'm/s', sign: '≤' },
};

function displayMission(m) {
  const unitHtml = unit => unit ? ` <span class="unit">${unit}</span>` : '';
  const stat = ([label, value, unit]) =>
    `<div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value num">${escapeHtml(String(value ?? '–'))}${unitHtml(unit)}</div>
    </div>`;
  $('mission-summary').innerHTML = [
    ['Havada kalış (seyirde)', m.endurance_min, 'dk'],
    ['Azami hız', m.max_speed, 'm/s'],
    ['Sürekli dönüş', m.turn_rate_deg, '°/s'],
    ['Dönüş yarıçapı', m.turn_radius, 'm'],
  ].map(stat).join('');

  let checksHtml = '';
  if (!m.can_fly) {
    checksHtml = `<div class="verdict fail"><i class="ph ph-x-circle"></i><div>
      <strong>Güç yetersiz</strong>
      <p>Bu motor gücüyle uçak düz uçuşu sürdüremiyor. Motor gücünü artırın ya da ağırlığı azaltın.</p>
    </div></div>`;
  } else if (m.checks) {
    const failed = m.checks.filter(c => c.status !== 'pass').length;
    const rows = m.checks.map(c => {
      const def = MISSION_TARGETS[c.key];
      const st = STATUS[c.status];
      return `<tr>
        <th scope="row">${def.label}</th>
        <td class="num">${c.value} <span class="unit">${def.unit}</span></td>
        <td class="limit">${def.sign} ${c.target} ${def.unit}</td>
        <td><span class="status ${c.status}"><i class="ph ${st.icon}"></i>${st.label}</span></td>
      </tr>`;
    }).join('');
    checksHtml = `<div class="verdict ${m.targets_met ? 'pass' : 'fail'}">
      <i class="ph ${m.targets_met ? 'ph-check-circle' : 'ph-x-circle'}"></i>
      <div>
        <strong>${m.targets_met ? 'Görev hedefleri karşılanıyor' : 'Görev hedefleri karşılanmıyor'}</strong>
        <p>${failed ? `${m.checks.length} hedeften ${failed} tanesi tutmuyor.` : 'Hedefler Parametreler adımından düzenlenebilir.'}</p>
      </div>
    </div>
    <div class="table-scroll">
      <table class="check-table">
        <thead><tr><th>Hedef</th><th>Değer</th><th>İstenen</th><th>Durum</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }
  $('mission-checks').innerHTML = checksHtml;

  $('mission-details').innerHTML = [
    ['Stall hızı', m.stall_speed, 'm/s'],
    ['Seyir hızı', m.cruise_speed, 'm/s'],
    ['Tahmini süzülme oranı', m.glide_ratio_estimate, ':1'],
    ['Seyirde çekilen güç', m.cruise_power, 'W'],
    ['Menzil (seyirde)', m.range_km, 'km'],
    ['Azami tırmanma', m.climb_rate, 'm/s'],
    ['Sürekli dönüşte yük faktörü', m.turn_load_factor, 'g'],
    ['Köşe hızı', m.corner_speed, 'm/s'],
    ['Anlık dönüş (köşe hızında)', m.corner_turn_rate_deg, '°/s'],
    ['Anlık dönüş yarıçapı', m.corner_turn_radius, 'm'],
    ['Kanat yüklemesi', m.wing_loading, 'kg/m²'],
    ['Güç yüklemesi', m.power_loading, 'W/kg'],
    ['Toplam CD0', m.cd0_total, ''],
  ].map(([label, value, unit]) =>
    `<div><dt>${label}</dt><dd class="num">${escapeHtml(String(value))}${unitHtml(unit)}</dd></div>`
  ).join('');
}

window.addEventListener('DOMContentLoaded', init);
