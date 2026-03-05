/**
 * shimStateManager.js
 *
 * Lightweight StateManager shim to use if the real one is absent, for testing or migration.
 * It implements .state, ._hydrateState (noop), and .saveState() which persists using ProjectStorage.
 *
 * Only create this shim if you are sure the real implementation isn't present.
 */

if (!window.StateManager) {
  window.StateManager = {
    state: null,
    _hydrateState: function(){ /* no-op, application might override */ },
    saveState: async function() {
      try {
        if (!window.ProjectStorage) {
          throw new Error('ProjectStorage missing');
        }
        return await window.ProjectStorage.saveProject(this.state);
      } catch (e) {
        console.error('shim saveState failed', e);
        return false;
      }
    }
  };
  console.log('shim StateManager created (only for migration/testing). Remove when real StateManager is loaded.');
}