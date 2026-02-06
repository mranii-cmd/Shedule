/* Complete app.js with bulk upload helpers, safe bulk sender and upload helpers.
   Changes from previous version:
   - Added TYPE_MAP constant and exposed window.TYPE_MAP
   - handleFilesSelected now maps provided group names to valid type_slug and stores created._group as the mapped slug
   - rest of file kept same/compatible
*/

/* globals window, document, fetch, File, FormData, URL */

// DOM element references
const eventsList = document.getElementById('events');
const qInput = document.getElementById('q');
const btnSearch = document.getElementById('btnSearch');
const loadMore = document.getElementById('loadMore');

const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const btnLogin = document.getElementById('btnLogin');
const userInfo = document.getElementById('userInfo');
const usernameDisplay = document.getElementById('usernameDisplay');
const btnLogout = document.getElementById('btnLogout');

// note: HTML uses id="createSection"; don't rely on a global variable named create
const createSection = document.getElementById('createSection');
const btnCreate = document.getElementById('btnCreate');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const startDateInput = document.getElementById('start_date');
const allDayInput = document.getElementById('all_day');

let page = 1;
const per_page = 10;

// simple in-memory cache for event objects (keyed by id)
window._eventsCache = window._eventsCache || {};

/*
 * TYPE_MAP: mappe les noms de groupe (tels qu'utilisés par l'UI) vers les slugs
 * valides côté serveur (obtenus via getTypesCached()).
 * Adapte cette map si tu as d'autres groupes.
 */
const TYPE_MAP = {
  'proces-verbaux': 'pv',
  'bordereaux': 'courrier',
  'attestations': 'autre',
  'annonces': 'autre'
};
window.TYPE_MAP = TYPE_MAP; // exposer pour debug / autres scripts

// small helpers
function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  return String(s === null || s === undefined ? '' : s).replace(/"/g, '&quot;');
}
function formatEventDate(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString();
  } catch (e) { return d; }
}
function formatTime(t) {
  if (!t) return '';
  // accept formats like "HH:MM", "HH:MM:SS", "HH:MM:SS.sssZ", or "T14:30:00Z"
  const m = String(t).match(/(\d{2}:\d{2})/);
  return m ? m[1] : String(t).slice(0, 5);
}
function formatDateTime(d, t) {
  const datePart = formatEventDate(d);
  const timePart = formatTime(t);
  return timePart ? `${datePart} · ${timePart}` : datePart;
}
/* ===== Header rendering & wiring =====
   Adds header search handling and header filters interaction.
   Place this block just after formatDateTime().
*/
async function renderHeader() {
  try {
    // update username display in header if present
    const headerUsername = document.getElementById('headerUsername');
    const loginBtn = document.getElementById('headerLoginBtn');
    const logoutBtn = document.getElementById('headerLogoutBtn');
    const username = localStorage.getItem('username') || '';
    if (headerUsername) headerUsername.textContent = username;
    if (loginBtn) loginBtn.style.display = username ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = username ? '' : 'none';

    // login / logout wiring (reuse existing modal helpers)
    if (loginBtn) {
      loginBtn.removeEventListener('click', window._headerLoginHandler);
      window._headerLoginHandler = () => {
        if (typeof window.openLoginModal === 'function') return window.openLoginModal();
        const lm = document.getElementById('loginModal');
        if (lm) lm.classList.remove('hidden');
      };
      loginBtn.addEventListener('click', window._headerLoginHandler);
    }
    if (logoutBtn) {
      logoutBtn.removeEventListener('click', window._headerLogoutHandler);
      window._headerLogoutHandler = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        showUser();
        try { renderHeader(); } catch (e) { console.debug(e); }
      };
      logoutBtn.addEventListener('click', window._headerLogoutHandler);
    }

    // populate header filter selects (if present) — robust (uses apiFetch if available, fallback otherwise)
    const headerType = document.getElementById('headerFilterType');
    const headerYear = document.getElementById('headerFilterYear');
    if (headerType || headerYear) {
      try {
        // types (use apiFetch if present so token is included)
        let types = [];
        try {
          types = (typeof apiFetch === 'function') ? await apiFetch('/types').catch(() => []) : [];
          if (!types || !Array.isArray(types)) types = [];
        } catch (e) { console.debug('types fetch failed', e); types = []; }

        if (headerType) {
          headerType.innerHTML = '<option value="">Type</option>';
          for (const t of (types || [])) {
            const opt = document.createElement('option');
            opt.value = t.slug;
            opt.textContent = t.name;
            headerType.appendChild(opt);
          }
        }

        // years: try facets endpoint first, then fallback to scanning documents
        let years = [];
        try {
          let facets = null;
          if (typeof apiFetch === 'function') {
            facets = await apiFetch('/documents/facets').catch(() => null);
          } else {
            const r = await fetch('/api/documents/facets');
            facets = r.ok ? await r.json() : null;
          }

          if (facets && Array.isArray(facets.years) && facets.years.length) {
            years = facets.years.map(y => (typeof y === 'object' ? y.year : y)).filter(Boolean).sort((a, b) => b - a);
          } else {
            // fallback: fetch many documents and derive years
            const docsResp = (typeof apiFetch === 'function')
              ? await apiFetch('/documents?per_page=200&page=1').catch(() => null)
              : await fetch('/api/documents?per_page=200&page=1').then(r => r.ok ? r.json() : null);
            const docs = docsResp && Array.isArray(docsResp.data) ? docsResp.data : (Array.isArray(docsResp) ? docsResp : []);
            const s = new Set();
            (docs || []).forEach(d => {
              if (d.year) s.add(String(d.year));
              else if (d.created_at) {
                const yr = new Date(d.created_at).getFullYear();
                if (!isNaN(yr)) s.add(String(yr));
              }
            });
            years = Array.from(s).map(Number).filter(Boolean).sort((a, b) => b - a);
          }
        } catch (err) {
          console.debug('populate headerYear failed', err);
          years = [];
        }

        if (headerYear) {
          headerYear.innerHTML = '<option value="">Année</option>';
          if (years.length) {
            for (const y of years) {
              const opt = document.createElement('option');
              opt.value = String(y);
              opt.textContent = String(y);
              headerYear.appendChild(opt);
            }
          } else {
            headerYear.innerHTML = '<option value="">(aucune)</option>';
          }
        }
      } catch (err) {
        console.debug('renderHeader: populate filters failed', err);
      }
    }

    // --- robust header search handler ---
    function doHeaderSearch() {
      const hs = document.getElementById('headerSearch');
      const q = hs ? hs.value.trim() : '';
      if (!q) return;

      // if header filters selected, prefer documents view
      const ht = document.getElementById('headerFilterType');
      const hy = document.getElementById('headerFilterYear');
      const typeSelected = ht && ht.value;
      const yearSelected = hy && hy.value;
      if (typeSelected || yearSelected) {
        const docsTabBtn = document.getElementById('tab-button-docs');
        if (docsTabBtn) docsTabBtn.click();
        const mainDocSearch = document.getElementById('docSearch');
        if (mainDocSearch) mainDocSearch.value = q;
        const mainType = document.getElementById('filterType');
        const mainYear = document.getElementById('filterYear');
        if (mainType && ht) mainType.value = ht.value;
        if (mainYear && hy) mainYear.value = hy.value;
        if (typeof renderDocs === 'function') {
          try { renderDocs(1, q); return; } catch (e) { console.debug('renderDocs failed', e); }
        }
      }

      // fallbacks: prefer existing global handlers then main search
      if (typeof window.handleGlobalSearch === 'function') {
        try { window.handleGlobalSearch(q); return; } catch (e) { console.debug('handleGlobalSearch failed', e); }
      }
      if (typeof window.doGlobalSearch === 'function') {
        try { window.doGlobalSearch(q); return; } catch (e) { console.debug('doGlobalSearch failed', e); }
      }
      const mainQ = document.getElementById('q');
      const mainBtn = document.getElementById('btnSearch');
      if (mainQ && mainBtn) {
        try { mainQ.value = q; mainBtn.click(); return; } catch (e) { console.debug('fallback main search failed', e); }
      }
      console.debug('No search handler available for header query:', q);
    }

    // attach listeners idempotently
    const headerSearchEl = document.getElementById('headerSearch');
    const headerBtnEl = document.getElementById('headerSearchBtn');
    if (headerBtnEl) {
      headerBtnEl.removeEventListener('click', doHeaderSearch);
      headerBtnEl.addEventListener('click', doHeaderSearch);
    }
    if (headerSearchEl) {
      if (headerSearchEl.__headerKeydown) headerSearchEl.removeEventListener('keydown', headerSearchEl.__headerKeydown);
      const keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); doHeaderSearch(); } };
      headerSearchEl.addEventListener('keydown', keyHandler);
      headerSearchEl.__headerKeydown = keyHandler;
    }
  } catch (err) {
    console.debug('renderHeader error', err);
  }
}
/* ===== end header improvements ===== */

/* util: create and show simple modal for event details (reusable) */
function showEventModal(id) {
  const evt = window._eventsCache && window._eventsCache[String(id)];
  if (!evt) { alert('Détails indisponibles pour cet événement.'); return; }

  // remove existing modal if any
  const existing = document.getElementById('eventDetailModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'eventDetailModal';
  modal.setAttribute('role', 'dialog');
  modal.style = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:12000;padding:20px;';
  modal.innerHTML = `
    <div style="width:100%;max-width:720px;background:#fff;border-radius:10px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="min-width:0">
          <h3 style="margin:0 0 6px 0;">${escapeHtml(evt.title || '(sans titre)')}</h3>
          <div class="muted" style="margin-bottom:8px;">${formatDateTime(evt.start_date, evt.start_time)}${evt.end_date || evt.end_time ? ' — ' + formatDateTime(evt.end_date || evt.start_date, evt.end_time) : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${evt.url ? `<a id="modalOpenUrl" href="${escapeAttr(evt.url)}" target="_blank" rel="noopener" class="btn btn-primary" style="padding:6px 10px">Ouvrir</a>` : ''}
          <button id="modalDeleteBtn" class="btn btn-danger" style="padding:6px 10px">Supprimer</button>
          <button id="modalCloseBtn" class="btn btn-secondary" style="padding:6px 10px">Fermer</button>
        </div>
      </div>
      ${evt.description ? `<div style="margin-top:12px;color:#444">${escapeHtml(evt.description)}</div>` : ''}
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('modalCloseBtn').addEventListener('click', () => modal.remove());

  const delBtn = document.getElementById('modalDeleteBtn');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet événement ?')) return;
      try {
        // prefer to trigger existing UI delete: find the list item with this data-event-id
        const itemEl = document.querySelector('.event-item[data-event-id="' + String(id) + '"]');
        const deleteBtn = itemEl ? itemEl.querySelector('button.event-delete-btn') : null;
        if (deleteBtn) {
          // trigger click on delete button -> reuse existing handler
          deleteBtn.click();
          modal.remove();
        } else {
          // fallback: call API directly
          try {
            await apiFetch('/events/' + encodeURIComponent(id), { method: 'DELETE' });
            if (itemEl) itemEl.remove();
            modal.remove();
            alert('Événement supprimé.');
            // remove from cache
            delete window._eventsCache[String(id)];
          } catch (err) {
            console.error('delete fallback error', err);
            alert('Suppression côté serveur impossible: ' + (err && err.message ? err.message : 'erreur'));
          }
        }
      } catch (err) {
        console.error(err);
        alert('Erreur lors de la suppression: ' + (err && err.message ? err.message : 'erreur'));
      }
    });
  }
}

/* apiFetch helper */
function apiFetch(path, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  const token = localStorage.getItem('token');
  if (token) {
    opts.headers['Authorization'] = 'Bearer ' + token;
  }
  return fetch('/api' + path, opts).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    return res.json().catch(() => ({}));
  });
}

// --- Documents bulk helper: validate type_slugs before sending ---

let _cachedTypes = null;
async function getTypesCached(force = false) {
  if (_cachedTypes && !force) return _cachedTypes;
  try {
    const types = (typeof apiFetch === 'function')
      ? await apiFetch('/types').catch(() => [])
      : await fetch('/api/types').then(r => r.ok ? r.json() : []);
    _cachedTypes = Array.isArray(types) ? types : [];
    return _cachedTypes;
  } catch (err) {
    console.debug('getTypesCached error', err);
    _cachedTypes = _cachedTypes || [];
    return _cachedTypes;
  }
}

/**
 * Validate operations array for unknown type_slugs.
 * ops: [{ id, type_slug, year, ... }, ...]
 * options:
 *   - failOnInvalid: boolean (default true)
 *   - mapInvalidTo: { '<invalid>': '<valid>' } optional mapping
 *
 * Returns { ok:true, operations:ops } or { ok:false, invalid:[...], message }
 */
async function validateOperations(ops = [], options = {}) {
  const { failOnInvalid = true, mapInvalidTo = {} } = options || {};
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, invalid: [], message: 'no_operations' };

  const types = await getTypesCached();
  const validSlugs = new Set(types.map(t => String(t.slug)));
  const invalid = [];

  const normalizedOps = ops.map(op => {
    const copy = Object.assign({}, op);
    if (copy.type_slug) {
      const slug = String(copy.type_slug);
      if (!validSlugs.has(slug)) {
        if (mapInvalidTo && mapInvalidTo[slug]) {
          copy.type_slug = mapInvalidTo[slug];
        } else {
          invalid.push(slug);
        }
      }
    }
    return copy;
  });

  if (invalid.length && failOnInvalid) {
    return { ok: false, invalid: Array.from(new Set(invalid)), message: 'unknown_type_slugs' };
  }
  return { ok: true, operations: normalizedOps, invalid: Array.from(new Set(invalid)) };
}

/**
 * Send bulk operations to the server after validation.
 * ops: array, options: same as validateOperations
 * returns server response or throws.
 */
async function sendBulkOperations(ops = [], options = {}) {
  const validation = await validateOperations(ops, options);
  if (!validation.ok) {
    const msg = 'Invalid type_slug(s): ' + (validation.invalid.length ? validation.invalid.join(', ') : validation.message);
    throw new Error(msg);
  }

  const body = JSON.stringify({ operations: validation.operations });
  if (typeof apiFetch === 'function') {
    return apiFetch('/documents/bulk', { method: 'POST', body });
  } else {
    const res = await fetch('/api/documents/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + text);
    }
    return res.json().catch(() => ({}));
  }
}

// expose helpers for other modules / console testing
window.getTypesCached = getTypesCached;
window.validateOperations = validateOperations;
window.sendBulkOperations = sendBulkOperations;

// ----- blob detection + safe bulk sender + upload helper -----

function containsBlobUrl(obj) {
  if (!obj) return false;
  if (typeof obj === 'string') return obj.startsWith('blob:');
  if (Array.isArray(obj)) return obj.some(containsBlobUrl);
  if (typeof obj === 'object') return Object.values(obj).some(containsBlobUrl);
  return false;
}

// wrap existing validateOperations to also detect blob: URLs
async function validateOperationsWithBlob(ops = [], options = {}) {
  const res = await validateOperations(ops, options);
  if (!res.ok) return res;

  // detect blob: URLs in any string property of ops
  const opsWithBlob = [];
  for (const op of res.operations) {
    if (containsBlobUrl(op) || containsBlobUrl(op.url) || containsBlobUrl(op.path) || containsBlobUrl(op.filename)) {
      opsWithBlob.push(op);
    }
  }
  if (opsWithBlob.length) {
    return { ok: false, invalid: [], message: 'blob_urls_present', blobOps: opsWithBlob };
  }
  return res;
}

// safe sender: validates types AND rejects blob: urls with helpful error
async function sendBulkOperationsSafe(ops = [], options = {}) {
  const validation = await validateOperationsWithBlob(ops, options);
  if (!validation.ok) {
    if (validation.message === 'blob_urls_present') {
      const ids = (validation.blobOps || []).map(o => o.id || o.filename || '(unknown)').join(', ');
      throw new Error('Opérations contenant des blob: URLs détectées pour les documents: ' + ids + '. Uploadez les fichiers sur le serveur avant d\'envoyer le bulk.');
    }
    const msg = 'Invalid type_slug(s): ' + (validation.invalid && validation.invalid.length ? validation.invalid.join(', ') : validation.message);
    throw new Error(msg);
  }

  const body = JSON.stringify({ operations: validation.operations });
  if (typeof apiFetch === 'function') {
    return apiFetch('/documents/bulk', { method: 'POST', body });
  } else {
    const res = await fetch('/api/documents/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + text);
    }
    return res.json().catch(() => ({}));
  }
}

// Robust upload helper used by the UI.
// - Accepts a File or Blob (with optional .name).
// - Posts to /api/documents/upload with Authorization Bearer token (if present).
// - Normalizes server responses to return an object containing at least one of:
//   { id, path, url, filename, original_name, ... }
// - Throws an Error with useful message on failure.
//
// Usage:
//   const created = await uploadFileToServer(file);
//   // created may contain { id, path, url, filename } or the raw server body
async function uploadFileToServer(file) {
  if (!file) throw new Error('No file provided');
  const fd = new FormData();
  fd.append('file', file, file.name);

  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': 'Bearer ' + token } : undefined;

  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    body: fd,
    headers // do not set Content-Type for FormData
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Upload failed: HTTP ' + res.status + (txt ? ' ' + txt : ''));
  }

  // Normalize response: prefer returned document object if wrapped { success, document }
  const body = await res.json().catch(() => null);
  return (body && body.document) ? body.document : body;
}
window.uploadFileToServer = uploadFileToServer;

window.uploadFileToServer = uploadFileToServer;

// expose to window for console / other modules
window.validateOperationsWithBlob = validateOperationsWithBlob;
window.sendBulkOperationsSafe = sendBulkOperationsSafe;
window.uploadFileToServer = uploadFileToServer;

/* ----- Bulk uploader helpers (upload immédiat, build ops, send bulk) ----- */
/* Place this block RIGHT AFTER the uploadFileToServer exposure and BEFORE fetchEvents */

window._pendingFiles = window._pendingFiles || {};   // tempId -> File
window._uploadedDocs = window._uploadedDocs || {};   // tempId -> created doc from server

/**
 * Utility: infer filename from a title text like "Titre (filename.ext)"
 */
function inferFilenameFromTitle(title) {
  if (!title) return null;
  const m = String(title).match(/\(([^\)]+)\)\s*$/);
  if (m && m[1]) return m[1].trim();
  const parts = String(title).split('(');
  return parts.length > 1 ? parts[parts.length - 1].replace(/\)$/, '').trim() : null;
}

/**
 * Upload provided File objects and store server responses in window._uploadedDocs.
 * files: FileList | Array<File>
 * options: { groupSlug, year }
 * Returns array of results: [{ tempId, fileName, created, success, error? }, ...]
 */
async function handleFilesSelected(files, options = {}) {
  const { groupSlug = 'autre', year = new Date().getFullYear() } = options || {};
  if (!files || files.length === 0) return [];

  // map provided groupSlug (which may be a UI group name) to a valid type slug
  const mappedGroupSlug = (TYPE_MAP && TYPE_MAP[groupSlug]) ? TYPE_MAP[groupSlug] : groupSlug || 'autre';

  const results = [];
  for (const f of Array.from(files)) {
    const tempId = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    window._pendingFiles[tempId] = f;
    try {
      // uploadFileToServer must exist (injected earlier)
      const created = await uploadFileToServer(f);
      if (!created) throw new Error('upload returned empty result');
      // store server response plus meta; store the mapped slug (type_slug) into _group so later buildOps uses a valid slug
      window._uploadedDocs[tempId] = Object.assign({ _fileName: f.name, _group: mappedGroupSlug, _year: year }, created);
      results.push({ tempId, fileName: f.name, created, success: true });
    } catch (err) {
      console.error('handleFilesSelected: upload failed for', f.name, err);
      results.push({ tempId, fileName: f.name, error: String(err), success: false });
    }
  }
  return results;
}

/**
 * Build ops array from uploaded docs stored in window._uploadedDocs
 * mapping (optional) can override type_slug/year per tempId or per group slug:
 *  mapping = { "<tempId>": { type_slug, year }, "<groupSlug>": { type_slug, year } }
 */
function buildOpsFromUploadedDocs(mapping = null) {
  const ops = [];
  for (const [tempId, created] of Object.entries(window._uploadedDocs || {})) {
    try {
      let type_slug = (created && created._group) || 'autre';
      let year = (created && created._year) || new Date().getFullYear();
      if (mapping) {
        const m = mapping[tempId] || mapping[type_slug] || null;
        if (m && m.type_slug) type_slug = m.type_slug;
        if (m && (m.year || m.year === 0)) year = m.year;
      }
      const op = {};
      if (created.id) op.id = created.id;
      else if (created.path) op.path = created.path;
      else if (created.url) op.url = created.url;
      else {
        console.debug('Skipping uploaded doc without id/path/url', tempId, created);
        continue;
      }
      op.type_slug = type_slug;
      op.year = year;
      ops.push(op);
    } catch (err) {
      console.debug('buildOpsFromUploadedDocs skip error', tempId, err);
    }
  }
  return ops;
}

/**
 * Send pending uploaded docs as bulk operations using the safe sender.
 * options forwarded to sendBulkOperationsSafe (failOnInvalid, mapInvalidTo, ...)
 * mapping optional as in buildOpsFromUploadedDocs
 */
async function sendPendingBulk(options = {}, mapping = null) {
  const bulkSender = (typeof sendBulkOperationsSafe === 'function') ? sendBulkOperationsSafe
                    : ((typeof sendBulkOperations === 'function') ? sendBulkOperations : null);
  if (!bulkSender) throw new Error('Bulk sender not available (sendBulkOperationsSafe/sendBulkOperations missing)');

  const ops = buildOpsFromUploadedDocs(mapping);
  if (!ops || ops.length === 0) throw new Error('No operations to send (ops empty).');

  return bulkSender(ops, options);
}

/**
 * Convenience: binds a #bulkImportBtn (if present) to open file picker and upload+bulk.
 * Add a button <button id="bulkImportBtn">Importer fichiers</button> in the UI for this to work.
 */
function initBulkImportButton(defaultOptions = {}) {
  try {
    const btn = document.getElementById('bulkImportBtn');
    if (!btn) return;
    if (btn._bulkInit) return;
    btn._bulkInit = true;
    btn.addEventListener('click', async () => {
      // open file picker
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      const files = await new Promise(resolve => {
        fileInput.onchange = () => resolve(Array.from(fileInput.files || []));
        fileInput.click();
      });
      fileInput.remove();
      if (!files || files.length === 0) return alert('Aucun fichier sélectionné.');

      // upload
      const res = await handleFilesSelected(files, defaultOptions);
      console.log('handleFilesSelected results', res);

      // build ops and send (default mapping uses created._group/_year stored during upload)
      try {
        const mapping = null;
        const result = await sendPendingBulk({}, mapping);
        console.log('sendPendingBulk result', result);
        alert('Bulk envoyé avec succès.');
      } catch (err) {
        console.error('sendPendingBulk error', err);
        alert('Erreur lors de l\'envoi bulk: ' + (err && err.message ? err.message : String(err)));
      }
    });
  } catch (err) {
    console.debug('initBulkImportButton failed', err);
  }
}

// expose functions for console and other modules
window.handleFilesSelected = handleFilesSelected;
window.buildOpsFromUploadedDocs = buildOpsFromUploadedDocs;
window.sendPendingBulk = sendPendingBulk;
window.initBulkImportButton = initBulkImportButton;

// Optionally auto-init the button if present on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  try { initBulkImportButton(); } catch (e) { console.debug('auto initBulkImportButton failed', e); }
});

/* REPLACE existing fetchEvents function with this version that uses apiFetch */
async function fetchEvents(search = '', pageNum = 1) {
  const params = new URLSearchParams({ page: pageNum, per_page });
  if (search !== undefined && String(search).trim() !== '') {
    params.set('search', String(search));
    params.set('q', String(search)); // compat
  }
  const path = '/events?' + params.toString(); // apiFetch will prefix /api
  console.debug('[fetchEvents] path', path);
  try {
    const json = await apiFetch(path, { method: 'GET' });
    console.debug('[fetchEvents] response', json);
    return json;
  } catch (err) {
    console.error('[fetchEvents] error', err);
    throw err;
  }
}

// Helper: returns id of currently active tab button
function getActiveTabId() {
  const activeBtn = document.querySelector('.tab-btn[aria-selected="true"]');
  return activeBtn ? activeBtn.id : null;
}

// Global search handler: route query to the active tab's search function
async function handleGlobalSearch(q) {
  const activeTab = getActiveTabId();
  const query = (q || '').trim();

  if (activeTab === 'tab-button-events' || activeTab === null) {
    // events tab (default)
    page = 1;
    if (eventsList) eventsList.innerHTML = '';
    await render(query);
    return;
  }

  if (activeTab === 'tab-button-docs') {
    // documents tab: call renderDocs if exposed, otherwise fill doc search input and trigger input event
    if (typeof window.renderDocs === 'function') {
      try {
        window.renderDocs(undefined, query);
        return;
      } catch (e) { console.debug('window.renderDocs failed', e); }
    }
    const docSearch = document.getElementById('docSearch');
    if (docSearch) {
      docSearch.value = query;
      docSearch.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  }

  if (activeTab === 'tab-button-resources') {
    // resources tab: try to trigger existing search button/handler
    const resourceInput = document.getElementById('resourceSearch');
    const resourceBtn = document.getElementById('btnSearchResources');
    if (resourceInput) resourceInput.value = query;
    if (resourceBtn) {
      resourceBtn.click();
      return;
    }
  }

  // fallback: try events
  page = 1;
  if (eventsList) eventsList.innerHTML = '';
  await render(query);
}

// Bind global search button and Enter key
if (btnSearch) {
  btnSearch.addEventListener('click', async () => {
    const q = qInput ? qInput.value : '';
    try { await handleGlobalSearch(q); } catch (e) { console.error('search error', e); }
  });
} else {
  console.debug('btnSearch not found - search disabled');
}

// Enter key on search input triggers search
if (qInput) {
  qInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = qInput.value;
      try { await handleGlobalSearch(q); } catch (err) { console.error('search enter error', err); }
    }
  });
}

// Remplace la fonction `render` existante par celle-ci
// et ajoute le binding d'actions sur les boutons "ouvrir" / "supprimer".
async function render(search = '') {
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  try {
    if (eventsList) {
      if (eventsList.tagName && eventsList.tagName.toLowerCase() === 'ul') {
        eventsList.innerHTML = '<li class="muted">Chargement…</li>';
      } else {
        eventsList.innerHTML = '<div class="muted">Chargement…</div>';
      }
    }

    const data = await fetchEvents(search, page);
    const items = (data && Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : [])) || [];

    if (!eventsList) return;
    if (page === 1) eventsList.innerHTML = '';

    if (items.length === 0) {
      const none = document.createElement(eventsList.tagName && eventsList.tagName.toLowerCase() === 'ul' ? 'li' : 'div');
      none.className = 'muted';
      none.textContent = 'Aucun résultat.';
      eventsList.appendChild(none);
      return;
    }

    for (const e of items) {
      const id = e.id || e._id || '';
      const start = e.start_date || e.date || e.start || '-';
      const start_time = e.start_time || e.time || e.startTime || '';
      const end = e.end_date || e.end || '';
      const end_time = e.end_time || e.endTime || '';
      const title = e.title || e.name || '(sans titre)';
      const desc = e.description || e.desc || e.summary || '';
      const url = e.url || e.link || '';

      // store in cache for later use (modal, etc.)
      if (id) window._eventsCache[String(id)] = e;

      // build display date/time
      const displayDate = formatDateTime(start, start_time);
      const displayEnd = end || end_time ? (formatDateTime(end || start, end_time)) : '';

      // Actions (boutons) — add data-id and include data-url only if present
      const openDataAttr = url ? `data-url="${esc(url)}"` : '';
      const openIdAttr = id ? `data-id="${esc(id)}"` : '';
      const actionsHtml = `
        <div class="event-actions" aria-hidden="false">
          <button type="button" class="btn-icon event-open-btn" ${openIdAttr} ${openDataAttr} title="Ouvrir">
            <!-- svg open icon -->
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.41-1.42 9.3-9.29H14V3z"/><path d="M5 5h5V3H3v7h2V5zM5 19h5v2H3v-7h2v5z"/></svg>
          </button>
          <button type="button" class="btn-icon event-delete-btn" data-id="${esc(id)}" title="Supprimer">
            <!-- svg trash icon -->
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>`;

      const contentHtml =
        `<div class="item-header">
           <div style="min-width:0">
             <strong class="item-title">${esc(title)}</strong>
             <div class="muted item-meta" style="font-size:0.9rem">${esc(displayDate)}${displayEnd ? (' — ' + esc(displayEnd)) : ''}</div>
           </div>
           ${actionsHtml}
         </div>
         ${desc ? ('<div class="item-details">' + esc(desc) + '</div>') : ''}`;

      if (eventsList.tagName && eventsList.tagName.toLowerCase() === 'ul') {
        const li = document.createElement('li');
        li.className = 'list-item event-item';
        li.dataset.eventId = id;
        li.innerHTML = contentHtml;
        eventsList.appendChild(li);
      } else {
        const card = document.createElement('div');
        card.className = 'list-item event-item';
        card.dataset.eventId = id;
        card.innerHTML = contentHtml;
        eventsList.appendChild(card);
      }
    }
  } catch (err) {
    console.error('render error', err);
    if (eventsList) {
      eventsList.innerHTML = '';
      const el = document.createElement(eventsList.tagName && eventsList.tagName.toLowerCase() === 'ul' ? 'li' : 'div');
      el.className = 'muted';
      el.textContent = 'Erreur lors de la récupération des événements: ' + (err && err.message ? err.message : 'erreur');
      eventsList.appendChild(el);
    }
  }
}

/* ==== DOCUMENTS: filtres, rendu et API helpers
   Insère ce bloc JUSTE APRÈS la fonction `render(search = '') { ... }`
   et AVANT `function bindEventActions() { ... }`
*/

async function loadDocumentFilters() {
  const typeSelect = document.getElementById('filterType');
  const yearSelect = document.getElementById('filterYear');

  try {
    // load types
    const types = await apiFetch('/types').catch(() => []);
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="">Tous types</option>';
      for (const t of types) {
        const opt = document.createElement('option');
        opt.value = t.slug;
        opt.textContent = t.name;
        typeSelect.appendChild(opt);
      }
    }

    // load facets (years + types counts) to fill year select
    const facets = await apiFetch('/documents/facets').catch(() => ({ years: [], types: [] }));
    const years = (facets && Array.isArray(facets.years)) ? facets.years.map(y => y.year).filter(Boolean).sort((a, b) => b - a) : [];
    if (yearSelect) {
      yearSelect.innerHTML = '<option value="">Toutes années</option>';
      for (const y of years) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        yearSelect.appendChild(opt);
      }
    }
  } catch (err) {
    console.debug('loadDocumentFilters error', err);
  }
}

/**
 * Query documents with filters using the apiFetch helper.
 * params: { q, type, year, page, per_page }
 */
async function fetchDocumentsWithFilters(params = {}) {
  const p = new URLSearchParams();
  if (params.q) p.set('q', params.q);
  if (params.type) p.set('type', params.type);
  if (params.year) p.set('year', String(params.year));
  p.set('page', params.page ? String(params.page) : '1');
  p.set('per_page', params.per_page ? String(params.per_page) : '20');
  return apiFetch('/documents?' + p.toString());
}

/**
 * Render documents list into the page.
 * - container fallback order: #documentsList -> #documentsContainer -> #documents
 * - call as window.renderDocs(page, q) so other code (handleGlobalSearch) can call it.
 */
async function renderDocs(page = 1, q = '') {
  const container = document.getElementById('documentsList') ||
    document.getElementById('documentsContainer') ||
    document.getElementById('documents');

  if (!container) {
    console.debug('No documents container found; skipping renderDocs');
    return;
  }

  // read filter controls if present
  const typeEl = document.getElementById('filterType');
  const yearEl = document.getElementById('filterYear');
  const searchEl = document.getElementById('docSearch');

  const type = typeEl && typeEl.value ? typeEl.value : '';
  const year = yearEl && yearEl.value ? yearEl.value : '';
  const query = (q !== undefined && q !== null && q !== '') ? q : (searchEl && searchEl.value ? searchEl.value : '');

  container.innerHTML = '<div class="muted">Chargement…</div>';

  try {
    const res = await fetchDocumentsWithFilters({ q: query, type, year, page, per_page: 20 });
    // tolerant parsing: res.data or res (array)
    const items = (res && Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : [])) || [];

    container.innerHTML = '';
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="muted">Aucun document.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'list-items';
    for (const d of items) {
      const id = d.id || '';
      const title = d.title || d.original_name || d.filename || '(sans titre)';
      const date = d.created_at || d.createdAt || '';
      const yearText = d.year ? ` — ${escapeHtml(String(d.year))}` : '';
      const filename = d.filename || d.original_name || '';
      const url = d.url || d.path || '#';
      const typeName = d.type_id && d.type ? (d.type.name || '') : (d.type_name || '');

      // build robust open URL (ignore ephemeral blob: URLs)
      let openHref = '#';
      const rawUrl = (d.url && String(d.url).trim()) ? String(d.url).trim() : '';
      const isBlobUrl = rawUrl && rawUrl.startsWith('blob:');
      if (rawUrl && !isBlobUrl) {
        openHref = rawUrl;
      } else if (d.path && String(d.path).trim() !== '') {
        const p = String(d.path || '');
        openHref = p.startsWith('/') ? p : ('/uploads/' + p.replace(/^\/+/, ''));
      } else if (id) {
        openHref = '/api/documents/' + encodeURIComponent(id) + '/download';
      }

      const actions = [];
      if (openHref && openHref !== '#') {
        actions.push(`<a class="btn btn-primary doc-open" href="${escapeAttr(openHref)}" target="_blank" rel="noopener noreferrer" style="padding:6px 8px">Ouvrir</a>`);
      }
      actions.push(`<button class="btn btn-secondary btn-doc-classify" data-id="${escapeAttr(id)}" style="padding:6px 8px">Classer</button>`);
      actions.push(`<button class="btn btn-ghost btn-doc-delete" data-id="${escapeAttr(id)}" style="padding:6px 8px">Supprimer</button>`);

      const item = document.createElement('div');
      item.className = 'list-item document-item';
      item.dataset.documentId = id;
      item.innerHTML = `
        <div class="item-header" style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div style="min-width:0">
            <strong class="item-title">${escapeHtml(title)}</strong>
            <div class="muted item-meta" style="font-size:0.9rem">${escapeHtml(formatDateTime(date, ''))}${yearText}${typeName ? ' · ' + escapeHtml(typeName) : ''}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${actions.join('')}
          </div>
        </div>
        ${filename ? `<div class="item-details" style="margin-top:8px">${escapeHtml(filename)}</div>` : ''}
      `;
      list.appendChild(item);
    }
    container.appendChild(list);

    // Delegated delete handler (attach once)
    try {
      if (!container._hasDocDeleteBound) {
        container._hasDocDeleteBound = true;
        container.addEventListener('click', async (ev) => {
          const btn = ev.target.closest && ev.target.closest('.btn-doc-delete');
          if (!btn) return;
          ev.preventDefault();
          ev.stopPropagation();
          const id = btn.dataset.id;
          if (!id) { alert('Identifiant manquant pour la suppression.'); return; }
          if (!confirm('Supprimer ce document ?')) return;

          btn.disabled = true;
          try {
            const token = localStorage.getItem('token') || '';
            const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
            const res = await fetch('/api/documents/' + encodeURIComponent(id), { method: 'DELETE', headers });
            if (!res.ok && res.status !== 204) {
              const txt = await res.text().catch(() => '');
              throw new Error('HTTP ' + res.status + ' ' + (txt || ''));
            }
          } catch (err) {
            console.error('delete document error', err);
            alert('Échec de la suppression : ' + (err && err.message ? err.message : 'erreur'));
            btn.disabled = false;
            return;
          }

          const row = btn.closest('.list-item.document-item');
          if (row) {
            row.classList.add('removing');
            row.style.transition = row.style.transition || 'opacity .28s ease, transform .28s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateY(-8px)';
            setTimeout(() => { try { renderDocs(page, ''); } catch (e) { console.debug('renderDocs after delete failed', e); } }, 320);
          } else {
            try { renderDocs(page, ''); } catch (e) { console.debug('renderDocs after delete failed', e); }
          }
        });
      }
    } catch (e) { console.debug('attach delete handler failed', e); }
    // right after container.appendChild(list);
    try {
      if (typeof window.attachYearToggleHandlers === 'function') {
        window.attachYearToggleHandlers();
      }
    } catch (e) {
      console.debug('attachYearToggleHandlers call failed', e);
    }

  } catch (err) {
    console.error('renderDocs error', err);
    container.innerHTML = `<div class="muted">Erreur lors du chargement des documents: ${(err && err.message) ? err.message : 'erreur'}</div>`;
  }
}

// make year toggle handlers available globally
window.attachYearToggleHandlers = function attachYearToggleHandlers() {
  // try several possible container ids so this works with both index.html and app.js renderers
  const container = document.getElementById('docsItems') ||
    document.getElementById('documentsList') ||
    document.getElementById('documentsContainer') ||
    document.getElementById('documents');
  if (!container) return;

  const groups = Array.from(container.querySelectorAll('.docs-year-group'));
  groups.forEach(group => {
    const header = group.querySelector('.docs-year-header');
    const content = group.querySelector('.docs-doc-cards');
    if (!header || !content) return;

    // remove previous handler if present
    if (header._yearToggleHandler) header.removeEventListener('click', header._yearToggleHandler);

    const onClick = (e) => {
      const isOpen = group.classList.contains('open');

      if (isOpen) {
        // collapse
        content.style.maxHeight = content.scrollHeight + 'px';
        requestAnimationFrame(() => {
          content.style.maxHeight = '0px';
          content.style.opacity = '0';
        });
        group.classList.remove('open');
      } else {
        // collapse siblings
        const siblings = Array.from(container.querySelectorAll('.docs-year-group.open')).filter(s => s !== group);
        siblings.forEach(s => {
          s.classList.remove('open');
          const sContent = s.querySelector('.docs-doc-cards');
          if (sContent) {
            sContent.style.maxHeight = sContent.scrollHeight + 'px';
            requestAnimationFrame(() => { sContent.style.maxHeight = '0px'; sContent.style.opacity = '0'; });
          }
        });

        // expand target
        group.classList.add('open');
        const h = content.scrollHeight;
        content.style.maxHeight = h + 'px';
        content.style.opacity = '1';

        const onTransitionEnd = (ev) => {
          if (ev.propertyName === 'max-height') {
            content.style.maxHeight = 'none';
            content.removeEventListener('transitionend', onTransitionEnd);
          }
        };
        content.addEventListener('transitionend', onTransitionEnd);
      }
    };

    header.addEventListener('click', onClick);
    header._yearToggleHandler = onClick;
  });
};

// Animation helpers pour expansion / collapse smooth (utiliser max-height -> scrollHeight)
function attachYearToggleHandlers() {
  // Déléguer sur le container des groupes si possible
  const container = docsItems; // variable existante dans the scope of the script
  if (!container) return;

  // chaque header a déjà été créé dans renderDocs ; on attache listeners
  const groups = Array.from(container.querySelectorAll('.docs-year-group'));
  groups.forEach(group => {
    const header = group.querySelector('.docs-year-header');
    const content = group.querySelector('.docs-doc-cards');
    if (!header || !content) return;

    // ensure initial closed/open state: if group has class open, expand it
    if (group.classList.contains('open')) {
      content.style.maxHeight = content.scrollHeight + 'px';
      content.style.opacity = '1';
    } else {
      content.style.maxHeight = '0px';
      content.style.opacity = '0';
    }

    // remove previous handler if any
    if (header._yearToggleHandler) header.removeEventListener('click', header._yearToggleHandler);

    const onClick = (e) => {
      const isOpen = group.classList.contains('open');
      if (isOpen) {
        // collapse
        // set current height explicitly to allow transition
        content.style.maxHeight = content.scrollHeight + 'px';
        // trigger frame then set to 0
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            content.style.maxHeight = '0px';
            content.style.opacity = '0';
          });
        });
        group.classList.remove('open');
      } else {
        // expand this one and collapse siblings
        // collapse siblings first
        const siblings = Array.from(container.querySelectorAll('.docs-year-group.open')).filter(s => s !== group);
        siblings.forEach(s => {
          s.classList.remove('open');
          const sContent = s.querySelector('.docs-doc-cards');
          if (sContent) {
            sContent.style.maxHeight = sContent.scrollHeight + 'px';
            // ensure transition happens
            requestAnimationFrame(() => { sContent.style.maxHeight = '0px'; sContent.style.opacity = '0'; });
          }
        });

        // expand target
        group.classList.add('open');
        // set to auto height by measuring scrollHeight
        const h = content.scrollHeight;
        content.style.maxHeight = h + 'px';
        content.style.opacity = '1';
        // after transition ends, clear maxHeight for natural layout
        const onTransitionEnd = (ev) => {
          if (ev.propertyName === 'max-height') {
            // remove inline max-height to allow dynamic content changes
            content.style.maxHeight = 'none';
            content.removeEventListener('transitionend', onTransitionEnd);
          }
        };
        content.addEventListener('transitionend', onTransitionEnd);
      }
    };

    header.addEventListener('click', onClick);
    header._yearToggleHandler = onClick;
  });
}

// Programmatic switch: ouvre une année précise, ferme les autres et scrolle
function switchToYear(year) {
  const container = docsItems;
  if (!container) return;
  // normalize year string
  const yStr = String(year);
  const group = Array.from(container.querySelectorAll('.docs-year-group')).find(g => {
    const titleEl = g.querySelector('.docs-year-title');
    return titleEl && titleEl.textContent.trim() === (yStr === 'Sans année' ? '(Sans année)' : yStr);
  });
  if (!group) return console.debug('switchToYear: year not found', year);

  // collapse others and expand target
  const siblings = Array.from(container.querySelectorAll('.docs-year-group')).filter(g => g !== group);
  siblings.forEach(s => {
    s.classList.remove('open');
    const sc = s.querySelector('.docs-doc-cards');
    if (sc) { sc.style.maxHeight = sc.scrollHeight + 'px'; requestAnimationFrame(() => { sc.style.maxHeight = '0px'; sc.style.opacity = '0'; }); }
  });

  // expand group
  const content = group.querySelector('.docs-doc-cards');
  if (!group.classList.contains('open')) {
    group.classList.add('open');
    content.style.maxHeight = content.scrollHeight + 'px';
    content.style.opacity = '1';
    // clear maxHeight after transition
    content.addEventListener('transitionend', function onTE(ev) {
      if (ev.propertyName === 'max-height') {
        content.style.maxHeight = 'none';
        content.removeEventListener('transitionend', onTE);
      }
    });
  }

  // smooth scroll into view (center the group)
  setTimeout(() => {
    group.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // briefly highlight
    group.classList.add('enter');
    setTimeout(() => group.classList.remove('enter'), 400);
  }, 50);
}

// Appel automatique après chaque rendu pour (ré)attacher handlers
// Ajoute cet appel à la fin de ta fonction renderDocs, après que les groups aient été ajoutés au DOM:
// attachYearToggleHandlers();
// Ainsi les handlers seront réattachés à chaque rerender.
window.renderDocs = renderDocs;

// Si le conteneur documents est inséré dynamiquement par l'app,
// observer et déclencher renderDocs une seule fois.
(function autoRenderDocsWhenReady() {
  const ids = ['documentsList', 'documentsContainer', 'documents'];
  const findContainer = () => ids.map(id => document.getElementById(id)).find(Boolean);
  if (findContainer()) return; // déjà présent

  try {
    const mo = new MutationObserver((mutations, obs) => {
      const c = findContainer();
      if (c) {
        console.debug('Auto-detected documents container -> calling renderDocs(1, "")');
        try { if (typeof window.renderDocs === 'function') window.renderDocs(1, ''); } catch (e) { console.debug('auto renderDocs error', e); }
        obs.disconnect();
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    // sécurité : déconnecte après 10s au cas où le conteneur n'apparaitrait jamais
    setTimeout(() => { try { mo.disconnect(); } catch (e) {} }, 10000);
  } catch (e) { console.debug('autoRenderDocsWhenReady failed', e); }
})();

/* Wiring: bind doc search / filters (safe binds) */
document.addEventListener('DOMContentLoaded', () => {
  // load filters if relevant controls exist
  const docTabBtn = document.getElementById('tab-button-docs');
  const docSearch = document.getElementById('docSearch');
  const filterType = document.getElementById('filterType');
  const filterYear = document.getElementById('filterYear');

  // if filter controls are present, populate them
  if (filterType || filterYear) {
    loadDocumentFilters();
  }

  // search input: enter triggers renderDocs
  if (docSearch) {
    docSearch.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await renderDocs(1, docSearch.value);
      }
    });
  }

  // filter change handlers
  if (filterType) filterType.addEventListener('change', () => renderDocs(1));
  if (filterYear) filterYear.addEventListener('change', () => renderDocs(1));

  // if there's a docs tab button, clicking it should load filters  docs
  if (docTabBtn) {
    docTabBtn.addEventListener('click', async () => {
      // small delay to ensure UI tab state has updated
      setTimeout(async () => {
        await loadDocumentFilters();
        await renderDocs(1);
      }, 50);
    });
  }

  // If the page initially shows the docs tab, load filters/docs
  const activeDoc = document.querySelector('.tab-btn[aria-selected="true"]#tab-button-docs');
  if (activeDoc) {
    loadDocumentFilters();
    renderDocs(1);
  }
});

// Classify button handler: ouvre modal pour choisir type & année et appelle PATCH /api/documents/:id
// Delegated handler pour les boutons "Classer" — attache au container des documents
(function bindDocClassify() {
  const container = document.getElementById('documentsList') ||
    document.getElementById('documentsContainer') ||
    document.getElementById('documents');

  if (!container) {
    // si le container n'existe pas encore, réessayer au DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => bindDocClassify());
    return;
  }

  // éviter double attachement
  if (container._hasDocClassifyBound) return;
  container._hasDocClassifyBound = true;

  container.addEventListener('click', async (ev) => {
    const btn = ev.target.closest && ev.target.closest('.btn-doc-classify');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();

    const id = btn.dataset.id;
    if (!id) {
      console.debug('btn-doc-classify clicked but no data-id found on element', btn);
      alert('Impossible : identifiant document manquant.');
      return;
    }

    try {
      const types = await apiFetch('/types').catch(() => []);
      const facets = await apiFetch('/documents/facets').catch(() => ({ years: [] }));
      const years = (facets.years || []).map(y => y.year).filter(Boolean).sort((a, b) => b - a);

      const modal = document.createElement('div');
      modal.style = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:12000;padding:20px;';
      modal.innerHTML = `
        <div style="width:100%;max-width:420px;background:#fff;border-radius:8px;padding:16px;">
          <h3 style="margin:0 0 8px 0">Classer le document</h3>
          <div style="margin-bottom:8px;">
            <label>Type</label>
            <select id="modalTypeSelect" style="width:100%;margin-top:6px">
              <option value="">(aucun)</option>
              ${types.map(t => `<option value="${t.slug}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label>Année</label>
            <select id="modalYearSelect" style="width:100%;margin-top:6px">
              <option value="">(aucune)</option>
              ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="modalCancel" class="btn btn-secondary">Annuler</button>
            <button id="modalSave" class="btn btn-primary">Enregistrer</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('modalCancel').addEventListener('click', () => modal.remove());
      document.getElementById('modalSave').addEventListener('click', async () => {
        const typeSlug = document.getElementById('modalTypeSelect').value;
        const yearVal = document.getElementById('modalYearSelect').value;
        try {
          const body = {};
          if (typeof typeSlug !== 'undefined') body.type_slug = typeSlug;
          if (typeof yearVal !== 'undefined') body.year = yearVal === '' ? null : Number(yearVal);
          await apiFetch('/documents/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify(body)
          });
          modal.remove();
          if (typeof renderDocs === 'function') renderDocs(1);
          alert('Classification enregistrée.');
        } catch (err) {
          console.error('save classify error', err);
          alert('Erreur lors de l\'enregistrement: ' + (err && err.message ? err.message : 'erreur'));
        }
      });
    } catch (err) {
      console.error('classify button error', err);
      alert('Impossible de charger les types/années');
    }
  });
})();

// Event delegation: gérer "ouvrir" et "supprimer" pour les boutons ajoutés ci‑dessus
function bindEventActions() {
  if (!eventsList) return;

  // ensure we don't attach multiple times
  if (eventsList._hasEventActionsBound) return;
  eventsList._hasEventActionsBound = true;

  eventsList.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button.event-open-btn, button.event-delete-btn');
    if (!btn) return;

    // Ouvrir
    if (btn.classList.contains('event-open-btn')) {
      const url = btn.dataset.url;
      const id = btn.dataset.id;
      if (url && url !== '#' && url !== 'undefined') {
        window.open(url, '_blank', 'noopener');
      } else if (id) {
        showEventModal(id);
      } else {
        alert('Aucune URL disponible pour cet événement.');
      }
      return;
    }

    // Supprimer
    if (btn.classList.contains('event-delete-btn')) {
      const id = btn.dataset.id;
      if (!id) {
        alert('Impossible de supprimer: identifiant manquant.');
        return;
      }
      if (!confirm('Supprimer cet événement ?')) return;

      // Tentative de suppression via API si possible (apiFetch prefixe /api)
      try {
        // try DELETE /api/events/:id (using apiFetch)
        await apiFetch('/events/' + encodeURIComponent(id), { method: 'DELETE' });
        // enlever de l'UI
        const itemEl = btn.closest('.event-item');
        if (itemEl) itemEl.remove();
        // remove from cache
        delete window._eventsCache[String(id)];
        // if modal open for this id, close it
        const modal = document.getElementById('eventDetailModal');
        if (modal) modal.remove();
      } catch (err) {
        console.error('delete event error', err);
        // si apiFetch absent ou erreur, alerter
        alert('Erreur lors de la suppression: ' + (err && err.message ? err.message : 'erreur'));
      }
      return;
    }
  });
}

// Appelle bindEventActions une seule fois au démarrage (par ex. dans DOMContentLoaded init)
document.addEventListener('DOMContentLoaded', () => {
  if (typeof eventsList !== 'undefined' && eventsList) bindEventActions();
  else {
    setTimeout(() => { if (typeof eventsList !== 'undefined' && eventsList) bindEventActions(); }, 200);
  }
});

// protect bindings for optional elements
if (btnSearch) {
  btnSearch.addEventListener('click', (ev) => {
    page = 1;
    if (eventsList) eventsList.innerHTML = '';
    render(qInput ? qInput.value : '');
  });
} else {
  console.debug('btnSearch not found - search disabled');
}

if (loadMore) {
  loadMore.addEventListener('click', () => {
    page++;
    render(qInput ? qInput.value : '');
  });
} else {
  console.debug('loadMore not found - paging disabled');
}

function formatDateLocal(d) {
  if (!d) return '-';
  // d peut être 'YYYY-MM-DD' ou ISO
  const dt = (typeof d === 'string' && d.length === 10) ? new Date(d + 'T00:00:00') : new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString();
}

// Render simple list/cards in #agendaContainer
function renderAgendaItems(items) {
  const container = document.getElementById('agendaContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="muted empty-message">Aucun événement pour cette période.</div>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'list-items';
  for (const e of items) {
    const title = e.title || e.name || '(sans titre)';
    const date = e.start_date || e.date || e.start || '';
    const time = e.start_time || e.time || '';
    const desc = e.description || e.desc || e.summary || '';
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `
      <div class="item-header">
        <div>
          <strong>${escapeHtml(title)}</strong><br />
          <span class="muted" style="font-size:0.9rem">${formatDateLocal(date)}${time ? ' · ' + escapeHtml(formatTime(time)) : ''}</span>
        </div>
        <div>
          ${e.url ? `<a class="btn btn-primary" href="${escapeAttr(e.url)}" target="_blank" rel="noopener noreferrer" style="padding:6px 8px">Ouvrir</a>` : ''}
        </div>
      </div>
      ${desc ? `<div class="item-details" style="margin-top:6px">${escapeHtml(desc)}</div>` : ''}
    `;
    list.appendChild(el);
  }
  container.appendChild(list);
  try { if (typeof window.attachYearToggleHandlers === 'function') window.attachYearToggleHandlers(); } catch (e) { console.debug('attachYearToggleHandlers call failed', e); }
}

// Query events for agenda using from/to (yyyy-mm-dd) and render
async function loadAgendaForPeriod(from, to) {
  const container = document.getElementById('agendaContainer');
  if (container) container.innerHTML = '<div class="muted">Chargement…</div>';

  try {
    const params = new URLSearchParams();
    if (from) params.set('start_date', from);
    if (to) params.set('end_date', to);
    params.set('per_page', 100); // fetch many for the period
    params.set('page', 1);
    // try to use apiFetch so token is included if required
    const path = '/events?' + params.toString();
    const data = await apiFetch(path, { method: 'GET' }).catch(async (err) => {
      // fallback: try direct fetch if apiFetch not available or failed
      console.debug('apiFetch failed for agenda, trying fetch', err);
      const res = await fetch('/api' + path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });

    // tolerant parsing: data.data or data (array)
    const items = (data && Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : [])) || [];
    renderAgendaItems(items);
  } catch (err) {
    console.error('loadAgendaForPeriod error', err);
    if (container) container.innerHTML = `<div class="muted">Erreur lors du chargement de l'agenda: ${err && err.message ? err.message : 'erreur'}</div>`;
  }
}

// Hook the "Appliquer" button and default behavior
(function bindAgendaControls() {
  const btn = document.getElementById('btnApplyAgendaFilters');
  const fromEl = document.getElementById('agendaFrom');
  const toEl = document.getElementById('agendaTo');

  // If no button, do nothing
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const from = fromEl && fromEl.value ? fromEl.value : '';
    const to = toEl && toEl.value ? toEl.value : '';
    // basic validation: if both present and from > to, swap or warn
    if (from && to && from > to) {
      // swap
      const tmp = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = tmp;
    }
    await loadAgendaForPeriod(from, to);
  });

  // Optionally load current week on first load
  document.addEventListener('DOMContentLoaded', () => {
    // If fields empty, set defaults to current week and load
    if (fromEl && toEl && !fromEl.value && !toEl.value) {
      const now = new Date();
      // start = monday
      const day = now.getDay(); // 0..6 (sun..sat)
      const diffToMon = (day + 6) % 7; // days since monday
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMon);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = d => d.toISOString().slice(0, 10);
      fromEl.value = fmt(monday);
      toEl.value = fmt(sunday);
      // load default week
      loadAgendaForPeriod(fromEl.value, toEl.value);
    }
  });
})();
// Auth handlers
// Replace existing handleLogin with this robust version
async function handleLogin() {
  const username = loginUsername ? loginUsername.value.trim() : '';
  const password = loginPassword ? loginPassword.value : '';
  const loginMsg = document.getElementById('loginMsg');

  if (!username || !password) {
    if (loginMsg) loginMsg.textContent = "Nom d'utilisateur et mot de passe requis.";
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    // Try to parse JSON safely
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = body && (body.error || body.message) ? (body.error || body.message) : ('HTTP ' + res.status);
      if (loginMsg) loginMsg.textContent = 'Connexion échouée: ' + errMsg;
      return;
    }

    // store token & username (prefer server username if provided)
    const token = body.token || '';
    const serverUsername = (body.user && body.user.username) ? body.user.username : username;
    if (token) localStorage.setItem('token', token);
    localStorage.setItem('username', serverUsername);

    // update UI
    showUser();
    try { if (typeof renderHeader === 'function') renderHeader(); } catch (e) { console.debug('renderHeader init failed', e); }
    // clear password input
    if (loginPassword) loginPassword.value = '';

    // Close modal if glue script exposes closeLoginModal
    if (typeof window.closeLoginModal === 'function') {
      try { window.closeLoginModal(); } catch (e) { console.debug('closeLoginModal failed', e); }
    }

    if (loginMsg) loginMsg.textContent = 'Connecté.';
  } catch (err) {
    console.error('handleLogin error', err);
    if (loginMsg) loginMsg.textContent = 'Erreur réseau.';
  }
}

function showUser() {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');

  const createSectionEl = document.getElementById('createSection');
  const userInfoEl = document.getElementById('userInfo');
  const usernameDisplayEl = document.getElementById('usernameDisplay');
  const loginFormEl = document.getElementById('loginForm');

  if (token && username) {
    if (userInfoEl) userInfoEl.style.display = 'block';
    if (usernameDisplayEl) usernameDisplayEl.textContent = username;
    if (loginFormEl) loginFormEl.style.display = 'none';
    if (createSectionEl) createSectionEl.style.display = 'block';

    // Use the runtime window.closeLoginModal if available
    if (typeof window.closeLoginModal === 'function') {
      try { window.closeLoginModal(); } catch (e) { console.debug('closeLoginModal failed', e); }
    }
  } else {
    if (userInfoEl) userInfoEl.style.display = 'none';
    if (usernameDisplayEl) usernameDisplayEl.textContent = '';
    if (loginFormEl) loginFormEl.style.display = 'block';
    if (createSectionEl) createSectionEl.style.display = 'none';

    // Use the runtime window.openLoginModal if available
    if (typeof window.openLoginModal === 'function') {
      try { window.openLoginModal(); } catch (e) { console.debug('openLoginModal failed', e); }
    } else {
      // Fallback: ensure modal is visible and page locked
      const modal = document.getElementById('loginModal');
      const appPage = document.getElementById('appPage') || document.querySelector('.page');
      if (modal) modal.classList.remove('hidden');
      if (appPage) appPage.classList.add('locked');
    }
  }
  // refresh header UI if header exists
  try { if (typeof renderHeader === 'function') renderHeader(); } catch (e) { console.debug('renderHeader update failed', e); }
}

const btnLoginEl = document.getElementById('btnLogin');
if (btnLoginEl) btnLoginEl.addEventListener('click', handleLogin);

const btnLogoutEl = document.getElementById('btnLogout');
if (btnLogoutEl) {
  btnLogoutEl.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    // update UI (this will call window.openLoginModal dynamically)
    showUser();

    // Extra safety: if for any reason the modal didn't open, force it
    if (typeof window.openLoginModal === 'function') {
      try { window.openLoginModal(); } catch (e) { console.debug('forced openLoginModal failed', e); }
    } else {
      const modal = document.getElementById('loginModal');
      const appPage = document.getElementById('appPage') || document.querySelector('.page');
      if (modal) modal.classList.remove('hidden');
      if (appPage) appPage.classList.add('locked');
    }
  });
}

// Create event (robust version) — includes start_time and end_time
async function handleCreate() {
  // find inputs (support quick sidebar and full create form)
  const titleEl = document.getElementById('qTitle') || document.getElementById('title');
  const descEl = document.getElementById('qDesc') || document.getElementById('description');
  const startDateEl = document.getElementById('qDate') || document.getElementById('start_date');
  const startTimeEl = document.getElementById('qStartTime') || document.getElementById('start_time');
  const endDateEl = document.getElementById('qEndDate') || document.getElementById('end_date');
  const endTimeEl = document.getElementById('qEndTime') || document.getElementById('end_time');
  const allDayEl = document.getElementById('qAllDay') || document.getElementById('all_day');

  const title = titleEl ? (titleEl.value || 'Untitled') : 'Untitled';
  const description = descEl ? descEl.value || '' : '';
  const start_date = startDateEl ? startDateEl.value : '';
  const start_time = startTimeEl ? startTimeEl.value : '';
  const end_date = endDateEl ? endDateEl.value : '';
  const end_time = endTimeEl ? endTimeEl.value : '';
  const all_day = allDayEl ? (allDayEl.checked ? 1 : 0) : 0;

  if (!start_date) {
    alert('Date requise.');
    return;
  }

  const payload = { title, description, start_date, start_time: start_time || null, end_date: end_date || null, end_time: end_time || null, all_day };

  try {
    const res = await apiFetch('/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      alert('Événement créé' + (res.id ? ' (id=' + res.id + ')' : ''));
      // prepend to a visible list if it exists
      const eventsListEl = document.getElementById('eventsList') || document.getElementById('events');
      try {
        if (eventsListEl) {
          // if #events is a container div, prepend a simple line; if it's a ul, insert li
          const displayDate = formatDateTime(start_date, start_time);
          if (eventsListEl.tagName.toLowerCase() === 'ul') {
            eventsListEl.insertAdjacentHTML('afterbegin', `<li>${escapeHtml(displayDate)} - ${escapeHtml(payload.title)}</li>`);
          } else {
            const el = document.createElement('div');
            el.textContent = `${displayDate} — ${payload.title}`;
            eventsListEl.insertAdjacentElement('afterbegin', el);
          }
        }
      } catch (e) { console.debug('Could not prepend created event to DOM:', e); }

      // clear inputs where present
      if (titleEl) titleEl.value = '';
      if (descEl) descEl.value = '';
      if (startDateEl) startDateEl.value = '';
      if (startTimeEl) startTimeEl.value = '';
      if (endDateEl) endDateEl.value = '';
      if (endTimeEl) endTimeEl.value = '';
      if (allDayEl) allDayEl.checked = false;

      // refresh display if loader exists
      if (window.loadAndRenderEvents) window.loadAndRenderEvents('#events', { apiUrl: '/api/events' });
      else {
        // reload list
        page = 1;
        render();
      }
    } else {
      alert('Erreur création: ' + JSON.stringify(res));
    }
  } catch (err) {
    console.error(err);
    alert('Erreur création: ' + (err && err.message));
  }
}

// attach create handler to any known create button ids (safe bind)
const possibleCreateIds = ['btnCreate', 'btnCreateQuick', 'btnCreateFull', 'qCreateBtn', 'btnCreateFull'];
let btnCreateEl = null;
for (const id of possibleCreateIds) {
  const el = document.getElementById(id);
  if (el) { btnCreateEl = el; break; }
}
if (btnCreateEl) {
  btnCreateEl.addEventListener('click', handleCreate);
} else {
  console.debug('No create button found among', possibleCreateIds);
}

// initial load & UI state (single initialization)
showUser();
//try { if (typeof renderHeader === 'function') renderHeader(); } catch (e) { console.debug('renderHeader init failed', e); }
render();