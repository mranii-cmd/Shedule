// /public/js/preview-pdf.js
// Amélioration du rendu PDF : affiche toutes les pages, ajoute controls prev/next page
// Doit être chargé après pdf.js (pdfjsLib déjà disponible) et après les définitions de preview modal.

(function () {
  // Globals for PDF rendering
  window._pdfDocument = null;
  window._pdfCurrentPage = 1;
  window._pdfTotalPages = 0;
  window._pdfRenderingInProgress = false;

  // Default margin (px) added on top of header height for comfortable spacing.
  // Tu peux ajuster à chaud avec window.PDF_SCROLL_MARGIN_TOP = 200;
  const DEFAULT_SCROLL_MARGIN_TOP = 80;

  // Ensure workerSrc (avoid pdf.js warning)
  if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // Helper: find the first descendant scrollable inside a root (BFS)
  function findDescendantScrollable(root) {
    if (!root) return null;
    const q = [root];
    while (q.length) {
      const el = q.shift();
      if (!el || el.nodeType !== 1) continue;
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflow + cs.overflowY + cs.overflowX) && el.scrollHeight > el.clientHeight) return el;
      for (let i = 0; i < el.children.length; i++) q.push(el.children[i]);
    }
    return null;
  }

  // Helper: find nearest scrollable ancestor
  function findScrollableAncestor(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      if (/(auto|scroll)/.test(cs.overflow + cs.overflowY + cs.overflowX) && cur.scrollHeight > cur.clientHeight) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // Render a specific page number into the canvas (fit-to-width, DPR-correct)
  async function renderPdfPage(pageNum) {
    const viewer = document.getElementById('preview-viewer');
    if (!viewer || !window._pdfDocument) return;

    const canvas = document.getElementById('pdf-canvas');
    if (!canvas) return;

    // prevent double render
    if (window._pdfRenderingInProgress) return;
    window._pdfRenderingInProgress = true;

    try {
      const page = await window._pdfDocument.getPage(pageNum);

      // container (where the canvas is laid out)
      const container = canvas.parentElement || viewer;

      // compute available width in CSS pixels (account for container padding)
      const computed = getComputedStyle(container);
      const padLeft = parseFloat(computed.paddingLeft || 0);
      const padRight = parseFloat(computed.paddingRight || 0);
      const availW = Math.max(200, container.clientWidth - padLeft - padRight);

      // runtime options:
      const BOOST = (typeof window.PDF_RENDER_SCALE_BOOST === 'number') ? window.PDF_RENDER_SCALE_BOOST : 1.0;
      const MAX_SCALE = (typeof window.PDF_RENDER_MAX_SCALE === 'number') ? window.PDF_RENDER_MAX_SCALE : 3.0;

      // compute scale based on width only (fit-to-width)
      const baseViewport = page.getViewport({ scale: 1 });
      let scale = (availW / baseViewport.width) * BOOST;
      if (scale > MAX_SCALE) scale = MAX_SCALE;

      const viewport = page.getViewport({ scale });

      // DPR/backing store
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // CSS size: ensure canvas occupies the computed width in CSS px
      canvas.style.setProperty('width', `${Math.floor(viewport.width)}px`, 'important');
      canvas.style.setProperty('height', 'auto', 'important');
      canvas.style.setProperty('display', 'block', 'important');

      // draw
      const ctx = canvas.getContext('2d');
      // reset transforms then scale for DPR
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (dpr !== 1) ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      // update UI
      window._pdfCurrentPage = pageNum;
      updatePdfPageControls();

      // --- scroll/header compensation (spacer + align-items fix) ---
      try {
        const margin = (typeof window.PDF_SCROLL_MARGIN_TOP === 'number') ? window.PDF_SCROLL_MARGIN_TOP : DEFAULT_SCROLL_MARGIN_TOP;

        // find scrollable (prefer descendant inside .preview-viewer)
        const viewerRoot = document.querySelector('.preview-viewer') || document.getElementById('preview-viewer');
        let scrollable = viewerRoot ? findDescendantScrollable(viewerRoot) : null;
        if (!scrollable) scrollable = findScrollableAncestor(container) || container;

        // compute header height
        let headerHeight = 0;
        const modal = document.querySelector('.preview-modal') || document.getElementById('preview-modal');
        if (modal) {
          const varVal = getComputedStyle(modal).getPropertyValue('--preview-header-height');
          if (varVal) headerHeight = parseInt(varVal, 10) || 0;
          else {
            const headerEl = modal.querySelector('.preview-header');
            if (headerEl) headerHeight = Math.ceil(headerEl.getBoundingClientRect().height || 0);
          }
        }

        // ensure we anchor children at top to avoid vertical-centering that makes top unreachable
        try {
          if (scrollable) scrollable.style.setProperty('align-items', 'flex-start', 'important');
        } catch (e) { /* ignore */ }

        // ensure spacer element exists and has correct height (headerHeight + margin)
        try {
          if (scrollable) {
            // remove any inline padding-top leftover
            try { scrollable.style.removeProperty('padding-top'); } catch(e){}

            let spacer = scrollable.querySelector('.preview-scroll-spacer');
            const pad = headerHeight + Math.max(0, margin || 0);
            if (!spacer) {
              spacer = document.createElement('div');
              spacer.className = 'preview-scroll-spacer';
              spacer.style.setProperty('width', '1px');
              spacer.style.setProperty('flex', '0 0 auto');
              scrollable.insertBefore(spacer, scrollable.firstChild);
            }
            spacer.style.setProperty('height', `${pad}px`);
            spacer.style.setProperty('min-height', `${pad}px`);
          }
        } catch (e) { /* ignore spacer errors */ }

        // compute canvas offset relative to scrollable
        let offset = 0;
        let el = canvas;
        while (el && el !== scrollable && el.offsetParent) {
          offset += el.offsetTop;
          el = el.offsetParent;
        }
        if (el !== scrollable) {
          const sRect = scrollable.getBoundingClientRect();
          const eRect = canvas.getBoundingClientRect();
          offset = (eRect.top - sRect.top) + (scrollable.scrollTop || 0);
        }

        let desired = Math.round(offset - headerHeight - Math.max(0, margin));
        if (desired < 0) desired = 0;
        const maxScrollTop = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight);
        if (desired > maxScrollTop) desired = maxScrollTop;

        setTimeout(() => {
          try { scrollable.scrollTop = desired; } catch (e) { /* ignore */ }
        }, 40);
      } catch (e) {
        try { canvas.scrollIntoView({ block: 'center' }); } catch (err) { }
      }

    } catch (err) {
      console.error('renderPdfPage error', err);
    } finally {
      window._pdfRenderingInProgress = false;
    }
  }

  function updatePdfPageControls() {
    const indicator = document.getElementById('pdf-page-indicator');
    if (indicator) indicator.textContent = `${window._pdfCurrentPage} / ${window._pdfTotalPages || 1}`;

    const prevBtn = document.getElementById('pdf-page-prev');
    const nextBtn = document.getElementById('pdf-page-next');
    if (prevBtn) prevBtn.disabled = window._pdfCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = window._pdfCurrentPage >= (window._pdfTotalPages || 1);
  }

  // Public API to go to next/prev page
  window.pdfNavigatePage = function (delta) {
    if (!window._pdfDocument) return;
    const newPage = Math.min(Math.max(1, window._pdfCurrentPage + delta), window._pdfTotalPages || 1);
    if (newPage === window._pdfCurrentPage) return;
    renderPdfPage(newPage);
  };

  // Replace / augment loadPreviewContent for PDF rendering only
  // This function will be called by your existing showPreviewModal after modal is created
  window.loadPreviewContent = async function (docData) {
    const viewer = document.getElementById('preview-viewer');
    if (!viewer) {
      console.error('Preview viewer not found');
      return;
    }

    const mimeType = (docData.mime_type || '').toLowerCase();

    // --- PDF handling ---
    if (mimeType.includes('pdf')) {
      // set up viewer HTML with canvas + page controls
      viewer.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center;">
            <div style="display:flex;gap:6px;align-items:center;">
              <button id="pdf-page-prev" class="preview-btn" title="Page précédente">◀</button>
              <span id="pdf-page-indicator" style="color:#fff;font-weight:600">1 / 1</span>
              <button id="pdf-page-next" class="preview-btn" title="Page suivante">▶</button>
            </div>
          </div>

          <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:8px;background: #f5f5f5; border-radius:8px;">
            <canvas id="pdf-canvas" style="max-width:100%;height:auto;display:block;border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.3);"></canvas>
          </div>
        </div>
      `;

      // Move controls + indicator into header .preview-actions (create if missing)
      try {
        const modal = document.querySelector('.preview-modal') || document.getElementById('preview-modal');
        const viewerEl = document.getElementById('preview-viewer');
        if (modal && viewerEl) {
          let actionsEl = modal.querySelector('.preview-actions');
          if (!actionsEl) {
            const header = modal.querySelector('.preview-header');
            if (header) {
              actionsEl = document.createElement('div');
              actionsEl.className = 'preview-actions';
              header.appendChild(actionsEl);
            }
          }

          const prevBtn = viewerEl.querySelector('#pdf-page-prev') || document.getElementById('pdf-page-prev');
          const nextBtn = viewerEl.querySelector('#pdf-page-next') || document.getElementById('pdf-page-next');
          let indicator = viewerEl.querySelector('#pdf-page-indicator') || document.getElementById('pdf-page-indicator');

          if (!indicator && actionsEl) {
            indicator = document.createElement('span');
            indicator.id = 'pdf-page-indicator';
            indicator.textContent = `${window._pdfCurrentPage || 1} / ${window._pdfTotalPages || 1}`;
            actionsEl.appendChild(indicator);
          }

          if (actionsEl) {
            if (prevBtn && !actionsEl.contains(prevBtn)) actionsEl.appendChild(prevBtn);
            if (indicator && !actionsEl.contains(indicator)) actionsEl.appendChild(indicator);
            if (nextBtn && !actionsEl.contains(nextBtn)) actionsEl.appendChild(nextBtn);

            if (indicator) {
              indicator.style.setProperty('font-size', '0.95rem', 'important');
              indicator.style.setProperty('margin', '0 8px', 'important');
              indicator.style.setProperty('font-weight', '600', 'important');
              indicator.style.setProperty('color', 'inherit', 'important');
            }
            [prevBtn, nextBtn].forEach(b => {
              if (!b) return;
              b.style.setProperty('display', 'inline-flex', 'important');
              b.style.setProperty('margin-left', '6px', 'important');
              b.style.setProperty('vertical-align', 'middle', 'important');
            });
          }
        }
      } catch (e) {
        console.warn('Preview: déplacement contrôles/indicateur vers header échoué', e);
      }

      // --- Spacer + align-items fix: ensure we can scroll to top and header doesn't overlap content ---
      try {
        const modal = document.querySelector('.preview-modal') || document.getElementById('preview-modal');
        const viewerScrollable = findDescendantScrollable(viewer) || viewer;

        // ensure vertical anchoring to top when content overflows
        try {
          if (viewerScrollable) {
            // if content taller than container, anchor to top to prevent centering that produces negative top
            if (viewerScrollable.scrollHeight > viewerScrollable.clientHeight) {
              viewerScrollable.style.setProperty('align-items', 'flex-start', 'important');
            } else {
              // remove inline align-items if unnecessary
              try { viewerScrollable.style.removeProperty('align-items'); } catch (e) {}
            }
          }
        } catch (e) { /* ignore */ }

        // create/update spacer element
        const ensureSpacer = (pad) => {
          if (!viewerScrollable) return;
          let spacer = viewerScrollable.querySelector('.preview-scroll-spacer');
          if (!spacer) {
            spacer = document.createElement('div');
            spacer.className = 'preview-scroll-spacer';
            spacer.style.setProperty('width', '1px');
            spacer.style.setProperty('flex', '0 0 auto');
            viewerScrollable.insertBefore(spacer, viewerScrollable.firstChild);
          }
          spacer.style.setProperty('height', `${pad}px`);
          spacer.style.setProperty('min-height', `${pad}px`);
        };

        const applyHeaderSpacer = (margin = (typeof window.PDF_SCROLL_MARGIN_TOP === 'number' ? window.PDF_SCROLL_MARGIN_TOP : DEFAULT_SCROLL_MARGIN_TOP)) => {
          if (!viewerScrollable) return;
          // measure header height
          let headerHeight = 0;
          if (modal) {
            const varVal = getComputedStyle(modal).getPropertyValue('--preview-header-height');
            if (varVal) headerHeight = parseInt(varVal, 10) || 0;
            else {
              const hEl = modal.querySelector('.preview-header');
              if (hEl) headerHeight = Math.ceil(hEl.getBoundingClientRect().height || 0);
            }
          }
          const pad = headerHeight + Math.max(0, margin || 0);

          // remove old padding if any (we use spacer instead)
          try { viewerScrollable.style.removeProperty('padding-top'); } catch (e) {}

          ensureSpacer(pad);

          try {
            viewerScrollable.style.setProperty('overflow-y', 'auto', 'important');
            viewerScrollable.style.setProperty('box-sizing', 'border-box', 'important');
          } catch (e) {}
        };

        // apply now
        applyHeaderSpacer();

        // observe header size changes to keep spacer in sync
        try {
          const headerEl = modal && modal.querySelector('.preview-header');
          if (headerEl && !modal.__previewHeaderRO_for_spacer) {
            modal.__previewHeaderRO_for_spacer = new ResizeObserver(() => applyHeaderSpacer());
            modal.__previewHeaderRO_for_spacer.observe(headerEl);
          }
        } catch (e) { /* ignore if unsupported */ }
      } catch (e) {
        console.warn('Preview: cannot create header spacer', e);
      }

      // attach buttons (idempotent)
      const prevBtn = document.getElementById('pdf-page-prev');
      const nextBtn = document.getElementById('pdf-page-next');

      if (prevBtn) {
        prevBtn.onclick = (e) => {
          e.preventDefault();
          window.pdfNavigatePage(-1);
        };
      }

      if (nextBtn) {
        nextBtn.onclick = (e) => {
          e.preventDefault();
          window.pdfNavigatePage(1);
        };
      }

      // load pdf via pdf.js
      try {
        const url = `/api/documents/${docData.id}/download`;
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        window._pdfDocument = pdf;
        window._pdfTotalPages = pdf.numPages || 1;
        window._pdfCurrentPage = 1;

        // render the first page
        await renderPdfPage(1);
      } catch (err) {
        console.error('Error loading PDF', err);
        viewer.innerHTML = `
          <div style="padding:2rem;text-align:center;color:#333;">
            <p>Erreur lors du chargement du PDF.</p>
            <p style="font-size:0.9rem;color:#666;">${err && err.message ? err.message : ''}</p>
            <button class="preview-btn" onclick="window.downloadDocument(${docData.id})">Télécharger</button>
          </div>
        `;
      }

      return;
    }

    // --- Non-PDF: keep existing behavior ---

    // Images
    else if (mimeType.includes('image')) {
      viewer.innerHTML = `
        <img src="/api/documents/${docData.id}/download" alt="${docData.title}"
             style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
      `;
      return;
    }

    // Text
    else if (mimeType.includes('text')) {
      try {
        const res = await fetch(`/api/documents/${docData.id}/download`);
        const text = await res.text();
        viewer.innerHTML = `
          <div style="background:white;padding:2rem;border-radius:8px;max-width:900px;overflow:auto;">
            <pre style="white-space:pre-wrap;word-wrap:break-word;color:#333;">${(text && typeof text === 'string') ? escapeHtml(text) : ''}</pre>
          </div>
        `;
      } catch (err) {
        console.error('Erreur texte:', err);
        viewer.innerHTML = `<div style="padding:2rem;color:white">Impossible de charger le texte</div>`;
      }
      return;
    }

    // Office / unsupported
    else {
      viewer.innerHTML = `
        <div class="preview-unsupported">
          <div class="preview-unsupported-icon">📄</div>
          <div>
            <div class="preview-unsupported-text">Prévisualisation non disponible</div>
            <div class="preview-unsupported-subtext">Type: ${mimeType || 'Inconnu'}</div>
          </div>
          <button class="preview-btn" onclick="window.downloadDocument(${docData.id})" style="margin-top:1rem;">📥 Télécharger</button>
        </div>
      `;
      return;
    }
  };

  // cleanup when modal closed
  const origClose = window.closePreviewModal;
  window.closePreviewModal = function () {
    // reset pdf globals
    window._pdfDocument = null;
    window._pdfCurrentPage = 1;
    window._pdfTotalPages = 0;

    // cleanup header observer and spacer we may have applied
    try {
      const modal = document.getElementById('preview-modal') || document.querySelector('.preview-modal');
      if (modal) {
        if (modal.__previewHeaderRO_for_spacer) {
          try { modal.__previewHeaderRO_for_spacer.disconnect(); } catch (e) {}
          modal.__previewHeaderRO_for_spacer = null;
        }
        const viewerScrollable = (modal.querySelector('.preview-viewer') ? findDescendantScrollable(modal.querySelector('.preview-viewer')) : null) ||
                                 (modal.querySelector('.preview-viewer') || null);
        if (viewerScrollable && viewerScrollable.style) {
          // remove spacer element if present
          const spacer = viewerScrollable.querySelector('.preview-scroll-spacer');
          if (spacer) try { spacer.remove(); } catch (e) {}
          try { viewerScrollable.style.removeProperty('padding-top'); } catch(e){}
          try { viewerScrollable.style.removeProperty('align-items'); } catch(e){}
        }
      }
    } catch (e) { /* ignore */ }

    // call original if exists
    if (typeof origClose === 'function') origClose();
    else {
      const modal = document.getElementById('preview-modal');
      if (modal) modal.remove();
    }
  };

  // helper escape
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // runtime helpers for quick testing
  window.setPdfPreviewMargin = (px) => { window.PDF_SCROLL_MARGIN_TOP = Number(px) || 0; console.log('PDF_SCROLL_MARGIN_TOP =', window.PDF_SCROLL_MARGIN_TOP); };
  window.adjustPdfPreviewTopMargin = (value) => {
    // value: number (px) or string 'vh:0.25'
    try {
      const modal = document.querySelector('.preview-modal') || document.getElementById('preview-modal');
      const viewer = document.getElementById('preview-viewer');
      const canvas = document.getElementById('pdf-canvas');
      if (!modal || !viewer || !canvas) return console.warn('preview-modal / viewer / canvas introuvable');

      const viewerScrollable = findDescendantScrollable(viewer) || viewer;

      let headerH = 0;
      const varVal = modal && getComputedStyle(modal).getPropertyValue('--preview-header-height');
      if (varVal) headerH = parseInt(varVal, 10) || 0;
      else {
        const hEl = modal.querySelector('.preview-header');
        if (hEl) headerH = Math.ceil(hEl.getBoundingClientRect().height || 0);
      }

      let marginPx = 0;
      if (typeof value === 'string' && value.startsWith('vh:')) {
        const frac = parseFloat(value.split(':')[1]) || 0;
        marginPx = Math.round(window.innerHeight * Math.max(0, Math.min(1, frac)));
      } else {
        marginPx = Number(value) || 0;
      }

      const pad = headerH + Math.max(0, marginPx);
      // remove padding-top and use spacer to preserve ability to scroll to top
      try { viewerScrollable.style.removeProperty('padding-top'); } catch (e) {}
      let spacer = viewerScrollable.querySelector('.preview-scroll-spacer');
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.className = 'preview-scroll-spacer';
        spacer.style.setProperty('width', '1px');
        spacer.style.setProperty('flex', '0 0 auto');
        viewerScrollable.insertBefore(spacer, viewerScrollable.firstChild);
      }
      spacer.style.setProperty('height', `${pad}px`);
      spacer.style.setProperty('min-height', `${pad}px`);
      try {
        viewerScrollable.style.setProperty('overflow-y', 'auto', 'important');
        viewerScrollable.style.setProperty('box-sizing', 'border-box', 'important');
      } catch (e) {}
      // reposition to show top of canvas under header
      let offset = 0;
      let el = canvas;
      while (el && el !== viewerScrollable && el.offsetParent) {
        offset += el.offsetTop;
        el = el.offsetParent;
      }
      if (el !== viewerScrollable) {
        const sRect = viewerScrollable.getBoundingClientRect();
        const eRect = canvas.getBoundingClientRect();
        offset = (eRect.top - sRect.top) + (viewerScrollable.scrollTop || 0);
      }
      const desired = Math.max(0, Math.round(offset - headerH - Math.max(0, marginPx)));
      const maxScrollTop = Math.max(0, viewerScrollable.scrollHeight - viewerScrollable.clientHeight);
      const applied = Math.min(Math.max(0, desired), maxScrollTop);
      try { viewerScrollable.scrollTop = applied; } catch (e) {}
      console.log('adjustPdfPreviewTopMargin applied', { headerH, marginPx, pad, desired, applied, maxScrollTop });
    } catch (err) {
      console.warn('adjustPdfPreviewTopMargin error', err);
    }
  };

  console.log('preview-pdf.js loaded: PDF page navigation enabled with header-aware spacer handling.');
})();