/**
 * SE Dictionary – Service Worker (Manifest V3)
 *
 * Runs once on install/update to seed the IndexedDB database from the
 * bundled ENtoSI.json dictionary file.  After seeding, the popup reads
 * directly from IndexedDB without needing this worker to be alive.
 */

const DB_NAME    = 'se_dictionary';
const DB_VERSION = 1;
const STORE      = 'entries';

/** Open (and, if necessary, upgrade) the dictionary database. */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        // Index on English key for EN→SI lookups and prefix queries
        store.createIndex('en', 'en', { unique: false });
        // Index on Sinhala value for SI→EN lookups and prefix queries
        store.createIndex('si', 'si', { unique: false });
      }
    };

    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror   = ({ target: { error  } }) => reject(error);
  });
}

/** Fetch the bundled JSON and bulk-insert all entries into IndexedDB. */
async function seedDictionary(db) {
  const url      = chrome.runtime.getURL('ENtoSI.json');
  const response = await fetch(url);
  const raw      = await response.json();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    // Wipe any stale data from a previous version before re-seeding.
    store.clear();

    for (const item of raw) {
      const en = Object.keys(item)[0];
      const si = item[en];
      store.put({ en, si });
    }

    tx.oncomplete = () => resolve();
    tx.onerror    = ({ target: { error } }) => reject(error);
  });
}

/**
 * Return the number of entries currently stored.
 * Used to skip re-seeding if the database is already populated on a
 * fresh install where onInstalled fires multiple times in rare edge cases.
 */
function countEntries(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;

  try {
    const db    = await openDB();
    const count = await countEntries(db);

    // On update, always re-seed so the dictionary stays current.
    // On install, seed only if the store is empty (safety guard).
    if (reason === 'update' || count === 0) {
      console.log('[SE Dictionary] Seeding dictionary…');
      await seedDictionary(db);
      console.log('[SE Dictionary] Done – entries stored.');
    }

    db.close();
  } catch (err) {
    console.error('[SE Dictionary] Failed to seed dictionary:', err);
  }
});
