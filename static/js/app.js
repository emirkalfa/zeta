const state = {
  geometry: null,
  polars: null,
  stability: null,
  airfoilCoords: null,
  tailCoords: null,
  vtailCoords: null,
  airfoilCode: '2412',
  darkMode: localStorage.getItem('zeta-dark') === 'true',
  wallThickness: 1.2,
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

function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }

function showLoading(btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Hesaplanıyor...';
}

function hideLoading(btn, text) {
  btn.disabled = false;
  btn.innerHTML = text || 'HESAPLA';
}

async function init() {
  await loadAirfoils();
  setupDarkMode();
  setupSaveLoad();
  setupEventListeners();
  applyDarkMode();
  checkSavedProject();
}

async function loadAirfoils() {
  const data = await fetchAPI('/api/airfoils');
  const opts = data.map(a =>
    `<option value="${escapeHtml(a.code)}">${escapeHtml(a.name)} (t=${(a.max_thickness*100).toFixed(0)}%)</option>`
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
    localStorage.setItem('zeta-dark', state.darkMode);
    applyDarkMode();
  });
}

function applyDarkMode() {
  document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
  $('darkToggle').textContent = state.darkMode ? '☀️' : '🌙';
}

function setupSaveLoad() {
  $('saveBtn')?.addEventListener('click', saveProject);
  $('loadBtn')?.addEventListener('click', loadProject);
}

function checkSavedProject() {
  try {
    const saved = localStorage.getItem('zeta-project');
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

      }
    }
  } catch(e) {}
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

    reynolds: parseInt($('reynolds').value) || 200000,
    cg_percent: parseInt($('cgSlider').value) || 25,
    max_alpha: parseInt($('maxAlpha').value) || 20,
  };
  localStorage.setItem('zeta-project', JSON.stringify(data));
  const sb = $('saveBtn');
  if (sb) { sb.textContent = '✅'; setTimeout(() => { sb.textContent = '💾'; }, 1500); }
}

function loadProject() {
  try {
    const saved = localStorage.getItem('zeta-project');
    if (saved) {
      checkSavedProject();
      const lb = $('loadBtn');
      if (lb) { lb.textContent = '✅'; setTimeout(() => { lb.textContent = '📂'; }, 1500); }
    }
  } catch(e) { alert('Kayıtlı proje bulunamadı.'); }
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
  $('stlWingSliced').addEventListener('click', exportSlicedWing);
  $('stlTailSliced').addEventListener('click', exportSlicedTail);

  // Toggle fuselage visibility
  $('toggleFuse').addEventListener('click', toggleFuselage);

  // Mode selector
  function setMode(mode) {
    $('autoMode').classList.toggle('active', mode === 'auto');
    $('manualMode').classList.toggle('active', mode === 'manual');
    $('manual-inputs').style.display = mode === 'manual' ? '' : 'none';
  }
  $('autoMode').addEventListener('click', () => setMode('auto'));
  $('manualMode').addEventListener('click', () => setMode('manual'));
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
  const cg_percent = parseInt($('cgSlider').value) || 25;
  const max_alpha = parseInt($('maxAlpha').value) || 20;

  if (!wingspan || !weight || wingspan <= 0 || weight <= 0) {
    alert('Lütfen geçerli bir kanat açıklığı ve ağırlık girin.');
    hideLoading(btn);
    return;
  }

  try {
    state.airfoilCode = airfoil_code;

    // Get wing airfoil coordinates
    const airfoilId = await getAirfoilId(airfoil_code);
    const airfoilData = await fetchAPI(`/api/airfoil/${airfoilId}`);
    state.airfoilCoords = airfoilData.coordinates;

    // Get horizontal tail airfoil coordinates
    const htailId = await getAirfoilId(htail_airfoil);
    const htailData = await fetchAPI(`/api/airfoil/${htailId}`);
    state.tailCoords = htailData.coordinates;

    // Get vertical tail airfoil coordinates
    const vtailId = await getAirfoilId(vtail_airfoil);
    const vtailData = await fetchAPI(`/api/airfoil/${vtailId}`);
    state.vtailCoords = vtailData.coordinates;

    // Calculate geometry
    const manual_mode = $('manual-inputs').style.display !== 'none';
    const body = {
      wingspan, weight, airfoil_code, wing_shape, wing_position, tail_type, manual_mode
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

    // Run analysis (uses wing airfoil)
    state.polars = await fetchAPI('/api/analyze', {
      geometry: state.geometry, airfoil_code, reynolds_number, max_alpha
    });

    // Run stability test (uses htail airfoil)
    state.stability = await fetchAPI('/api/stability', {
      geometry: state.geometry, airfoil_code, tail_airfoil_code: htail_airfoil, reynolds_number
    });

    // Save to localStorage
    saveProject();

    // Display everything
    displayResults(state.geometry);
    displayFlightTest(state.stability);
    displayCharts(state.polars);
    show('results-card');
    show('viewer-card');
    show('charts-card');
    show('flight-card');
    show('stl-card');

    initViewer(state.geometry, state.airfoilCoords, state.tailCoords, state.vtailCoords, airfoil_code, tail_type);
    hideLoading(btn);

    // Scroll to results
    $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error(err);
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
    { label: 'Stall Hızı', value: stab.stall_speed + ' m/s', cls: stab.stall_speed < 12 ? 'pass' : 'warn' },
    { label: 'Seyir Hızı', value: stab.cruise_speed + ' m/s', cls: 'pass' },
    { label: 'Tırmanma Oranı', value: stab.climb_rate + ' m/s', cls: stab.climb_rate > 2 ? 'pass' : 'warn' },
    { label: 'Static Margin', value: '%' + stab.static_margin, cls: stab.static_margin >= 5 ? 'pass' : 'fail' },
    { label: 'CL Maks', value: stab.cl_max, cls: 'pass' },
    { label: 'Seyir CD (total)', value: stab.cd_cruise, cls: 'pass' },
    { label: 'Reynolds (Re)', value: (stab.Reynolds || '').toLocaleString(), cls: 'pass' },
  ];

  const assessments = stab.assessments || [];
  const verdict = stab.overall_passed ? '✅ UÇABİLİR' : '❌ UÇAMAZ';

  $('flight-results').innerHTML =
    items.map(item =>
      `<div class="flight-item ${item.cls}">
        <div class="value">${escapeHtml(String(item.value))}</div>
        <div class="label">${escapeHtml(item.label)}</div>
      </div>`
    ).join('') +
    `<div class="flight-assessment">
      <h3>Değerlendirme</h3>
      <ul>${assessments.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
    </div>
    <div class="flight-verdict ${stab.overall_passed ? 'pass' : 'fail'}">${escapeHtml(verdict)}</div>`;
}

window.addEventListener('DOMContentLoaded', init);
