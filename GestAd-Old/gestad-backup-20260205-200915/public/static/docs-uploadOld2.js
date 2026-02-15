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

      // If docs-sync helper is available, use it to insert the server-provided document
      try {
        if (typeof window.docsOnUploadSuccess === 'function') {
          // pass server response and form values (file, title, desc, category)
          window.docsOnUploadSuccess(
            createdBody,
            uploadFile.files[0],
            uploadTitle ? uploadTitle.value.trim() : '',
            uploadDesc ? uploadDesc.value.trim() : '',
            uploadCategory ? uploadCategory.value : null
          );
          if (uploadMsg) uploadMsg.textContent = 'Téléversé avec succès.';
        } else {
          // Fallback: show message and attempt a UI refresh
          if (uploadMsg) uploadMsg.textContent = 'Téléversé avec succès.';
          try {
            if (typeof window.renderDocs === 'function') {
              await window.renderDocs(1, '');
            } else if (typeof window.renderDocsMock === 'function') {
              await window.renderDocsMock(1, '');
            }
          } catch (e) {
            console.debug('refresh after upload failed (fallback)', e);
          }
        }
      } catch (e) {
        console.debug('docsOnUploadSuccess failed, falling back', e);
        if (uploadMsg) uploadMsg.textContent = 'Téléversé avec succès (mais post-processing échoué).';
        try {
          if (typeof window.renderDocs === 'function') {
            await window.renderDocs(1, '');
          } else if (typeof window.renderDocsMock === 'function') {
            await window.renderDocsMock(1, '');
          }
        } catch (err) {
          console.debug('refresh after upload failed (second fallback)', err);
        }
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
})();