let charts = {};

function displayCharts(polars) {
  destroyCharts();

  if (polars.cl_vs_alpha && polars.cl_vs_alpha.length) {
    createLineChart('chartClAlpha', 'Cl vs α', polars.cl_vs_alpha, 'Hücum Açısı (°)', 'Cl', '#444');
    createTable('tableClAlpha', ['α (°)', 'Cl'], polars.cl_vs_alpha);
  }

  if (polars.cd_vs_cl && polars.cd_vs_cl.length) {
    createLineChart('chartCdCl', 'Cd vs Cl', polars.cd_vs_cl, 'Cd', 'Cl', '#666');
    createTable('tableCdCl', ['Cd', 'Cl'], polars.cd_vs_cl);
  }

  if (polars.cm_vs_alpha && polars.cm_vs_alpha.length) {
    createLineChart('chartCmAlpha', 'Cm vs α', polars.cm_vs_alpha, 'Hücum Açısı (°)', 'Cm', '#888');
    createTable('tableCmAlpha', ['α (°)', 'Cm'], polars.cm_vs_alpha);
  }

  if (polars.efficiency && polars.efficiency.length) {
    createLineChart('chartEff', 'Cl/Cd vs α', polars.efficiency, 'Hücum Açısı (°)', 'Cl/Cd', '#333');
    createTable('tableEff', ['α (°)', 'Cl/Cd'], polars.efficiency);
  }

  if (polars.lift_distribution && polars.lift_distribution.length) {
    const ld = polars.lift_distribution;
    createLineChart('chartLiftDist', 'Lift Dağılımı', ld.map(d => ({x: d.y, y: d.cl_local})),
      'Kanat Açıklığı (m)', 'cl_local', '#555');
    createTable('tableLiftDist', ['Y (m)', 'cl_local', 'Chord (m)'],
      ld.map(d => ({x: d.y, y: d.cl_local, z: d.chord})));
  }
}

function createLineChart(canvasId, label, data, xLabel, yLabel, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#666';

  const chart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label,
        data: data.map(d => ({x: d.x, y: d.y})),
        showLine: true,
        borderColor: color,
        backgroundColor: color + '30',
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.3,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `(${ctx.parsed.x.toFixed(2)}, ${ctx.parsed.y.toFixed(4)})`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: textColor },
          grid: { color: isDark ? '#334155' : '#eee' },
          ticks: { color: textColor }
        },
        y: {
          title: { display: true, text: yLabel, color: textColor },
          grid: { color: isDark ? '#334155' : '#eee' },
          ticks: { color: textColor }
        }
      }
    }
  });

  charts[canvasId] = chart;
}

function createTable(containerId, headers, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const sample = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 10)) === 0).slice(0, 10);

  let html = '<table><thead><tr>';
  for (const h of headers) html += `<th>${h}</th>`;
  html += '</tr></thead><tbody>';

  for (const row of sample) {
    html += '<tr>';
    html += `<td>${row.x.toFixed(1)}</td>`;
    html += `<td>${row.y.toFixed(4)}</td>`;
    if (row.z !== undefined) html += `<td>${row.z.toFixed(4)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function destroyCharts() {
  for (const key in charts) {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  }
}
