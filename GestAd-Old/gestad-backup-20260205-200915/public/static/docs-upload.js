//* Robust delegated upload handler for Documents panel.
(function () {
  'use strict';

  async function doUpload() {
    const uploadFile = document.getElementById('uploadFile');
    const uploadTitle = document.getElementById('uploadTitle');
    const uploadDesc = document.getElementById('uploadDesc');
    const uploadCategory = document.getElementById('uploadCategory');
    const uploadMsg = document.getElementById('uploadMsg');
    const uploadSubmit = document.getElementById('uploadSubmit');

    if (!uploadFile || !uploadFile.files || uploadFile.files.length === 0) {
      if (uploadMsg) uploadMsg.textContent = 'Choisir un fichier.';
      return;
    }
    if (!uploadTitle || !uploadTitle.value.trim()) {
      if (uploadMsg) uploadMsg.textContent = 'Titre requis.';
      return;
    }

    const fd = new FormData();
    fd.append('file', uploadFile.files[0]);
    fd.append('title', uploadTitle.value.trim());
    if (uploadDesc && uploadDesc.value) fd.append('desc', uploadDesc.value.trim());
    if (uploadCategory && uploadCategory.value) fd.append('category', uploadCategory.value);

    if (uploadSubmit) uploadSubmit.disabled = true;
    const prevText = uploadSubmit ? uploadSubmit.textContent : null;
    if (uploadSubmit) uploadSubmit.textContent = 'Téléversement…';
    if (uploadMsg) uploadMsg.textContent = 'Téléversement en cours…';

    try {
      const token = localStorage.getItem('token') || '';
      const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
      const res = await fetch('/api/documents/upload', { method: 'POST', headers, body: fd });

      if (!res.ok) {
        const body = await res.text().catch(() => null);
        let emsg = `Échec upload (status ${res.status})`;
        try {
          const j = JSON.parse(body);
          if (j && j.error) emsg += ': ' + j.error;
        } catch (e) {}
        throw new Error(emsg);
      }

      // Parse server response (best-effort)
      let createdBody = null;
      try {
        createdBody = await res.json().catch(() => null);
      } catch (e) {
        createdBody = null;
      }

      // Consolidated post-upload handling (attach category, insert locally via docsOnUploadSuccess or fallback,
      // then notify other tabs once). This replaces duplicated/overlapping handlers to ensure the chosen
      // category is always respected.
      try {
        // Prefer explicit select value, otherwise try to use active docs category (tab/buttons),
        // finally fallback to 'proces-verbaux'. Keep the select in sync with the chosen category.
        const chosenCategory = (uploadCategory && uploadCategory.value)
          ? uploadCategory.value
          : ((typeof window.getActiveDocsCategory === 'function') ? window.getActiveDocsCategory()
              : (document.querySelector('.doc-cat-btn[aria-pressed="true"]') ? document.querySelector('.doc-cat-btn[aria-pressed="true"]').dataset.cat : null))
            || 'proces-verbaux';
        try { if (uploadCategory) uploadCategory.value = chosenCategory; } catch (e) {}


        // normalize createdBody and attach category if missing
    if (createdBody && typeof createdBody === 'object') {
          // override server-provided category with the user's selection so UI shows the expected category
          createdBody._category = chosenCategory;
          // if server wrapped the doc in createdBody.document, ensure it carries the category too
          if (createdBody.document && typeof createdBody.document === 'object') {
            createdBody.document._category = chosenCategory;
          }
        } else {
          createdBody = { _category: chosenCategory };
        }

        // store temp file reference for possible later recovery
        const tempId = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        window._pendingFiles = window._pendingFiles || {};
        try { window._pendingFiles[tempId] = uploadFile.files[0]; } catch (e) {}

        // If an app-level helper exists, prefer it (single call)
        if (typeof window.docsOnUploadSuccess === 'function') {
          try {
            await window.docsOnUploadSuccess(createdBody, uploadFile.files[0], uploadTitle ? uploadTitle.value.trim() : '', uploadDesc ? uploadDesc.value.trim() : '', chosenCategory);
            if (uploadMsg) uploadMsg.textContent = 'Téléversé avec succès.';
            try { localStorage.setItem('docsStorePolicy', 'use_local'); } catch (e) {}
          } catch (e) {
            console.debug('docsOnUploadSuccess threw, falling back', e);
            if (uploadMsg) uploadMsg.textContent = 'Téléversé (post-processing échoué).';
          }
        } else {
          // fallback: insert a minimal item into the local docsStore and render
          const doc = (createdBody && createdBody.document) ? createdBody.document : (createdBody || null);
          const cat = chosenCategory;
          const item = {
            id: doc && (doc.id || null),
            title: (doc && (doc.title || doc.original_name)) || (uploadTitle ? uploadTitle.value.trim() : '') + (uploadFile.files[0] ? (' (' + uploadFile.files[0].name + ')') : ''),
            desc: (uploadDesc && uploadDesc.value) || (doc && (doc.desc || doc.description)) || '',
            url: doc && (doc.url || doc.path) ? (doc.url || doc.path) : (doc && doc.filename ? ('/uploads/documents/' + doc.filename) : '#'),
            created: doc || null,
            _tempId: tempId,
            _category: cat,
            _localPending: true
          };
          window.docsStore = window.docsStore || {};
          window.docsStore[cat] = window.docsStore[cat] || [];
          window.docsStore[cat].unshift(item);
          try { if (typeof window.persistIfAllowed === 'function') window.persistIfAllowed(); } catch (e) { console.debug('persist failed', e); }
          try { if (typeof window.renderDocs === 'function') window.renderDocs(cat); } catch (e) { console.debug('renderDocs fallback failed', e); }
          if (uploadMsg) uploadMsg.textContent = 'Téléversé avec succès.';
        }

        // publish notifications once (documentsUpdated + docsStoreUpdated + BroadcastChannel)
        try {
          const ts = String(Date.now());
          try { localStorage.setItem('documentsUpdated', ts); } catch (e) { /* ignore */ }
          try { localStorage.setItem('docsStoreUpdated', ts); } catch (e) { /* ignore */ }
          try {
            window._docsBC = window._docsBC || (('BroadcastChannel' in window) ? new BroadcastChannel('gestad-docs') : null);
            if (window._docsBC && typeof window._docsBC.postMessage === 'function') window._docsBC.postMessage('refresh');
          } catch (e) { /* ignore */ }
          try {
            window._appGlobalBC = window._appGlobalBC || (('BroadcastChannel' in window) ? new BroadcastChannel('app-global') : null);
            if (window._appGlobalBC && typeof window._appGlobalBC.postMessage === 'function') window._appGlobalBC.postMessage({ type: 'section:updated', section: 'documents' });
          } catch (e) { /* ignore */ }
        } catch (e) { console.debug('notify after upload failed', e); }
      } catch (err) {
        console.debug('post-upload consolidated handler error', err);
      }

      // Clear form fields after successful upload processing
      uploadFile.value = '';
      if (uploadTitle) uploadTitle.value = '';
      if (uploadDesc) uploadDesc.value = '';
      // keep uploadCategory as-is (optional)

      // --- Notify the rest of the app (use same logic as other sections) ---
      try {
        // Prefer application-level notifier if it exists
        if (typeof window.notifySectionUpdated === 'function') {
          try { window.notifySectionUpdated('documents'); } catch (e) { console.debug('notifySectionUpdated failed', e); }
        } else if (typeof window.appEvents === 'object' && typeof window.appEvents.emit === 'function') {
          try { window.appEvents.emit('section:updated', { section: 'documents' }); } catch (e) { console.debug('appEvents.emit failed', e); }
        } else {
          // Fallback: BroadcastChannel + localStorage keys (compatible with many modules)
          try {
            // reuse existing BC if present, otherwise try to create an app-global channel
            if (window._appGlobalBC && typeof window._appGlobalBC.postMessage === 'function') {
              try { window._appGlobalBC.postMessage({ type: 'section:updated', section: 'documents' }); } catch (e) { console.debug('appGlobalBC post failed', e); }
            } else if ('BroadcastChannel' in window) {
              try {
                window._appGlobalBC = window._appGlobalBC || new BroadcastChannel('app-global');
                window._appGlobalBC.postMessage({ type: 'section:updated', section: 'documents' });
              } catch (e) { console.debug('creating/posting app-global BC failed', e); }
            }
          } catch (e) { console.debug('BroadcastChannel notify failed', e); }

          // localStorage fallback: set document-specific key and docsStoreUpdated for backward compatibility
          try { localStorage.setItem('documentsUpdated', String(Date.now())); } catch (e) { console.debug('localStorage documentsUpdated set failed', e); }
          try { localStorage.setItem('docsStoreUpdated', String(Date.now())); } catch (e) { console.debug('localStorage docsStoreUpdated set failed', e); }
        }
        console.debug('docs-upload: notification posted (documents)');
      } catch (e) {
        console.debug('docs-upload: overall notify failed', e);
      }
      // --- end notify ---

    } catch (err) {
      console.error('Upload error', err);
      if (uploadMsg) uploadMsg.textContent = 'Erreur: ' + (err && err.message ? err.message : 'upload échoué');
      alert('Échec du téléversement: ' + (err && err.message ? err.message : 'erreur'));
    } finally {
      if (uploadSubmit) {
        uploadSubmit.disabled = false;
        if (prevText) uploadSubmit.textContent = prevText;
      }
    }
  }

  function delegatedClickListener(e) {
    if (!e.target) return;
    const btn = e.target.closest && e.target.closest('#uploadSubmit');
    if (!btn) return;
    e.preventDefault();
    doUpload();
  }

  document.removeEventListener('click', delegatedClickListener);
  document.addEventListener('click', delegatedClickListener, { passive: false });

  // Defensive observer (no-op but kept for future)
  try {
    const root = document.getElementById('panel-docs') || document.body;
    const mo = new MutationObserver(() => {});
    mo.observe(root, { childList: true, subtree: true });
  } catch (e) {}
  // --- Initialization & uploadReset handler ---
  document.addEventListener('DOMContentLoaded', () => {
    // Ensure the uploadCategory select defaults to current active category
    const sel = document.getElementById('uploadCategory');
    const active = (typeof window.getActiveDocsCategory === 'function')
      ? window.getActiveDocsCategory()
      : (document.querySelector('.doc-cat-btn[aria-pressed="true"]') ? document.querySelector('.doc-cat-btn[aria-pressed="true"]').dataset.cat : 'proces-verbaux');
    if (sel) {
      try { sel.value = active || 'proces-verbaux'; } catch (e) { /* ignore */ }
    }

    // Wire the "Réinitialiser" button if present
    const resetBtn = document.getElementById('uploadReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const f = document.getElementById('uploadFile');
        const t = document.getElementById('uploadTitle');
        const d = document.getElementById('uploadDesc');
        const c = document.getElementById('uploadCategory');
        const m = document.getElementById('uploadMsg');
        if (f) try { f.value = ''; } catch (e) {}
        if (t) try { t.value = ''; } catch (e) {}
        if (d) try { d.value = ''; } catch (e) {}
        if (c) try { c.value = active || 'proces-verbaux'; } catch (e) {}
        if (m) try { m.textContent = ''; } catch (e) {}
      });
    }
  });
})();