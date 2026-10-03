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
    id: 'CmAlpha', title: 'Yunuslama momenti', x: 'α (°)', y: 'Cm',
    build(p) { return { points: p.cm_vs_alpha, note: 'Ağırlık merkezi etrafında' }; },
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
        note: 'Yerel kaldırma katsayısı, α = 5°',
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

function displayCharts(polars) {
  destroyCharts();
  const css = getComputedStyle(document.documentElement);
  const theme = {
    line: css.getPropertyValue('--primary').trim(),
    text: css.getPropertyValue('--text-secondary').trim(),
    grid: css.getPropertyValue('--border').trim(),
    font: css.getPropertyValue('--mono').trim(),
  };

  for (const def of CHART_DEFS) {
    const { points, note } = def.build(polars);
    if (!points || !points.length) continue;
    document.getElementById('note' + def.id).textContent = note;
    createLineChart('chart' + def.id, def, points, theme);
    createTable('table' + def.id, def, points);
  }
}

function createLineChart(canvasId, def, points, theme) {
  const axis = (label) => ({
    title: { display: true, text: label, color: theme.text },
    grid: { color: theme.grid },
    border: { color: theme.grid },
    ticks: { color: theme.text, font: { family: theme.font, size: 11 } },
  });

  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'scatter',
    data: {
      datasets: [{
        data: points,
        showLine: true,
        borderColor: theme.line,
        backgroundColor: theme.line,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 12,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
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

function destroyCharts() {
  for (const key in charts) {
    charts[key].destroy();
    delete charts[key];
  }
}
