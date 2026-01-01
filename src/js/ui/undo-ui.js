(function () {
  function updateUndoBtn() {
    try {
      var btn = document.getElementById('btnUndo');
      if (!btn) {
        var header = document.getElementById('header-actions') || document.querySelector('#header-actions, .header-actions, .app-header, header');
        btn = document.createElement('button');
        btn.id = 'btnUndo';
        btn.className = 'btn';
        btn.title = 'Annuler la dernière modification';
        btn.style.marginLeft = '8px';
        btn.textContent = '↶ Annuler';
        btn.disabled = true;
        if (header && header.appendChild) header.appendChild(btn);
        else document.body.insertBefore(btn, document.body.firstChild);
        bindClick(btn);
      }
      var can = false;
      if (window.StateManager && typeof window.StateManager.canUndo === 'function') {
        try { can = !!window.StateManager.canUndo(); } catch (e) { can = false; }
      }
      btn.disabled = !can;
    } catch (e) { console.error('updateUndoBtn error', e); }
  }

  function bindClick(btn) {
    if (!btn) return;
    if (btn.__undo_bound) return;
    btn.addEventListener('click', function (e) {
      try { e && e.preventDefault && e.preventDefault(); } catch (err) {}
      try {
        if (window.StateManager && typeof window.StateManager.undo === 'function') {
          var ok = window.StateManager.undo();
          if (!ok) {
            try { window.NotificationManager && window.NotificationManager.warning && window.NotificationManager.warning('Aucune action à annuler'); } catch (e) {}
          }
        } else {
          console.warn('Undo not available on StateManager');
        }
      } catch (err) {
        console.error('Undo action failed', err);
      } finally {
        setTimeout(updateUndoBtn, 50);
      }
    });
    btn.__undo_bound = true;
  }

  // Initialization
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        updateUndoBtn();
        window.addEventListener('undo:stackChanged', updateUndoBtn);
        if (window.StateManager && typeof window.StateManager.subscribe === 'function') {
          try { window.StateManager.subscribe('undo:stackChanged', updateUndoBtn); } catch (e) {}
        }
        setInterval(updateUndoBtn, 1500);
      });
    } else {
      updateUndoBtn();
      window.addEventListener('undo:stackChanged', updateUndoBtn);
      if (window.StateManager && typeof window.StateManager.subscribe === 'function') {
        try { window.StateManager.subscribe('undo:stackChanged', updateUndoBtn); } catch (e) {}
      }
      setInterval(updateUndoBtn, 1500);
    }
  } catch (e) { console.error('undo-ui init failed', e); }
})();