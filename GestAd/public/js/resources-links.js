// Simple client for the "Ressources" links UI.
// Expose initResourcesLinks({ apiBase }) called from index.html.
// - GET list: GET {apiBase} (expects array of docs OR resources)
// - Create link: POST {apiBase}/links  (body: { url, title })
// - Delete link: DELETE {apiBase}/links/:id

(function () {
  function escapeText(s) {
    return String(s == null ? '' : s);
  }

  async function fetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = res.statusText;
      try { msg = JSON.parse(text).error || JSON.parse(text).message || msg; } catch (e) {}
      throw new Error(msg || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function createAnchor(url, label) {
    const a = document.createElement('a');
    // allow relative uploads (starting with /) or absolute http(s)
    const isSafe = typeof url === 'string' && (url.startsWith('/') || url.match(/^https?:\/\//i));
    a.href = isSafe ? url : '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label || url;
    a.className = 'resource-link';
    return a;
  }

  async function loadResources(apiBase) {
    const listEl = document.getElementById('resources-list');
    const countEl = document.getElementById('search-resources-count');
    if (!listEl) return;
    listEl.innerHTML = '<li style="color:#666">Chargement...</li>';
    try {
      // Prefer apiBase (e.g. /api/resources), fallback to documents endpoint
      let url = apiBase || '/api/resources';
      let items = await fetchJson(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      // If server returns { resources: [...] } handle it
      if (items && items.resources) items = items.resources;
      items = items || [];

      // normalize: items may be documents with url/path fields
      listEl.innerHTML = '';
      if (items.length === 0) {
        listEl.innerHTML = '<li style="color:#666">Aucune ressource</li>';
      } else {
        items.forEach(item => {
          const li = document.createElement('li');
          li.style.display = 'flex';
          li.style.alignItems = 'center';
          li.style.justifyContent = 'space-between';
          li.style.gap = '8px';

          const left = document.createElement('div');
          left.style.flex = '1';

          const title = item.title || item.original_name || item.url || item.filename || 'Lien';
          const label = escapeText(title);

          // Use item.url if present, else item.path or constructed uploads path
          const href = item.url || item.path || (item.filename ? '/uploads/resources/' + item.filename : '');
          const a = createAnchor(href, label);
          left.appendChild(a);

          // metadata small
          const meta = document.createElement('div');
          meta.style.fontSize = '0.85rem';
          meta.style.color = '#666';
          if (item.created_at) {
            meta.textContent = ' • ' + new Date(item.created_at).toLocaleString();
            left.appendChild(meta);
          }

          li.appendChild(left);

          // actions
          const actions = document.createElement('div');
          actions.style.display = 'flex';
          actions.style.gap = '6px';

          // If item has numeric id (persisted), show delete button that calls API
          if (item.id && !isNaN(Number(item.id))) {
            const del = document.createElement('button');
            del.className = 'btn btn-sm btn-danger';
            del.textContent = 'Supprimer';
            del.onclick = async () => {
              if (!confirm('Supprimer ce lien ?')) return;
              try {
                await fetchJson(`${apiBase}/links/${item.id}`, { method: 'DELETE', headers: { 'Accept': 'application/json' } });
                await loadResources(apiBase);
              } catch (err) {
                alert('Erreur suppression: ' + err.message);
              }
            };
            actions.appendChild(del);
          }

          li.appendChild(actions);
          listEl.appendChild(li);
        });
      }

      if (countEl) countEl.textContent = items.length > 0 ? `📚 ${items.length} ressource(s)` : '';
    } catch (err) {
      listEl.innerHTML = `<li style="color:#b00">Erreur chargement: ${escapeText(err.message)}</li>`;
      if (countEl) countEl.textContent = '';
      console.error('loadResources error', err);
    }
  }

  function initFormHandlers(apiBase) {
    const form = document.getElementById('add-link-form');
    const titleInput = document.getElementById('link-title');
    const urlInput = document.getElementById('link-url');
    const errorEl = document.getElementById('link-form-error');

    if (!form || !urlInput) return;

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
      const url = (urlInput.value || '').trim();
      const title = (titleInput && titleInput.value) ? titleInput.value.trim() : null;
      if (!url) {
        if (errorEl) { errorEl.textContent = 'URL requise'; errorEl.style.display = 'block'; }
        return;
      }
      try {
        await fetchJson(`${apiBase}/links`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ url, title })
        });
        // clear
        if (titleInput) titleInput.value = '';
        urlInput.value = '';
        await loadResources(apiBase);
      } catch (err) {
        if (errorEl) { errorEl.textContent = err.message || 'Erreur'; errorEl.style.display = 'block'; }
        console.error('create link error', err);
      }
    };
  }

  // Public initializer
  window.initResourcesLinks = function (opts = {}) {
    const apiBase = (opts && opts.apiBase) ? opts.apiBase.replace(/\/$/, '') : '/api/resources';
    // ensure element exists
    if (!document.getElementById('resources-list')) return;
    initFormHandlers(apiBase);
    loadResources(apiBase);
  };
})();