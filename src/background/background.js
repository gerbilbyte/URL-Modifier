/**
 * URL Modifier — Background Script
 *
 * Problem: When an external app, such as Signal, opens a URL, Firefox cold-starts
 * and the Intent URL is queued before the background script has run at all.
 * The webRequest listener fires before storage is loaded, so cachedActive is
 * false and the request passes through unchanged.
 *
 * Solution — three independent interception layers:
 *
 *  Layer 1 — webRequest.onBeforeRequest (registered synchronously at top level)
 *    Catches most requests. The handler awaits storage if the cache isn't warm.
 *    Because the listener is registered synchronously, Firefox holds the request
 *    open while we await — this is the key fix for the cold-start race.
 *
 *  Layer 2 — webNavigation.onBeforeNavigate
 *    Fires slightly later than webRequest but catches navigations that somehow
 *    slip through. We issue a programmatic tabs.update redirect here.
 *
 *  Layer 3 — tabs.onUpdated (URL change detection)
 *    Last resort. If a tab loads a URL that should have been rewritten, we
 *    catch it here and immediately redirect the tab. Visible as a very brief
 *    flash to the wrong URL, but it always corrects.
 */

const KEY_RULES  = 'urlModifierRules';
const KEY_ACTIVE = 'urlModifierActive';

let cachedRules  = null;   // null = not loaded yet
let cachedActive = null;   // null = not loaded yet

// Storage load promise — resolved once we have state from disk
let storageReady;
const storagePromise = new Promise(resolve => { storageReady = resolve; });

// Redirect loop guards
const redirectedByWebRequest   = new Set();
const redirectedByNavigation   = new Set();
const redirectedByTabsUpdated  = new Set();

const ALL_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
  'font', 'object', 'xmlhttprequest', 'ping', 'beacon',
  'media', 'websocket', 'csp_report', 'imageset',
  'web_manifest', 'speculative', 'other'
];

// ── Storage helpers ───────────────────────────────────────────────────────────

async function loadStorage() {
  const data = await browser.storage.local.get([KEY_RULES, KEY_ACTIVE]);
  cachedRules  = data[KEY_RULES]  || [];
  cachedActive = data[KEY_ACTIVE] || false;
  storageReady();   // unblock any awaiting handlers
  updateIcon();
}

// Keep cache in sync whenever popup/options saves changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[KEY_RULES])  cachedRules  = changes[KEY_RULES].newValue  || [];
  if (changes[KEY_ACTIVE]) cachedActive = changes[KEY_ACTIVE].newValue || false;
  updateIcon();
});

// ── Boot — runs synchronously, kicks off async storage load ──────────────────
loadStorage();  // do not await — let it run in background

// ── LAYER 1: webRequest.onBeforeRequest ──────────────────────────────────────
// Registered synchronously at top level so it is attached before any
// cold-start Intent URL fires.
// The handler is async — Firefox will hold the request open while we await.
browser.webRequest.onBeforeRequest.addListener(
  onBeforeRequest,
  { urls: ['<all_urls>'], types: ALL_TYPES },
  ['blocking']
);

async function onBeforeRequest(details) {
  const url = details.url;
  if (url.startsWith('moz-extension://')) return {};
  if (redirectedByWebRequest.has(url)) { redirectedByWebRequest.delete(url); return {}; }

  // If cache not warm yet, wait for storage (happens on cold start)
  if (cachedRules === null || cachedActive === null) {
    await storagePromise;
  }

  if (!cachedActive || !cachedRules.length) return {};

  const modified = applyRules(url, cachedRules);
  if (!modified || modified === url) return {};

  try { new URL(modified); } catch (_) {
    console.warn('[URLModifier] Layer1: invalid rewrite, skipping:', modified);
    return {};
  }

  redirectedByWebRequest.add(modified);
  setTimeout(() => redirectedByWebRequest.delete(modified), 5000);

  console.log('[URLModifier] Layer1:', url, '->', modified);
  return { redirectUrl: modified };
}

// ── LAYER 2: webNavigation.onBeforeNavigate ───────────────────────────────────
// Fires for main-frame navigations. Catches anything Layer 1 missed.
browser.webNavigation.onBeforeNavigate.addListener(async details => {
  if (details.frameId !== 0) return;   // main frame only
  const url = details.url;
  if (url.startsWith('moz-extension://') || url === 'about:blank') return;
  if (redirectedByNavigation.has(url)) { redirectedByNavigation.delete(url); return; }

  if (cachedRules === null || cachedActive === null) await storagePromise;
  if (!cachedActive || !cachedRules.length) return;

  const modified = applyRules(url, cachedRules);
  if (!modified || modified === url) return;

  try { new URL(modified); } catch (_) { return; }

  redirectedByNavigation.add(modified);
  setTimeout(() => redirectedByNavigation.delete(modified), 5000);

  console.log('[URLModifier] Layer2:', url, '->', modified);
  browser.tabs.update(details.tabId, { url: modified }).catch(() => {});
});

// ── LAYER 3: tabs.onUpdated ───────────────────────────────────────────────────
// Last resort — if a tab actually starts loading a URL that should have been
// rewritten, redirect it immediately. May cause a brief flash.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  if (url.startsWith('moz-extension://') || url === 'about:blank') return;
  if (redirectedByTabsUpdated.has(url)) { redirectedByTabsUpdated.delete(url); return; }

  if (cachedRules === null || cachedActive === null) await storagePromise;
  if (!cachedActive || !cachedRules.length) return;

  const modified = applyRules(url, cachedRules);
  if (!modified || modified === url) return;

  try { new URL(modified); } catch (_) { return; }

  redirectedByTabsUpdated.add(modified);
  setTimeout(() => redirectedByTabsUpdated.delete(modified), 5000);

  console.log('[URLModifier] Layer3:', url, '->', modified);
  browser.tabs.update(tabId, { url: modified }).catch(() => {});
});

// ── Rule application ──────────────────────────────────────────────────────────
function applyRules(url, rules) {
  let result = url;
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, 'gi');
      if      (rule.mode === 'before')  result = result.replace(re, m => rule.modification + m);
      else if (rule.mode === 'replace') result = result.replace(re, rule.modification);
      else if (rule.mode === 'after')   result = result.replace(re, m => m + rule.modification);
    } catch (_) {
      const esc = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re  = new RegExp(esc, 'gi');
      if      (rule.mode === 'before')  result = result.replace(re, m => rule.modification + m);
      else if (rule.mode === 'replace') result = result.replace(re, rule.modification);
      else if (rule.mode === 'after')   result = result.replace(re, m => m + rule.modification);
    }
  }
  return result;
}

// ── Icon ──────────────────────────────────────────────────────────────────────
function updateIcon() {
  const suffix = cachedActive ? 'on' : 'off';
  browser.action.setIcon({
    path: {
      16:  'src/icons/icon-' + suffix + '-16.png',
      32:  'src/icons/icon-' + suffix + '-32.png',
      48:  'src/icons/icon-' + suffix + '-48.png',
      128: 'src/icons/icon-' + suffix + '-128.png'
    }
  }).catch(() => {});
  browser.action.setTitle({
    title: cachedActive ? 'URL Modifier — Active' : 'URL Modifier — Inactive'
  });
}

// ── Message handler ───────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((msg, _sender) => {
  if (msg.type === 'GET_STATE') {
    return Promise.resolve({ rules: cachedRules || [], active: cachedActive || false });
  }
  if (msg.type === 'SET_RULES') {
    cachedRules = msg.rules;
    browser.storage.local.set({ [KEY_RULES]: cachedRules });
    return Promise.resolve({ ok: true });
  }
  if (msg.type === 'SET_ACTIVE') {
    cachedActive = msg.active;
    browser.storage.local.set({ [KEY_ACTIVE]: cachedActive });
    updateIcon();
    return Promise.resolve({ ok: true });
  }
  return Promise.resolve({ error: 'unknown message' });
});
