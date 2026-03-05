// Module: attemptSaveSession.js (ES module)
// Import modal
import { showConflictConfirmModal } from '../ui/conflictConfirmModal.js';

/**
 * saveSessionToServer(payload)
 * Adapter à ton backend ou logique StateManager.
 * Ici par défaut: sauvegarde locale via StateManager (si présent).
 * Retourne Promise resolving { success, session }
 */
function saveSessionToServer(payload) {
  return new Promise(function (resolve, reject) {
    try {
      if (window.StateManager && StateManager.state && Array.isArray(StateManager.state.seances)) {
        var idx = -1;
        if (payload.id) {
          idx = StateManager.state.seances.findIndex(function (s) { return Number(s.id) === Number(payload.id); });
        }
        if (idx >= 0) {
          StateManager.state.seances[idx] = payload;
        } else {
          payload.id = payload.id || Date.now();
          StateManager.state.seances.push(payload);
        }
        if (typeof StateManager.saveState === 'function') StateManager.saveState();
        resolve({ success: true, session: payload });
      } else {
        // fallback: simulate success
        resolve({ success: true, session: payload });
      }
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * attemptSaveSession(candidate)
 * - vérifie les conflits via ConflictService (client-side)
 * - si conflits: affiche modal showConflictConfirmModal -> selon choix, force la sauvegarde (meta + forcePlace)
 * - retourne la Promise du save (ou { cancelled: true } si annulé)
 */
export function attemptSaveSession(candidate, opts) {
  opts = opts || {};
  var allSessions = (window.StateManager && (typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : (StateManager.state && StateManager.state.seances))) || [];
  var excludeIds = candidate && candidate.id ? [candidate.id] : [];
  var conflicts = [];
  try {
    if (window.ConflictService && typeof ConflictService.checkAllConflicts === 'function') {
      conflicts = ConflictService.checkAllConflicts(candidate, allSessions, excludeIds, (StateManager && StateManager.state && StateManager.state.sallesInfo) || {});
    } else {
      conflicts = [];
    }
  } catch (e) {
    console.warn('Conflict check failed', e);
    conflicts = [];
  }

  if (Array.isArray(conflicts) && conflicts.length) {
    return showConflictConfirmModal(candidate, conflicts).then(function (choice) {
      if (!choice || choice.action === 'cancel') {
        console.log('Placement cancelled by user due to conflicts');
        return { cancelled: true };
      }
      var payload = Object.assign({}, candidate);
      payload.meta = payload.meta || {};
      payload.meta.placedDespiteConflicts = true;
      payload.meta.conflictsSnapshot = conflicts.slice(0);
      payload.meta.placedBy = (window.currentUser && window.currentUser.id) || 'unknown';
      payload.meta.placedAt = (new Date()).toISOString();
      if (choice.action === 'force_mark') payload.meta.markForResolution = true;
      payload.forcePlace = true;
      return saveSessionToServer(payload);
    });
  } else {
    return saveSessionToServer(candidate);
  }
}

// Expose a global helper for compatibility with existing code that expects window.attemptSaveSession
window.attemptSaveSession = attemptSaveSession;
export default attemptSaveSession;