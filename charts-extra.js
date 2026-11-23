/* Extra dataset charts for the main dashboard (pure dataset analysis, no agent). */
const _tick = { color: '#94a3b8', font: { size: 11, family: 'Inter' } };
const _grid = { color: 'rgba(255,255,255,0.05)' };
const _words = s => (s || '').trim().split(/\s+/).filter(Boolean).length;
const DIFFS = ['Beginner', 'Intermediate', 'Advanced'];

function extraChartsHTML() {
  const card = (id, title, sub) => `
    <div class="chart-card">
      <div class="chart-title"><span class="dot"></span>${title}</div>
      ${sub ? `<div class="chart-sub">${sub}</div>` : ''}
      <div class="chart-container"><canvas id="${id}"></canvas></div>
    </div>`;
  return `
    <div class="section-header"><div class="section-title">📈 Dataset Analytics</div></div>
    <div class="charts-grid">
      ${card('chart-stacked', 'Difficulty by Category', 'How each category splits across difficulty levels')}
      ${card('chart-diffpie', 'Difficulty Share', 'Overall mix of Beginner / Intermediate / Advanced')}
    </div>
    <div class="charts-grid">
      ${card('chart-avglen', 'Average Answer Length', 'Words per answer, by category')}
      ${card('chart-hist', 'Answer Length Distribution', 'Number of answers per word-count range')}
    </div>
    <div class="charts-grid">
      ${card('chart-radar', 'Category Profile', 'Share of Advanced questions vs. detail (avg words) per category')}
      ${card('chart-qlen', 'Question Length vs. Answer Length', 'Each dot is one question, colored by category')}
    </div>`;
}

function buildExtraCharts() {
  const qs = getAllQuestions();
  if (!qs.length || !document.getElementById('chart-stacked')) return;
  const cats = Object.keys(CATEGORIES);
  const mk = (key, id, cfg) => {
    if (state.charts[key]) state.charts[key].destroy();
    state.charts[key] = new Chart(document.getElementById(id).getContext('2d'), cfg);
  };
  const base = { responsive: true, maintainAspectRatio: false };

  // 1) Stacked bar: difficulty per category
  mk('stacked', 'chart-stacked', {
    type: 'bar',
    data: { labels: cats, datasets: DIFFS.map(d => ({
      label: d, data: cats.map(c => qs.filter(q => q.category === c && q.difficulty === d).length),
      backgroundColor: DIFFICULTY_COLORS[d] + 'bb', borderColor: DIFFICULTY_COLORS[d], borderWidth: 1, borderRadius: 4 })) },
    options: { ...base, plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } },
      scales: { x: { stacked: true, ticks: _tick, grid: _grid }, y: { stacked: true, ticks: _tick, grid: _grid, beginAtZero: true } } },
  });

  // 2) Difficulty share (polar-free pie)
  const dcount = DIFFS.map(d => qs.filter(q => q.difficulty === d).length);
  mk('diffpie', 'chart-diffpie', {
    type: 'pie',
    data: { labels: DIFFS, datasets: [{ data: dcount, backgroundColor: DIFFS.map(d => DIFFICULTY_COLORS[d] + 'aa'),
      borderColor: DIFFS.map(d => DIFFICULTY_COLORS[d]), borderWidth: 2, hoverOffset: 8 }] },
    options: { ...base, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } },
      tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed} (${Math.round(c.parsed / qs.length * 100)}%)` } } } },
  });

  // 3) Avg answer length per category (horizontal)
  const avg = cats.map(c => {
    const a = qs.filter(q => q.category === c);
    return a.length ? +(a.reduce((s, q) => s + _words(q.answer), 0) / a.length).toFixed(1) : 0;
  });
  mk('avglen', 'chart-avglen', {
    type: 'bar',
    data: { labels: cats, datasets: [{ label: 'Avg words', data: avg,
      backgroundColor: cats.map(c => CATEGORIES[c].color + '44'), borderColor: cats.map(c => CATEGORIES[c].color), borderWidth: 2, borderRadius: 6 }] },
    options: { ...base, indexAxis: 'y', plugins: { legend: { display: false } },
      scales: { x: { ticks: _tick, grid: _grid, beginAtZero: true }, y: { ticks: _tick, grid: { display: false } } } },
  });

  // 4) Histogram of answer word counts
  const lens = qs.map(q => _words(q.answer));
  const step = 10, max = Math.max(...lens);
  const bins = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i);
  mk('hist', 'chart-hist', {
    type: 'bar',
    data: { labels: bins.map(i => `${i * step}-${i * step + step - 1}`),
      datasets: [{ label: 'Answers', data: bins.map(i => lens.filter(l => Math.floor(l / step) === i).length),
        backgroundColor: '#8b5cf655', borderColor: '#8b5cf6', borderWidth: 2, borderRadius: 4, barPercentage: 0.95, categoryPercentage: 0.95 }] },
    options: { ...base, plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: 'words per answer', color: '#64748b' }, ticks: _tick, grid: { display: false } },
        y: { ticks: _tick, grid: _grid, beginAtZero: true } } },
  });

  // 5) Radar: % advanced and avg length (both scaled 0-100)
  const advPct = cats.map(c => { const a = qs.filter(q => q.category === c); return a.length ? a.filter(q => q.difficulty === 'Advanced').length / a.length * 100 : 0; });
  const maxAvg = Math.max(...avg, 1);
  mk('radar', 'chart-radar', {
    type: 'radar',
    data: { labels: cats, datasets: [
      { label: '% Advanced', data: advPct.map(v => +v.toFixed(0)), borderColor: '#ef4444', backgroundColor: '#ef444433', pointBackgroundColor: '#ef4444' },
      { label: 'Answer detail (scaled)', data: avg.map(v => +(v / maxAvg * 100).toFixed(0)), borderColor: '#06b6d4', backgroundColor: '#06b6d433', pointBackgroundColor: '#06b6d4' } ] },
    options: { ...base, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } } },
      scales: { r: { beginAtZero: true, max: 100, angleLines: _grid, grid: _grid, pointLabels: { color: '#cbd5e1', font: { size: 11 } }, ticks: { display: false } } } },
  });

  // 6) Scatter: question length vs answer length
  mk('qlen', 'chart-qlen', {
    type: 'scatter',
    data: { datasets: cats.map(c => ({ label: c, backgroundColor: CATEGORIES[c].color + 'cc', pointRadius: 5, pointHoverRadius: 8,
      data: qs.filter(q => q.category === c).map(q => ({ x: _words(q.question), y: _words(q.answer), q: q.question })) })) },
    options: { ...base, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10 } },
      tooltip: { callbacks: { label: c => `${c.raw.q} (${c.raw.x}→${c.raw.y} words)` } } },
      scales: { x: { title: { display: true, text: 'question words', color: '#64748b' }, ticks: _tick, grid: _grid },
        y: { title: { display: true, text: 'answer words', color: '#64748b' }, ticks: _tick, grid: _grid, beginAtZero: true } } },
  });
}
