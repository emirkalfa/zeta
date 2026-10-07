const charts = {};

// Her grafik: kapsayıcı id'si, eksenler ve polars verisinden nokta + özet üreten fonksiyon
const CHART_DEFS = [
  {
    id: 'ClAlpha', title: 'Kaldırma eğrisi', x: 'α (°)', y: 'CL',
    build(p) {
      const peak = maxBy(p.cl_vs_alpha, d => d.y);
      return { points: p.cl_vs_alpha, note: `CL maks ${fmt(peak.y)} · α = ${fmt(peak.x)}°` };
    },
  },
  {
    id: 'CdCl', title: 'Sürükleme poları', x: 'CD', y: 'CL',
    build(p) {
      // Stall sonrası sürükleme artışı ekseni ezdiği için yalnızca stall öncesi noktalar çizilir
      const points = p.cd_vs_cl.filter(d => !d.stalled);
      return { points, note: `CD min ${fmt(Math.min(...points.map(d => d.x)))} · stall öncesi` };
    },
  },
  {
    id: 'CmAlpha', title: 'Kanat yunuslama momenti', x: 'α (°)', y: 'Cm',
    build(p) { return { points: p.cm_vs_alpha, note: 'Yalnız kanat; kuyruk ve gövde momentleri dahil değil' }; },
  },
  {
    id: 'Eff', title: 'Aerodinamik verim', x: 'α (°)', y: 'CL/CD',
    build(p) {
      const peak = maxBy(p.efficiency, d => d.y);
      return { points: p.efficiency, note: `En iyi CL/CD ${fmt(peak.y)} · α = ${fmt(peak.x)}°` };
    },
  },
  {
    id: 'LiftDist', title: 'Açıklık boyunca kaldırma dağılımı', x: 'y (m)', y: 'cl', z: 'Veter (m)',
    build(p) {
      return {
        points: p.lift_distribution.map(d => ({ x: d.y, y: d.cl_local, z: d.chord })),
        note: `Yerel kaldırma katsayısı, α = ${p.lift_distribution_alpha ?? 5}° · teorik`,
      };
    },
  },
];

function maxBy(arr, fn) {
  return arr.reduce((best, d) => (fn(d) > fn(best) ? d : best), arr[0]);
}

// Anlamlı basamak sayısını koruyan kısa sayı biçimi (0.0123 → "0.0123", 12.07 → "12.07")
function fmt(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4;
  return String(parseFloat(v.toFixed(digits)));
}

function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  return {
    line: css.getPropertyValue('--primary').trim(),
    text: css.getPropertyValue('--text-secondary').trim(),
    grid: css.getPropertyValue('--border').trim(),
    font: css.getPropertyValue('--mono').trim(),
  };
}

function displayCharts(polars) {
  const theme = chartTheme();
  for (const def of CHART_DEFS) {
    const { points, note } = def.build(polars);
    if (!points || !points.length) continue;
    document.getElementById('note' + def.id).textContent = note;
    createLineChart('chart' + def.id, def, [{ points }], theme);
    createTable('table' + def.id, def, points);
  }
}

// Görev sayfası: dönüş hızı ve güç eğrileri
function displayMissionCharts(mission) {
  const theme = chartTheme();
  document.getElementById('noteTurn').textContent =
    `En iyi sürekli ${fmt(mission.turn_rate_deg)}°/s · ${fmt(mission.turn_speed)} m/s`;
  createLineChart('chartTurn', { x: 'Hız (m/s)', y: 'Dönüş hızı (°/s)' }, [
    { label: 'Sürekli', points: mission.turn_curve.map(d => ({ x: d.v, y: d.sustained })) },
    { label: 'Anlık', points: mission.turn_curve.map(d => ({ x: d.v, y: d.instantaneous })), secondary: true },
  ], theme);

  const speeds = mission.power_curve.map(d => d.v);
  document.getElementById('notePower').textContent = `Mevcut ${fmt(mission.power_available)} W`;
  createLineChart('chartPower', { x: 'Hız (m/s)', y: 'Güç (W)' }, [
    { label: 'Gerekli', points: mission.power_curve.map(d => ({ x: d.v, y: d.required })) },
    { label: 'Mevcut', points: [speeds[0], speeds[speeds.length - 1]].map(v => ({ x: v, y: mission.power_available })), secondary: true },
  ], theme);
}

// series: [{ points, label?, secondary? }]: ikincil seriler nötr renkte ve kesikli çizilir
function createLineChart(canvasId, def, series, theme) {
  if (charts[canvasId]) charts[canvasId].destroy();

  const axis = (label) => ({
    title: { display: true, text: label, color: theme.text },
    grid: { color: theme.grid },
    border: { color: theme.grid },
    ticks: { color: theme.text, font: { family: theme.font, size: 11 } },
  });

  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'scatter',
    data: {
      datasets: series.map(({ points, label, secondary }) => ({
        label,
        data: points,
        showLine: true,
        borderColor: secondary ? theme.text : theme.line,
        backgroundColor: secondary ? theme.text : theme.line,
        borderDash: secondary ? [6, 4] : [],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 12,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: {
          display: series.length > 1,
          align: 'end',
          labels: { color: theme.text, boxWidth: 18, boxHeight: 0, font: { size: 11 } },
        },
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (ctx) => `${def.x} ${fmt(ctx.parsed.x)}   ${def.y} ${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: { x: axis(def.x), y: axis(def.y) },
    },
  });
}

function createTable(containerId, def, points) {
  const headers = [def.x, def.y].concat(def.z ? [def.z] : []);
  const rows = points.map(p =>
    `<tr><td>${fmt(p.x)}</td><td>${fmt(p.y)}</td>${def.z ? `<td>${fmt(p.z)}</td>` : ''}</tr>`
  ).join('');
  document.getElementById(containerId).innerHTML =
    `<table class="data-table num"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}
