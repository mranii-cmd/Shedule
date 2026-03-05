// Simple BackupService (vanilla JS) — expose window.BackupService
// Usage: window.BackupService.createBackup({download:true, label:'test'});

(function () {
  var KEY_PREFIX = 'project_state_backup_';
  function _ts() { return (new Date()).toISOString().replace(/[:.]/g, '-'); }

  function _getState() {
    try {
      if (window.StateManager && typeof window.StateManager.state !== 'undefined') {
        return JSON.parse(JSON.stringify(window.StateManager.state));
      }
      var ls = localStorage.getItem('project_state');
      if (ls) return JSON.parse(ls);
      if (window._last_import_cleaned) return JSON.parse(JSON.stringify(window._last_import_cleaned));
    } catch (e) { console.warn('BackupService: _getState error', e); }
    return null;
  }

  function createBackup(options) {
    options = options || {};
    var download = !!options.download;
    var label = options.label || '';
    var state = _getState();
    if (!state) throw new Error('No project state found to backup');
    var ts = _ts();
    var key = KEY_PREFIX + ts;
    var payload = { meta: { createdAt: (new Date()).toISOString(), label: label, source: (window.StateManager ? 'StateManager' : (localStorage.getItem('project_state') ? 'localStorage' : 'last_import')) }, state: state };
    localStorage.setItem(key, JSON.stringify(payload));
    localStorage.setItem(KEY_PREFIX + 'last', key);
    if (window.DatabaseService && typeof window.DatabaseService.save === 'function') {
      try { window.DatabaseService.save('project_state_backup', payload); } catch (e) { console.warn('BackupService: DatabaseService.save failed', e); }
    }
    if (download) {
      var a = document.createElement('a');
      a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
      a.download = 'project_state_backup_' + ts + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    }
    return { key: key, payload: payload };
  }

  function listBackups() {
    var keys = Object.keys(localStorage).filter(function (k) { return k.indexOf(KEY_PREFIX) === 0 && k !== (KEY_PREFIX + 'last'); }).sort().reverse();
    return keys.map(function (k) {
      try { var raw = localStorage.getItem(k); var parsed = raw ? JSON.parse(raw) : null; return { key: k, meta: parsed && parsed.meta ? parsed.meta : { createdAt: null, label: '' }, size: raw ? raw.length : 0 }; } catch (e) { return { key: k, meta: { createdAt: null, label: '' }, size: 0 }; }
    });
  }

  function getBackup(key) { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { console.error('BackupService.getBackup error', e); return null; } }

  function restoreBackup(key) {
    var backup = getBackup(key);
    if (!backup) throw new Error('Backup not found: ' + key);
    var state = backup.state || backup;
    if (!state) throw new Error('Backup has no state payload');
    if (window.StateManager && typeof window.StateManager.state !== 'undefined') {
      // push undo snapshot before applying the backup restore
      try { if (typeof window.StateManager.pushUndoState === 'function') window.StateManager.pushUndoState('restore backup ' + key); } catch (e) { console.debug('pushUndoState restoreBackup failed', e); }

      window.StateManager.state = state;
      try { if (typeof window.StateManager._hydrateState === 'function') window.StateManager._hydrateState(); } catch (e) { console.warn('hydrateState failed', e); }
      try { if (typeof window.StateManager.saveState === 'function') window.StateManager.saveState(); } catch (e) { console.warn('StateManager.saveState failed', e); }
      try { if (window.EDTApp && typeof window.EDTApp.populateFormSelects === 'function') window.EDTApp.populateFormSelects(); if (window.EDTApp && typeof window.EDTApp.renderAll === 'function') window.EDTApp.renderAll(); } catch (e) { }
      return true;
    } else {
      localStorage.setItem('project_state', JSON.stringify(state));
      return true;
    }
  }

  function deleteBackup(key) { try { localStorage.removeItem(key); return true; } catch (e) { console.error(e); return false; } }

  function downloadBackup(key) {
    var b = getBackup(key);
    if (!b) throw new Error('Backup not found: ' + key);
    var meta = b.meta || {};
    var ts = meta.createdAt ? meta.createdAt.replace(/[:.]/g, '-') : _ts();
    var filename = 'project_state_backup_' + ts + '.json';
    var a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(b, null, 2));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  window.BackupService = { createBackup: createBackup, listBackups: listBackups, getBackup: getBackup, restoreBackup: restoreBackup, deleteBackup: deleteBackup, downloadBackup: downloadBackup };
})();