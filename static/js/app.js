const state = {
  geometry: null,
  polars: null,
  stability: null,
  airfoilCoords: null,
  airfoilCode: '2412',
  darkMode: localStorage.getItem('zeta-dark') === 'true',
};

async function fetchAPI(url, body = null) {
  const opts = { headers: { 'Content-Type': 'application/json' } };
  if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function $(id) { return document.getElementById(id); }

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
    `<option value="${a.code}">${a.name} (t=${(a.max_thickness*100).toFixed(0)}%)</option>`
  ).join('');
  $('airfoil').innerHTML = opts;
  $('tailAirfoil').innerHTML = opts;
  $('tailAirfoil').value = '0012';
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
  $('saveBtn').addEventListener('click', saveProject);
  $('loadBtn').addEventListener('click', loadProject);
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
        $('tailAirfoil').value = data.tail_airfoil_code || '0012';
        const wp = document.querySelector(`input[name="wing_pos"][value="${data.wing_position || 'mid'}"]`);
        if (wp) wp.checked = true;
        const tt = document.querySelector(`input[name="tail_type"][value="${data.tail_type || 'conventional'}"]`);
        if (tt) tt.checked = true;
        const wj = document.querySelector(`input[name="junction"][value="${data.wing_junction || 'through'}"]`);
        if (wj) wj.checked = true;
      }
    }
  } catch(e) {}
}

function saveProject() {
  const data = {
    wingspan: $('wingspan').value,
    weight: $('weight').value,
    airfoil_code: $('airfoil').value,
    tail_airfoil_code: $('tailAirfoil').value,
    wing_position: document.querySelector('input[name="wing_pos"]:checked')?.value || 'mid',
    tail_type: document.querySelector('input[name="tail_type"]:checked')?.value || 'conventional',
    wing_junction: document.querySelector('input[name="junction"]:checked')?.value || 'through',
  };
  localStorage.setItem('zeta-project', JSON.stringify(data));
  $('saveBtn').textContent = '✅';
  setTimeout(() => { $('saveBtn').textContent = '💾'; }, 1500);
}

function loadProject() {
  try {
    const saved = localStorage.getItem('zeta-project');
    if (saved) {
      checkSavedProject();
      $('loadBtn').textContent = '✅';
      setTimeout(() => { $('loadBtn').textContent = '📂'; }, 1500);
    }
  } catch(e) { alert('Kayıtlı proje bulunamadı.'); }
}

function setupEventListeners() {
  $('calculateBtn').addEventListener('click', calculateAll);
  $('viewX').addEventListener('click', () => viewerSetView('x'));
  $('viewY').addEventListener('click', () => viewerSetView('y'));
  $('viewZ').addEventListener('click', () => viewerSetView('z'));
  $('viewAutoRotate').addEventListener('click', () => {
    $('viewAutoRotate').classList.toggle('active');
    viewerToggleRotate();
  });
  $('viewReset').addEventListener('click', () => viewerReset());
  $('stlWing').addEventListener('click', () => exportSTL('wing'));
  $('stlFuselage').addEventListener('click', () => exportSTL('fuselage'));
  $('stlTail').addEventListener('click', () => exportSTL('tail'));
}

async function calculateAll() {
  const btn = $('calculateBtn');
  showLoading(btn);

  const wingspan = parseFloat($('wingspan').value);
  const weight = parseFloat($('weight').value);
  const airfoil_code = $('airfoil').value;
  const tail_airfoil_code = $('tailAirfoil').value;
  const wing_position = document.querySelector('input[name="wing_pos"]:checked')?.value || 'mid';
  const tail_type = document.querySelector('input[name="tail_type"]:checked')?.value || 'conventional';
  const wing_junction = document.querySelector('input[name="junction"]:checked')?.value || 'through';

  if (!wingspan || !weight || wingspan <= 0 || weight <= 0) {
    alert('Lütfen geçerli bir kanat açıklığı ve ağırlık girin.');
    hideLoading(btn);
    return;
  }

  try {
    state.airfoilCode = airfoil_code;

    // Get airfoil coordinates
    const airfoilId = await getAirfoilId(airfoil_code);
    const airfoilData = await fetchAPI(`/api/airfoil/${airfoilId}`);
    state.airfoilCoords = airfoilData.coordinates;

    // Get tail airfoil coordinates
    const tailId = await getAirfoilId(tail_airfoil_code);
    const tailData = await fetchAPI(`/api/airfoil/${tailId}`);
    state.tailCoords = tailData.coordinates;

    // Calculate geometry
    state.geometry = await fetchAPI('/api/calculate', {
      wingspan, weight, airfoil_code, tail_airfoil_code, wing_position, tail_type, wing_junction
    });

    // Run analysis
    state.polars = await fetchAPI('/api/analyze', {
      geometry: state.geometry, airfoil_code
    });

    // Run stability test
    state.stability = await fetchAPI('/api/stability', {
      geometry: state.geometry, airfoil_code, tail_airfoil_code
    });

    // Save to localStorage
    saveProject();

    // Display everything
    displayResults(state.geometry);
    displayFlightTest(state.stability);
    displayCharts(state.polars);
    initViewer(state.geometry, state.airfoilCoords, state.tailCoords, airfoil_code, wing_junction, tail_type);
    hideLoading(btn);

    show('results-card');
    show('viewer-card');
    show('charts-card');
    show('flight-card');
    show('stl-card');

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
    { label: 'Kök Veter', value: geom.root_chord + ' m', key: 'root_chord' },
    { label: 'Uç Veter', value: geom.tip_chord + ' m', key: 'tip_chord' },
    { label: 'MAC', value: geom.mac + ' m', key: 'mac' },
    { label: 'Kanat Alanı', value: geom.wing_area + ' m²', key: 'wing_area' },
    { label: 'Açıklık Oranı', value: geom.aspect_ratio, key: 'aspect_ratio' },
    { label: 'Daralma Oranı', value: geom.taper_ratio, key: 'taper_ratio' },
    { label: 'Ok Açısı', value: geom.sweep_angle + '°', key: 'sweep_angle' },
    { label: 'Dihedral', value: geom.dihedral_angle + '°', key: 'dihedral_angle' },
    { label: 'Gövde Uzunluğu', value: geom.fuselage_length + ' m', key: 'fuselage_length' },
    { label: 'Gövde Genişliği', value: geom.fuselage_max_width + ' m', key: 'fuselage_max_width' },
    { label: 'Gövde Yüksekliği', value: geom.fuselage_max_height + ' m', key: 'fuselage_max_height' },
    { label: 'Yatay Kuyruk Açıklığı', value: geom.htail_span + ' m', key: 'htail_span' },
    { label: 'Dikey Kuyruk Açıklığı', value: geom.vtail_span + ' m', key: 'vtail_span' },
    { label: 'CG Pozisyonu', value: geom.cg_position + ' m', key: 'cg_position' },
    { label: 'Kanat Konumu', value: geom.wing_position === 'low' ? 'Alçak' : geom.wing_position === 'high' ? 'Yüksek' : 'Orta', key: '' },
    { label: 'Kuyruk Tipi', value: geom.tail_type === 'ttail' ? 'T-tail' : geom.tail_type === 'vtail' ? 'V-tail' : 'Konvansiyonel', key: '' },
  ];

  $('results-grid').innerHTML = items.map(item =>
    `<div class="result-item">
      <div class="value">${item.value}</div>
      <div class="label">${item.label}</div>
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
    { label: 'Seyir CD', value: stab.cd_cruise, cls: 'pass' },
  ];

  const assessments = stab.assessments || [];
  const verdict = stab.overall_passed ? '✅ UÇABİLİR' : '❌ UÇAMAZ';

  $('flight-results').innerHTML =
    items.map(item =>
      `<div class="flight-item ${item.cls}">
        <div class="value">${item.value}</div>
        <div class="label">${item.label}</div>
      </div>`
    ).join('') +
    `<div class="flight-assessment">
      <h3>Değerlendirme</h3>
      <ul>${assessments.map(a => `<li>${a}</li>`).join('')}</ul>
    </div>
    <div class="flight-verdict ${stab.overall_passed ? 'pass' : 'fail'}">${verdict}</div>`;
}

window.addEventListener('DOMContentLoaded', init);
