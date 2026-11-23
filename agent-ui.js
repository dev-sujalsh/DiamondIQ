/* ═══════════════════════════════════════════════════════════════════════════
   AI AGENT UI — talks to agent/server.py (POST /api/agent/*)
   Falls back to agent/analysis.json (static, no chat) when no server is running.
   ═══════════════════════════════════════════════════════════════════════════ */

const AGENT = { report: null, offline: false, tab: 'insights', chat: [], loading: null, key: '' };
const CLUSTER_COLORS = ['#06b6d4','#8b5cf6','#f59e0b','#10b981','#ec4899','#3b82f6','#f97316','#84cc16','#e879f9','#14b8a6'];

function agentUserQuestions() { return store.getArr(STORAGE_KEYS.USER_QUESTIONS); }

async function agentPost(path, body) {
  const res = await fetch((window.AGENT_API_BASE || '') + '/api/agent/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, questions: agentUserQuestions() }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

/** Loads (or reuses) the agent report for the current dataset. */
async function loadAgentReport(force = false) {
  const key = String(getAllQuestions().length);
  if (AGENT.report && AGENT.key === key && !force) return AGENT.report;
  if (AGENT.loading && !force) return AGENT.loading;
  AGENT.loading = (async () => {
    try {
      AGENT.report = await agentPost('analyze', {});
      AGENT.offline = false;
    } catch (e) {
      try {
        AGENT.report = await (await fetch('./agent/analysis.json')).json();
        AGENT.offline = true;
      } catch { AGENT.report = null; }
    }
    AGENT.key = key;
    AGENT.loading = null;
    return AGENT.report;
  })();
  return AGENT.loading;
}

// ── Dashboard teaser (top of main dashboard) ────────────────────────────────
async function renderAgentTeaser() {
  const box = document.getElementById('agent-teaser');
  if (!box) return;
  box.innerHTML = `<div class="agent-teaser-head"><span>🤖 AI Agent</span><span class="agent-muted">Analysing dataset…</span></div>`;
  const r = await loadAgentReport();
  if (!document.getElementById('agent-teaser')) return;
  if (!r) { box.innerHTML = `<div class="agent-teaser-head"><span>🤖 AI Agent</span><span class="agent-muted">Not available — see agent/README</span></div>`; return; }
  const top = r.insights.filter(i => ['warn', 'good', 'info'].includes(i.severity)).slice(0, 3);
  box.innerHTML = `
    <div class="agent-teaser-head">
      <span>🤖 AI Agent Insights</span>
      <button class="section-action" onclick="navigateTo('agent')">Open agent →</button>
    </div>
    <p class="agent-summary">${escHtml(r.summary)}</p>
    <div class="agent-chips">
      ${top.map(i => `<span class="agent-chip sev-${i.severity}">${escHtml(i.title)}</span>`).join('')}
      <span class="agent-chip">Quality ${r.audit.quality_score}/100</span>
      <span class="agent-chip">${r.metrics.clusters} topics</span>
    </div>`;
}

// ── Agent page ──────────────────────────────────────────────────────────────
async function renderAgent(container) {
  if (!container) container = document.getElementById('page-content');
  container.innerHTML = `<div class="agent-loading"><div class="spinner"></div> Training agent on ${getAllQuestions().length} questions…</div>`;
  const r = await loadAgentReport();
  if (state.currentPage !== 'agent') return;
  if (!r) {
    container.innerHTML = `<div class="chart-card"><div class="chart-title">Agent unavailable</div>
      <p class="agent-muted">Start the backend: <code>pip install -r agent/requirements.txt</code>, then
      <code>python agent/server.py</code> and open <code>http://localhost:3000</code>.</p></div>`;
    return;
  }
  const m = r.metrics;
  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  container.innerHTML = `
    ${AGENT.offline ? `<div class="agent-banner">Showing the saved analysis of the base dataset. Live re-analysis, your added questions and chat need the agent backend (see DEPLOY.md).</div>` : ''}
    <div class="stats-grid">
      ${statCard('🧠', 'Questions analysed', m.questions, 'var(--grad-primary)', 'rgba(6,182,212,0.12)', m.llm ? 'Claude enabled' : 'Local model', 'up')}
      ${statCard('🧩', 'Topic clusters', m.clusters, 'var(--grad-gold)', 'rgba(245,158,11,0.12)', 'silhouette ' + m.silhouette, 'neutral')}
      ${statCard('🎯', 'Category predictor', Math.round((m.category_accuracy || 0) * 100), 'var(--grad-green)', 'rgba(16,185,129,0.12)', '% CV accuracy', 'neutral')}
      ${statCard('✅', 'Quality score', r.audit.quality_score, 'linear-gradient(135deg,#8b5cf6,#ec4899)', 'rgba(139,92,246,0.12)', r.audit.total_issues + ' issues', r.audit.total_issues ? 'neutral' : 'up')}
    </div>
    <div class="agent-card"><div class="agent-card-title">🤖 Executive summary ${m.llm ? '<span class="agent-chip">written by Claude</span>' : ''}</div>
      <p class="agent-summary">${escHtml(r.summary)}</p></div>
    <div class="agent-tabs">
      ${[['insights', '💡 Insights'], ['topics', '🧩 Topics & keywords'], ['audit', '🛡️ Quality audit'], ['chat', '💬 Ask the dataset']]
        .map(([k, l]) => `<button class="agent-tab ${AGENT.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}
      <button class="agent-tab agent-retrain" id="agent-retrain">↻ Re-analyse</button>
    </div>
    <div id="agent-panel"></div>`;
  container.querySelectorAll('.agent-tab[data-tab]').forEach(b => b.addEventListener('click', () => { AGENT.tab = b.dataset.tab; renderAgent(container); }));
  document.getElementById('agent-retrain').addEventListener('click', async () => {
    container.innerHTML = `<div class="agent-loading"><div class="spinner"></div> Re-training…</div>`;
    await loadAgentReport(true); renderAgent(container);
  });
  setTimeout(runCountUps, 80);
  const panel = document.getElementById('agent-panel');
  ({ insights: panelInsights, topics: panelTopics, audit: panelAudit, chat: panelChat })[AGENT.tab](panel, r);
}

function panelInsights(el, r) {
  const icon = { warn: '⚠️', good: '✅', info: '💡' };
  el.innerHTML = `<div class="insight-grid">${r.insights.map(i => `
    <div class="insight-card sev-${i.severity}">
      <div class="insight-title">${icon[i.severity] || '💡'} ${escHtml(i.title)}</div>
      <div class="insight-text">${escHtml(i.text)}</div>
    </div>`).join('')}</div>`;
}

function panelTopics(el, r) {
  el.innerHTML = `
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title"><span class="dot"></span>Topic map (each dot = a question)</div>
        <div class="chart-container"><canvas id="chart-scatter"></canvas></div></div>
      <div class="chart-card"><div class="chart-title"><span class="dot"></span>Top keywords</div>
        <div class="chart-container"><canvas id="chart-keywords"></canvas></div></div>
    </div>
    <div class="section-header"><div class="section-title">Discovered topics</div></div>
    <div class="cluster-grid">${r.clusters.map((c, i) => `
      <div class="cluster-card" style="border-left:3px solid ${CLUSTER_COLORS[c.id % 10]}">
        <div class="cluster-name">${escHtml(c.name)}</div>
        <div class="cluster-meta">${c.size} questions · mostly ${escHtml(c.dominant_category)} (${Math.round(c.purity * 100)}%)</div>
        <div class="cluster-kw">${c.keywords.slice(0, 6).map(k => `<span class="tag">${escHtml(k)}</span>`).join('')}</div>
        <div class="cluster-ex">“${escHtml(c.examples[0] || '')}”</div>
      </div>`).join('')}</div>`;
  const grid = 'rgba(255,255,255,0.05)', tick = { color: '#94a3b8', font: { size: 11, family: 'Inter' } };
  if (state.charts.scatter) state.charts.scatter.destroy();
  state.charts.scatter = new Chart(document.getElementById('chart-scatter'), {
    type: 'scatter',
    data: { datasets: r.clusters.map(c => ({
      label: c.name, backgroundColor: CLUSTER_COLORS[c.id % 10] + 'cc', pointRadius: 5, pointHoverRadius: 8,
      data: r.scatter.filter(p => p.cluster === c.id) })) },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw.q } } },
      scales: { x: { display: false }, y: { display: false } } },
  });
  if (state.charts.keywords) state.charts.keywords.destroy();
  state.charts.keywords = new Chart(document.getElementById('chart-keywords'), {
    type: 'bar',
    data: { labels: r.keywords.map(k => k.term), datasets: [{ data: r.keywords.map(k => k.score),
      backgroundColor: '#06b6d444', borderColor: '#06b6d4', borderWidth: 2, borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { ticks: tick, grid: { color: grid } }, y: { ticks: tick, grid: { display: false } } } },
  });
}

function panelAudit(el, r) {
  const a = r.audit;
  if (!a.issues.length) {
    el.innerHTML = `<div class="agent-card"><div class="agent-card-title">✅ No issues found</div>
      <p class="agent-muted">No duplicates, thin answers or confident label mismatches in ${r.metrics.questions} questions.</p></div>`;
    return;
  }
  el.innerHTML = `
    <div class="agent-chips" style="margin-bottom:14px">${Object.entries(a.by_type).map(([k, v]) => `<span class="agent-chip">${v} × ${escHtml(k)}</span>`).join('')}</div>
    <div class="audit-list">${a.issues.map(i => `
      <div class="audit-item sev-${i.severity}">
        <div class="audit-top"><span class="audit-sev">${i.severity}</span><span class="tag">${escHtml(i.type)}</span>
          <span class="audit-cat">${escHtml(i.category)}</span></div>
        <div class="audit-q">${escHtml(i.question)}</div>
        <div class="audit-detail">${escHtml(i.detail)}</div>
        <div class="audit-fix">💡 ${escHtml(i.suggestion)}</div>
      </div>`).join('')}</div>`;
}

function panelChat(el) {
  const suggestions = ['What gaps are there in the dataset?', 'What is the Hope Diamond?', 'How many questions per category?', 'Can diamonds burn?', 'What are the main topics?'];
  el.innerHTML = `
    <div class="agent-card chat-card">
      <div class="chat-log" id="chat-log">${AGENT.chat.length ? '' : `<div class="agent-muted">Ask about the dataset or about diamonds — answers come from the trained agent.</div>`}</div>
      <div class="chat-suggest">${suggestions.map(s => `<button class="agent-chip chat-s">${s}</button>`).join('')}</div>
      <div class="chat-input-row">
        <input id="chat-input" class="chat-input" placeholder="Ask the dataset…" autocomplete="off" ${AGENT.offline ? 'disabled' : ''}>
        <button class="chat-send" id="chat-send" ${AGENT.offline ? 'disabled' : ''}>Send</button>
      </div>
      ${AGENT.offline ? '<div class="agent-muted" style="margin-top:8px">Chat needs the agent backend, which is not connected to this site.</div>' : ''}
    </div>`;
  AGENT.chat.forEach(drawChatMsg);
  const send = async (text) => {
    text = (text || '').trim(); if (!text) return;
    const input = document.getElementById('chat-input'); input.value = '';
    AGENT.chat.push({ role: 'user', text }); drawChatMsg(AGENT.chat.at(-1));
    const pending = { role: 'agent', text: 'Thinking…', pending: true }; const node = drawChatMsg(pending);
    try {
      const res = await agentPost('chat', { message: text });
      Object.assign(pending, { text: res.answer, sources: res.sources, mode: res.mode, pending: false });
    } catch (e) { Object.assign(pending, { text: 'Sorry, the agent could not be reached: ' + e.message, pending: false }); }
    AGENT.chat.push(pending); node.remove(); drawChatMsg(pending);
  };
  document.getElementById('chat-send').addEventListener('click', () => send(document.getElementById('chat-input').value));
  document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') send(e.target.value); });
  el.querySelectorAll('.chat-s').forEach(b => b.addEventListener('click', () => !AGENT.offline && send(b.textContent)));
}

function drawChatMsg(m) {
  const log = document.getElementById('chat-log'); if (!log) return document.createElement('div');
  if (log.querySelector('.agent-muted') && log.children.length === 1 && !log.firstElementChild.classList.contains('chat-msg')) log.innerHTML = '';
  const d = document.createElement('div');
  d.className = `chat-msg ${m.role}`;
  d.innerHTML = `<div class="chat-bubble">${escHtml(m.text)}${m.sources && m.sources.length && m.mode !== 'stats' ? `
    <div class="chat-src">Matched: ${m.sources.slice(0, 2).map(s => `<span class="tag">${escHtml(s.question.slice(0, 48))}${s.question.length > 48 ? '…' : ''}</span>`).join('')}
    ${m.mode === 'claude' ? '<span class="agent-chip">Claude</span>' : ''}</div>` : ''}</div>`;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
  return d;
}

// Refresh agent results when questions change
window.addEventListener('questionUpdate', () => {
  if (state.currentPage === 'agent') loadAgentReport(true).then(() => state.currentPage === 'agent' && renderAgent());
  else if (state.currentPage === 'dashboard') loadAgentReport(true).then(renderAgentTeaser);
});
