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
const RESULT_TABS = ['results', 'viewer', 'fuse', 'charts', 'flight', 'stl'];

const state = {
  geometry: null,
  polars: null,
  stability: null,
  airfoils: [],
  airfoilCoords: null,
  tailCoords: null,
  vtailCoords: null,
  airfoilCode: '2412',
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

/* ─── Sidebar / Tab System ─── */
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.tab === tabId);
  });
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const active = link.dataset.tab === tabId;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
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

function applyManualFuselage(geom) {
  geom.fuse_type = 'manual';
  geom.fuse_sections = state.fuseSections.map(s => ({ ...s }));
  const maxW = Math.max(...state.fuseSections.map(s => s.w));
  geom.fuselage_length = state.fuseSections[5].t;
  geom.fuselage_max_width = maxW;
  geom.fuselage_max_height = maxW;
}

function updateFuseFromSliders() {
  readFuseSections();
  updateSectionDisplays();
  if (state.geometry) {
    applyManualFuselage(state.geometry);
    updateFuseViewer(state.geometry, state.airfoilCoords);
  }
}

/* ─── Init ─── */
async function init() {
  setupTheme();
  setupSidebar();
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

  if (Array.isArray(data.man_fuse_sections) && data.man_fuse_sections.length === 6) {
    state.fuseSections = data.man_fuse_sections;
    for (let i = 0; i < 6; i++) {
      $('sec_' + i + '_pos').value = state.fuseSections[i].t;
      $('sec_' + i + '_w').value = state.fuseSections[i].w;
      $('sec_' + i + '_h').value = state.fuseSections[i].h;
    }
    updateSectionDisplays();
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
    man_fuse_sections: state.fuseSections.map(s => ({ ...s })),
    reynolds: parseInt($('reynolds').value) || 200000,
    cg_percent: parseInt($('cgSlider').value) || 25,
    max_alpha: parseInt($('maxAlpha').value) || 20,
  }));
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

  for (let i = 0; i < 6; i++) {
    for (const key of ['pos', 'w', 'h']) {
      const slider = $(`sec_${i}_${key}`);
      const input = $(`sec_${i}_${key}_inp`);
      slider.addEventListener('input', updateFuseFromSliders);
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        if (isNaN(val)) return;
        slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), val));
        updateFuseFromSliders();
      });
    }
  }
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

  const body = {
    wingspan, weight, airfoil_code, tail_type, fuse_type, manual_mode,
    wing_shape: radioValue('wing_shape', 'tapered'),
    wing_position: radioValue('wing_pos', 'mid'),
    cg_percent: parseInt($('cgSlider').value) || 25,
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
    [state.polars, state.stability] = await Promise.all([
      fetchAPI('/api/analyze', {
        geometry: state.geometry, airfoil_code, reynolds_number,
        max_alpha: parseInt($('maxAlpha').value) || 20,
      }),
      fetchAPI('/api/stability', {
        geometry: state.geometry, airfoil_code, tail_airfoil_code: htail_airfoil, reynolds_number,
      }),
    ]);

    readFuseSections();
    saveProject();

    displayResults(state.geometry);
    displayFlightTest(state.stability);
    enableResultTabs();

    // 3D sahneler boyutlarını kapsayıcıdan aldığı için sekme görünürken kurulur
    switchTab('viewer');
    if (fuse_type === 'manual') applyManualFuselage(state.geometry);
    else state.geometry.fuse_type = 'conventional';
    initViewer(state.geometry, state.airfoilCoords, state.tailCoords, state.vtailCoords, airfoil_code, tail_type);

    // Gövde sekmesi her zaman kesit (K1–K6) önizlemesini gösterir
    switchTab('fuse');
    applyManualFuselage(state.geometry);
    initFuseViewer(state.geometry, state.airfoilCoords, state.tailCoords, state.vtailCoords, tail_type);

    switchTab('charts');
    displayCharts(state.polars);

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
    ['Gövde ve denge', [
      ['Gövde uzunluğu', geom.fuselage_length, 'm'],
      ['Gövde genişliği', geom.fuselage_max_width, 'm'],
      ['Gövde yüksekliği', geom.fuselage_max_height, 'm'],
      ['CG pozisyonu', geom.cg_position, 'm'],
    ]],
    ['Dikey kuyruk', [
      ['Açıklık', geom.vtail_span, 'm'],
      ['Kök veter', geom.vtail_chord, 'm'],
      ['Uç veter', (geom.vtail_tip_chord || 0).toFixed(3), 'm'],
      ['Daralma oranı', geom.vtail_taper, ''],
      ['Alan', geom.vtail_area, 'm²'],
    ]],
  ];

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
          <span class="flight-value">${escapeHtml(String(item.value))}</span>
        </div>
        <div class="flight-label">${escapeHtml(item.label)}</div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${item.pct}%"></div>
        </div>
      </div>`
    ).join('') +
    `<div class="flight-assessment">
      <h3>Değerlendirme</h3>
      <ul>${assessments.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
    </div>
    <div class="flight-verdict ${stab.overall_passed ? 'pass' : 'fail'}">${verdict}</div>`;
}

window.addEventListener('DOMContentLoaded', init);
