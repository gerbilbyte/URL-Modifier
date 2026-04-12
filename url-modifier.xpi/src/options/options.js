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

// ── Nav ───────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    $('s-' + item.dataset.s).classList.add('active');
  });
});

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() { renderStatus(); renderTable(); renderCount(); runTest(); }

function renderStatus() {
  const pill = $('toggleBtn');
  pill.className = 'toggle-pill' + (active ? ' on' : '');
  $('statusTxt').textContent = active ? 'Active' : 'Inactive';
}

function renderCount() {
  const n = rules.length;
  $('rule-count').textContent = n + ' rule' + (n === 1 ? '' : 's');
}

function renderTable() {
  const tb = $('tbody');
  tb.innerHTML = '';
  if (!rules.length) {
    tb.innerHTML = '<tr class="empty-row"><td colspan="6">No rules yet — click <strong>+ Add Rule</strong> to create one.</td></tr>';
    return;
  }
  rules.forEach(r => tb.appendChild(makeRow(r)));
}

function makeRow(rule) {
  const tr = document.createElement('tr');

  const nameTd = td(); const nameEl = inp(rule.name, 'name-c', 'Rule name');
  nameEl.addEventListener('input', () => { rule.name = nameEl.value; save(); });
  nameTd.appendChild(nameEl);

  const patTd = td(); const patEl = inp(rule.pattern, '', 'regex or literal');
  checkRe(patEl, rule.pattern);
  patEl.addEventListener('input', () => { rule.pattern = patEl.value; checkRe(patEl, rule.pattern); save(); runTest(); });
  patTd.appendChild(patEl);

  const modTd = td(); const modEl = inp(rule.modification, '', 'replacement');
  modEl.addEventListener('input', () => { rule.modification = modEl.value; save(); runTest(); });
  modTd.appendChild(modEl);

  const modeTd = td();
  const pills = document.createElement('div'); pills.className = 'mode-pills';
  ['before','replace','after'].forEach(m => {
    const id = rule.id + '-' + m;
    const r = Object.assign(document.createElement('input'), { type:'radio', name:'mode-'+rule.id, id, value:m });
    if (rule.mode === m) r.checked = true;
    r.addEventListener('change', () => { rule.mode = m; save(); runTest(); });
    const l = Object.assign(document.createElement('label'), { htmlFor: id });
    l.textContent = m[0].toUpperCase() + m.slice(1);
    pills.appendChild(r); pills.appendChild(l);
  });
  modeTd.appendChild(pills);

  const togTd = td();
  const tog = document.createElement('div');
  tog.className = 'tog' + (rule.enabled ? ' on' : '');
  tog.addEventListener('click', () => { rule.enabled = !rule.enabled; tog.className = 'tog' + (rule.enabled ? ' on' : ''); save(); runTest(); });
  togTd.appendChild(tog);

  const delTd = td();
  const del = document.createElement('button'); del.className = 'del-btn'; del.textContent = '✕';
  del.addEventListener('click', () => { rules = rules.filter(r => r.id !== rule.id); save(); renderTable(); renderCount(); runTest(); });
  delTd.appendChild(del);

  [nameTd, patTd, modTd, modeTd, togTd, delTd].forEach(c => tr.appendChild(c));
  return tr;
}

function td() { return document.createElement('td'); }
function inp(val, cls, ph) {
  const el = Object.assign(document.createElement('input'), { type:'text', value:val, placeholder:ph });
  if (cls) el.className = cls;
  return el;
}
function checkRe(el, p) {
  if (!p) { el.classList.remove('bad'); return; }
  try { new RegExp(p); el.classList.remove('bad'); } catch(_) { el.classList.add('bad'); }
}

// ── Save ──────────────────────────────────────────────────────────────────────
function save() { browser.runtime.sendMessage({ type: 'SET_RULES', rules }); }

// ── Test ──────────────────────────────────────────────────────────────────────
function applyLocally(url) {
  let r = url;
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, 'gi');
      if (rule.mode === 'before')   r = r.replace(re, m => rule.modification + m);
      else if (rule.mode === 'replace') r = r.replace(re, rule.modification);
      else if (rule.mode === 'after')   r = r.replace(re, m => m + rule.modification);
    } catch(_) {
      const esc = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
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
  if (!url) { out.textContent = '—'; out.className = 'test-out same'; return; }
  try {
    const result = applyLocally(url);
    out.textContent = result;
    out.className = 'test-out' + (result === url ? ' same' : '');
  } catch(e) { out.textContent = 'Error: ' + e.message; out.className = 'test-out err'; }
}
$('test-in').addEventListener('input', runTest);

// ── Events ────────────────────────────────────────────────────────────────────
$('toggleBtn').addEventListener('click', () => {
  active = !active;
  browser.runtime.sendMessage({ type: 'SET_ACTIVE', active });
  renderStatus(); toast(active ? '✓ Activated' : '○ Deactivated');
});

$('btnAdd').addEventListener('click', () => {
  rules.push({ id: uid(), name:'', pattern:'', modification:'', mode:'replace', enabled:true });
  save(); renderTable(); renderCount();
  const rows = $('tbody').querySelectorAll('tr:not(.empty-row)');
  rows[rows.length-1]?.querySelector('input')?.focus();
});

$('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(rules, null, 2)], { type:'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download:'url-modifier-rules.json' });
  a.click(); URL.revokeObjectURL(a.href); toast('✓ Exported');
});

$('btnImport').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => {
  const file = $('file-input').files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Expected JSON array');
      rules = data.map(r => ({
        id: r.id || uid(), name: r.name||'', pattern: r.pattern||'',
        modification: r.modification||'',
        mode: ['before','replace','after'].includes(r.mode) ? r.mode : 'replace',
        enabled: r.enabled !== false
      }));
      save(); renderAll();
      toast('✓ Imported ' + rules.length + ' rule' + (rules.length===1?'':'s'));
    } catch(err) { toast('✗ ' + err.message); }
    $('file-input').value = '';
  };
  reader.readAsText(file);
});

$('btnClear').addEventListener('click', () => {
  if (!rules.length) return;
  if (!confirm('Delete all ' + rules.length + ' rule' + (rules.length===1?'':'s') + '?')) return;
  rules = []; save(); renderAll(); toast('✓ Cleared');
});

function uid() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16);
      });
}
function toast(msg, ms=2200) {
  const el=$('toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),ms);
}
