/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND DASHBOARD — Application Logic
   Dataset loaded from diamonds.json | Reactive dashboard updates
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Storage Keys ─────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  USERS:          'diamond_users',
  CURRENT_USER:   'diamond_current_user',
  USER_QUESTIONS: 'diamond_user_questions',
};

// ── Category Config ───────────────────────────────────────────────────────────
const CATEGORIES = {
  Grading:  { color: '#06b6d4', icon: '⭐' },
  History:  { color: '#8b5cf6', icon: '📜' },
  Pricing:  { color: '#f59e0b', icon: '💰' },
  Mining:   { color: '#10b981', icon: '⛏️'  },
  Jewelry:  { color: '#ec4899', icon: '💍' },
  Science:  { color: '#3b82f6', icon: '🔬' },
  Care:     { color: '#f97316', icon: '✨' },
};

const DIFFICULTY_COLORS = {
  Beginner:     '#10b981',
  Intermediate: '#f59e0b',
  Advanced:     '#ef4444',
};

// ── Application State ─────────────────────────────────────────────────────────
let state = {
  currentUser:     null,
  currentPage:     'dashboard',
  explorerSearch:  '',
  explorerFilter:  'All',
  charts:          {},
  baseDataset:     [],   // loaded from diamonds.json
  datasetMeta:     {},   // metadata from JSON
};

// ── Storage Helpers ───────────────────────────────────────────────────────────
const store = {
  get:    (key)       => JSON.parse(localStorage.getItem(key) || 'null'),
  set:    (key, val)  => localStorage.setItem(key, JSON.stringify(val)),
  getArr: (key)       => JSON.parse(localStorage.getItem(key) || '[]'),
};

// ── Data Accessors ────────────────────────────────────────────────────────────
function getUsers()       { return store.getArr(STORAGE_KEYS.USERS); }
function saveUsers(users) { store.set(STORAGE_KEYS.USERS, users); }

/** Returns the full merged dataset: base JSON + user-added questions */
function getAllQuestions() {
  const userQs = store.getArr(STORAGE_KEYS.USER_QUESTIONS);
  return [...state.baseDataset, ...userQs];
}

/** Returns questions added by a specific user */
function getUserQuestions(username) {
  return store.getArr(STORAGE_KEYS.USER_QUESTIONS)
              .filter(q => q.addedBy === username);
}

// ── Custom Event: questionAdded ───────────────────────────────────────────────
// Fired on window whenever a question is added or deleted.
// Any listener (dashboard, sidebar badge) can react to this.
function dispatchQuestionUpdate() {
  window.dispatchEvent(new CustomEvent('questionUpdate', {
    detail: { total: getAllQuestions().length }
  }));
}

// ── Init: Load JSON then Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  showLoadingScreen();
  await loadDiamondJSON();
  bootApp();
});

/** Fetches diamonds.json and stores result in state.baseDataset.
 *  Falls back to window.__DIAMOND_JSON__ (set by diamonds-data.js) when
 *  the page is opened directly via file:// protocol (no server). */
async function loadDiamondJSON() {
  try {
    // ── Primary: fetch from server (works with http:// or Live Server) ──────
    const res  = await fetch('./diamonds.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.baseDataset = json.questions || [];
    state.datasetMeta = json.metadata  || {};
    console.log(`✅ [fetch] Loaded ${state.baseDataset.length} questions from diamonds.json`);
  } catch (err) {
    // ── Fallback: use inline data embedded by diamonds-data.js ──────────────
    if (window.__DIAMOND_JSON__) {
      state.baseDataset = window.__DIAMOND_JSON__.questions || [];
      state.datasetMeta = window.__DIAMOND_JSON__.metadata  || {};
      console.info(`ℹ️ [inline] Loaded ${state.baseDataset.length} questions from diamonds-data.js (file:// mode)`);
    } else {
      // Last resort: nothing loaded
      console.error('❌ No dataset available. diamonds-data.js may be missing.');
      state.baseDataset = [];
      state.datasetMeta = { title: 'Diamond Dataset', totalQuestions: 0 };
    }
  }
}

function showLoadingScreen() {
  document.getElementById('loading-screen').classList.remove('hidden');
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
}

function hideLoadingScreen() {
  document.getElementById('loading-screen').classList.add('hidden');
}

function showJsonError() {
  const el = document.getElementById('loading-error');
  if (el) {
    el.classList.remove('hidden');
    el.innerHTML = `
      <div style="color:#f59e0b;font-size:14px;text-align:center;margin-top:12px">
        ⚠️ <strong>diamonds.json not found.</strong><br>
        Open via a local server (e.g. VS Code Live Server) for full functionality.
        <br><br>
        <button onclick="bootApp()" style="background:var(--grad-primary);border:none;color:white;padding:10px 20px;border-radius:8px;cursor:pointer;font-family:Inter,sans-serif;font-weight:600">
          Continue with empty dataset →
        </button>
      </div>`;
  }
}

function bootApp() {
  hideLoadingScreen();

  // Seed demo user if none exist
  let users = getUsers();
  if (users.length === 0) {
    users = [{
      username: 'admin',
      email:    'admin@diamond.com',
      password: 'diamond123',
      role:     'Admin',
      joinedAt: new Date().toISOString(),
    }];
    saveUsers(users);
  }

  // Restore session
  const savedUser = store.get(STORAGE_KEYS.CURRENT_USER);
  if (savedUser) {
    state.currentUser = savedUser;
    showApp();
  } else {
    showAuth();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════════════════

function showAuth() {
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  setupAuthListeners();
}

function showApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderSidebar();
  setupTopbarSearch();
  setupQuestionUpdateListener();
  navigateTo('dashboard');
}

function setupAuthListeners() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      document.getElementById('login-form').classList.toggle('hidden',    mode !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', mode !== 'register');
      clearErrors();
    });
  });

  document.getElementById('login-btn').addEventListener('click',    handleLogin);
  document.getElementById('register-btn').addEventListener('click', handleRegister);

  document.getElementById('login-email').addEventListener('keydown',    e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

  document.getElementById('demo-fill-btn').addEventListener('click', () => {
    document.getElementById('login-email').value    = 'admin@diamond.com';
    document.getElementById('login-password').value = 'diamond123';
  });
}

function handleLogin() {
  clearErrors();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showError('login-error', 'Please fill in all fields.');
  const user = getUsers().find(u => u.email === email && u.password === password);
  if (!user) return showError('login-error', 'Invalid email or password. Try the demo credentials below.');
  loginUser(user);
}

function handleRegister() {
  clearErrors();
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) return showError('reg-error', 'Please fill in all fields.');
  if (password.length < 6) return showError('reg-error', 'Password must be at least 6 characters.');
  const users = getUsers();
  if (users.find(u => u.email === email)) return showError('reg-error', 'An account with this email already exists.');
  const newUser = { username: name, email, password, role: 'Explorer', joinedAt: new Date().toISOString() };
  users.push(newUser);
  saveUsers(users);
  loginUser(newUser);
}

function loginUser(user) {
  state.currentUser = user;
  store.set(STORAGE_KEYS.CURRENT_USER, user);
  showApp();
}

function logout() {
  state.currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  showAuth();
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function clearErrors() {
  document.querySelectorAll('.error-msg').forEach(e => e.classList.remove('show'));
}

// ══════════════════════════════════════════════════════════════════════════════
//  REACTIVE QUESTION-UPDATE LISTENER
//  Subscribes once; updates sidebar badge + re-renders dashboard if visible
// ══════════════════════════════════════════════════════════════════════════════

function setupQuestionUpdateListener() {
  window.addEventListener('questionUpdate', (e) => {
    // Always update the sidebar badge
    const badge = document.getElementById('total-q-badge');
    if (badge) {
      badge.textContent = e.detail.total;
      badge.classList.add('badge-pop');
      setTimeout(() => badge.classList.remove('badge-pop'), 400);
    }

    // Live-refresh dashboard stats + charts if currently on dashboard page
    if (state.currentPage === 'dashboard') {
      refreshDashboardStats();
    }

    // Live-refresh Q&A grid if currently on explorer page
    if (state.currentPage === 'explorer') {
      renderQuestionGrid();
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  SIDEBAR & TOP BAR
// ══════════════════════════════════════════════════════════════════════════════

function renderSidebar() {
  const { username, role } = state.currentUser;
  const initials = username.substring(0, 2).toUpperCase();

  document.getElementById('sidebar-username').textContent = username;
  document.getElementById('sidebar-role').textContent     = role;
  document.getElementById('sidebar-avatar').textContent   = initials;
  document.getElementById('total-q-badge').textContent    = getAllQuestions().length;

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  document.getElementById('logout-btn').addEventListener('click', logout);
}

function setupTopbarSearch() {
  const searchInput = document.getElementById('topbar-search');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    state.explorerSearch = searchInput.value;
    if (state.currentPage === 'explorer') renderQuestionGrid();
  });
}

function updateNavActive() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.classList.toggle('active', item.dataset.page === state.currentPage);
  });
}

function updateTopbarTitle() {
  const titles = {
    dashboard: '💎 Diamond <span>Dashboard</span>',
    explorer:  '🔍 Q&A <span>Explorer</span>',
    add:       '➕ Add <span>Question</span>',
    profile:   '👤 My <span>Profile</span>',
    agent:     '🤖 AI <span>Agent</span>',
  };
  const el = document.getElementById('topbar-title');
  if (el) el.innerHTML = titles[state.currentPage] || '';
}

// ══════════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════

function navigateTo(page) {
  state.currentPage = page;
  updateNavActive();
  updateTopbarTitle();
  const area = document.getElementById('page-content');
  area.innerHTML = '';
  area.style.animation = 'none';
  requestAnimationFrame(() => { area.style.animation = ''; });

  if (page === 'dashboard') renderDashboard(area);
  if (page === 'explorer')  renderExplorer(area);
  if (page === 'add')       renderAddQuestion(area);
  if (page === 'profile')   renderProfile(area);
  if (page === 'agent')     renderAgent(area);
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════════════════

function renderDashboard(container) {
  if (!container) container = document.getElementById('page-content');
  container.innerHTML = `
    <!-- Stat Cards -->
    <div class="stats-grid" id="stats-grid"></div>

    <!-- AI Agent teaser -->
    <div class="agent-teaser" id="agent-teaser"></div>

    <!-- JSON Source Banner -->
    <div class="json-banner">
      <span class="json-banner-icon">📄</span>
      <div>
        <strong>Live Dataset:</strong> diamonds.json
        &nbsp;·&nbsp; ${state.datasetMeta.title || 'Diamond Knowledge Dataset'}
        &nbsp;·&nbsp; v${state.datasetMeta.version || '1.0'}
        &nbsp;·&nbsp; <span id="json-total">${getAllQuestions().length}</span> total questions
      </div>
      <div class="live-dot" style="margin-left:auto"></div>
    </div>

    <!-- Charts Row -->
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title"><span class="dot"></span>Questions by Category</div>
        <div class="chart-container"><canvas id="chart-bar"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title"><span class="dot"></span>Category Breakdown</div>
        <div class="chart-container"><canvas id="chart-doughnut"></canvas></div>
        <div class="category-legend" id="cat-legend"></div>
      </div>
    </div>

    <!-- Difficulty Distribution -->
    <div class="charts-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:28px">
      ${['Beginner','Intermediate','Advanced'].map(diff => {
        const count = getAllQuestions().filter(q => q.difficulty === diff).length;
        const pct   = Math.round((count / getAllQuestions().length) * 100);
        const color = DIFFICULTY_COLORS[diff];
        return `
          <div class="chart-card" style="display:flex;align-items:center;gap:16px">
            <div style="width:52px;height:52px;border-radius:12px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">
              ${diff==='Beginner'?'🟢':diff==='Intermediate'?'🟡':'🔴'}
            </div>
            <div>
              <div style="font-size:28px;font-weight:800;color:${color}" id="diff-${diff}">${count}</div>
              <div style="font-size:13px;color:var(--text-secondary)">${diff}</div>
              <div style="margin-top:6px;height:4px;width:100px;background:rgba(255,255,255,0.08);border-radius:2px">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width 1s ease"></div>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>

    ${extraChartsHTML()}

    <!-- Recent Questions -->
    <div class="section-header">
      <div class="section-title">🕐 Recent Questions</div>
      <button class="section-action" onclick="navigateTo('explorer')">View All →</button>
    </div>
    <div class="recent-list" id="recent-list"></div>
  `;

  renderStatCards();
  buildBarChart();
  buildDoughnutChart();
  buildCategoryLegend();
  buildRecentList();
  buildExtraCharts();
  setTimeout(runCountUps, 80);
  if (typeof renderAgentTeaser === 'function') renderAgentTeaser();
}

/** Re-renders ONLY the stat cards, charts, and counts — without full page rebuild */
function refreshDashboardStats() {
  renderStatCards();
  buildBarChart();
  buildDoughnutChart();
  buildCategoryLegend();
  buildRecentList();
  buildExtraCharts();

  // Update JSON banner count
  const jsonTotal = document.getElementById('json-total');
  if (jsonTotal) jsonTotal.textContent = getAllQuestions().length;

  // Update difficulty bars
  ['Beginner','Intermediate','Advanced'].forEach(diff => {
    const el = document.getElementById(`diff-${diff}`);
    if (el) el.textContent = getAllQuestions().filter(q => q.difficulty === diff).length;
  });

  setTimeout(runCountUps, 80);
}

function renderStatCards() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;
  const allQs   = getAllQuestions();
  const userQs  = store.getArr(STORAGE_KEYS.USER_QUESTIONS);
  const cats    = Object.keys(CATEGORIES);

  grid.innerHTML = `
    ${statCard('💎', 'Total Questions',   allQs.length,    'var(--grad-primary)', 'rgba(6,182,212,0.12)',   `+${userQs.length} community`, 'up')}
    ${statCard('👥', 'Registered Users',  getUsers().length, 'var(--grad-gold)',    'rgba(245,158,11,0.12)', 'Active users', 'up')}
    ${statCard('📂', 'Categories',        cats.length,     'var(--grad-green)',   'rgba(16,185,129,0.12)', '7 topics', 'neutral')}
    ${statCard('✍️', 'Contributions',     userQs.length,   'linear-gradient(135deg,#8b5cf6,#ec4899)', 'rgba(139,92,246,0.12)', 'User-added Q&As', userQs.length > 0 ? 'up' : 'neutral')}
  `;
}

function statCard(icon, label, value, gradient, iconBg, change, changeType) {
  return `
    <div class="stat-card" style="--card-gradient:${gradient};--icon-bg:${iconBg}">
      <div class="stat-card-top">
        <div class="stat-icon-wrap" style="background:${iconBg}">${icon}</div>
        <div class="stat-change ${changeType}">${changeType === 'up' ? '▲' : '—'} ${change}</div>
      </div>
      <div class="stat-value"><span class="count-up" data-target="${value}">0</span></div>
      <div class="stat-label">${label}</div>
    </div>`;
}

function runCountUps() {
  document.querySelectorAll('.count-up').forEach(el => {
    const target  = parseInt(el.dataset.target, 10);
    // If already at target value, skip animation
    if (parseInt(el.textContent) === target) return;
    let current   = 0;
    const step    = Math.max(1, Math.floor(target / 40));
    const timer   = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current.toLocaleString();
      if (current >= target) clearInterval(timer);
    }, 20);
  });
}

function buildBarChart() {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;
  const allQs  = getAllQuestions();
  const cats   = Object.keys(CATEGORIES);
  const data   = cats.map(cat => allQs.filter(q => q.category === cat).length);
  const colors = cats.map(cat => CATEGORIES[cat].color);

  if (state.charts.bar) state.charts.bar.destroy();
  state.charts.bar = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: cats,
      datasets: [{
        label: 'Questions',
        data,
        backgroundColor: colors.map(c => c + '44'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11, family: 'Inter' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11, family: 'Inter' } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

function buildDoughnutChart() {
  const ctx = document.getElementById('chart-doughnut');
  if (!ctx) return;
  const allQs  = getAllQuestions();
  const cats   = Object.keys(CATEGORIES);
  const data   = cats.map(cat => allQs.filter(q => q.category === cat).length);
  const colors = cats.map(cat => CATEGORIES[cat].color);

  if (state.charts.doughnut) state.charts.doughnut.destroy();
  state.charts.doughnut = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'aa'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 10,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} questions` } }
      }
    }
  });
}

function buildCategoryLegend() {
  const legend = document.getElementById('cat-legend');
  if (!legend) return;
  const allQs = getAllQuestions();
  const total = allQs.length;
  legend.innerHTML = Object.entries(CATEGORIES).map(([cat, meta]) => {
    const count = allQs.filter(q => q.category === cat).length;
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="legend-item">
        <div class="legend-dot" style="background:${meta.color}"></div>
        <span class="legend-label">${meta.icon} ${cat}</span>
        <div class="legend-bar-wrap">
          <div class="legend-bar" style="width:${pct}%;background:${meta.color}"></div>
        </div>
        <span class="legend-count">${count}</span>
      </div>`;
  }).join('');
}

function buildRecentList() {
  const list = document.getElementById('recent-list');
  if (!list) return;
  const userQs  = store.getArr(STORAGE_KEYS.USER_QUESTIONS);
  // Show newest user-added Q's first, then pad with dataset tail
  const recents = [...userQs].reverse().slice(0, 5);
  const padded  = recents.length < 5
    ? [...recents, ...state.baseDataset.slice(-5)].slice(0, 5)
    : recents;

  list.innerHTML = padded.map(q => {
    const cat   = CATEGORIES[q.category] || { color: '#06b6d4', icon: '💎' };
    const isNew = !!q.addedBy;
    return `
      <div class="recent-item" onclick="navigateTo('explorer')">
        <div class="recent-item-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
        <div class="recent-item-body">
          <div class="recent-item-q">${escHtml(q.question)}</div>
          <div class="recent-item-meta">
            <span class="tag" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${q.category}</span>
            <span class="tag" style="background:${getDiffColor(q.difficulty)}22;color:${getDiffColor(q.difficulty)};border:1px solid ${getDiffColor(q.difficulty)}44">${q.difficulty}</span>
            ${isNew ? '<span class="badge badge-new">✨ New</span>' : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  Q&A EXPLORER PAGE
// ══════════════════════════════════════════════════════════════════════════════

function renderExplorer(container) {
  if (!container) container = document.getElementById('page-content');
  container.innerHTML = `
    <div class="explorer-controls">
      <div class="filter-tabs" id="filter-tabs">
        ${['All', ...Object.keys(CATEGORIES)].map(cat => `
          <button class="filter-tab ${state.explorerFilter === cat ? 'active' : ''}"
                  style="${state.explorerFilter === cat && cat !== 'All' ? `background:${CATEGORIES[cat]?.color};border-color:${CATEGORIES[cat]?.color}` : ''}"
                  data-filter="${cat}">
            ${cat === 'All' ? '🔷 All' : CATEGORIES[cat].icon + ' ' + cat}
          </button>`).join('')}
      </div>
      <div style="margin-left:auto;font-size:13px;color:var(--text-secondary)">
        Showing <strong id="result-count" style="color:var(--accent-cyan)">${getAllQuestions().length}</strong> questions
      </div>
    </div>
    <div class="questions-grid" id="q-grid"></div>
  `;

  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.explorerFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach(b => {
        b.classList.remove('active');
        const c = b.dataset.filter;
        if (c !== 'All') { b.style.background = ''; b.style.borderColor = ''; b.style.color = ''; }
      });
      btn.classList.add('active');
      if (btn.dataset.filter !== 'All') {
        const color = CATEGORIES[btn.dataset.filter]?.color;
        if (color) { btn.style.background = color; btn.style.borderColor = color; btn.style.color = 'white'; }
      }
      renderQuestionGrid();
    });
  });

  renderQuestionGrid();
}

function renderQuestionGrid() {
  const grid = document.getElementById('q-grid');
  if (!grid) return;
  const allQs  = getAllQuestions();
  const search = state.explorerSearch.toLowerCase();
  const filter = state.explorerFilter;

  const filtered = allQs.filter(q => {
    const matchCat    = filter === 'All' || q.category === filter;
    const matchSearch = !search ||
      q.question.toLowerCase().includes(search) ||
      q.answer.toLowerCase().includes(search) ||
      q.category.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div class="no-results-text">No questions match your search or filter.</div>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(q => {
    const cat    = CATEGORIES[q.category] || { color: '#06b6d4', icon: '💎' };
    const isUser = !!q.addedBy;
    return `
      <div class="q-card" data-id="${q.id}" style="--cat-color:${cat.color}"
           onclick="toggleQCard(this)">
        <div class="q-card-toggle">▼</div>
        <div class="q-card-header">
          <div class="q-card-num">#${q.id}</div>
          <div class="q-card-question">${escHtml(q.question)}</div>
        </div>
        <div class="q-card-tags">
          <span class="tag tag-category" style="color:${cat.color};background:${cat.color}22;border:1px solid ${cat.color}44">
            ${cat.icon} ${q.category}
          </span>
          <span class="tag" style="background:${getDiffColor(q.difficulty)}22;color:${getDiffColor(q.difficulty)};border:1px solid ${getDiffColor(q.difficulty)}44">
            ${q.difficulty}
          </span>
          ${isUser ? `<span class="user-added-badge">✨ ${escHtml(q.addedBy)}</span>` : ''}
        </div>
        <div class="q-card-answer">${escHtml(q.answer)}</div>
      </div>`;
  }).join('');
}

function toggleQCard(card) {
  card.classList.toggle('expanded');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADD QUESTION PAGE
// ══════════════════════════════════════════════════════════════════════════════

function renderAddQuestion(container) {
  if (!container) container = document.getElementById('page-content');

  const categoryOptions = Object.keys(CATEGORIES).map(cat =>
    `<option value="${cat}">${CATEGORIES[cat].icon} ${cat}</option>`
  ).join('');

  container.innerHTML = `
    <div class="add-page-layout">
      <!-- Form -->
      <div class="glass-card">
        <div class="card-heading">📝 Add a New Question</div>
        <div class="card-subheading">
          Your question will be instantly added to the dataset — the dashboard will update automatically
          with live stat and chart refresh.
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="add-category" onchange="updatePreview()">
              ${categoryOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Difficulty</label>
            <select class="form-select" id="add-difficulty" onchange="updatePreview()">
              <option value="Beginner">🟢 Beginner</option>
              <option value="Intermediate">🟡 Intermediate</option>
              <option value="Advanced">🔴 Advanced</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Question</label>
          <input type="text" class="form-input" id="add-question"
                 placeholder="e.g., What causes the blue color in some diamonds?"
                 oninput="updatePreview()" />
        </div>

        <div class="form-group">
          <label class="form-label">Answer</label>
          <textarea class="form-textarea" id="add-answer"
                    placeholder="Provide a detailed, accurate answer..."
                    oninput="updatePreview()" rows="5"></textarea>
        </div>

        <div id="add-error" class="error-msg"></div>

        <button class="btn-primary" onclick="submitQuestion()" style="margin-top:8px">
          💎 Add to Dataset
        </button>

        <!-- Live Preview -->
        <div class="preview-card" id="q-preview" style="display:none">
          <div class="preview-label">✦ Live Preview</div>
          <div class="preview-q" id="preview-q-text">Your question appears here...</div>
          <div class="preview-a" id="preview-a-text">Your answer appears here...</div>
        </div>
      </div>

      <!-- Tips + Categories -->
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="glass-card">
          <div class="card-heading">💡 Writing Tips</div>
          <ul class="tips-list">
            <li class="tip-item"><span class="tip-icon">🎯</span><span>Be specific — good questions have clear, unambiguous answers.</span></li>
            <li class="tip-item"><span class="tip-icon">📏</span><span>Keep questions concise — ideally one sentence ending with '?'</span></li>
            <li class="tip-item"><span class="tip-icon">📖</span><span>Write comprehensive answers — include context and examples.</span></li>
            <li class="tip-item"><span class="tip-icon">🔬</span><span>Ensure factual accuracy — diamond knowledge must be correct.</span></li>
            <li class="tip-item"><span class="tip-icon">🏷️</span><span>Choose the right category for proper filtering.</span></li>
          </ul>
        </div>

        <div class="glass-card">
          <div class="card-heading" style="font-size:15px;margin-bottom:12px">📂 Dataset Status</div>
          <div style="display:flex;flex-direction:column;gap:8px" id="cat-status-list">
            ${Object.entries(CATEGORIES).map(([cat, meta]) => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${meta.color}11;border:1px solid ${meta.color}22;border-radius:8px">
                <span style="font-size:16px">${meta.icon}</span>
                <span style="font-size:13px;font-weight:600;color:${meta.color}">${cat}</span>
                <span style="font-size:12px;color:var(--text-muted);margin-left:auto" id="cat-count-${cat}">
                  ${getAllQuestions().filter(q => q.category === cat).length} questions
                </span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function updatePreview() {
  const q       = document.getElementById('add-question')?.value?.trim();
  const a       = document.getElementById('add-answer')?.value?.trim();
  const preview = document.getElementById('q-preview');
  if (!preview) return;
  if (q || a) {
    preview.style.display = 'block';
    document.getElementById('preview-q-text').textContent = q || 'Your question appears here...';
    document.getElementById('preview-a-text').textContent = a || 'Your answer appears here...';
  } else {
    preview.style.display = 'none';
  }
}

function submitQuestion() {
  const category   = document.getElementById('add-category')?.value;
  const difficulty = document.getElementById('add-difficulty')?.value;
  const question   = document.getElementById('add-question')?.value?.trim();
  const answer     = document.getElementById('add-answer')?.value?.trim();
  const errEl      = document.getElementById('add-error');

  errEl.classList.remove('show');

  if (!question || question.length < 10) {
    errEl.textContent = 'Please enter a question (at least 10 characters).';
    errEl.classList.add('show');
    return;
  }
  if (!answer || answer.length < 15) {
    errEl.textContent = 'Please enter an answer (at least 15 characters).';
    errEl.classList.add('show');
    return;
  }

  const userQs = store.getArr(STORAGE_KEYS.USER_QUESTIONS);
  const newId  = 1000 + userQs.length + 1;

  const newQ = {
    id:         newId,
    category,
    difficulty,
    question,
    answer,
    addedBy:    state.currentUser.username,
    addedAt:    new Date().toISOString(),
  };

  userQs.push(newQ);
  store.set(STORAGE_KEYS.USER_QUESTIONS, userQs);

  // ── Fire the reactive update event ──────────────────────────────────────────
  dispatchQuestionUpdate();

  // Update category counts on this same page
  Object.keys(CATEGORIES).forEach(cat => {
    const el = document.getElementById(`cat-count-${cat}`);
    if (el) el.textContent = `${getAllQuestions().filter(q => q.category === cat).length} questions`;
  });

  // Clear form
  document.getElementById('add-question').value = '';
  document.getElementById('add-answer').value   = '';
  if (document.getElementById('q-preview')) {
    document.getElementById('q-preview').style.display = 'none';
  }

  showToast(`✅ Question added! Total dataset: ${getAllQuestions().length} questions`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROFILE PAGE
// ══════════════════════════════════════════════════════════════════════════════

function renderProfile(container) {
  if (!container) container = document.getElementById('page-content');
  const { username, email, role, joinedAt } = state.currentUser;
  const myQs    = getUserQuestions(username);
  const initials = username.substring(0, 2).toUpperCase();
  const joined   = new Date(joinedAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  container.innerHTML = `
    <div class="profile-layout">
      <!-- Left -->
      <div class="glass-card">
        <div class="profile-avatar-section">
          <div class="profile-avatar-big">${initials}</div>
          <div class="profile-username">${escHtml(username)}</div>
          <div class="profile-email">${escHtml(email)}</div>
          <div style="margin-top:8px"><span class="badge badge-new">${role}</span></div>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);text-align:center;margin-bottom:16px">
          📅 Member since ${joined}
        </div>
        <div class="profile-stat-row">
          <div class="profile-stat-item">
            <div class="profile-stat-value">${myQs.length}</div>
            <div class="profile-stat-label">My Contributions</div>
          </div>
          <div class="profile-stat-item">
            <div class="profile-stat-value">${getAllQuestions().length}</div>
            <div class="profile-stat-label">Total in DB</div>
          </div>
        </div>
        <button class="btn-primary" style="margin-top:20px" onclick="navigateTo('add')">
          ➕ Add New Question
        </button>
        <button class="btn-danger" style="width:100%;margin-top:12px" onclick="logout()">
          🚪 Sign Out
        </button>
      </div>

      <!-- Right -->
      <div class="glass-card">
        <div class="card-heading">📝 My Contributions</div>
        <div class="card-subheading">Questions you've added to the Diamond Dataset.</div>
        ${myQs.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">💎</div>
            <div class="empty-state-text">You haven't added any questions yet.</div>
            <button class="btn-primary" style="width:auto;padding:12px 28px;margin-top:16px" onclick="navigateTo('add')">
              Add Your First Question
            </button>
          </div>
        ` : `
          <div class="user-questions-list">
            ${myQs.map((q, i) => {
              const cat  = CATEGORIES[q.category] || { color:'#06b6d4', icon:'💎' };
              const date = new Date(q.addedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'});
              return `
                <div class="user-q-item">
                  <div class="user-q-num">#${i + 1}</div>
                  <div class="user-q-text">
                    <div style="font-weight:600;margin-bottom:6px">${escHtml(q.question)}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${escHtml(q.answer.substring(0, 90))}...</div>
                    <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
                      <span class="tag" style="color:${cat.color};background:${cat.color}22;border:1px solid ${cat.color}44;font-size:11px">${cat.icon} ${q.category}</span>
                      <span style="font-size:11px;color:var(--text-muted)">📅 ${date}</span>
                    </div>
                  </div>
                  <div class="user-q-actions">
                    <button class="btn-danger" onclick="deleteUserQuestion(${q.id}, event)" title="Delete">🗑</button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function deleteUserQuestion(id, event) {
  event.stopPropagation();
  let userQs = store.getArr(STORAGE_KEYS.USER_QUESTIONS);
  userQs = userQs.filter(q => q.id !== id);
  store.set(STORAGE_KEYS.USER_QUESTIONS, userQs);

  // Fire reactive update
  dispatchQuestionUpdate();

  showToast('🗑️ Question deleted. Dataset updated.');
  navigateTo('profile');
}

// ══════════════════════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════════════════════

function showToast(msg) {
  const toast = document.getElementById('success-toast');
  if (!toast) return;
  toast.querySelector('.toast-msg').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getDiffColor(diff) { return DIFFICULTY_COLORS[diff] || '#94a3b8'; }

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
