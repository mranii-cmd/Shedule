(function () {
  // Module-level state
  let undoButton = null;
  let updateInterval = null;

  function updateUndoBtn() {
    try {
      if (!undoButton) {
        undoButton = initializeButton();
      }
      
      const canUndo = checkUndoAvailability();
      if (undoButton) {
        undoButton.disabled = !canUndo;
      }
    } catch (e) {
      console.error('updateUndoBtn error', e);
    }
  }

  function initializeButton() {
    let btn = document.getElementById('btnUndo');
    if (btn) return btn;

    const header = document.getElementById('header-actions') || 
                   document.querySelector('#header-actions, .header-actions, .app-header, header');
    
    btn = document.createElement('button');
    btn.id = 'btnUndo';
    btn.className = 'btn';
    btn.title = 'Annuler la dernière modification';
    btn.style.marginLeft = '8px';
    btn.textContent = '↶ Annuler';
    btn.disabled = true;
    
    if (header && header.appendChild) {
      header.appendChild(btn);
    } else {
      document.body.insertBefore(btn, document.body.firstChild);
    }
    
    bindClickHandler(btn);
    return btn;
  }

  function checkUndoAvailability() {
    if (window.StateManager && typeof window.StateManager.canUndo === 'function') {
      try {
        return !!window.StateManager.canUndo();
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  function bindClickHandler(btn) {
    if (!btn || btn.__undo_bound) return;
    
    btn.addEventListener('click', function (e) {
      try {
        e && e.preventDefault && e.preventDefault();
      } catch (err) {}
      
      try {
        if (window.StateManager && typeof window.StateManager.undo === 'function') {
          const ok = window.StateManager.undo();
          if (!ok && window.NotificationManager && window.NotificationManager.warning) {
            window.NotificationManager.warning('Aucune action à annuler');
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

  function attachEventListeners() {
    window.addEventListener('undo:stackChanged', updateUndoBtn);
    
    if (window.StateManager && typeof window.StateManager.subscribe === 'function') {
      try {
        window.StateManager.subscribe('undo:stackChanged', updateUndoBtn);
      } catch (e) {
        console.warn('Failed to subscribe to undo:stackChanged', e);
      }
    }
    
    // Periodic update as fallback
    updateInterval = setInterval(updateUndoBtn, 1500);
  }

  function initialize() {
    try {
      updateUndoBtn();
      attachEventListeners();
    } catch (e) {
      console.error('undo-ui init failed', e);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Cleanup on unload
  window.addEventListener('unload', function() {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
})();