/* ─────────────────────────────────────────────────────────────────────────────
   kcal — AI-powered calorie tracker
   app.js — all state, rendering, API, and storage logic
───────────────────────────────────────────────────────────────────────────── */

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY   = 'kcal_data_v2';
const GOAL_KEY      = 'kcal_goal_v1';
const APIKEY_KEY    = 'kcal_apikey_v1';
const API_URL       = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-20250514';

// ── State ─────────────────────────────────────────────────────────────────────
let data      = {};   // { 'YYYY-MM-DD': [ { name, kcal, time } ] }
let goal      = 2000;
let apiKey    = '';
let chartInst = null;
let loading   = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function fmtNum(n)   { return Math.round(n).toLocaleString(); }
function nowTime()   { return `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`; }

function getToday()  { return data[todayKey()] || []; }

// ── Storage ───────────────────────────────────────────────────────────────────
function loadStorage() {
  try { data   = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { data = {}; }
  try { goal   = parseInt(localStorage.getItem(GOAL_KEY)) || 2000; }      catch { goal = 2000; }
  try { apiKey = localStorage.getItem(APIKEY_KEY) || ''; }                 catch { apiKey = ''; }
}

function saveData()   { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function saveGoal()   { localStorage.setItem(GOAL_KEY,    String(goal)); }
function saveApiKey() { localStorage.setItem(APIKEY_KEY,  apiKey); }

// ── Anthropic API ─────────────────────────────────────────────────────────────
async function estimateCalories(userInput) {
  if (!apiKey) throw new Error('NO_API_KEY');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            apiKey,
      'anthropic-version':    '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: `You are a precise calorie estimation assistant. The user describes food they just ate.
Reply ONLY with a single raw JSON object — no markdown, no backticks, no explanation.
Fields:
  "kcal"  — integer, your best realistic estimate of total calories
  "label" — short clean food name (e.g. "Bowl of oatmeal with banana", "2 slices pepperoni pizza")
Assume typical/average serving size when amounts are unspecified. Be accurate, not conservative.`,
      messages: [{ role: 'user', content: userInput }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const json  = await response.json();
  const raw   = (json.content || []).map(c => c.text || '').join('').trim();
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── Submit food ───────────────────────────────────────────────────────────────
async function submitFood() {
  if (loading) return;

  const input = document.getElementById('foodInput');
  const value = input.value.trim();
  if (!value) return;

  if (!apiKey) {
    showError('Add your Anthropic API key in Settings first.');
    return;
  }

  setLoading(true);
  clearError();

  try {
    const result = await estimateCalories(value);
    const kcal   = Math.round(Number(result.kcal));
    const label  = result.label || value;
    const key    = todayKey();

    if (!data[key]) data[key] = [];
    data[key].push({ name: label, kcal, time: nowTime() });

    saveData();
    input.value = '';
    renderToday();
  } catch (e) {
    if (e.message === 'NO_API_KEY') {
      showError('Add your Anthropic API key in Settings first.');
    } else {
      showError('Could not estimate — check your API key or try again.');
      console.error('[kcal] API error:', e);
    }
  }

  setLoading(false);
  input.focus();
}

// ── Delete entry ──────────────────────────────────────────────────────────────
function deleteItem(index) {
  const key = todayKey();
  if (!data[key]) return;
  // index is from reversed list, so invert back
  const realIndex = data[key].length - 1 - index;
  data[key].splice(realIndex, 1);
  saveData();
  renderToday();
}

// ── Clear all data ────────────────────────────────────────────────────────────
function clearAll() {
  if (!confirm('Clear all calorie data? This cannot be undone.')) return;
  data = {};
  saveData();
  renderToday();
  renderStats();
}

// ── UI state helpers ──────────────────────────────────────────────────────────
function setLoading(state) {
  loading = state;
  const btn   = document.getElementById('sendBtn');
  const txt   = document.getElementById('loadingText');
  const input = document.getElementById('foodInput');

  input.disabled = state;
  txt.style.display = state ? 'block' : 'none';

  if (state) {
    btn.classList.add('loading');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>`;
  } else {
    btn.classList.remove('loading');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </svg>`;
  }
}

function showError(msg)  { document.getElementById('errMsg').textContent = msg; }
function clearError()    { document.getElementById('errMsg').textContent = ''; }

// ── Render: today ─────────────────────────────────────────────────────────────
function renderToday() {
  const today = getToday();
  const total = today.reduce((s, i) => s + i.kcal, 0);

  // Totals
  document.getElementById('totalNum').textContent = fmtNum(total);

  // Progress bar
  const pct = Math.min(100, Math.round((total / goal) * 100));
  const bar  = document.getElementById('goalBar');
  bar.style.width = pct + '%';
  bar.classList.toggle('over', total > goal);

  document.getElementById('goalLeft').textContent  = fmtNum(total) + ' kcal';
  document.getElementById('goalRight').textContent = 'goal: ' + fmtNum(goal) + ' kcal';

  // Log list
  const list  = document.getElementById('logList');
  const empty = document.getElementById('emptyState');
  const label = document.getElementById('logLabel');
  list.innerHTML = '';

  if (today.length === 0) {
    empty.style.display = 'block';
    label.style.display = 'none';
  } else {
    empty.style.display = 'none';
    label.style.display = '';
    [...today].reverse().forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'log-item';
      li.innerHTML = `
        <div class="log-dot"></div>
        <div class="log-name">${escHtml(item.name)}</div>
        <div class="log-time">${escHtml(item.time)}</div>
        <div class="log-kcal">+${fmtNum(item.kcal)} kcal</div>
        <button class="del-btn" onclick="deleteItem(${idx})" aria-label="Remove ${escHtml(item.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>`;
      list.appendChild(li);
    });
  }
}

// ── Render: date string ───────────────────────────────────────────────────────
function renderDate() {
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  document.getElementById('dateStr').textContent =
    new Date().toLocaleDateString('en-US', opts).toLowerCase();
}

// ── Render: stats ─────────────────────────────────────────────────────────────
function renderStats() {
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const entries = data[key] || [];
    const total   = entries.reduce((s, x) => s + x.kcal, 0);
    const label   = i === 0 ? 'today' : i === 1 ? 'yday' :
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    last7.push({ key, label, total, count: entries.length });
  }

  const totals  = last7.map(d => d.total).filter(v => v > 0);
  const avg     = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const maxVal  = totals.length ? Math.max(...totals) : 0;
  const streak  = calcStreak();
  const allMeals = Object.values(data).flat().length;

  // Metric cards
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-val">${fmtNum(avg)}</div><div class="stat-lbl">avg / day</div></div>
    <div class="stat-card"><div class="stat-val">${fmtNum(maxVal)}</div><div class="stat-lbl">peak day</div></div>
    <div class="stat-card"><div class="stat-val">${streak}</div><div class="stat-lbl">day streak</div></div>
    <div class="stat-card"><div class="stat-val">${allMeals}</div><div class="stat-lbl">total meals</div></div>`;

  // Chart
  renderChart(last7);

  // History list
  const histList = document.getElementById('histList');
  histList.innerHTML = '';
  const historical = [...last7].reverse().filter(d => d.total > 0);

  if (historical.length === 0) {
    histList.innerHTML = '<p class="empty-stats">no history yet — start logging today</p>';
  } else {
    historical.forEach(d => {
      const pct = Math.min(100, Math.round((d.total / goal) * 100));
      const div = document.createElement('div');
      div.className = 'hist-item';
      div.innerHTML = `
        <div class="hist-date">${d.key}</div>
        <div class="hist-bar-wrap">
          <div class="hist-bar${d.total > goal ? ' over' : ''}" style="width:${pct}%"></div>
        </div>
        <div class="hist-kcal">${fmtNum(d.total)} kcal</div>`;
      histList.appendChild(div);
    });
  }
}

// ── Render: chart ─────────────────────────────────────────────────────────────
function renderChart(last7) {
  if (chartInst) { chartInst.destroy(); chartInst = null; }

  const dark     = matchMedia('(prefers-color-scheme: dark)').matches;
  const barColor = dark ? '#6AAF7A' : '#4A7C59';
  const barOver  = dark ? '#E07055' : '#C45A3A';
  const barEmpty = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)';
  const gridClr  = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  const tickClr  = dark ? '#8A8A82' : '#8A8A82';

  const ctx = document.getElementById('histChart').getContext('2d');
  chartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: last7.map(d => d.label),
      datasets: [{
        data: last7.map(d => Math.round(d.total)),
        backgroundColor: last7.map(d =>
          d.total > goal ? barOver : d.total > 0 ? barColor : barEmpty),
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmtNum(ctx.raw)} kcal`,
            title: ctx => ctx[0].label
          },
          displayColors: false,
          backgroundColor: dark ? '#2C2C2A' : '#FFFFFF',
          titleColor:      dark ? '#F2F1EC' : '#1A1A18',
          bodyColor:       dark ? '#8A8A82' : '#8A8A82',
          borderColor:     dark ? '#2E2E30' : '#E0DED6',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: tickClr, font: { family: 'DM Mono, monospace', size: 11 } }
        },
        y: {
          grid: { color: gridClr },
          border: { display: false },
          ticks: {
            color: tickClr,
            font: { family: 'DM Mono, monospace', size: 11 },
            callback: v => v === 0 ? '0' : fmtNum(v)
          }
        }
      }
    }
  });
}

// ── Calc streak ───────────────────────────────────────────────────────────────
function calcStreak() {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (data[key] && data[key].length > 0) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function showTab(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'stats')    renderStats();
  if (name === 'settings') renderSettings();
}

// ── Settings ──────────────────────────────────────────────────────────────────
function renderSettings() {
  document.getElementById('goalInputSet').value = goal;
  const keyInput = document.getElementById('apiKeyInput');
  if (keyInput) {
    keyInput.value = apiKey;
    updateApiKeyStatus();
  }
}

function onGoalChange(val) {
  const parsed = parseInt(val);
  if (parsed >= 100 && parsed <= 99999) {
    goal = parsed;
    saveGoal();
    renderToday();
  }
}

function onApiKeyChange(val) {
  apiKey = val.trim();
  saveApiKey();
  updateApiKeyStatus();
}

function updateApiKeyStatus() {
  const el = document.getElementById('apiKeyStatus');
  if (!el) return;
  if (!apiKey) {
    el.textContent = 'no key set';
    el.className = 'key-status missing';
  } else if (apiKey.startsWith('sk-ant-')) {
    el.textContent = '✓ key saved';
    el.className = 'key-status ok';
  } else {
    el.textContent = 'key format looks wrong';
    el.className = 'key-status warn';
  }
}

// ── Check for tab param in URL ────────────────────────────────────────────────
function checkUrlTab() {
  const params = new URLSearchParams(window.location.search);
  const tab    = params.get('tab');
  if (tab === 'stats' || tab === 'settings') {
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    if (btn) showTab(tab, btn);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  loadStorage();
  renderDate();
  renderToday();
  checkUrlTab();

  // Enter key on food input
  document.getElementById('foodInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitFood();
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then(reg => {
      console.log('[kcal] Service worker registered:', reg.scope);
    }).catch(err => {
      console.warn('[kcal] Service worker registration failed:', err);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
