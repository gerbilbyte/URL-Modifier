/* global browser */
'use strict';

let rules  = [];
let active = false;

const $ = id => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────────────────────
browser.runtime.sendMessage({ type: 'GET_STATE' }).then(state => {
  rules  = state.rules  || [];
  active = state.active || false;
  renderAll();
});

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  renderStatus();
  renderRules();
  renderCount();
  runTest();
}

function renderStatus() {
  const pill = $('toggleBtn');
  pill.className = 'toggle-pill' + (active ? ' on' : '');
  $('statusTxt').textContent = active ? 'Active' : 'Inactive';
}

function renderCount() {
  const n = rules.length;
  $('rule-count').textContent = n + ' rule' + (n === 1 ? '' : 's');
}

function renderRules() {
  const list = $('rules-list');
  list.innerHTML = '';
  if (!rules.length) {
    list.innerHTML = '<div class="empty">No rules yet — click <strong>+ Add Rule</strong> to create one.</div>';
    return;
  }
  rules.forEach(r => list.appendChild(makeRow(r)));
}

function makeRow(rule) {
  const row = document.createElement('div');
  row.className = 'rule-row';
  row.dataset.id = rule.id;

  // Name
  const nameEl = inp(rule.name, 'name-f', 'Rule name');
  nameEl.addEventListener('input', () => { rule.name = nameEl.value; save(); });

  // Pattern
  const patEl = inp(rule.pattern, '', 'regex or literal');
  checkRegex(patEl, rule.pattern);
  patEl.addEventListener('input', () => {
    rule.pattern = patEl.value;
    checkRegex(patEl, rule.pattern);
    save(); runTest();
  });

  // Modification
  const modEl = inp(rule.modification, '', 'replacement text');
  modEl.addEventListener('input', () => { rule.modification = modEl.value; save(); runTest(); });

  // Mode
  const modeWrap = document.createElement('div');
  modeWrap.className = 'mode-wrap';
  ['before','replace','after'].forEach(m => {
    const id = rule.id + '-' + m;
    const radio = Object.assign(document.createElement('input'),
      { type: 'radio', name: 'mode-' + rule.id, id, value: m });
    if (rule.mode === m) radio.checked = true;
    radio.addEventListener('change', () => { rule.mode = m; save(); runTest(); });
    const lbl = Object.assign(document.createElement('label'), { htmlFor: id });
    lbl.textContent = m[0].toUpperCase() + m.slice(1);
    modeWrap.appendChild(radio);
    modeWrap.appendChild(lbl);
  });

  // Delete
  const del = document.createElement('button');
  del.className = 'del-btn';
  del.title = 'Delete';
  del.innerHTML = '✕';
  del.addEventListener('click', () => {
    rules = rules.filter(r => r.id !== rule.id);
    save(); renderRules(); renderCount(); runTest();
  });

  [nameEl, patEl, modEl, modeWrap, del].forEach(el => row.appendChild(el));
  return row;
}

function inp(val, cls, ph) {
  const el = document.createElement('input');
  el.type = 'text'; el.value = val; el.placeholder = ph;
  if (cls) el.classList.add(cls);
  return el;
}

function checkRegex(el, pat) {
  if (!pat) { el.classList.remove('bad'); return; }
  try { new RegExp(pat); el.classList.remove('bad'); }
  catch (_) { el.classList.add('bad'); }
}

// ── Save ──────────────────────────────────────────────────────────────────────
function save() {
  browser.runtime.sendMessage({ type: 'SET_RULES', rules });
}

// ── Test URL ──────────────────────────────────────────────────────────────────
function applyLocally(url) {
  let r = url;
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, 'gi');
      if (rule.mode === 'before')   r = r.replace(re, m => rule.modification + m);
      else if (rule.mode === 'replace') r = r.replace(re, rule.modification);
      else if (rule.mode === 'after')   r = r.replace(re, m => m + rule.modification);
    } catch (_) {
      const esc = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, 'gi');
      if (rule.mode === 'before')   r = r.replace(re, m => rule.modification + m);
      else if (rule.mode === 'replace') r = r.replace(re, rule.modification);
      else if (rule.mode === 'after')   r = r.replace(re, m => m + rule.modification);
    }
  }
  return r;
}

function runTest() {
  const url = $('test-in').value.trim();
  const out = $('test-out');
  if (!url) { out.textContent = '—'; out.className = 'same'; return; }
  try {
    const result = applyLocally(url);
    out.textContent = result;
    out.className = result === url ? 'same' : '';
  } catch (e) {
    out.textContent = 'Error: ' + e.message;
    out.className = 'err';
  }
}
$('test-in').addEventListener('input', runTest);

// ── Events ────────────────────────────────────────────────────────────────────
$('toggleBtn').addEventListener('click', () => {
  active = !active;
  browser.runtime.sendMessage({ type: 'SET_ACTIVE', active });
  renderStatus();
  toast(active ? '✓ Activated' : '○ Deactivated');
});

$('btnAdd').addEventListener('click', () => {
  rules.push({ id: uid(), name: '', pattern: '', modification: '', mode: 'replace', enabled: true });
  save(); renderRules(); renderCount();
  const rows = document.querySelectorAll('.rule-row');
  const last = rows[rows.length - 1];
  if (last) { last.querySelector('input').focus(); last.scrollIntoView({ block: 'nearest' }); }
});

$('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'),
    { href: URL.createObjectURL(blob), download: 'url-modifier-rules.json' });
  a.click(); URL.revokeObjectURL(a.href);
  toast('✓ Exported');
});

$('btnImport').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => {
  const file = $('file-input').files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Expected a JSON array');
      rules = data.map(r => ({
        id:           r.id || uid(),
        name:         r.name || '',
        pattern:      r.pattern || '',
        modification: r.modification || '',
        mode:         ['before','replace','after'].includes(r.mode) ? r.mode : 'replace',
        enabled:      r.enabled !== false
      }));
      save(); renderAll();
      toast('✓ Imported ' + rules.length + ' rule' + (rules.length === 1 ? '' : 's'));
    } catch (err) { toast('✗ ' + err.message); }
    $('file-input').value = '';
  };
  reader.readAsText(file);
});

$('btnOptions').addEventListener('click', () => browser.runtime.openOptionsPage());

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });
}

function toast(msg, ms = 2000) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
}
