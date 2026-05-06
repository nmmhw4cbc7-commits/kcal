
Kopieren

/* ─────────────────────────────────────────────────────────────────────────────
   kcal — AI calorie tracker  |  app.js
───────────────────────────────────────────────────────────────────────────── */
 
const STORAGE_KEY = 'kcal_data_v2';
const GOAL_KEY    = 'kcal_goal_v1';
const APIKEY_KEY  = 'kcal_apikey_v1';
const API_URL     = 'https://api.anthropic.com/v1/messages';
const MODEL       = 'claude-sonnet-4-20250514';
 
let data      = {};
let goal      = 2000;
let apiKey    = '';
let chartInst = null;
let busy      = false;
 
/* ── Helpers ─────────────────────────────────────────────────────────────── */
function pad(n)    { return String(n).padStart(2, '0'); }
function fmt(n)    { return Math.round(n).toLocaleString(); }
function nowTime() { return pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()); }
 
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
 
function dayKey(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
 
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
 
function el(id) { return document.getElementById(id); }
 
/* ── Storage ─────────────────────────────────────────────────────────────── */
function loadStorage() {
  try { data   = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { data = {}; }
  try { goal   = parseInt(localStorage.getItem(GOAL_KEY), 10) || 2000;  } catch(e) { goal = 2000; }
  try { apiKey = localStorage.getItem(APIKEY_KEY) || '';                 } catch(e) { apiKey = ''; }
}
 
function saveData()   { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {} }
function saveGoal()   { try { localStorage.setItem(GOAL_KEY, String(goal));             } catch(e) {} }
function saveApiKey() { try { localStorage.setItem(APIKEY_KEY, apiKey);                 } catch(e) {} }
 
/* ── Render: today ───────────────────────────────────────────────────────── */
function renderToday() {
  const entries = data[todayKey()] || [];
  const total   = entries.reduce((s, i) => s + i.kcal, 0);
 
  el('totalNum').textContent = fmt(total);
 
  const pct = Math.min(100, Math.round((total / goal) * 100));
  el('goalBar').style.width = pct + '%';
  el('goalBar').classList.toggle('over', total > goal);
  el('goalLeft').textContent  = fmt(total) + ' kcal';
  el('goalRight').textContent = 'goal: ' + fmt(goal) + ' kcal';
 
  const list  = el('logList');
  const empty = el('emptyState');
  const label = el('logLabel');
  list.innerHTML = '';
 
  if (entries.length === 0) {
    empty.style.display = 'block';
    label.style.display = 'none';
  } else {
    empty.style.display = 'none';
    label.style.display = '';
    // show newest first
    [...entries].reverse().forEach(function(item, idx) {
      const realIdx = entries.length - 1 - idx;
      const li = document.createElement('li');
      li.className = 'log-item';
      li.innerHTML =
        '<div class="log-dot"></div>' +
        '<div class="log-name">' + esc(item.name) + '</div>' +
        '<div class="log-time">' + esc(item.time) + '</div>' +
        '<div class="log-kcal">+' + fmt(item.kcal) + ' kcal</div>' +
        '<button class="del-btn" onclick="deleteItem(' + realIdx + ')" aria-label="Remove">' +
          '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>';
      list.appendChild(li);
    });
  }
}
 
/* ── Render: date string ─────────────────────────────────────────────────── */
function renderDate() {
  el('dateStr').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  }).toLowerCase();
}
 
/* ── Render: stats ───────────────────────────────────────────────────────── */
function renderStats() {
  var last7 = [];
  for (var i = 6; i >= 0; i--) {
    var k       = dayKey(i);
    var entries = data[k] || [];
    var total   = entries.reduce(function(s, x) { return s + x.kcal; }, 0);
    var d       = new Date(); d.setDate(d.getDate() - i);
    var label   = i === 0 ? 'today' : i === 1 ? 'yday' :
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    last7.push({ key: k, label: label, total: total, count: entries.length });
  }
 
  var totals    = last7.map(function(d) { return d.total; }).filter(function(v) { return v > 0; });
  var avg       = totals.length ? Math.round(totals.reduce(function(a,b){return a+b;},0) / totals.length) : 0;
  var maxVal    = totals.length ? Math.max.apply(null, totals) : 0;
  var streak    = calcStreak();
  var allMeals  = Object.values(data).reduce(function(s,a){return s+a.length;},0);
 
  el('statsGrid').innerHTML =
    '<div class="stat-card"><div class="stat-val">' + fmt(avg)      + '</div><div class="stat-lbl">avg / day</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + fmt(maxVal)   + '</div><div class="stat-lbl">peak day</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + streak        + '</div><div class="stat-lbl">day streak</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + allMeals      + '</div><div class="stat-lbl">total meals</div></div>';
 
  buildChart(last7);
 
  var histList = el('histList');
  histList.innerHTML = '';
  var historical = last7.slice().reverse().filter(function(d) { return d.total > 0; });
 
  if (historical.length === 0) {
    histList.innerHTML = '<p class="empty-stats">no history yet — start logging today</p>';
  } else {
    historical.forEach(function(d) {
      var pct = Math.min(100, Math.round((d.total / goal) * 100));
      var div = document.createElement('div');
      div.className = 'hist-item';
      div.innerHTML =
        '<div class="hist-date">' + d.key + '</div>' +
        '<div class="hist-bar-wrap"><div class="hist-bar' + (d.total > goal ? ' over' : '') +
        '" style="width:' + pct + '%"></div></div>' +
        '<div class="hist-kcal">' + fmt(d.total) + ' kcal</div>';
      histList.appendChild(div);
    });
  }
}
 
/* ── Build chart ─────────────────────────────────────────────────────────── */
function buildChart(last7) {
  if (chartInst) { chartInst.destroy(); chartInst = null; }
 
  var dark      = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var barColor  = dark ? '#6AAF7A' : '#4A7C59';
  var barOver   = dark ? '#E07055' : '#C45A3A';
  var barEmpty  = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)';
  var gridClr   = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  var tickClr   = '#8A8A82';
 
  var ctx = el('histChart').getContext('2d');
  chartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: last7.map(function(d){ return d.label; }),
      datasets: [{
        data: last7.map(function(d){ return Math.round(d.total); }),
        backgroundColor: last7.map(function(d){
          return d.total > goal ? barOver : d.total > 0 ? barColor : barEmpty;
        }),
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
          displayColors: false,
          backgroundColor: dark ? '#2C2C2A' : '#FFFFFF',
          titleColor:      dark ? '#F2F1EC' : '#1A1A18',
          bodyColor:       '#8A8A82',
          borderColor:     dark ? '#2E2E30' : '#E0DED6',
          borderWidth: 1,
          callbacks: {
            label: function(c) { return ' ' + fmt(c.raw) + ' kcal'; }
          }
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
            callback: function(v) { return fmt(v); }
          }
        }
      }
    }
  });
}
 
/* ── Streak ──────────────────────────────────────────────────────────────── */
function calcStreak() {
  var streak = 0;
  for (var i = 0; i < 365; i++) {
    var k = dayKey(i);
    if (data[k] && data[k].length > 0) streak++;
    else if (i > 0) break;
  }
  return streak;
}
 
/* ── AI: estimate calories ───────────────────────────────────────────────── */
async function estimateCalories(text) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: 'You are a calorie estimation assistant. The user tells you what they ate. Respond ONLY with a raw JSON object — no markdown, no explanation, no backticks. Fields: "kcal" (integer, realistic calorie estimate), "label" (short clean food name). Assume average serving size when amounts are unspecified.',
      messages: [{ role: 'user', content: text }]
    })
  });
 
  if (!res.ok) {
    const err = await res.json().catch(function(){ return {}; });
    throw new Error((err.error && err.error.message) || ('HTTP ' + res.status));
  }
 
  const json  = await res.json();
  const raw   = (json.content || []).map(function(c){ return c.text || ''; }).join('').trim();
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}
 
/* ── Submit food ─────────────────────────────────────────────────────────── */
async function submitFood() {
  if (busy) return;
 
  const input = el('foodInput');
  const value = input.value.trim();
  if (!value) return;
 
  if (!apiKey) {
    showErr('Add your Anthropic API key in Settings first ↑');
    return;
  }
 
  setBusy(true);
  clearErr();
 
  try {
    const result = await estimateCalories(value);
    const kcal   = Math.round(Number(result.kcal));
    const label  = result.label || value;
    const key    = todayKey();
    if (!data[key]) data[key] = [];
    data[key].push({ name: label, kcal: kcal, time: nowTime() });
    saveData();
    input.value = '';
    renderToday();
  } catch(e) {
    console.error('[kcal]', e);
    if (e.message && e.message.toLowerCase().includes('api key')) {
      showErr('Invalid API key — check Settings.');
    } else {
      showErr('Could not estimate — check your API key or try again.');
    }
  }
 
  setBusy(false);
  input.focus();
}
 
/* ── Delete entry ────────────────────────────────────────────────────────── */
function deleteItem(index) {
  const key = todayKey();
  if (!data[key] || !data[key][index]) return;
  data[key].splice(index, 1);
  saveData();
  renderToday();
}
 
/* ── Clear all data ──────────────────────────────────────────────────────── */
function clearAll() {
  if (!confirm('Clear all calorie data? This cannot be undone.')) return;
  data = {};
  saveData();
  renderToday();
  if (el('tab-stats').classList.contains('active')) renderStats();
}
 
/* ── Settings ────────────────────────────────────────────────────────────── */
function onGoalChange(val) {
  const n = parseInt(val, 10);
  if (n >= 100 && n <= 99999) {
    goal = n;
    saveGoal();
    renderToday();
  }
}
 
function onApiKeyChange(val) {
  apiKey = val.trim();
  saveApiKey();
  updateKeyStatus();
}
 
function updateKeyStatus() {
  const s = el('apiKeyStatus');
  if (!s) return;
  if (!apiKey) {
    s.textContent = 'no key set';
    s.className   = 'missing';
  } else if (apiKey.startsWith('sk-ant-')) {
    s.textContent = '✓ key saved';
    s.className   = 'ok';
  } else {
    s.textContent = 'key format looks wrong (should start with sk-ant-)';
    s.className   = 'warn';
  }
}
 
function renderSettings() {
  el('goalInputSet').value = goal;
  el('apiKeyInput').value  = apiKey;
  updateKeyStatus();
}
 
/* ── Tabs ────────────────────────────────────────────────────────────────── */
function showTab(name, btn) {
  // hide all sections
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  // deactivate all nav buttons
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  // show chosen section
  el('tab-' + name).classList.add('active');
  // activate chosen button
  btn.classList.add('active');
  // section-specific render
  if (name === 'stats')    renderStats();
  if (name === 'settings') renderSettings();
}
 
/* ── UI helpers ──────────────────────────────────────────────────────────── */
function setBusy(state) {
  busy = state;
  const btn   = el('sendBtn');
  const txt   = el('loadingText');
  const input = el('foodInput');
  input.disabled    = state;
  txt.style.display = state ? 'block' : 'none';
  if (state) {
    btn.classList.add('loading');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
  } else {
    btn.classList.remove('loading');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  }
}
 
function showErr(msg) { el('errMsg').textContent = msg; }
function clearErr()   { el('errMsg').textContent = ''; }
 
/* ── Init ────────────────────────────────────────────────────────────────── */
function init() {
  loadStorage();
  renderDate();
  renderToday();
 
  // register service worker (only works on https or localhost, not file://)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('service-worker.js').catch(function(e) {
      console.warn('[kcal] SW registration failed:', e);
    });
  }
}
 
/* ── Explicitly expose functions called from inline HTML onclick ─────────── */
window.showTab        = showTab;
window.submitFood     = submitFood;
window.deleteItem     = deleteItem;
window.clearAll       = clearAll;
window.onGoalChange   = onGoalChange;
window.onApiKeyChange = onApiKeyChange;
 
/* ── Boot ────────────────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init(); // DOM already ready
}
 
