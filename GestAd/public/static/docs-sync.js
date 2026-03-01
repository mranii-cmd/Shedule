// docs-sync.js
// - Versioning/cleanup for persisted docsStore
// - BroadcastChannel + storage listener to trigger initDocs/renderDocs
// - docsOnUploadSuccess(createdBody, file, title, desc, cat) : helper to call after upload
// - optional lightweight polling for cross-browser sync

(function () {
  const DOCS_STORE_VERSION = 'v2';
  // Try safe localStorage access
  function safeLSGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function safeLSSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  function safeLSRemove(k){ try { localStorage.removeItem(k); } catch(e){} }

  // Purge older persisted snapshot if version changed
  try {
    const cur = safeLSGet('docsStoreVersion');
    if (cur !== DOCS_STORE_VERSION) {
      safeLSRemove('docsStore');
      safeLSRemove('docsStorePersistedAt');
      safeLSSet('docsStoreVersion', DOCS_STORE_VERSION);
      console.debug('docs-sync: purged old docsStore snapshot; version set to', DOCS_STORE_VERSION);
    }
  } catch (e) { console.debug('docs-sync init purge failed', e); }

  // BroadcastChannel + storage listener
  try {
    if ('BroadcastChannel' in window) {
      window._docsBC = window._docsBC || new BroadcastChannel('gestad-docs');
      window._docsBC.addEventListener('message', (ev) => {
        try {
          if (ev && ev.data === 'refresh') {
            if (typeof window.initDocs === 'function') window.initDocs();
            else if (typeof window.renderDocs === 'function') window.renderDocs(window.getActiveDocsCategory ? window.getActiveDocsCategory() : 'proces-verbaux', '');
          }
        } catch (e) { console.debug('docs-sync BC handler error', e); }
      });
    }
  } catch (e) { console.debug('docs-sync BC init failed', e); }

// inside existing window.addEventListener('storage', (ev) => { ... })
window.addEventListener('storage', (ev) => {
  try {
    if (!ev || !ev.key) return;
    // handle both legacy and new keys
    if (ev.key === 'docsStoreUpdated' || ev.key === 'documentsUpdated') {
      try {
        // avoid duplicate runs when value not newer than last seen
        const v = Number(ev.newValue || 0);
        if (v && v > (window._docsLastSeenUpdated || 0)) window._docsLastSeenUpdated = v;
        if (typeof window.initDocs === 'function') window.initDocs();
        else if (typeof window.renderDocs === 'function') window.renderDocs(window.getActiveDocsCategory ? window.getActiveDocsCategory() : 'proces-verbaux', '');
      } catch (e) { console.debug('docs-sync storage handler inner failed', e); }
    }
  } catch (e) { console.debug('docs-sync storage handler failed', e); }
});

  // Helper: normalize server path/url for UI
  function makeUrlFromDoc(doc) {
    if (!doc) return null;
    if (doc.url && String(doc.url).trim() !== '') return String(doc.url);
    const p = doc.path || doc.path === '' ? String(doc.path) : null;
    const filename = doc.filename || null;
    if (p) {
      // ensure leading slash
      return p.startsWith('/') ? p : ('/' + p);
    }
    if (filename) return '/uploads/documents/' + filename;
    return null;
  }

  // Exposed helper: call after an upload response is received from server
  // createdBody: server response body (object or {document: {...}})
  // file/title/desc/cat : optional, used for fallback UI if server body missing fields
  window.docsOnUploadSuccess = function docsOnUploadSuccess(createdBody, file, title, desc, cat) {
    try {
      const doc = createdBody && createdBody.document ? createdBody.document : (createdBody || null);
      if (!doc) return null;
      const category = cat || (window.getActiveDocsCategory ? window.getActiveDocsCategory() : 'proces-verbaux');
      const item = {
        id: doc.id || null,
        title: doc.title || title || doc.original_name || (file && file.name),
        desc: desc || doc.desc || '',
        filename: doc.filename || null,
        url: makeUrlFromDoc(doc),
        created: doc,
        _tempId: null,
        _category: category,
        _localPending: false,
        _serverSaved: true
      };
      window.docsStore = window.docsStore || {};
      window.docsStore[category] = window.docsStore[category] || [];
      // put new item at the top
      window.docsStore[category].unshift(item);

      // Persist UI copy if helper exists
      try { if (typeof window.persistIfAllowed === 'function') window.persistIfAllowed(); } catch(e){ console.debug(e); }

      // Notify other tabs
      try {
        if (window._docsBC && typeof window._docsBC.postMessage === 'function') window._docsBC.postMessage('refresh');
      } catch(e){ console.debug('docs-sync BC post failed', e); }
      try { safeLSSet('docsStoreUpdated', String(Date.now())); } catch(e){}

      // Trigger immediate render if available
      try { if (typeof window.renderDocs === 'function') window.renderDocs(category, ''); } catch(e){ console.debug('docs-sync render docs failed', e); }

      return item;
    } catch (err) {
      console.debug('docsOnUploadSuccess error', err);
      return null;
    }
  };

  // Optional: lightweight polling to sync across different browsers/profiles
  (function startPolling(){
    if (window._docsAutoPollInstalled) return;
    window._docsAutoPollInstalled = true;
    const INTERVAL_MS = 30 * 1000; // 30s
    setInterval(() => {
      try {
        if (document.hidden) return;
        if (typeof window.initDocs === 'function') window.initDocs();
      } catch (e) { /* ignore */ }
    }, INTERVAL_MS);
  })();

  console.debug('docs-sync initialized (version=' + DOCS_STORE_VERSION + ')');
})();