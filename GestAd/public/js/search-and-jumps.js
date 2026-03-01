/* search-and-jumps.js
   Global search + jump-to-page logic (legislation + fallback for other types)
   - Searches /api/legislation/search and /api/documents/search and merges results
   - For legislation results uses /api/legislation/:id/position?limit= to compute page,
     loads that page (window.loadLegislationPage) and highlights the document card.
   - Lightweight, dependency-free. Designed to work with the index.html provided.
*/

(function () {
  const RESULTS_CONTAINER_ID = 'global-search-results';
  const RESULTS_LIST_ID = 'search-results-list';
  const RESULTS_COUNT_ID = 'search-results-count';
  const INPUT_ID = 'global-search-input';
  const SEARCH_DEBOUNCE_MS = 300;
  const MAX_RESULTS = 50;
  const LEGIS_PAGE_SIZE = 9; // must match server/client page size
  const PAGE_SIZE = 9;

  const getTokenHeader = () => {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async function fetchJson(url, opts = {}) {
    const headers = { ...(opts.headers || {}), ...getTokenHeader() };
    const resp = await fetch(url, { ...opts, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      let err;
      try { err = text ? JSON.parse(text) : { message: resp.statusText }; } catch (e) { err = { message: text || resp.statusText }; }
      throw new Error(err.error || err.message || resp.statusText);
    }
    return resp.json();
  }

  // Combined search across endpoints
  async function performSearch(query) {
    if (!query || query.trim().length < 2) return [];

    const q = encodeURIComponent(query.trim());
    const promises = [
      fetchJson(`/api/legislation/search?q=${q}`).catch(err => { console.warn('leg search err', err); return []; }),
      fetchJson(`/api/documents/search?q=${q}`).catch(err => { console.warn('docs search err', err); return []; }),
    ];

    const [leg, docs] = await Promise.all(promises);

    const mapLeg = (items = []) => items.slice(0, MAX_RESULTS).map(it => ({
      type: 'legislation',
      id: it.id,
      title: it.title || it.originalName || '(sans titre)',
      originalName: it.originalName || '',
      desc: it.desc || it.description || '',
      uploadedAt: it.uploadedAt || it.created_at || null,
      raw: it
    }));

    const mapDocs = (items = []) => items.slice(0, MAX_RESULTS).map(it => ({
      type: 'document',
      id: it.id,
      title: it.title || it.original_name || '(sans titre)',
      originalName: it.original_name || '',
      desc: it.description || '',
      category: it.category || '',
      uploadedAt: it.created_at || null,
      raw: it
    }));

    return [...mapLeg(leg), ...mapDocs(docs)].slice(0, MAX_RESULTS);
  }

  // Render results into the header dropdown
  function renderResults(items, query) {
    const resultsContainer = document.getElementById(RESULTS_CONTAINER_ID);
    const list = document.getElementById(RESULTS_LIST_ID);
    const countEl = document.getElementById(RESULTS_COUNT_ID);
    if (!resultsContainer || !list || !countEl) return;

    if (!items || items.length === 0) {
      countEl.textContent = '0 résultat';
      list.innerHTML = `<div class="search-no-results">Aucun résultat pour « ${escapeHtml(query)} »</div>`;
      resultsContainer.style.display = 'block';
      return;
    }

    countEl.textContent = `${items.length} résultat${items.length > 1 ? 's' : ''}`;
    list.innerHTML = items.map(it => {
      const cat = it.type === 'legislation' ? 'Législation' : (it.category || 'Document');
      const snippet = (it.desc || it.originalName || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `
        <div class="search-result-item" data-type="${it.type}" data-id="${it.id}" tabindex="0">
          <div class="search-result-icon">${it.type === 'legislation' ? '⚖️' : '📄'}</div>
          <div class="search-result-content">
            <div class="search-result-title">${escapeHtml(it.title)}</div>
            <div class="search-result-meta">
              <span>${escapeHtml(cat)}</span>
              ${it.uploadedAt ? `<span>${new Date(it.uploadedAt).toLocaleDateString('fr-FR')}</span>` : ''}
              ${it.originalName ? `<span>${escapeHtml(it.originalName)}</span>` : ''}
            </div>
            ${snippet ? `<div style="font-size:0.9rem;color:#555;margin-top:6px;">${snippet}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // attach handlers
    Array.from(list.querySelectorAll('.search-result-item')).forEach(node => {
      node.addEventListener('click', onResultClick);
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          node.click();
        }
      });
    });

    resultsContainer.style.display = 'block';
  }

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Handle click on a search result
  async function onResultClick(e) {
    const node = e.currentTarget;
    const type = node.getAttribute('data-type');
    const id = node.getAttribute('data-id');

    // close the dropdown visually (but leave focus)
    const resultsContainer = document.getElementById(RESULTS_CONTAINER_ID);
    if (resultsContainer) resultsContainer.style.display = 'none';

    try {
      if (type === 'legislation') {
        await jumpToLegislation(id);
      } else if (type === 'document') {
        // best-effort: if window.switchToTab and loadDocuments exist, try to use them
        if (typeof window.switchToTab === 'function') {
          window.switchToTab('tab-docs-admin');
        } else {
          const btn = document.getElementById('tab-docs-admin');
          if (btn) btn.click();
        }

        // If there's a position endpoint for documents use it (not guaranteed)
        try {
          const posResp = await fetch(`/api/documents/${id}/position?limit=${PAGE_SIZE}`, { headers: getTokenHeader() });
          if (posResp.ok) {
            const pos = await posResp.json();
            if (typeof window.loadDocumentsPage === 'function') {
              await window.loadDocumentsPage(pos.page);
              await highlightAfterLoad('documents-list', id);
              return;
            }
          }
        } catch (err) {
          // ignore, fallback below
        }

        // Fallback: try to find element on current page and highlight
        await delay(200);
        await highlightAfterLoad('documents-list', id);
      } else {
        // default: navigate to legislation tab
        if (typeof window.switchToTab === 'function') {
          window.switchToTab('tab-legislation');
        } else {
          const btn = document.getElementById('tab-legislation');
          if (btn) btn.click();
        }
      }
    } catch (err) {
      console.error('Jump error', err);
      alert('Impossible d\'effectuer la navigation : ' + (err && err.message ? err.message : err));
    }
  }

  // Jump to legislation: compute page then load and highlight
  async function jumpToLegislation(id) {
    // compute position
    const limit = LEGIS_PAGE_SIZE;
    const posUrl = `/api/legislation/${encodeURIComponent(id)}/position?limit=${limit}`;
    let page = 1;

    try {
      const tokenHeader = getTokenHeader();
      const resp = await fetch(posUrl, { headers: tokenHeader });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.page) page = parseInt(json.page, 10) || 1;
      } else if (resp.status === 404) {
        throw new Error('Document introuvable');
      } else {
        // fallback: page 1
        console.warn('position endpoint returned', resp.status);
      }
    } catch (err) {
      console.warn('Could not get position, loading page 1', err);
      page = 1;
    }

    // switch to legislation tab
    if (typeof window.switchToTab === 'function') {
      window.switchToTab('tab-legislation');
    } else {
      const btn = document.getElementById('tab-legislation');
      if (btn) btn.click();
    }

    // load the legislation page using the helper if available
    if (typeof window.loadLegislationPage === 'function') {
      await window.loadLegislationPage(page);
    } else {
      // fallback: try to call the generic loader (if any) or fetch & render minimal
      try {
        const res = await fetch(`/api/legislation?page=${page}&limit=${limit}`, { headers: getTokenHeader() });
        if (res.ok) {
          const items = await res.json();
          const container = document.getElementById('legislation-list');
          if (container) {
            container.innerHTML = items.map(doc => `
              <div class="document-card" data-doc-id="${doc.id}">
                <div class="document-icon">📄</div>
                <div class="document-title" title="${escapeHtml(doc.title || doc.originalName || '')}">${escapeHtml(doc.title || doc.originalName || '')}</div>
                <div class="document-meta">${escapeHtml(doc.originalName || '')}</div>
              </div>
            `).join('');
          }
        }
      } catch (err) {
        console.warn('fallback load failed', err);
      }
    }

    // wait for the specific element to appear and highlight it
    const found = await waitForDocAndHighlight('legislation-list', id, { timeout: 7000, poll: 150 });
    if (!found) {
      // fallback: show a small notice
      console.warn('Document not present on loaded page after waiting');
      alert('Document chargé mais introuvable sur la page (vérifiez la pagination).');
    }
  }

  // Wait for an element with data-doc-id and highlight
  async function waitForDocAndHighlight(containerId, docId, { timeout = 5000, poll = 100 } = {}) {
    const container = document.getElementById(containerId);
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (container) {
        const el = container.querySelector(`[data-doc-id="${docId}"]`);
        if (el) {
          highlightElement(el);
          // scroll to it
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (e) { el.scrollIntoView(); }
          return true;
        }
      }
      await delay(poll);
    }
    return false;
  }

  // Generic highlight function
  function highlightElement(el, { duration = 2500 } = {}) {
    try {
      el.classList.add('highlight');
      el.classList.add('blink');
      // ensure visible z-index
      el.style.zIndex = 9999;
      setTimeout(() => {
        el.classList.remove('blink');
      }, 1200);
      setTimeout(() => {
        el.classList.remove('highlight');
        el.style.zIndex = '';
      }, duration);
    } catch (e) {
      console.warn('highlight failed', e);
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // If a page already has the doc element (no page switching needed) highlight it
  async function highlightAfterLoad(containerId, docId) {
    const ok = await waitForDocAndHighlight(containerId, docId, { timeout: 3000, poll: 120 });
    if (!ok) {
      // nothing else to do; optionally show message
      console.warn(`Document ${docId} not found in ${containerId}`);
    }
  }

  // Close global search UI
  function closeGlobalSearch() {
    const resultsContainer = document.getElementById(RESULTS_CONTAINER_ID);
    if (resultsContainer) resultsContainer.style.display = 'none';
    const input = document.getElementById(INPUT_ID);
    if (input) input.blur();
  }

  // Show search history (simple)
  function showSearchHistory(history = []) {
    const historyContainer = document.getElementById('search-history');
    const list = document.getElementById('search-history-list');
    if (!historyContainer || !list) return;
    if (!history || history.length === 0) {
      historyContainer.style.display = 'none';
      return;
    }
    historyContainer.style.display = 'block';
    list.innerHTML = history.map(h => `<div class="search-history-item" data-q="${escapeHtml(h)}">${escapeHtml(h)}</div>`).join('');
    Array.from(list.querySelectorAll('.search-history-item')).forEach(node => {
      node.addEventListener('click', (e) => {
        const q = node.getAttribute('data-q');
        const input = document.getElementById(INPUT_ID);
        if (input) {
          input.value = q;
          input.dispatchEvent(new Event('input'));
        }
      });
    });
  }

  // Wire up UI
  function init() {
    const input = document.getElementById(INPUT_ID);
    const resultsContainer = document.getElementById(RESULTS_CONTAINER_ID);
    const resultsList = document.getElementById(RESULTS_LIST_ID);
    if (!input || !resultsContainer || !resultsList) {
      // nothing to do
      return;
    }

    const debouncedSearch = debounce(async function (ev) {
      const q = ev.target.value.trim();
      if (!q || q.length < 2) {
        resultsContainer.style.display = 'none';
        return;
      }
      try {
        const items = await performSearch(q);
        renderResults(items, q);
        // store history (simple, localStorage)
        try {
          let history = JSON.parse(localStorage.getItem('search_history') || '[]');
          history = history.filter(h => h !== q);
          history.unshift(q);
          if (history.length > 10) history = history.slice(0, 10);
          localStorage.setItem('search_history', JSON.stringify(history));
        } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('Search failed', err);
        resultsList.innerHTML = `<div class="search-no-results">Erreur recherche</div>`;
        resultsContainer.style.display = 'block';
      }
    }, SEARCH_DEBOUNCE_MS);

    input.addEventListener('input', debouncedSearch);

    input.addEventListener('focus', function () {
      const q = input.value.trim();
      if (!q) {
        try {
          const history = JSON.parse(localStorage.getItem('search_history') || '[]');
          showSearchHistory(history);
        } catch (e) { /* ignore */ }
      } else {
        // if there is text, trigger search (debounced)
        input.dispatchEvent(new Event('input'));
      }
    });

    // close on escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeGlobalSearch();
    });

    // close results when clicking outside
    document.addEventListener('click', function (ev) {
      const container = document.querySelector('.global-search-container');
      if (!container) return;
      if (!container.contains(ev.target)) {
        closeGlobalSearch();
      }
    });

    // wire close button if present
    const closeBtn = document.querySelector('.btn-close-search');
    if (closeBtn) closeBtn.addEventListener('click', closeGlobalSearch);

    // expose helpers
    window.closeGlobalSearch = closeGlobalSearch;
    window.jumpToLegislation = jumpToLegislation;

    // preview modal for legislation entries (reuses showPreviewModal from the main app)
    // --- Remplacez la partie previewLegislation par ce bloc ---
    window.previewLegislation = async function (id) {
      try {
        // console.debug('previewLegislation: start', { id });
        const tokenHeader = getTokenHeader();
        const resp = await fetch(`/api/legislation/${encodeURIComponent(id)}`, { headers: tokenHeader });
        if (!resp.ok) throw new Error('Document introuvable');
        const doc = await resp.json();
        //console.debug('previewLegislation: fetched doc', doc);

        // normaliser champs attendus par showPreviewModal / loadPreviewContent
        doc.mime_type = doc.mime_type || doc.mimetype || doc.mimeType || (doc.raw && (doc.raw.mime_type || doc.raw.mimetype)) || '';
        doc.original_name = doc.original_name || doc.originalName || doc.original_name || '';
        doc.title = doc.title || doc.title || doc.original_name || doc.originalName || '';
        doc.file_size = doc.file_size || doc.size || doc.file_size || 0;
        doc.created_at = doc.created_at || doc.uploadedAt || doc.created_at || doc.uploadedAt || null;
        doc.kind = doc.kind || (doc.storedName ? 'file' : doc.link ? 'link' : undefined);

        // <-- IMPORTANT : forcer l'URL de téléchargement pour la législation
        // showPreviewModal/loadPreviewContent utilise getDownloadUrl(doc) si présent (_downloadUrl)
        if (!doc._downloadUrl) {
          // si c'est un lien externe, utilise doc.url sinon l'endpoint legislation
          doc._downloadUrl = doc.url && String(doc.url).trim() !== ''
            ? doc.url
            : `/api/legislation/${encodeURIComponent(id)}/download`;
          //console.debug('previewLegislation: set _downloadUrl', doc._downloadUrl);
        }

        // afficher la modale de prévisualisation
        if (typeof window.showPreviewModal === 'function') {
          window.showPreviewModal(doc);
        } else {
          // fallback: ouvrir le téléchargement dans un nouvel onglet (rare)
          window.open(doc._downloadUrl, '_blank');
        }
      } catch (err) {
        console.error('previewLegislation error', err);
        alert('Impossible d\'ouvrir la prévisualisation.');
      }
    };

    // ---- START: server-backed search + input binding for Législation ----
    // Calls /api/legislation/search?q=... for q >= 2 and renders results into #legislation-list.
    window.searchLegislation = async function (q) {
      const containerId = 'legislation-list';
      const countEl = document.getElementById('search-legislation-count');
      const container = document.getElementById(containerId);
      try {
        q = String(q || '').trim();
        if (q.length < 2) {
          // restore paginated view if available
          if (typeof window.loadLegislationPage === 'function') {
            window.loadLegislationPage(1);
          }
          if (countEl) countEl.textContent = '';
          return;
        }

        const items = await fetchJson(`/api/legislation/search?q=${encodeURIComponent(q)}`).catch(err => {
          console.warn('leg search failed', err);
          return [];
        });

        // normalize items (so renderDocuments/getFileIcon find mime_type/original_name consistently)
        const normalized = (items || []).map(it => {
          const doc = { ...(it || {}) };
          doc.mime_type = doc.mime_type || doc.mimetype || doc.mimeType || (doc.raw && (doc.raw.mime_type || doc.raw.mimetype)) || '';
          doc.original_name = doc.original_name || doc.originalName || doc.original_name || '';
          doc.title = doc.title || doc.title || doc.original_name || doc.originalName || '';
          doc.file_size = doc.file_size || doc.size || doc.file_size || 0;
          doc.created_at = doc.created_at || doc.uploadedAt || doc.created_at || doc.uploadedAt || null;
          // keep kind/storedName if present (useful to detect files vs links)
          doc.kind = doc.kind || (doc.raw && doc.raw.kind) || (doc.storedName ? 'file' : doc.link ? 'link' : undefined);
          // marque la source pour que le renderer sache que c'est de la législation
          doc._source = 'legislation';
          return doc;
        });
        // Keep a copy for client filtering BUT first filter results so we only show items
        // that actually appear in the paginated "législation" listing.
        // Servers sometimes return results that are not categorized as legislation;
        // client-side filter reduces false-positives and avoids jumps to pages where the doc isn't present.
        const filtered = (normalized || []).filter(d => {
          const cat = (d.category || (d.raw && d.raw.category) || '').toString().toLowerCase();
          const kind = (d.kind || '').toString().toLowerCase();
          // accept explicit marks
          return cat === 'législation' || cat === 'legislation' || kind === 'legislation' || !!d.isLegislation;
        });

        // If none are explicitly marked, treat all normalized items returned by the legislation search
        // as legislation (servers sometimes omit category/kind fields). Use a debug log instead of a warning.
        let toShow;
        if (filtered.length > 0) {
          toShow = filtered;
        } else {
          toShow = normalized || [];
          /*if ((normalized || []).length > 0) {
            // debug-level message (less noisy than warn)
            if (typeof console !== 'undefined' && console.debug) {
              console.debug('searchLegislation: no explicit legislation category/kind on results — falling back to all normalized items from legislation search');
            }
          }*/
        }

        // Ensure each item advertises a category (renderDocuments and preview expect this)
        toShow.forEach(d => { if (!d.category) d.category = 'législation'; });

        window.allDocuments = window.allDocuments || {};
        window.allDocuments[containerId] = toShow;

        // Prefer to reuse global renderDocuments if present — pass filtered/normalized data (consistent fields)
        if (typeof window.renderDocuments === 'function') {
          window.renderDocuments(toShow || [], containerId);
        } else if (container) {
          // minimal render fallback — prefer site-wide getFileIcon if available
          const iconFor = (doc) => {
            try {
              if (typeof window.getFileIcon === 'function') return window.getFileIcon(doc.mime_type);
            } catch (e) { /* ignore */ }
            return '📄';
          };
          container.innerHTML = (normalized || []).map(doc => `
          <div class="document-card" data-doc-id="${doc.id}">
            <div class="document-icon">${iconFor(doc)}</div>
            <div class="document-title" title="${(doc.title || doc.original_name || '').replace(/"/g, '&quot;')}">${doc.title || doc.original_name || ''}</div>
            <div class="document-meta">${doc.original_name || ''}</div>
            <div class="document-meta">${doc.file_size ? (doc.file_size + ' bytes') : ''}</div>
            <div class="document-meta">${doc.created_at ? new Date(doc.created_at).toLocaleDateString('fr-FR') : ''}</div>
            <div class="document-actions"></div>
          </div>
        `).join('');
        }

        if (countEl) countEl.textContent = `${(normalized || []).length} résultat${(normalized || []).length > 1 ? 's' : ''}`;

        // Attach jump buttons to rendered cards (match by index)
        if (container && (normalized || []).length > 0) {
          const cards = Array.from(container.children || []);
          (normalized || []).forEach((doc, idx) => {
            const card = cards[idx];
            if (!card) return;

            // ensure icon uses site getFileIcon if available
            try {
              const iconEl = card.querySelector('.document-icon');
              if (iconEl) {
                if (typeof window.getFileIcon === 'function') {
                  iconEl.textContent = window.getFileIcon(doc.mime_type);
                } else {
                  // fallback keep existing content
                }
              }
            } catch (e) { /* ignore */ }

            let actions = card.querySelector('.document-actions');
            if (!actions) {
              actions = document.createElement('div');
              actions.className = 'document-actions';
              card.appendChild(actions);
            }

            // If card already has a "Voir"/"Ouvrir" button that opens a window (🔗), replace its handler
            const openerBtn = Array.from(actions.querySelectorAll('button, a')).find(el => {
              const txt = (el.textContent || '').toLowerCase();
              if (txt.includes('ouvrir') || txt.includes('🔗') || txt.includes('télécharger')) return true;
              const onclick = (el.getAttribute && el.getAttribute('onclick')) || '';
              if (onclick.includes('window.open') || onclick.includes('download')) return true;
              return false;
            });
            // --- Dans la boucle qui parcourt les cards, remplacez l'override openerBtn par ce bloc ---
            if (openerBtn) {
              // si l'entrée est un fichier, on veut préférer la modale
              if (doc.kind === 'file' || doc.storedName || (doc.original_name && doc.original_name.length > 0)) {
                try {
                  // créer un clone superficiel pour enlever tous les event listeners existants
                  const replacement = openerBtn.cloneNode(false);

                  // si c'était un <a>, retirer href/target pour éviter navigation
                  if (replacement.tagName && replacement.tagName.toLowerCase() === 'a') {
                    try {
                      if (!replacement.dataset) replacement.dataset = {};
                      // sauvegarder l'ancienne href si besoin
                      if (!openerBtn.dataset.origHref) openerBtn.dataset.origHref = openerBtn.getAttribute('href') || '';
                    } catch (e) { /* ignore */ }
                    replacement.removeAttribute('href');
                    replacement.removeAttribute('target');
                    replacement.setAttribute('role', 'button');
                  }

                  // conserver le texte / label visuel
                  replacement.textContent = openerBtn.textContent;
                  // copier classes/attributes utiles (sauf listeners)
                  replacement.className = openerBtn.className || '';

                  // attacher handler de preview (stopPropagation pour sécurité)
                  replacement.addEventListener('click', function (ev) {
                    try { ev.preventDefault(); ev.stopPropagation(); } catch (e) { /* ignore */ }
                    if (typeof window.previewLegislation === 'function') window.previewLegislation(doc.id);
                    else if (typeof window.previewDocument === 'function') window.previewDocument(doc.id);
                  }, { passive: false });

                  // remplacer dans le DOM
                  openerBtn.parentNode && openerBtn.parentNode.replaceChild(replacement, openerBtn);
                } catch (e) {
                  // fallback conservative : override onclick
                  openerBtn.onclick = function (ev) {
                    try { ev && ev.stopPropagation(); } catch (e) { }
                    if (typeof window.previewLegislation === 'function') window.previewLegislation(doc.id);
                    else if (typeof window.previewDocument === 'function') window.previewDocument(doc.id);
                  };
                }
              }
            }

            // add a "Aller" button to jump to the paginated page if there is no obvious navigation button
            // Remplacer l'ancien test hasNav par ce bloc plus complet
            const hasNav = Array.from(actions.querySelectorAll('button, a')).some(el => {
              const t = (el.textContent || '').trim().toLowerCase();

              // Détecter les libellés usuels indiquant navigation/prévisualisation
              if (t.includes('aller') || t.includes('page') ||
                t.includes('voir') || t.includes('ouvrir') || t.includes('prévisualiser') ||
                t.includes('prévisualisation') || t.includes('🔗')) {
                return true;
              }

              // Inspecter onclick/href pour repérer handlers de preview/jump/open
              try {
                const onclick = (el.getAttribute && el.getAttribute('onclick')) || '';
                if (onclick && (onclick.toLowerCase().includes('preview') || onclick.toLowerCase().includes('jumpto') || onclick.toLowerCase().includes('download') || onclick.toLowerCase().includes('open'))) {
                  return true;
                }
              } catch (e) { /* ignore */ }

              if (el.getAttribute && el.getAttribute('href')) return true;
              if (el.getAttribute && el.getAttribute('data-jump-id') === doc.id) return true;

              return false;
            });
            if (!hasNav) {
              const goBtn = document.createElement('button');
              goBtn.className = 'btn btn-sm';
              goBtn.style.flex = '1';
              goBtn.textContent = '↪️ Aller';
              goBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (typeof window.jumpToLegislation === 'function') {
                  await window.jumpToLegislation(doc.id);
                } else if (typeof window.switchToTab === 'function') {
                  window.switchToTab('tab-legislation');
                }
              });
              actions.insertBefore(goBtn, actions.firstChild || null);
            }
          });
        }

      } catch (err) {
        console.error('searchLegislation error', err);
        if (countEl) countEl.textContent = 'Erreur recherche';
      }
    };

    // Bind the local #search-legislation input: server-search for >=2 chars, otherwise local filter
    (function bindLegislationInput() {
      const input = document.getElementById('search-legislation');
      if (!input) return;
      const handler = debounce(async function (e) {
        const q = String(e.target.value || '').trim();
        if (q.length >= 2 && typeof window.searchLegislation === 'function') {
          await window.searchLegislation(q);
        } else {
          // fallback: filter current page (if filterDocuments exists)
          if (typeof window.filterDocuments === 'function') {
            window.filterDocuments(q, 'legislation-list', 'search-legislation-count');
          } else if (q.length === 0 && typeof window.loadLegislationPage === 'function') {
            // restore page view on clear
            window.loadLegislationPage(1);
          }
        }
      }, 220);
      if (input.__legis_handler__) input.removeEventListener('input', input.__legis_handler__);
      input.addEventListener('input', handler, { passive: true });
      input.__legis_handler__ = handler;
    })();
    // ---- END: server-backed search + input binding for Législation ----
  }

  // start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();