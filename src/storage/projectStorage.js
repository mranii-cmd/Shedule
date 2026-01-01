/**
 * projectStorage.js
 *
 * API principale :
 *  - saveProject(obj) -> Promise<boolean>
 *  - loadProject() -> Promise<object|null>
 *  - exportProject() -> Promise<string>   (JSON string)
 *  - importProject(jsonOrObj) -> Promise<object> (returns normalized state saved)
 *  - backupCurrent(prefix) -> Promise<string> (key of backup)
 *
 * Behavior:
 *  - Uses window.DatabaseService.save/load if present, otherwise localStorage 'project_state'.
 *  - Creates backups before wholesale writes.
 *  - Cleans "undefined" literals and replaces with null.
 *  - Validates basic shape and runs a light migration.
 */

const PROJECT_KEY = 'project_state';
const BACKUP_PREFIX = 'project_state_backup_';
const CURRENT_VERSION = '3.0-modular';

function hasDatabaseService() {
  return typeof window.DatabaseService !== 'undefined' &&
         typeof window.DatabaseService.save === 'function' &&
         typeof window.DatabaseService.load === 'function';
}

async function saveViaDB(key, value) {
  try {
    return await window.DatabaseService.save(key, value);
  } catch (e) {
    console.warn('DatabaseService.save failed, falling back to localStorage', e);
    return saveToLocalStorage(key, value);
  }
}

async function loadViaDB(key) {
  try {
    return await window.DatabaseService.load(key);
  } catch (e) {
    console.warn('DatabaseService.load failed, falling back to localStorage', e);
    return loadFromLocalStorage(key);
  }
}

function saveToLocalStorage(key, value) {
  try {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, v);
    return Promise.resolve(true);
  } catch (e) {
    return Promise.reject(e);
  }
}

function loadFromLocalStorage(key) {
  try {
    const v = localStorage.getItem(key);
    if (!v || v === 'undefined') return Promise.resolve(null);
    try {
      return Promise.resolve(JSON.parse(v));
    } catch (e) {
      // Return raw string if not JSON (unlikely)
      return Promise.resolve(v);
    }
  } catch (e) {
    return Promise.reject(e);
  }
}

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function cleanUndefinedLiterals(text) {
  // Replace literal "undefined" or bare undefined tokens conservatively
  // This tries to avoid breaking valid strings; used only on raw text input.
  return text.replace(/"\s*undefined\s*"/g, 'null').replace(/\bundefined\b/g, 'null');
}

function minimalValidate(state) {
  // Ensure at least version and header exist
  if (!state || typeof state !== 'object') return false;
  if (!state.version) state.version = CURRENT_VERSION;
  if (!state.header && state.headerInfo) state.header = state.headerInfo;
  state.header = state.header || { annee: 'inconnue', session: 'inconnue' };
  // Make arrays exist
  state.seances = Array.isArray(state.seances) ? state.seances : [];
  state.enseignants = Array.isArray(state.enseignants) ? state.enseignants : [];
  return true;
}

function migrateIfNeeded(state) {
  // Example migration hook: add missing fields, convert old shapes, etc.
  if (!state.version) state.version = 'unknown';
  // Example: older versions stored rooms in "rooms" array; convert to sallesInfo map
  if (!state.sallesInfo && Array.isArray(state.rooms)) {
    const map = {};
    state.rooms.forEach(r => {
      const id = r.code || r.name || r.id || ('R' + Math.random().toString(36).slice(2,8));
      map[id] = r.type || r.kind || 'Standard';
    });
    state.sallesInfo = map;
  }
  // Mark version
  state.version = CURRENT_VERSION;
  return state;
}

async function backupCurrent(prefix = BACKUP_PREFIX) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${prefix}${ts}`;
  const current = await loadProject();
  try {
    if (hasDatabaseService()) {
      await saveViaDB(key, current);
    } else {
      saveToLocalStorage(key, current);
    }
  } catch (e) {
    // fallback: in-memory backup
    window[key] = current;
  }
  return key;
}

async function saveProject(obj) {
  if (!obj || typeof obj !== 'object') return Promise.reject(new Error('Invalid project object'));
  const clone = deepClone(obj);
  clone.exportDate = new Date().toISOString();
  clone.version = clone.version || CURRENT_VERSION;
  // attempt backup
  try { await backupCurrent(); } catch (e){ console.warn('backup failed', e); }
  if (hasDatabaseService()) return saveViaDB(PROJECT_KEY, clone);
  return saveToLocalStorage(PROJECT_KEY, clone);
}

async function loadProject() {
  if (hasDatabaseService()) return loadViaDB(PROJECT_KEY);
  return loadFromLocalStorage(PROJECT_KEY);
}

async function exportProject() {
  const obj = await loadProject();
  if (!obj) throw new Error('No project loaded');
  return JSON.stringify(obj, null, 2);
}

async function importProject(jsonOrObj) {
  // Accept either object or JSON string
  let obj = jsonOrObj;
  if (typeof jsonOrObj === 'string') {
    const cleaned = cleanUndefinedLiterals(jsonOrObj);
    obj = JSON.parse(cleaned);
  }
  // normalize / validate / migrate
  minimalValidate(obj);
  obj = migrateIfNeeded(obj);
  // save
  await saveProject(obj);
  // keep last imported in-memory for quick access
  window._last_import_cleaned = deepClone(obj);
  return obj;
}

/* Heuristic remapping helper (safe): tries to find candidate arrays for seances/enseignants
   Returns object {mapped: {seancesKey?, enseignantsKey?}, state: normalizedState}
*/
function heuristicRemap(state) {
  const copy = deepClone(state);
  const arrays = Object.keys(copy).filter(k => Array.isArray(copy[k]) && copy[k].length > 0);
  const scoreArr = arr => {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    const keys = Object.keys(arr[0] || {});
    const fields = ['start','debut','date','heure','time','teacher','enseign','prof','salle','room','course','cours','module','title','subject'];
    let s = 0;
    keys.forEach(k => { fields.forEach(f => { if (k.toLowerCase().includes(f)) s += 1; }); });
    return s;
  };
  const candidates = arrays.map(k => ({k, len: copy[k].length, score: scoreArr(copy[k])}))
                         .sort((a,b) => b.score - a.score || b.len - a.len);
  const mapped = {};
  if ((!Array.isArray(copy.seances) || copy.seances.length === 0) && candidates.length) {
    const best = candidates.find(c => c.score > 0) || candidates[0];
    if (best) {
      copy.seances = copy[best.k];
      mapped.seancesKey = best.k;
    }
  }
  if ((!Array.isArray(copy.enseignants) || copy.enseignants.length === 0)) {
    const teacherKey = arrays.find(k => {
      const sample = copy[k][0] || {};
      return Object.keys(sample).some(kk => /nom|name|enseign|teacher|prof/i.test(kk));
    });
    if (teacherKey) {
      copy.enseignants = copy[teacherKey];
      mapped.enseignantsKey = teacherKey;
    } else if (Array.isArray(copy.seances) && copy.seances.length) {
      // try to build enseignants from seances
      const names = new Map();
      copy.seances.forEach(s => {
        const t = s.teacher || s.enseignant || s.prof || s.nom_enseignant || s.nom || s.profs || s.enseignants;
        if (!t) return;
        if (typeof t === 'string') { if (!names.has(t)) names.set(t, { nom: t }); }
        else if (typeof t === 'object') {
          const name = t.name || t.nom || t.fullname || t.label;
          if (name && !names.has(name)) names.set(name, t);
        }
      });
      if (names.size) {
        copy.enseignants = Array.from(names.values());
        mapped.enseignantsBuiltFromSeances = true;
      }
    }
  }
  return { mapped, state: copy };
}

// Exports
window.ProjectStorage = {
  saveProject,
  loadProject,
  exportProject,
  importProject,
  backupCurrent,
  heuristicRemap,
  PROJECT_KEY,
  BACKUP_PREFIX,
  CURRENT_VERSION
};