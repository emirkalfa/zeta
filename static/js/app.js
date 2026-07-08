/* ─── Cookie Helpers (fallback to localStorage) ─── */
function setCookie(name, value, days) {
  try {
    const encoded = encodeURIComponent(value);
    if (encoded.length > 4096) throw new Error('Cookie size exceeded');
    document.cookie = `${name}=${encoded}; path=/; max-age=${days * 86400}; SameSite=Lax`;
    return true;
  } catch (e) {
    localStorage.setItem(name, value);
    return false;
  }
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  if (match) return decodeURIComponent(match[2]);
  return localStorage.getItem(name);
}

function deleteCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0`;
  localStorage.removeItem(name);
}

const state = {
  geometry: null,
  polars: null,
  stability: null,
  airfoilCoords: null,
  tailCoords: null,
  vtailCoords: null,
  airfoilCode: '2412',
  darkMode: getCookie('zeta-dark') === 'true',
  wallThickness: 1.2,
  fuseType: 'conventional',
  fuseSections: [
    { t: 0.00, w: 0.143, h: 0.111 },
    { t: 0.15, w: 0.571, h: 0.667 },
    { t: 0.45, w: 1.000, h: 1.000 },
    { t: 0.90, w: 0.429, h: 0.444 },
    { t: 1.10, w: 0.100, h: 0.100 },
    { t: 1.20, w: 0.057, h: 0.044 },
  ],
};

async function fetchAPI(url, body = null) {
  const opts = { headers: { 'Content-Type': 'application/json' } };
  if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function $(id) { return document.getElementById(id); }

function showLoading(btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Hesaplanıyor...';
}

function hideLoading(btn, text) {
  btn.disabled = false;
  btn.innerHTML = text || 'HESAPLA';
}

/* ─── Sidebar / Tab System ─── */
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('active');
  });
  const pane = document.querySelector(`.tab-pane[data-tab="${tabId}"]`);
  const link = document.querySelector(`.sidebar-link[data-tab="${tabId}"]`);
  if (pane) pane.classList.add('active');
  if (link) link.classList.add('active');
}

function enableTab(tabId) {
  const link = document.querySelector(`.sidebar-link[data-tab="${tabId}"]`);
  if (link) link.classList.remove('disabled');
}

function setupSidebar() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.dataset.tab;
      if (link.classList.contains('disabled')) return;
      switchTab(tab);
      if (tab === 'fuse' && typeof fitFuseViewerToModel === 'function') {
        fitFuseViewerToModel();
      }
    });
  });
}

/* ─── Fuselage Helpers ─── */
function readFuseSections() {
  for (let i = 0; i < 6; i++) {
    state.fuseSections[i].t = parseFloat($('sec_' + i + '_pos').value);
    state.fuseSections[i].w = parseFloat($('sec_' + i + '_w').value);
    state.fuseSections[i].h = parseFloat($('sec_' + i + '_h').value);
  }
}

function updateSectionDisplays() {
  for (let i = 0; i < 6; i++) {
    $('sec_' + i + '_pos_inp').value = parseFloat($('sec_' + i + '_pos').value).toFixed(3);
    $('sec_' + i + '_w_inp').value = parseFloat($('sec_' + i + '_w').value).toFixed(3);
    $('sec_' + i + '_h_inp').value = parseFloat($('sec_' + i + '_h').value).toFixed(3);
  }
}

function updateFuseFromSliders() {
  readFuseSections();
  updateSectionDisplays();
  if (state.geometry) {
    const len = state.fuseSections[5].t;
    const maxW = Math.max(...state.fuseSections.map(s => s.w));
    state.geometry.fuselage_length = len;
    state.geometry.fuselage_max_width = maxW;
    state.geometry.fuselage_max_height = maxW;
    state.geometry.fuse_type = 'manual';
    state.geometry.fuse_sections = state.fuseSections.map(s => ({ ...s }));
    updateFuseViewer(state.geometry, state.airfoilCoords);
  }
}

/* ─── Init ─── */
async function init() {
  await loadAirfoils();
  setupDarkMode();
  setupSaveLoad();
  setupEventListeners();
  applyDarkMode();
  checkSavedProject();
  setupSidebar();
}

async function loadAirfoils() {
  const data = await fetchAPI('/api/airfoils');
  const opts = data.map(a =>
    `<option value="${a.code}">${a.name} (t=${(a.max_thickness * 100).toFixed(0)}%)</option>`
  ).join('');
  $('airfoil').innerHTML = opts;
  $('htailAirfoil').innerHTML = opts;
  $('htailAirfoil').value = '0012';
  $('vtailAirfoil').innerHTML = opts;
  $('vtailAirfoil').value = '0012';
}

function setupDarkMode() {
  $('darkToggle').addEventListener('click', () => {
    state.darkMode = !state.darkMode;
    setCookie('zeta-dark', state.darkMode, 365);
    applyDarkMode();
  });
}

function applyDarkMode() {
  document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
  const icon = $('darkToggle').querySelector('i');
  if (icon) icon.className = state.darkMode ? 'ph ph-sun' : 'ph ph-moon';
  if (typeof updateViewerTheme === 'function') updateViewerTheme();
}

function setupSaveLoad() {
  $('saveBtn')?.addEventListener('click', saveProject);
  $('loadBtn')?.addEventListener('click', loadProject);
}

function checkSavedProject() {
  try {
    const saved = getCookie('zeta-project');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.wingspan) {
        $('wingspan').value = data.wingspan;
        $('weight').value = data.weight;
        $('airfoil').value = data.airfoil_code || '2412';
        $('htailAirfoil').value = data.tail_airfoil_code || '0012';
        const ws = document.querySelector(`input[name="wing_shape"][value="${data.wing_shape || 'tapered'}"]`);
        if (ws) ws.checked = true;
        const wp = document.querySelector(`input[name="wing_pos"][value="${data.wing_position || 'mid'}"]`);
        if (wp) wp.checked = true;
        const tt = document.querySelector(`input[name="tail_type"][value="${data.tail_type || 'conventional'}"]`);
        if (tt) tt.checked = true;
        if (data.reynolds) $('reynolds').value = data.reynolds;
        if (data.cg_percent) { $('cgSlider').value = data.cg_percent; updateCGDisplay(); }
        if (data.max_alpha) $('maxAlpha').value = data.max_alpha;

        if (data.fuse_type && data.man_fuse_sections) {
          state.fuseType = 'manual';
          state.fuseSections = data.man_fuse_sections;
          for (let i = 0; i < 6; i++) {
            $('sec_' + i + '_pos').value = state.fuseSections[i].t;
            $('sec_' + i + '_w').value = state.fuseSections[i].w;
            $('sec_' + i + '_h').value = state.fuseSections[i].h;
          }
          updateSectionDisplays();
        }
      }
    }
  } catch (e) { }
}

function saveProject() {
  const data = {
    wingspan: $('wingspan').value,
    weight: $('weight').value,
    airfoil_code: $('airfoil').value,
    tail_airfoil_code: $('htailAirfoil').value,
    wing_shape: document.querySelector('input[name="wing_shape"]:checked')?.value || 'tapered',
    wing_position: document.querySelector('input[name="wing_pos"]:checked')?.value || 'mid',
    tail_type: document.querySelector('input[name="tail_type"]:checked')?.value || 'conventional',
    fuse_type: state.fuseType,
    man_fuse_sections: state.fuseSections.map(s => ({ ...s })),
    reynolds: parseInt($('reynolds').value) || 200000,
    cg_percent: parseInt($('cgSlider').value) || 25,
    max_alpha: parseInt($('maxAlpha').value) || 20,
  };
  setCookie('zeta-project', JSON.stringify(data), 365);
  const sb = $('saveBtn');
  if (sb) { sb.textContent = '✅'; setTimeout(() => { sb.textContent = '💾'; }, 1500); }
}

function loadProject() {
  try {
    const saved = getCookie('zeta-project');
    if (saved) {
      checkSavedProject();
      const lb = $('loadBtn');
      if (lb) { lb.textContent = '✅'; setTimeout(() => { lb.textContent = '📂'; }, 1500); }
    }
  } catch (e) { alert('Kayıtlı proje bulunamadı.'); }
}

function updateCGDisplay() {
  const val = $('cgSlider').value;
  $('cgValue').textContent = val;
}

function setupEventListeners() {
  $('calculateBtn').addEventListener('click', calculateAll);
  $('cgSlider').addEventListener('input', updateCGDisplay);
  $('viewX').addEventListener('click', () => viewerSetView('x'));
  $('viewY').addEventListener('click', () => viewerSetView('y'));
  $('viewZ').addEventListener('click', () => viewerSetView('z'));
  $('viewAutoRotate').addEventListener('click', () => {
    $('viewAutoRotate').classList.toggle('active');
    viewerToggleRotate();
  });
  $('viewReset').addEventListener('click', () => viewerReset());
  $('stlWing').addEventListener('click', () => exportSTL('wing'));
  $('stlTail').addEventListener('click', () => exportSTL('tail'));
  $('stlFuseConv').addEventListener('click', () => exportFuselageSTL('conventional'));
  $('stlFuseManual').addEventListener('click', () => exportFuselageSTL('manual'));
  $('stlFuseConvSliced').addEventListener('click', () => exportSlicedFuselage('conventional'));
  $('stlFuseManualSliced').addEventListener('click', () => exportSlicedFuselage('manual'));
  $('stlWingSliced').addEventListener('click', exportSlicedWing);
  $('stlTailSliced').addEventListener('click', exportSlicedTail);

  $('toggleFuse').addEventListener('click', toggleFuselage);

  function setMode(mode) {
    $('autoMode').classList.toggle('active', mode === 'auto');
    $('manualMode').classList.toggle('active', mode === 'manual');
    $('manual-inputs').style.display = mode === 'manual' ? '' : 'none';
  }
  $('autoMode').addEventListener('click', () => setMode('auto'));
  $('manualMode').addEventListener('click', () => setMode('manual'));

  state.fuseType = 'manual';

  for (let i = 0; i < 6; i++) {
    $('sec_' + i + '_pos').addEventListener('input', updateFuseFromSliders);
    $('sec_' + i + '_w').addEventListener('input', updateFuseFromSliders);
    $('sec_' + i + '_h').addEventListener('input', updateFuseFromSliders);
  }

  function makeSync(sliderId, inputId) {
    return () => {
      const val = parseFloat($(inputId).value);
      const slider = $(sliderId);
      if (!isNaN(val)) {
        const clamped = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), val));
        slider.value = clamped;
        updateFuseFromSliders();
      }
    };
  }
  for (let i = 0; i < 6; i++) {
    $('sec_' + i + '_pos_inp').addEventListener('input', makeSync('sec_' + i + '_pos', 'sec_' + i + '_pos_inp'));
    $('sec_' + i + '_w_inp').addEventListener('input', makeSync('sec_' + i + '_w', 'sec_' + i + '_w_inp'));
    $('sec_' + i + '_h_inp').addEventListener('input', makeSync('sec_' + i + '_h', 'sec_' + i + '_h_inp'));
  }
}

async function calculateAll() {
  const btn = $('calculateBtn');
  showLoading(btn);

  const wingspan = parseFloat($('wingspan').value);
  const weight = parseFloat($('weight').value);
  const airfoil_code = $('airfoil').value;
  const htail_airfoil = $('htailAirfoil').value;
  const vtail_airfoil = $('vtailAirfoil').value;
  const wing_position = document.querySelector('input[name="wing_pos"]:checked')?.value || 'mid';
  const wing_shape = document.querySelector('input[name="wing_shape"]:checked')?.value || 'tapered';
  const tail_type = document.querySelector('input[name="tail_type"]:checked')?.value || 'conventional';
  const fuse_type = document.querySelector('input[name="fuse_type"]:checked')?.value || 'conventional';
  const cg_percent = parseInt($('cgSlider').value) || 25;
  const max_alpha = parseInt($('maxAlpha').value) || 20;

  if (!wingspan || !weight || wingspan <= 0 || weight <= 0) {
    alert('Lütfen geçerli bir kanat açıklığı ve ağırlık girin.');
    hideLoading(btn);
    return;
  }

  try {
    state.airfoilCode = airfoil_code;

    const airfoilId = await getAirfoilId(airfoil_code);
    const airfoilData = await fetchAPI(`/api/airfoil/${airfoilId}`);
    state.airfoilCoords = airfoilData.coordinates;

    const htailId = await getAirfoilId(htail_airfoil);
    const htailData = await fetchAPI(`/api/airfoil/${htailId}`);
    state.tailCoords = htailData.coordinates;

    const vtailId = await getAirfoilId(vtail_airfoil);
    const vtailData = await fetchAPI(`/api/airfoil/${vtailId}`);
    state.vtailCoords = vtailData.coordinates;

    const manual_mode = $('manual-inputs').style.display !== 'none';
    const body = {
      wingspan, weight, airfoil_code, wing_shape, wing_position, tail_type, manual_mode,
      fuse_type,
    };
    if (manual_mode) {
      body.man_root_chord = parseFloat($('man_root_chord').value) || undefined;
      body.man_tip_chord = parseFloat($('man_tip_chord').value) || undefined;
      body.man_sweep = parseFloat($('man_sweep').value) || undefined;
      body.man_dihedral = parseFloat($('man_dihedral').value) || undefined;
      body.man_htail_span = parseFloat($('man_htail_span').value) || undefined;
      body.man_htail_root = parseFloat($('man_htail_root').value) || undefined;
      body.man_htail_tip = parseFloat($('man_htail_tip').value) || undefined;
      body.man_htail_sweep = parseFloat($('man_htail_sweep').value) || undefined;
      body.man_vtail_span = parseFloat($('man_vtail_span').value) || undefined;
      body.man_vtail_root = parseFloat($('man_vtail_root').value) || undefined;
      body.man_vtail_tip = parseFloat($('man_vtail_tip').value) || undefined;
    }
    state.wallThickness = parseFloat($('wallThickness').value) || 0;
    const reynolds_number = parseInt($('reynolds').value) || 200000;
    body.cg_percent = cg_percent;
    state.geometry = await fetchAPI('/api/calculate', body);
    state.polars = await fetchAPI('/api/analyze', {
      geometry: state.geometry, airfoil_code, reynolds_number, max_alpha
    });

    state.stability = await fetchAPI('/api/stability', {
      geometry: state.geometry, airfoil_code, tail_airfoil_code: htail_airfoil, reynolds_number
    });

    saveProject();

    displayResults(state.geometry);
    displayFlightTest(state.stability);
    displayCharts(state.polars);

    // Enable sidebar tabs
    enableTab('results');
    enableTab('viewer');
    enableTab('fuse');
    enableTab('charts');
    enableTab('flight');
    enableTab('stl');

    readFuseSections();
    if (fuse_type === 'manual') {
      state.geometry.fuse_type = 'manual';
      state.geometry.fuse_sections = state.fuseSections.map(s => ({ ...s }));
      const flen = state.fuseSections[5].t;
      const fmaxW = Math.max(...state.fuseSections.map(s => s.w));
      state.geometry.fuselage_length = flen;
      state.geometry.fuselage_max_width = fmaxW;
      state.geometry.fuselage_max_height = fmaxW;
    } else {
      state.geometry.fuse_type = 'conventional';
    }
    switchTab('viewer');
    initViewer(state.geometry, state.airfoilCoords, state.tailCoords, state.vtailCoords, airfoil_code, tail_type);
    // Set up manual fuse geometry for Gövde viewer tab (always uses keyframe preview)
    state.geometry.fuse_sections = state.fuseSections.map(s => ({ ...s }));
    state.geometry.fuse_type = 'manual';
    const fuseLen = state.fuseSections[5].t;
    const fuseMaxW = Math.max(...state.fuseSections.map(s => s.w));
    state.geometry.fuselage_length = fuseLen;
    state.geometry.fuselage_max_width = fuseMaxW;
    state.geometry.fuselage_max_height = fuseMaxW;
    initFuseViewer(state.geometry, state.airfoilCoords, state.tailCoords, state.vtailCoords, tail_type);
    hideLoading(btn);

    switchTab('results');

  } catch (err) {
    alert('Hesaplama sırasında bir hata oluştu: ' + err.message);
    hideLoading(btn);
  }
}

async function getAirfoilId(code) {
  const data = await fetchAPI('/api/airfoils');
  const found = data.find(a => a.code === code);
  return found ? found.id : 1;
}

function displayResults(geom) {
  const items = [
    { label: 'Kanat Açıklığı', value: geom.wingspan + ' m', key: '' },
    { label: 'Kök Veter', value: geom.root_chord + ' m', key: 'root_chord' },
    { label: 'Uç Veter', value: geom.tip_chord + ' m', key: 'tip_chord' },
    { label: 'MAC', value: geom.mac + ' m', key: 'mac' },
    { label: 'Kanat Alanı', value: geom.wing_area + ' m²', key: 'wing_area' },
    { label: 'Açıklık Oranı (AR)', value: geom.aspect_ratio, key: 'aspect_ratio' },
    { label: 'Daralma Oranı', value: geom.taper_ratio, key: 'taper_ratio' },
    { label: 'Ok Açısı', value: geom.sweep_angle + '°', key: 'sweep_angle' },
    { label: 'Dihedral', value: geom.dihedral_angle + '°', key: 'dihedral_angle' },
    { label: 'Kanat Konumu', value: geom.wing_position === 'low' ? 'Alçak' : geom.wing_position === 'high' ? 'Yüksek' : 'Orta', key: '' },
    { label: 'Kanat X Pozisyonu', value: geom.wing_x_pos + ' m', key: '' },
    { label: 'Gövde Uzunluğu', value: geom.fuselage_length + ' m', key: 'fuselage_length' },
    { label: 'Gövde Genişliği', value: geom.fuselage_max_width + ' m', key: 'fuselage_max_width' },
    { label: 'Gövde Yüksekliği', value: geom.fuselage_max_height + ' m', key: 'fuselage_max_height' },
    { label: 'Yatay Kuyruk Açıklığı', value: geom.htail_span + ' m', key: 'htail_span' },
    { label: 'Yatay Kuyruk Kök Veteri', value: geom.htail_chord + ' m', key: '' },
    { label: 'Yatay Kuyruk Uç Veteri', value: (geom.htail_tip_chord || 0).toFixed(3) + ' m', key: '' },
    { label: 'Yatay Kuyruk Daralması', value: geom.htail_taper, key: '' },
    { label: 'Yatay Kuyruk Alanı', value: geom.htail_area + ' m²', key: '' },
    { label: 'Kuyruk Kolu (Arm)', value: geom.htail_arm + ' m', key: '' },
    { label: 'Kuyruk X Pozisyonu', value: geom.tail_x_pos + ' m', key: '' },
    { label: 'Dikey Kuyruk Açıklığı', value: geom.vtail_span + ' m', key: 'vtail_span' },
    { label: 'Dikey Kuyruk Kök Veteri', value: geom.vtail_chord + ' m', key: '' },
    { label: 'Dikey Kuyruk Uç Veteri', value: (geom.vtail_tip_chord || 0).toFixed(3) + ' m', key: '' },
    { label: 'Dikey Kuyruk Daralması', value: geom.vtail_taper, key: '' },
    { label: 'Dikey Kuyruk Alanı', value: geom.vtail_area + ' m²', key: '' },
    { label: 'CG Pozisyonu', value: geom.cg_position + ' m', key: 'cg_position' },
    { label: 'Kanat Yüklemesi', value: (geom.weight / geom.wing_area).toFixed(2) + ' kg/m²', key: '' },
    { label: 'Kuyruk Tipi', value: geom.tail_type === 'ttail' ? 'T-tail' : geom.tail_type === 'vtail' ? 'V-tail' : 'Konvansiyonel', key: '' },
  ];

  const cs = geom.control_surfaces;
  if (cs) {
    items.push(
      { label: 'Aileron Alanı', value: cs.aileron.area + ' m²', key: '' },
      { label: 'Flap Alanı', value: cs.flap.area + ' m²', key: '' },
      { label: 'Elevator Alanı', value: cs.elevator.area + ' m²', key: '' },
      { label: 'Rudder Alanı', value: cs.rudder.area + ' m²', key: '' },
    );
  }

  $('results-grid').innerHTML = items.map(item =>
    `<div class="result-item">
      <div class="value">${escapeHtml(String(item.value))}</div>
      <div class="label">${escapeHtml(item.label)}</div>
    </div>`
  ).join('');
}

function displayFlightTest(stab) {
  const items = [
    { label: 'Stall Hızı', value: stab.stall_speed + ' m/s', cls: stab.stall_speed < 12 ? 'pass' : 'warn', icon: '<i class="ph ph-speedometer"></i>', pct: Math.min(100, (stab.stall_speed / 20) * 100) },
    { label: 'Seyir Hızı', value: stab.cruise_speed + ' m/s', cls: 'pass', icon: '<i class="ph ph-airplane-in-flight"></i>', pct: Math.min(100, (stab.cruise_speed / 30) * 100) },
    { label: 'Tırmanma Oranı', value: stab.climb_rate + ' m/s', cls: stab.climb_rate > 2 ? 'pass' : 'warn', icon: '<i class="ph ph-arrow-up"></i>', pct: Math.min(100, (stab.climb_rate / 6) * 100) },
    { label: 'Static Margin', value: '%' + stab.static_margin, cls: stab.static_margin >= 5 ? 'pass' : 'fail', icon: '<i class="ph ph-scales"></i>', pct: Math.min(100, (stab.static_margin / 15) * 100) },
    { label: 'CL Maks', value: stab.cl_max, cls: 'pass', icon: '<i class="ph ph-chart-bar"></i>', pct: Math.min(100, (stab.cl_max / 2.5) * 100) },
    { label: 'Seyir CD (total)', value: stab.cd_cruise, cls: 'pass', icon: '<i class="ph ph-trend-down"></i>', pct: Math.min(100, (1 - stab.cd_cruise / 0.1) * 100) },
    { label: 'Reynolds (Re)', value: (stab.Reynolds || '').toLocaleString(), cls: 'pass', icon: '<i class="ph ph-atom"></i>', pct: Math.min(100, ((stab.Reynolds || 0) / 500000) * 100) },
  ];

  const assessments = stab.assessments || [];
  const verdict = stab.overall_passed ? '<i class="ph ph-check-circle"></i> UÇABİLİR' : '<i class="ph ph-x-circle"></i> UÇAMAZ';

  $('flight-results').innerHTML =
    items.map(item =>
      `<div class="flight-item ${item.cls}">
        <div class="flight-item-header">
          <span class="flight-icon">${item.icon}</span>
          <span class="flight-value">${item.value}</span>
        </div>
        <div class="flight-label">${item.label}</div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${item.pct}%"></div>
        </div>
      </div>`
    ).join('') +
    `<div class="flight-assessment">
      <h3>Değerlendirme</h3>
      <ul>${assessments.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
    </div>
    <div class="flight-verdict ${stab.overall_passed ? 'pass' : 'fail'}">${escapeHtml(verdict)}</div>`;
}

window.addEventListener('DOMContentLoaded', init);
