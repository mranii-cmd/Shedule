/**
 * EventHandlers (stabilized)
 *
 * Corrections apportées :
 * - Empêche l'exécution multiple des mêmes handlers pour un même événement en marquant
 *   l'événement via event._edtHandled (défensif, évite doublons si plusieurs listeners existent).
 * - Throttle/debounce ensureDraggables pour éviter des exécutions répétées (logs "checked N nodes" en boucle).
 * - Garde d'initialisation pour éviter d'attacher plusieurs fois les listeners.
 *
 * Conserver le reste du comportement debug-friendly (logs) pour faciliter vérification.
 */

import SessionController from '../controllers/SessionController.js';
import StateManager from '../controllers/StateManager.js';
import DialogManager from '../ui/DialogManager.js';
import TableRenderer from '../ui/TableRenderer.js';
import FormManager from '../ui/FormManager.js';
import FormHandlers from './FormHandlers.js';

class EventHandlers {
  constructor() {
    this.draggedSessionId = null;

    // bind context
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDragLeave = this.handleDragLeave.bind(this);
    this.handleDrop = this.handleDrop.bind(this);

    // observer & throttle helpers
    this._seanceObserver = null;
    this._suspendObserver = false;
    this._ensureTimer = null;
    this._lastEnsureTime = 0;
    this._ensureThrottleMs = 120;

    // init guard
    this._initialized = false;
  }

  init() {
    if (this._initialized) {
      console.debug('EventHandlers.init: already initialized — skipping duplicate setup');
      return;
    }
    this._initialized = true;

    console.info('EventHandlers.init() — attaching DnD listeners and preparing draggables');

    document.addEventListener('dragstart', this.handleDragStart, true);
    document.addEventListener('dragend', this.handleDragEnd, true);
    document.addEventListener('dragover', this.handleDragOver, true);
    document.addEventListener('dragleave', this.handleDragLeave, true);
    document.addEventListener('drop', this.handleDrop, true);

    this.ensureDraggables();
    this.observeSeanceMutations();

    document.addEventListener('keydown', (e) => this.handleGlobalKeys(e));

    console.info('EventHandlers.init: listeners attached');
  }

  handleGlobalKeys(e) {
    if (e.key === 'Escape') {
      DialogManager.close();
    }
  }

  /**
   * Throttled ensureDraggables
   */
  ensureDraggables() {
    try {
      const now = Date.now();
      if (now - this._lastEnsureTime < this._ensureThrottleMs) {
        // schedule at end of throttle window if not already
        if (this._ensureTimer) return;
        this._ensureTimer = setTimeout(() => {
          this._ensureTimer = null;
          this._lastEnsureTime = Date.now();
          this._doEnsureDraggables();
        }, this._ensureThrottleMs);
        return;
      }
      this._lastEnsureTime = now;
      this._doEnsureDraggables();
    } catch (e) {
      console.debug('ensureDraggables failed', e);
    }
  }

  _doEnsureDraggables() {
    try {
      if (this._suspendObserver) return;
      const nodes = Array.from(document.querySelectorAll('.seance-item, .seance-data, [data-seance-id], [data-id], [data-id-session]'));
      nodes.forEach(n => {
        if (!n) return;
        // preserve explicit false draggable for locked items
        if (n.getAttribute('draggable') !== 'true' && n.getAttribute('draggable') !== 'false') {
          try { n.setAttribute('draggable', 'true'); } catch (e) { /* noop */ }
        }
        if (!n.getAttribute('aria-grabbed')) {
          try { n.setAttribute('aria-grabbed', 'false'); } catch (e) { /* noop */ }
        }
      });
      console.debug(`ensureDraggables: checked ${nodes.length} nodes`);
    } catch (e) {
      console.debug('_doEnsureDraggables failed', e);
    }
  }

  observeSeanceMutations() {
    try {
      if (this._seanceObserver) return;
      const observer = new MutationObserver((mutations) => {
        if (this._suspendObserver) return;
        let found = false;
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length) {
            m.addedNodes.forEach(node => {
              try {
                if (!(node instanceof HTMLElement)) return;
                if (node.matches && (node.matches('.seance-item') || node.matches('.seance-data') || node.matches('[data-seance-id]') || node.querySelector('.seance-item'))) {
                  found = true;
                }
              } catch (e) { /* noop */ }
            });
          }
        }
        if (found) {
          clearTimeout(this._ensureTimer);
          this._ensureTimer = setTimeout(() => {
            this._ensureTimer = null;
            this.ensureDraggables();
          }, 100);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      this._seanceObserver = observer;
      console.debug('observeSeanceMutations: observer attached');
    } catch (e) {
      console.debug('observeSeanceMutations failed', e);
    }
  }

  _extractSessionIdFromElement(el) {
    if (!el) return null;
    try {
      const node = el.closest ? el.closest('.seance-data, .seance-item, [data-seance-id], [data-id], [data-id-session]') : null;
      if (node) {
        return node.dataset.seanceId || node.dataset.id || node.dataset.idSession || node.getAttribute('data-id') || node.id || null;
      }
    } catch (e) { /* noop */ }
    return null;
  }

  /**
   * Défensif : si un inline ondragstart existe et qu'aucun sessionId n'est passé,
   * on laisse l'inline le prendre en charge (évite double handling).
   */
  _inlineHandlerPresentOnTarget(event) {
    try {
      if (!event || !event.target) return false;
      return !!(event.target.closest && event.target.closest('[ondragstart]'));
    } catch (e) {
      return false;
    }
  }

  handleDragStart(event, sessionId) {
    // Prevent duplicate execution when multiple listeners are registered
    if (event && event._edtHandled) return;
    // If inline exists and sessionId not provided, let inline handle
    if ((typeof sessionId === 'undefined' || sessionId === null) && this._inlineHandlerPresentOnTarget(event)) {
      return;
    }

    try {
      // mark handled so other handlers skip
      if (event) event._edtHandled = true;

      // suspend observer while dragging
      this._suspendObserver = true;

      let id = (typeof sessionId !== 'undefined' && sessionId !== null) ? String(sessionId) : null;
      if (!id) id = this._extractSessionIdFromElement(event.target) || this._extractSessionIdFromElement(event.currentTarget);

      if (!id) {
        console.debug('handleDragStart: no session id found on target', event.target);
        this._suspendObserver = false;
        return;
      }

      this.draggedSessionId = String(id);

      try {
        if (event.dataTransfer && typeof event.dataTransfer.setData === 'function') {
          event.dataTransfer.setData('text/plain', String(this.draggedSessionId));
          event.dataTransfer.effectAllowed = 'move';
        }
      } catch (err) {
        console.debug('handleDragStart: dataTransfer.setData failed', err);
      }

      const el = event.target.closest ? event.target.closest('.seance-data, .seance-item, [data-seance-id], [data-id]') : null;
      if (el) {
        el.classList.add('dragging');
        setTimeout(() => el.classList.add('invisible'), 0);
      }

      console.debug('handleDragStart: started dragging id=', this.draggedSessionId);
      window.__edt_draggedId = this.draggedSessionId;
    } catch (e) {
      console.debug('handleDragStart error', e);
      this._suspendObserver = false;
    }
  }

  handleDragEnd(event) {
    // prevent duplicate handling
    if (event && event._edtHandled) {
      // allow dragend cleanup once, but don't double-run heavy logic
      try { delete event._edtHandled; } catch (e) { }
    }

    try {
      const el = event && event.target && event.target.closest ? event.target.closest('.seance-data, .seance-item, [data-seance-id], [data-id]') : null;
      if (el) {
        el.classList.remove('invisible', 'dragging');
        el.style.opacity = '';
      }

      document.querySelectorAll('#edtTable td, td[data-jour]').forEach(cell => {
        cell.classList.remove('drop-target-active', 'cellule-conflit');
      });
      document.querySelectorAll('.seance-item.dragging, .seance-item.invisible, .seance-data.dragging, .seance-data.invisible').forEach(div => {
        div.classList.remove('dragging', 'invisible');
      });
    } catch (e) {
      console.debug('handleDragEnd cleanup failed', e);
    } finally {
      setTimeout(() => {
        this.draggedSessionId = null;
        try { delete window.__edt_draggedId; } catch (e) { }
        this._suspendObserver = false;
        this.ensureDraggables();
      }, 40);
    }
    console.debug('handleDragEnd: finished');
  }

  handleDragOver(event) {
    // avoid duplicate processing
    if (event && event._edtHandled) return;
    try {
      if (!this.draggedSessionId) return;
      if (event) event._edtHandled = true;
      event.preventDefault();
      try { if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; } catch (e) { }

      const targetCell = event.target.closest ? event.target.closest('td[data-jour], td[data-creneau], td[data-creneau-id]') : null;
      if (targetCell) targetCell.classList.add('drop-target-active');
    } catch (e) {
      console.debug('handleDragOver error', e);
    }
  }

  handleDragLeave(event) {
    if (event && event._edtHandled) return;
    try {
      const targetCell = event.target.closest ? event.target.closest('td[data-jour], td') : null;
      if (targetCell) targetCell.classList.remove('drop-target-active');
    } catch (e) {
      console.debug('handleDragLeave error', e);
    }
  }

  handleDrop(event) {
    // prevent duplicate processing
    if (event && event._edtHandled) return;
    if (event) event._edtHandled = true;

    try {
      event.preventDefault();

      document.querySelectorAll('.drop-target-active, .cellule-conflit').forEach(cell => {
        cell.classList.remove('drop-target-active', 'cellule-conflit');
      });
      document.querySelectorAll('.seance-item.invisible, .seance-item.dragging, .seance-data.invisible, .seance-data.dragging').forEach(div => {
        div.classList.remove('invisible', 'dragging');
      });

      const targetCell = event.target && event.target.closest ? event.target.closest('td[data-jour], td[data-creneau]') : null;
      if (!targetCell) {
        console.debug('handleDrop: no target cell found');
        this.draggedSessionId = null;
        return;
      }

      const newJour = targetCell.dataset.jour || targetCell.getAttribute('data-jour') || null;
      const newCreneau = targetCell.dataset.creneau || targetCell.getAttribute('data-creneau') || targetCell.dataset.creneauId || null;
      const newSalle = targetCell.dataset.salle || targetCell.getAttribute('data-salle') || targetCell.dataset.room || targetCell.getAttribute('data-room') || null;

      if (!this.draggedSessionId) {
        try {
          const transferred = event.dataTransfer && typeof event.dataTransfer.getData === 'function' ? event.dataTransfer.getData('text/plain') : null;
          if (transferred) this.draggedSessionId = transferred;
        } catch (e) { /* noop */ }
        if (!this.draggedSessionId && window.__edt_draggedId) this.draggedSessionId = window.__edt_draggedId;
      }

      if (!this.draggedSessionId) {
        console.debug('handleDrop: no draggedSessionId available (cannot move)');
        return;
      }

      const sessionIdNormalized = (String(this.draggedSessionId).match(/^\d+$/)) ? Number(this.draggedSessionId) : this.draggedSessionId;

      console.debug('handleDrop: moving', sessionIdNormalized, '->', newJour, newCreneau, 'salle=', newSalle);

      if (SessionController && typeof SessionController.moveSession === 'function') {
        try {
          const result = SessionController.moveSession(sessionIdNormalized, newJour, newCreneau, newSalle);
          if (result && typeof result.then === 'function') {
            result.then(() => {
              try { TableRenderer.render(); } catch (e) { console.debug('TableRenderer.render failed after move (async)', e); }
            }).catch(err => {
              console.error('SessionController.moveSession rejected', err);
            });
          } else {
            try { TableRenderer.render(); } catch (e) { console.debug('TableRenderer.render failed after move (sync)', e); }
          }
        } catch (err) {
          console.error('SessionController.moveSession failed', err);
        }
      } else {
        console.error('SessionController.moveSession non disponible');
      }
    } catch (err) {
      console.debug('handleDrop error', err);
    } finally {
      try { delete window.__edt_draggedId; } catch (e) { }
      this.draggedSessionId = null;
    }
  }

  ouvrirFormulairePourModifier(id) {
    const seance = StateManager.findSeanceById ? StateManager.findSeanceById(id) : StateManager.getSeanceById ? StateManager.getSeanceById(id) : null;
    if (!seance) return;
    FormManager.fillSeanceForm(seance);
  }

  supprimerSeance(id) {
    const seance = StateManager.findSeanceById ? StateManager.findSeanceById(id) : StateManager.getSeanceById ? StateManager.getSeanceById(id) : null;
    if (!seance) return;

    DialogManager.confirm(
      'Supprimer la Séance',
      `Voulez-vous vraiment supprimer cette séance de <strong>${seance.matiere}</strong> ?`,
      () => {
        SessionController.deleteSession(id);
        TableRenderer.render();
        const seance = StateManager.findSeanceById ? StateManager.findSeanceById(id) : StateManager.getSeanceById ? StateManager.getSeanceById(id) : null;
        if (seance && String(seance.session || '').toLowerCase().includes('automne')) {
          StateManager.recomputeVolumesAutomne && StateManager.recomputeVolumesAutomne();
        }
      }
    );
  }

  attribuerSeanceDirectement(jour, creneau) {
    if (FormHandlers && typeof FormHandlers.attribuerSeanceDirectement === 'function') {
      FormHandlers.attribuerSeanceDirectement(jour, creneau);
    } else {
      console.warn('FormHandlers.attribuerSeanceDirectement non disponible');
    }
  }

  toggleLockSeance(id) {
    if (typeof TableRenderer !== 'undefined' && TableRenderer.toggleLockSeance) {
      TableRenderer.toggleLockSeance(id);
    } else {
      console.error('[EventHandlers] TableRenderer.toggleLockSeance non disponible');
    }
  }
}

const instance = new EventHandlers();
export default instance;