/* ─── Kalıcı ayarlar (localStorage) ─── */
const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* gizli sekme vb. */ }
  },
};

const MANUAL_FIELDS = [
  'root_chord', 'tip_chord', 'sweep', 'dihedral',
  'htail_span', 'htail_root', 'htail_tip', 'htail_sweep',
  'vtail_span', 'vtail_root', 'vtail_tip',
];
// Varsayılan gövde biçimi: uzunluğa ve azami en/boya oranlı altı kesit
const FUSE_DEFAULT_SHAPE = [
  { t: 0.000, w: 0.143, h: 0.111 },
  { t: 0.125, w: 0.571, h: 0.667 },
  { t: 0.375, w: 1.000, h: 1.000 },
  { t: 0.750, w: 0.429, h: 0.444 },
  { t: 0.917, w: 0.100, h: 0.100 },
  { t: 1.000, w: 0.057, h: 0.044 },
];
const RESULT_TABS = ['results', 'viewer', 'fuse', 'charts', 'flight', 'mission', 'stl'];
// Değeri olduğu gibi saklanıp geri yüklenen görev/güç alanları
const MISSION_FIELDS = ['motorPower', 'batteryWh', 'avionicsPower', 'nLimit', 'targetEndurance', 'targetTurnRate', 'targetStall'];
// Bataryadan itkiye toplam verim (ESC · motor · pervane) için tipik değer
const PROP_EFFICIENCY = 0.6;

const state = {
  geometry: null,
  polars: null,
  stability: null,
  mission: null,
  airfoils: [],
  airfoilCoords: null,
  tailCoords: null,
  vtailCoords: null,
  airfoilCode: '2412',
  wallThickness: 1.2,
  // Özgün gövde kesitleri, metre cinsinden (t: burundan uzaklık, w: genişlik, h: yükseklik)
  fuseSections: scaleFuseShape(1.2, 0.14, 0.14),
  // Kullanıcı kesitlere dokunana kadar her hesaplamada otomatik gövde ölçülerine uydurulur
  fuseSectionsEdited: false,
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

/* ─── Sidebar / Tab System ─── */
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.tab === tabId);
  });
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const active = link.dataset.tab === tabId;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
      link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (!active) link.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  // Gizliyken 0×0 ölçülen 3D sahneler görünür olunca yeniden boyutlansın
  window.dispatchEvent(new Event('resize'));
  if (tabId === 'fuse' && typeof fitFuseViewerToModel === 'function') {
    fitFuseViewerToModel();
  }
}

function enableResultTabs() {
  for (const tab of RESULT_TABS) {
    document.querySelector(`.sidebar-link[data-tab="${tab}"]`).disabled = false;
  }
  $('navHint').hidden = true;
}

function setupSidebar() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => switchTab(link.dataset.tab));
  });
}

/* ─── Fuselage Helpers ─── */
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
      <legend><span class="num">K${i + 1}</span> ${FUSE_SECTION_NAMES[i]}</legend>
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
        syncFuseControls();
        updateFuselageViews();
      };
      slider.addEventListener('input', () => onChange(parseFloat(slider.value)));
      input.addEventListener('change', () => onChange(parseFloat(input.value)));
    }
  });
  syncFuseControls();
}

// state.fuseSections → kaydırıcı ve sayı alanları. Kaydırıcı aralığı gövde boyutuna göre ayarlanır.
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
      // Sürükleme sırasında aralık değişirse kaydırıcı elin altından kayar
      if (document.activeElement !== slider) slider.max = range[prop];
      slider.value = sec[prop];
      const input = $(`sec_${i}_${key}_inp`);
      if (document.activeElement !== input) input.value = sec[prop].toFixed(3);
    }
  });
}

function updateFuselageViews() {
  const geom = state.geometry;
  if (!geom) return;
  geom.fuse_sections = state.fuseSections.map(s => ({ ...s }));
  updateFuseViewer(geom, state.airfoilCoords);
  if (geom.fuse_type === 'manual' && typeof rebuildFuselage === 'function' && fuseGroup) {
    rebuildFuselage(geom, state.airfoilCoords);
  }
  displayResults(geom);
  saveProject();
}

/* ─── Init ─── */
async function init() {
  setupTheme();
  setupSidebar();
  renderFuseControls();
  setupEventListeners();
  loadVersion();
  try {
    await loadAirfoils();
  } catch (err) {
    showFormError('Airfoil listesi yüklenemedi. Sunucunun çalıştığından emin olup sayfayı yenileyin.');
    return;
  }
  restoreProject();
}

async function loadVersion() {
  try {
    const { version } = await fetchAPI('/api/version');
    $('appVersion').textContent = 'v' + version;
  } catch (e) { /* sürüm etiketi zorunlu değil */ }
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

async function fetchAirfoilCoords(code) {
  const found = state.airfoils.find(a => a.code === code) || state.airfoils[0];
  const data = await fetchAPI(`/api/airfoil/${found.id}`);
  return data.coordinates;
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
  if (typeof updateViewerTheme === 'function') updateViewerTheme();
  // Chart.js renkleri oluşturulurken okuduğu için grafikler yeniden çizilir
  if (state.polars) displayCharts(state.polars);
  if (state.mission) displayMissionCharts(state.mission);
}

/* ─── Proje kaydı ─── */
function restoreProject() {
  let data;
  try { data = JSON.parse(store.get('zeta-project')); } catch (e) { return; }
  if (!data || !data.wingspan) return;

  $('wingspan').value = data.wingspan;
  $('weight').value = data.weight;
  if (data.airfoil_code) $('airfoil').value = data.airfoil_code;
  if (data.tail_airfoil_code) $('htailAirfoil').value = data.tail_airfoil_code;
  if (data.vtail_airfoil_code) $('vtailAirfoil').value = data.vtail_airfoil_code;
  setRadio('wing_shape', data.wing_shape);
  setRadio('wing_pos', data.wing_position);
  setRadio('tail_type', data.tail_type);
  setRadio('fuse_type', data.fuse_type);
  if (data.reynolds) $('reynolds').value = data.reynolds;
  if (data.cg_percent) { $('cgSlider').value = data.cg_percent; updateCGDisplay(); }
  if (data.max_alpha) $('maxAlpha').value = data.max_alpha;
  setRadio('mission_profile', data.mission_profile);
  for (const id of MISSION_FIELDS) {
    if (data.mission?.[id] != null) $(id).value = data.mission[id];
  }
  updateMissionProfile();

  if (Array.isArray(data.fuse_sections_m) && data.fuse_sections_m.length === 6) {
    state.fuseSections = data.fuse_sections_m;
    state.fuseSectionsEdited = true;
    syncFuseControls();
  }
}

function saveProject() {
  store.set('zeta-project', JSON.stringify({
    wingspan: $('wingspan').value,
    weight: $('weight').value,
    airfoil_code: $('airfoil').value,
    tail_airfoil_code: $('htailAirfoil').value,
    vtail_airfoil_code: $('vtailAirfoil').value,
    wing_shape: radioValue('wing_shape', 'tapered'),
    wing_position: radioValue('wing_pos', 'mid'),
    tail_type: radioValue('tail_type', 'conventional'),
    fuse_type: radioValue('fuse_type', 'conventional'),
    fuse_sections_m: state.fuseSectionsEdited ? state.fuseSections : undefined,
    reynolds: parseInt($('reynolds').value) || 200000,
    cg_percent: parseInt($('cgSlider').value) || 25,
    max_alpha: parseInt($('maxAlpha').value) || 20,
    mission_profile: radioValue('mission_profile', 'general'),
    mission: Object.fromEntries(MISSION_FIELDS.map(id => [id, $(id).value])),
  }));
}

function updateMissionProfile() {
  $('competition-inputs').hidden = radioValue('mission_profile', 'general') !== 'competition';
}

// Tipik bir yarışma İHA'sı için başlangıç değerleri (6S 10 Ah ≈ 222 Wh)
function loadCompetitionPreset() {
  const values = { wingspan: 2.0, weight: 5.0, motorPower: 1200, batteryWh: 222, avionicsPower: 30, nLimit: 4 };
  for (const [id, value] of Object.entries(values)) $(id).value = value;
}

function updateCGDisplay() {
  $('cgValue').textContent = $('cgSlider').value;
}

function setupEventListeners() {
  $('paramForm').addEventListener('submit', (e) => { e.preventDefault(); calculateAll(); });
  $('cgSlider').addEventListener('input', updateCGDisplay);
  document.querySelectorAll('input[name="mode"]').forEach(input => {
    input.addEventListener('change', () => {
      $('manual-inputs').hidden = radioValue('mode') !== 'manual';
    });
  });

  document.querySelectorAll('input[name="mission_profile"]').forEach(input => {
    input.addEventListener('change', updateMissionProfile);
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
  $('stlFuseManual').addEventListener('click', () => exportFuselageSTL('manual'));
  $('stlFuseConvSliced').addEventListener('click', () => exportSlicedFuselage('conventional'));
  $('stlFuseManualSliced').addEventListener('click', () => exportSlicedFuselage('manual'));
  $('stlWingSliced').addEventListener('click', exportSlicedWing);
  $('stlTailSliced').addEventListener('click', exportSlicedTail);
  $('wallThickness').addEventListener('input', () => {
    state.wallThickness = parseFloat($('wallThickness').value) || 0;
  });

}

async function calculateAll() {
  const btn = $('calculateBtn');
  showFormError('');

  const wingspan = parseFloat($('wingspan').value);
  const weight = parseFloat($('weight').value);
  if (!(wingspan > 0) || !(weight > 0)) {
    showFormError('Kanat açıklığı ve ağırlık sıfırdan büyük olmalı.');
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
  const battery_wh = parseFloat($('batteryWh').value);
  if (!(motor_power > 0) || !(battery_wh > 0)) {
    showFormError('Motor gücü ve batarya enerjisi sıfırdan büyük olmalı.');
    return;
  }
  const competition = radioValue('mission_profile', 'general') === 'competition';

  const body = {
    wingspan, weight, airfoil_code, tail_type, fuse_type, manual_mode,
    wing_shape: radioValue('wing_shape', 'tapered'),
    wing_position: radioValue('wing_pos', 'mid'),
    cg_percent: parseInt($('cgSlider').value) || 25,
    // Yarışma profili ayrı bir gövde yerleşimi kullanır (çift bom, itici pervane)
    airframe: competition ? 'combat' : 'standard',
  };
  if (manual_mode) {
    for (const f of MANUAL_FIELDS) {
      body['man_' + f] = parseFloat($('man_' + f).value) || undefined;
    }
  }

  setBusy(btn, true);
  try {
    state.airfoilCode = airfoil_code;
    state.wallThickness = parseFloat($('wallThickness').value) || 0;
    [state.airfoilCoords, state.tailCoords, state.vtailCoords] = await Promise.all(
      [airfoil_code, htail_airfoil, vtail_airfoil].map(fetchAirfoilCoords)
    );

    state.geometry = await fetchAPI('/api/calculate', body);
    [state.polars, state.stability, state.mission] = await Promise.all([
      fetchAPI('/api/analyze', {
        geometry: state.geometry, airfoil_code, reynolds_number,
        max_alpha: parseInt($('maxAlpha').value) || 20,
      }),
      fetchAPI('/api/stability', {
        geometry: state.geometry, airfoil_code, tail_airfoil_code: htail_airfoil, reynolds_number,
        motor_power, prop_efficiency: PROP_EFFICIENCY,
      }),
      fetchAPI('/api/mission', {
        geometry: state.geometry, airfoil_code, reynolds_number,
        motor_power, battery_wh, prop_efficiency: PROP_EFFICIENCY,
        avionics_power: parseFloat($('avionicsPower').value) || 0,
        n_limit: parseFloat($('nLimit').value) || 4,
        targets: competition ? {
          endurance_min: parseFloat($('targetEndurance').value) || undefined,
          turn_rate_deg: parseFloat($('targetTurnRate').value) || undefined,
          stall_speed: parseFloat($('targetStall').value) || undefined,
        } : undefined,
      }),
    ]);

    if (!state.fuseSectionsEdited) {
      const g = state.geometry;
      state.fuseSections = scaleFuseShape(g.fuselage_length, g.fuselage_max_width, g.fuselage_max_height);
      syncFuseControls();
    }
    state.geometry.fuse_type = fuse_type;
    state.geometry.fuse_sections = state.fuseSections.map(s => ({ ...s }));
    saveProject();

    displayResults(state.geometry);
    displayFlightTest(state.stability);
    displayMission(state.mission);
    enableResultTabs();

    // 3D sahneler boyutlarını kapsayıcıdan aldığı için sekme görünürken kurulur
    switchTab('viewer');
    initViewer(state.geometry, state.airfoilCoords, state.tailCoords, state.vtailCoords, airfoil_code, tail_type);

    // Gövde sekmesi her zaman kesit (K1–K6) önizlemesini gösterir
    switchTab('fuse');
    initFuseViewer(state.geometry, state.airfoilCoords, state.tailCoords, state.vtailCoords, tail_type);

    switchTab('charts');
    displayCharts(state.polars);
    switchTab('mission');
    displayMissionCharts(state.mission);

    switchTab('results');
  } catch (err) {
    showFormError('Hesaplama sırasında bir hata oluştu: ' + err.message);
  } finally {
    setBusy(btn, false);
  }
}

const WING_POSITION_LABELS = { low: 'Alçak', mid: 'Orta', high: 'Yüksek' };
const TAIL_TYPE_LABELS = { conventional: 'Konvansiyonel', ttail: 'T-tail', vtail: 'V-tail' };

function displayResults(geom) {
  const manualFuse = geom.fuse_type === 'manual' && geom.fuse_sections;
  const fuse = manualFuse ? {
    length: Math.max(...geom.fuse_sections.map(s => s.t)),
    width: Math.max(...geom.fuse_sections.map(s => s.w)),
    height: Math.max(...geom.fuse_sections.map(s => s.h)),
  } : {
    length: geom.fuselage_length, width: geom.fuselage_max_width, height: geom.fuselage_max_height,
  };

  const summary = [
    ['Kanat alanı', geom.wing_area, 'm²'],
    ['Açıklık oranı', geom.aspect_ratio, ''],
    ['MAC', geom.mac, 'm'],
    ['Kanat yüklemesi', (geom.weight / geom.wing_area).toFixed(2), 'kg/m²'],
  ];

  const groups = [
    ['Kanat', [
      ['Açıklık', geom.wingspan, 'm'],
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
      ['Kuyruk kolu', geom.htail_arm, 'm'],
      ['X pozisyonu', geom.tail_x_pos, 'm'],
      ['Kuyruk tipi', TAIL_TYPE_LABELS[geom.tail_type] || 'Konvansiyonel', ''],
    ]],
    [manualFuse ? 'Gövde (özgün) ve denge' : 'Gövde ve denge', [
      ['Gövde uzunluğu', fuse.length, 'm'],
      ['Gövde genişliği', fuse.width, 'm'],
      ['Gövde yüksekliği', fuse.height, 'm'],
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

  if (geom.tail_booms) {
    groups.push(['Kuyruk bomları (karbon boru, 2 adet)', [
      ['Uzunluk', geom.tail_booms.length, 'm'],
      ['Çap', geom.tail_booms.diameter, 'm'],
      ['Merkezden uzaklık', geom.tail_booms.y, 'm'],
    ]]);
  }

  const cs = geom.control_surfaces;
  if (cs) {
    groups.push(['Kontrol yüzeyi alanları', [
      ['Aileron', cs.aileron.area, 'm²'],
      ['Flap', cs.flap.area, 'm²'],
      ['Elevator', cs.elevator.area, 'm²'],
      ['Rudder', cs.rudder.area, 'm²'],
    ]]);
  }

  const unitHtml = unit => unit ? ` <span class="unit">${escapeHtml(unit)}</span>` : '';

  $('results-summary').innerHTML = summary.map(([label, value, unit]) =>
    `<div class="stat">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value num">${escapeHtml(String(value))}${unitHtml(unit)}</div>
    </div>`
  ).join('');

  $('results-grid').innerHTML = groups.map(([title, rows]) =>
    `<section class="spec-group">
      <h3>${escapeHtml(title)}</h3>
      <dl>${rows.map(([label, value, unit]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd class="num">${escapeHtml(String(value))}${unitHtml(unit)}</dd></div>`
      ).join('')}</dl>
    </section>`
  ).join('');
}

const STATUS = {
  pass: { label: 'Uygun', icon: 'ph-check-circle' },
  warn: { label: 'Sınırda', icon: 'ph-warning' },
  fail: { label: 'Yetersiz', icon: 'ph-x-circle' },
};
// Sınırlar backend/stability.py ile aynı olmalı
const FLIGHT_CHECKS = {
  stall_speed: { label: 'Stall hızı', unit: 'm/s', limit: '< 15 m/s' },
  climb_rate: { label: 'Tırmanma oranı', unit: 'm/s', limit: '> 0 m/s' },
  static_margin: { label: 'Statik marj', unit: '% MAC', limit: '%5 – %20 arası ideal' },
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
        <strong>${passed ? 'Uçabilir' : 'Uçamaz'}</strong>
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
    const failed = m.checks.filter(c => c.status === 'fail').length;
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
