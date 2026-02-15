// preview-pdf.js
// Amélioration du rendu PDF : affiche toutes les pages, ajoute controls prev/next page
// Doit être chargé après pdf.js (pdfjsLib déjà disponible) et après les définitions de preview modal.

(function () {
  // Globals for PDF rendering
  window._pdfDocument = null;
  window._pdfCurrentPage = 1;
  window._pdfTotalPages = 0;
  window._pdfRenderingInProgress = false;

  // Ensure workerSrc (avoid pdf.js warning)
  if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // Render a specific page number into the canvas
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
      // compute scale to fit container width
      const container = canvas.parentElement;
      const containerWidth = Math.max(300, container.clientWidth - 32); // padding safe
      const viewport = page.getViewport({ scale: 1 });
      const scale = (containerWidth / viewport.width) * 1.2; // slight upscale for readability
      const scaledViewport = page.getViewport({ scale });

      canvas.width = Math.floor(scaledViewport.width);
      canvas.height = Math.floor(scaledViewport.height);

      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport
      };

      await page.render(renderContext).promise;

      // update UI page indicator and buttons
      window._pdfCurrentPage = pageNum;
      updatePdfPageControls();
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

  console.log('preview-pdf.js loaded: PDF page navigation enabled.');
})();