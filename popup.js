/**
 * SE Dictionary v2 – Popup script
 *
 * Search algorithm
 * ────────────────
 * All 134 K dictionary entries are stored in IndexedDB with two indices:
 *   • "en" index  – keyed by the English word
 *   • "si" index  – keyed by the Sinhala value
 *
 * Prefix / autocomplete queries use IDBKeyRange.bound(prefix, prefix + '\uffff')
 * which lets the browser's B-tree index skip directly to the matching range –
 * O(log n) rather than the O(n) linear scan used in v1.
 *
 * Exact-meaning lookups use index.getAll(IDBKeyRange.only(word)) which returns
 * all translations for the given word in a single indexed read.
 */

'use strict';

/* ── Constants ──────────────────────────────────────────────────────────── */
const DB_NAME      = 'se_dictionary';
const DB_VERSION   = 1;
const STORE        = 'entries';
const MAX_SUGGEST  = 10;
const DEBOUNCE_MS  = 180;
const THEME_KEY    = 'sed-theme';
const SEED_POLL_INTERVAL_MS = 1000;

/* ── DOM refs ───────────────────────────────────────────────────────────── */
const searchInput = document.getElementById('search-input');
const clearBtn    = document.getElementById('clear-btn');
const langTag     = document.getElementById('lang-tag');
const resultPane  = document.getElementById('results');
const themeBtn    = document.getElementById('theme-btn');

/* ── State ──────────────────────────────────────────────────────────────── */
let db            = null;
let debounceId    = null;
let activeIdx     = -1;
let suggestions   = [];
let mode          = 'suggest';  // 'suggest' | 'meanings'

/* ══ IndexedDB helpers ══════════════════════════════════════════════════════ */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = ({ target: { result: d } }) => {
      // Schema mirrors service-worker.js; covers the unlikely case where the
      // popup opens before the service worker has run.
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { autoIncrement: true });
        s.createIndex('en', 'en', { unique: false });
        s.createIndex('si', 'si', { unique: false });
      }
    };

    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror   = ({ target: { error  } }) => reject(error);
  });
}

/** Count total entries – used to detect whether seeding has completed. */
function countEntries() {
  if (!db) return Promise.resolve(0);
  return new Promise(resolve => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => resolve(0);
  });
}

/**
 * Prefix search via IDBKeyRange – returns up to MAX_SUGGEST unique words
 * that start with `prefix` using the named index ('en' or 'si').
 * Complexity: O(log n + k) where k = number of results returned.
 */
function prefixSearch(prefix, lang) {
  if (!db || !prefix) return Promise.resolve([]);

  return new Promise(resolve => {
    const range   = IDBKeyRange.bound(prefix, prefix + '\uffff');
    const seen    = new Set();
    const results = [];

    const req = db.transaction(STORE, 'readonly')
                  .objectStore(STORE)
                  .index(lang)
                  .openCursor(range);

    req.onsuccess = ({ target: { result: cursor } }) => {
      if (!cursor || results.length >= MAX_SUGGEST) {
        resolve(results);
        return;
      }
      const word = lang === 'en' ? cursor.value.en : cursor.value.si;
      if (!seen.has(word)) {
        seen.add(word);
        results.push(word);
      }
      cursor.continue();
    };

    req.onerror = () => resolve([]);
  });
}

/**
 * Retrieve all translations for an exact word match.
 * Returns an array of strings in the opposite language.
 */
function getMeanings(word, lang) {
  if (!db) return Promise.resolve([]);

  return new Promise(resolve => {
    const req = db.transaction(STORE, 'readonly')
                  .objectStore(STORE)
                  .index(lang)
                  .getAll(IDBKeyRange.only(word));

    req.onsuccess = ({ target: { result } }) => {
      resolve(lang === 'en' ? result.map(r => r.si) : result.map(r => r.en));
    };
    req.onerror = () => resolve([]);
  });
}

/* ══ Language detection ══════════════════════════════════════════════════ */

/** Returns true when the string contains at least one Sinhala character. */
function isSinhala(text) {
  return /[\u0D80-\u0DFF]/.test(text);
}

function getLang(text) {
  return isSinhala(text) ? 'si' : 'en';
}

/* ══ HTML helpers ════════════════════════════════════════════════════════ */

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Clamp a value between min and max (inclusive). */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* ══ Rendering ══════════════════════════════════════════════════════════ */

function showLoading() {
  resultPane.innerHTML =
    `<div class="state-msg">
       <div class="spinner"></div>
       <p>Setting up dictionary…</p>
       <p class="small">This only happens once</p>
     </div>`;
}

function showHint() {
  resultPane.innerHTML =
    `<div class="state-msg hint">
       <p>Start typing to search</p>
       <p class="small">Supports English &amp; සිංහල</p>
     </div>`;
}

function showNoResults() {
  resultPane.innerHTML =
    `<div class="state-msg"><p class="error">No results found</p></div>`;
}

function renderSuggestions(words, lang) {
  if (!words.length) { showNoResults(); return; }

  suggestions = words;
  mode        = 'suggest';
  activeIdx   = -1;

  const badgeCls = lang === 'si' ? 'si' : 'en';
  const badgeLabel = lang === 'si' ? 'SI' : 'EN';

  const html = words.map((w, i) =>
    `<div class="suggest-item" data-idx="${i}" data-word="${escHtml(w)}" role="option" tabindex="-1">` +
    `${escHtml(w)}<span class="badge ${badgeCls}">${badgeLabel}</span></div>`
  ).join('');

  resultPane.innerHTML = `<div class="suggest-list" role="listbox">${html}</div>`;

  resultPane.querySelectorAll('.suggest-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      showMeanings(el.dataset.word, lang);
    });
  });
}

async function showMeanings(word, lang) {
  const meanings = await getMeanings(word, lang);
  if (!meanings.length) { showNoResults(); return; }

  mode = 'meanings';
  searchInput.value = word;
  updateClearBtn();
  updateLangTag(word);

  const label = lang === 'en' ? 'EN → SI' : 'SI → EN';
  const items = meanings.map(m =>
    `<div class="meaning-item">${escHtml(m)}</div>`
  ).join('');

  resultPane.innerHTML =
    `<div class="meanings-card">
       <div class="meanings-header">
         <span class="word-title">${escHtml(word)}</span>
         <span class="direction-badge">${label}</span>
       </div>
       <div class="meanings-body">${items}</div>
     </div>`;
}

/* ══ Search flow ═════════════════════════════════════════════════════════ */

async function onInput() {
  const text = searchInput.value.trim();
  const lang = getLang(text);

  updateLangTag(text);
  updateClearBtn();

  if (!text) { showHint(); return; }

  const words = await prefixSearch(text, lang);
  renderSuggestions(words, lang);
}

/* ══ Keyboard navigation ════════════════════════════════════════════════ */

function moveFocus(delta) {
  if (mode !== 'suggest' || !suggestions.length) return;

  const items = resultPane.querySelectorAll('.suggest-item');
  if (!items.length) return;

  items[activeIdx]?.classList.remove('active');
  activeIdx = clamp(activeIdx + delta, -1, suggestions.length - 1);

  if (activeIdx >= 0) {
    items[activeIdx].classList.add('active');
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }
}

/* ══ Helper UI updates ══════════════════════════════════════════════════ */

function updateClearBtn() {
  clearBtn.style.display = searchInput.value ? '' : 'none';
}

function updateLangTag(text) {
  if (!text) {
    langTag.style.display = 'none';
    return;
  }
  const lang = getLang(text);
  langTag.textContent    = lang === 'si' ? 'SI' : 'EN';
  langTag.className      = lang;
  langTag.style.display  = '';
}

/* ══ Theme ══════════════════════════════════════════════════════════════ */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeBtn.title       = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

/* ══ Event listeners ════════════════════════════════════════════════════ */

searchInput.addEventListener('input', () => {
  clearTimeout(debounceId);
  debounceId = setTimeout(onInput, DEBOUNCE_MS);
});

searchInput.addEventListener('keydown', async e => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveFocus(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveFocus(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const text = searchInput.value.trim();
    const lang = getLang(text);
    if (mode === 'suggest' && activeIdx >= 0) {
      await showMeanings(suggestions[activeIdx], lang);
    } else if (text) {
      await showMeanings(text, lang);
    }
  } else if (e.key === 'Escape' && mode === 'meanings') {
    // Go back to suggestions for the current input
    await onInput();
    searchInput.focus();
  }
});

clearBtn.addEventListener('click', () => {
  searchInput.value     = '';
  langTag.style.display = 'none';
  clearBtn.style.display = 'none';
  suggestions = [];
  mode        = 'suggest';
  showHint();
  searchInput.focus();
});

themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* ══ Initialisation ════════════════════════════════════════════════════ */

(async function init() {
  // Restore user's theme preference (falls back to OS preference).
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else {
    applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  try {
    db = await openDB();
  } catch (err) {
    resultPane.innerHTML =
      `<div class="state-msg"><p class="error">Failed to open dictionary</p></div>`;
    return;
  }

  const count = await countEntries();

  if (count === 0) {
    // Service worker is still seeding – poll until data is available.
    showLoading();
    const poll = setInterval(async () => {
      const n = await countEntries();
      if (n > 0) {
        clearInterval(poll);
        showHint();
        searchInput.focus();
      }
    }, SEED_POLL_INTERVAL_MS);
    return;
  }

  showHint();
  searchInput.focus();
}());
