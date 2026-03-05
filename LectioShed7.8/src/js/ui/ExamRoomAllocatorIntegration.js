/**
 * Intégration tolérante entre les boutons "gérer répartition" et le composant ExamRoomAllocator.
 * - Détection déléguée améliorée : recherche éléments avec
 *   .exam-room-alloc-btn, [data-action="manage-alloc"], title contenant "gérer", ou texte contenant "⚙".
 * - Tente de récupérer l'ID d'examen depuis : data-exam-id, data-id, dataset.examId, ou attribut du parent.
 *
 * Robustifications ajoutées :
 * - Appelle ExamRoomAllocator.init() si disponible lors de l'initialisation.
 * - Logs plus verbeux pour faciliter le debugging.
 * - Tentatives de fallback si openAllocatorModal n'est pas disponible sur l'import :
 *   - essaie window.EDTExamRoomAllocator.openAllocatorModal
 *   - sinon affiche un message d'erreur utile.
 */

import ExamRoomAllocator from './ExamRoomAllocator.js';

const ExamRoomAllocatorIntegration = {
  _inited: false,

  init(containerId = 'examsListContainer') {
    if (this._inited) return;
    this._inited = true;

    try {
      const container = document.getElementById(containerId);
      if (!container) {
        console.warn(`ExamRoomAllocatorIntegration: container #${containerId} introuvable`);
        return;
      }

      // Ensure allocator is initialized if the module exposes init()
      try {
        if (ExamRoomAllocator && typeof ExamRoomAllocator.init === 'function') {
          ExamRoomAllocator.init();
          console.debug('ExamRoomAllocator.init() called by Integration');
        }
        // also expose for debug if not present
        try { if (typeof window !== 'undefined' && !window.EDTExamRoomAllocator) window.EDTExamRoomAllocator = ExamRoomAllocator; } catch (e) { /* noop */ }
      } catch (e) {
        console.debug('ExamRoomAllocatorIntegration: failed to init allocator', e);
      }

      // Delegated handler
      container.addEventListener('click', (ev) => {
        try {
          // 1) Try explicit selector match (fast path)
          let btn = ev.target.closest && ev.target.closest('.exam-room-alloc-btn, [data-action="manage-alloc"], [data-action="exam-alloc"]');

          // 2) If not found, try other heuristics: button with title/text "gérer" or containing gear char
          if (!btn) {
            const candidate = ev.target.closest && ev.target.closest('button, a, span');
            if (candidate) {
              const title = (candidate.getAttribute && candidate.getAttribute('title') || '') .toString().toLowerCase();
              const txt = (candidate.textContent || '').toString();
              if (title.includes('gérer') || txt.includes('⚙') || txt.toLowerCase().includes('gérer') || txt.includes('gear') || candidate.className.includes('gear')) {
                btn = candidate;
              }
            }
          }

          if (!btn) return;

          ev.preventDefault();

          // 3) Extract exam id from many possible locations
          let examId = null;
          try {
            examId = (btn.getAttribute && (btn.getAttribute('data-exam-id') || btn.getAttribute('data-id'))) ||
                     (btn.dataset && (btn.dataset.examId || btn.dataset.id)) || null;
          } catch (e) { examId = null; }

          if (!examId) {
            const parentWithId = btn.closest && btn.closest('[data-exam-id], [data-id]');
            if (parentWithId) {
              examId = parentWithId.getAttribute('data-exam-id') || parentWithId.getAttribute('data-id') || (parentWithId.dataset && parentWithId.dataset.examId) || null;
            }
          }

          // hidden input fallback
          if (!examId) {
            try {
              const item = btn.closest && btn.closest('.exam-item') || btn.closest && btn.closest('[data-exam-item]');
              const hidden = item && (item.querySelector && (item.querySelector('input[type="hidden"][data-exam-id]') || item.querySelector('input[type="hidden"].exam-id')));
              if (hidden) examId = hidden.dataset && hidden.dataset.examId || hidden.getAttribute('data-exam-id') || hidden.value || null;
            } catch (e) { /* noop */ }
          }

          if (!examId) {
            console.warn('ExamRoomAllocatorIntegration: exam id introuvable pour bouton, opening allocator without pre-select');
            // open without preselect
            try {
              if (ExamRoomAllocator && typeof ExamRoomAllocator.openAllocatorModal === 'function') {
                ExamRoomAllocator.openAllocatorModal();
              } else if (typeof window !== 'undefined' && window.EDTExamRoomAllocator && typeof window.EDTExamRoomAllocator.openAllocatorModal === 'function') {
                window.EDTExamRoomAllocator.openAllocatorModal();
              } else {
                console.error('ExamRoomAllocatorIntegration: no allocator available to open modal');
              }
            } catch (e) {
              console.warn(e);
            }
            return;
          }

          console.debug('ExamRoomAllocatorIntegration: launching allocator for examId=', examId);

          // call allocator (robustness: several fallbacks)
          try {
            if (ExamRoomAllocator && typeof ExamRoomAllocator.openAllocatorModal === 'function') {
              ExamRoomAllocator.openAllocatorModal(examId);
            } else if (typeof window !== 'undefined' && window.EDTExamRoomAllocator && typeof window.EDTExamRoomAllocator.openAllocatorModal === 'function') {
              window.EDTExamRoomAllocator.openAllocatorModal(examId);
            } else {
              // last resort: try to dispatch an event that someone else listens to
              const evOpen = new CustomEvent('open:exam-room-allocator', { detail: { examId } });
              document.dispatchEvent(evOpen);
              console.warn('ExamRoomAllocatorIntegration: allocator open method not found, dispatched event open:exam-room-allocator');
            }
          } catch (err) {
            console.error('ExamRoomAllocatorIntegration: openAllocatorModal failed', err);
          }
        } catch (err) {
          console.debug('ExamRoomAllocatorIntegration click handler error', err);
        }
      });

      console.debug('ExamRoomAllocatorIntegration initialized on #' + containerId);
    } catch (e) {
      console.warn('ExamRoomAllocatorIntegration.init failed', e);
    }
  }
};

export default ExamRoomAllocatorIntegration;