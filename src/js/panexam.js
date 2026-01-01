// panexam.js — gestion robuste des sous‑onglets Examens
import ExamTimetable from '/src/js/ui/ExamTimetable.js';
import ExportService from '/src/js/services/ExportService.js';

document.addEventListener('DOMContentLoaded', () => {
  console.debug('[panexam.js] DOM loaded');

  const examTabContainer = document.getElementById('tab-examens') ||
    document.querySelector('[data-tab="examens"]') ||
    document.querySelector('#tab-examens') ||
    null;

  function findSubTabButtons() {
    if (examTabContainer) {
      const inside = examTabContainer.querySelectorAll('.sub-tab-btn');
      if (inside && inside.length) return Array.from(inside);
    }
    const globalBtns = document.querySelectorAll('.sub-tab-btn[data-subtab], [data-subtab].sub-tab-btn, [data-subtab]');
    return Array.from(globalBtns || []);
  }

  function findSubTabPanes() {
    if (examTabContainer) {
      const panes = examTabContainer.querySelectorAll('.sub-tab-pane');
      if (panes && panes.length) return Array.from(panes);
    }
    const panesGlobal = document.querySelectorAll('#tab-examens .sub-tab-pane, .sub-tab-pane[data-subtab-id], [data-subtab-pane]');
    return Array.from(panesGlobal || []);
  }

  function activateExamSubtab(targetId) {
    const btns = findSubTabButtons();
    const panes = findSubTabPanes();

    btns.forEach(btn => {
      try {
        const id = btn.getAttribute('data-subtab') || btn.dataset?.subtab || btn.getAttribute('data-target');
        if (!id) return;
        if (id === targetId) btn.classList.add('active');
        else btn.classList.remove('active');
      } catch (e) { /* noop */ }
    });

    if (panes && panes.length) {
      panes.forEach(p => {
        const pid = p.id || p.getAttribute('data-subtab-id') || p.dataset?.subtabId || p.getAttribute('data-subtab');
        if (!pid) {
          p.style.display = (targetId === '') ? '' : 'none';
          return;
        }
        if (pid === targetId) {
          p.style.display = '';
          p.classList.add('active');
          if (pid.includes('timetable') || pid.toLowerCase().includes('timetable') || pid.toLowerCase().includes('emploi')) {
            try {
              ExamTimetable.init('examTimetableContainer');
              ExamTimetable.render();
            } catch (err) {
              console.warn('[panexam.js] ExamTimetable render error', err);
            }
            attachExportPDFListener();
          }
        } else {
          p.style.display = 'none';
          p.classList.remove('active');
        }
      });
    }
    document.dispatchEvent(new CustomEvent('panexam:subtab-changed', { detail: { subtab: targetId } }));
  }

  function attachSubTabHandlers() {
    const btns = findSubTabButtons();
    if (!btns || btns.length === 0) {
      console.debug('[panexam.js] Aucun bouton de sous-onglet trouvé pour Examens');
      return false;
    }
    btns.forEach(btn => {
      if (btn._panexamHandlerAttached) return;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const target = btn.getAttribute('data-subtab') || btn.dataset?.subtab || btn.getAttribute('data-target') || '';
        if (!target) {
          console.warn('[panexam.js] bouton subtab sans data-subtab', btn);
          return;
        }
        activateExamSubtab(target);
      });
      btn._panexamHandlerAttached = true;
    });
    return true;
  }

  function attachExportPDFListener() {
    try {
      if (window._panexam_pdf_delegated_handler && typeof window._panexam_pdf_delegated_handler === 'function') {
        try { document.body.removeEventListener('click', window._panexam_pdf_delegated_handler, true); } catch (e) { }
        delete window._panexam_pdf_delegated_handler;
        window._panexam_pdf_delegated = false;
        console.debug('[panexam.js] removed previous delegated PDF handler (if any)');
      }
    } catch (e) { /* noop */ }

    const invokeExportEDT = async (view) => {
      console.debug('[panexam.js] invokeExportEDT view=', view);
      try {
        // Prefer explicit API for EDT view
        if (typeof ExportService !== 'undefined' && ExportService) {
          if (typeof ExportService.exportEDTView === 'function') { await ExportService.exportEDTView(view); return; }
          if (typeof ExportService.exportEDT === 'function') { await ExportService.exportEDT(view); return; }
        }
        if (window.ExportService) {
          if (typeof window.ExportService.exportEDTView === 'function') { await window.ExportService.exportEDTView(view); return; }
          if (typeof window.ExportService.exportEDT === 'function') { await window.ExportService.exportEDT(view); return; }
        }
        // dynamic import fallback
        try {
          const mod = await import('/src/js/services/ExportService.js');
          const S = mod && (mod.default || mod);
          if (S && typeof S.exportEDTView === 'function') { await S.exportEDTView(view); return; }
          if (S && typeof S.exportEDT === 'function') { await S.exportEDT(view); return; }
        } catch (impErr) { console.warn('[panexam.js] dynamic import (exportEDTView) failed', impErr); }

        // fallback event for other modules
        try {
          window.dispatchEvent(new CustomEvent('panexam:export-edt-requested', { detail: { view }, bubbles: true }));
          return;
        } catch (evErr) { /* noop */ }

        alert('Aucun ExportService disponible pour exporter la vue EDT.');
      } catch (err) {
        console.error('[panexam.js] invokeExportEDT error', err);
        alert('Erreur lors de l\'export EDT : ' + (err && err.message));
      }
    };

    const invokeExportExamTimetable = async () => {
      console.debug('[panexam.js] invokeExportExamTimetable');
      try {
        if (typeof ExportService !== 'undefined' && ExportService && typeof ExportService.exportExamTimetableStructuredPDF === 'function') {
          await ExportService.exportExamTimetableStructuredPDF();
          return;
        }
        if (window.ExportService && typeof window.ExportService.exportExamTimetableStructuredPDF === 'function') {
          await window.ExportService.exportExamTimetableStructuredPDF();
          return;
        }
        try {
          const mod = await import('/src/js/services/ExportService.js');
          const S = mod && (mod.default || mod);
          if (S && typeof S.exportExamTimetableStructuredPDF === 'function') {
            await S.exportExamTimetableStructuredPDF();
            return;
          }
        } catch (impErr) { console.warn('[panexam.js] dynamic import (exam export) failed', impErr); }
        alert('Export examens non disponible.');
      } catch (err) {
        console.error('[panexam.js] invokeExportExamTimetable error', err);
        alert('Erreur lors de l\'export des examens : ' + (err && err.message));
      }
    };

    // Attach handler for EDT view export button (compat: btnExportEDTView -> btnExportPDF)
    try {
      const edtBtn = document.getElementById('btnExportEDTView') || document.getElementById('btnExportPDF');
      if (edtBtn) {
        if (!edtBtn._edtExportAttached) {
          edtBtn.addEventListener('click', async (e) => {
            // prevent delegated handlers from running
            try { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); } catch (e) { }
            try { if (typeof e.stopPropagation === 'function') e.stopPropagation(); } catch (e) { }
            try { if (typeof e.preventDefault === 'function') e.preventDefault(); } catch (e) { }

            try {
              const sel = document.getElementById('selectEDTView');
              const view = sel ? (sel.value || (sel.options && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].value)) : undefined;
              await invokeExportEDT(view);
            } catch (err) {
              console.error('[panexam.js] edtBtn handler error', err);
              await invokeExportEDT();
            }
          }, { passive: false });
          edtBtn._edtExportAttached = true;
          console.debug('[panexam.js] EDT export handler attached to', edtBtn.id || 'unknown');
        }
      } else {
        console.debug('[panexam.js] EDT export button not found (attach deferred)');
      }
    } catch (err) { console.warn('[panexam.js] attach edt export error', err); }

    // Attach robust handlers for exam timetable export buttons.
    // This will:
    //  - find buttons by id / data-action
    //  - also search inside the exam tab and timetable container for buttons whose text matches "export" + "exam/examen/EDT"
    //  - attach handlers to all matching elements (handles duplicates / clones)
    //  - observe examTabContainer for dynamically added buttons and attach on the fly
    (function attachExamExportHandlers() {
      const examTextRegex = /export(er|ation)?\b.*(exam|examen|edt)|\b(exam|examen).*\b(pdf|export)/i;

      function candidatesFromDOM() {
        const found = new Set();
        try {
          // explicit selectors first
          const sel = '#btnExportExamTimetablePDF, [data-action="export-exam-timetable-pdf"], [data-action="export-exam-pdf"], [data-action^="export-exam"]';
          Array.from(document.querySelectorAll(sel)).forEach(el => found.add(el));

          // search inside the exam tab container and the timetable container for textual matches
          const containers = [];
          if (examTabContainer) containers.push(examTabContainer);
          const timetableContainer = document.getElementById('examTimetableContainer');
          if (timetableContainer) containers.push(timetableContainer);
          // global fallback: document
          containers.push(document);

          containers.forEach(c => {
            try {
              Array.from(c.querySelectorAll('button, a[role="button"], [role="button"]')).forEach(b => {
                try {
                  if (found.has(b)) return;
                  const txt = (b.textContent || b.innerText || '').trim();
                  if (!txt) return;
                  if (examTextRegex.test(txt)) found.add(b);
                } catch (e) { /* noop per-button */ }
              });
            } catch (e) { /* noop per-container */ }
          });
        } catch (e) {
          console.warn('[panexam.js] candidatesFromDOM failed', e);
        }
        return Array.from(found);
      }

      function attachToElement(btn) {
        if (!btn || btn._examExportAttached) return;
        try {
          btn.addEventListener('click', async function examExportHandler(e) {
            // Ensure this handler runs exclusively for this click
            try { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); } catch (_) {}
            try { if (typeof e.stopPropagation === 'function') e.stopPropagation(); } catch (_) {}
            try { if (typeof e.preventDefault === 'function') e.preventDefault(); } catch (_) {}

            console.debug('[panexam.js] exam export button clicked ->', btn, 'text=', (btn.textContent||'').trim());
            try {
              await invokeExportExamTimetable();
            } catch (err) {
              console.error('[panexam.js] examExportHandler inner error', err);
            }
          }, { passive: false });
          btn._examExportAttached = true;
          console.debug('[panexam.js] attached exam export handler to', btn);
        } catch (e) {
          console.warn('[panexam.js] failed to attach exam export handler to', btn, e);
        }
      }

      // initial attach
      try {
        const list = candidatesFromDOM();
        if (list.length) {
          list.forEach(attachToElement);
        } else {
          console.debug('[panexam.js] no exam export candidates found on initial scan');
        }
      } catch (e) { console.warn('[panexam.js] initial attachExamExportHandlers scan failed', e); }

      // observe examTabContainer (or document.body) for future additions
      try {
        const observeTarget = examTabContainer || document.body;
        const mo = new MutationObserver(muts => {
          try {
            muts.forEach(m => {
              if (!m.addedNodes || m.addedNodes.length === 0) return;
              // check added nodes and their descendants for candidate buttons
              const added = [];
              m.addedNodes.forEach(n => {
                try {
                  if (!(n instanceof Element)) return;
                  // if the node itself matches textual criteria or selectors
                  const nodeList = [];
                  if (n.matches && n.matches('#btnExportExamTimetablePDF, [data-action^="export-exam"], button, a[role="button"], [role="button"]')) {
                    nodeList.push(n);
                  }
                  nodeList.push(...Array.from(n.querySelectorAll('button, a[role="button"], [role="button"], [data-action^="export-exam"]')));
                  nodeList.forEach(el => {
                    try {
                      const txt = (el.textContent || el.innerText || '').trim();
                      if (txt && examTextRegex.test(txt)) added.push(el);
                      else if (el.id === 'btnExportExamTimetablePDF' || el.dataset && (el.dataset.action && /export-exam/i.test(el.dataset.action))) added.push(el);
                    } catch (inner) {}
                  });
                } catch (_) {}
              });
              if (added.length) {
                // attach to unique ones
                Array.from(new Set(added)).forEach(attachToElement);
              }
            });
          } catch (obsErr) { /* noop */ }
        });
        mo.observe(observeTarget, { childList: true, subtree: true });
        // store observer to potentially disconnect later if needed
        try { window._panexam_exam_export_observer = mo; } catch (_) {}
      } catch (e) {
        console.warn('[panexam.js] MutationObserver for exam export buttons failed', e);
      }
    })();
  }

  const tried = { attached: false };
  function ensureHandlers() {
    const ok = attachSubTabHandlers();
    if (ok) tried.attached = true;
  }

  let observer = null;
  try {
    observer = new MutationObserver((mutations) => {
      const found = findSubTabButtons();
      if (found && found.length && !tried.attached) {
        ensureHandlers();
      }
      attachExportPDFListener();
    });
    const observeTarget = examTabContainer || document.body;
    observer.observe(observeTarget, { childList: true, subtree: true });
  } catch (e) {
    console.warn('[panexam.js] MutationObserver non disponible', e);
  }

  ensureHandlers();

  const initialBtns = findSubTabButtons();
  let defaultTarget = '';
  if (initialBtns && initialBtns.length) {
    defaultTarget = initialBtns[0].getAttribute('data-subtab') || initialBtns[0].dataset?.subtab || '';
  } else {
    const panes = findSubTabPanes();
    if (panes && panes.length) defaultTarget = panes[0].id || panes[0].getAttribute('data-subtab-id') || '';
  }
  setTimeout(() => {
    if (defaultTarget) activateExamSubtab(defaultTarget);
    attachExportPDFListener();
  }, 80);

  window._panexam = {
    activateSubtab: activateExamSubtab,
    attachHandlers: ensureHandlers,
    attachExportPDF: attachExportPDFListener
  };
});
