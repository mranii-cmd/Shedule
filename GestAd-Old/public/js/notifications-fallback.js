// Fallback helper : crée #notification-list si absent, améliore l'accessibilité minimale,
// et attache des handlers robustes pour "Marquer tout lu" et "Actualiser".
// Placez ce fichier en public/js/ et incluez-le (déjà référencé dans index.html).

(function ensureNotificationDropdown() {
  try {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;

    // Créer header si absent (sans onclick inline)
    if (!dropdown.querySelector('.notification-header')) {
      const header = document.createElement('div');
      header.className = 'notification-header';
      header.innerHTML = `<h4>Notifications</h4><div><button class="btn btn-sm" id="mark-all-read-btn" data-action="mark-all-read">Marquer tout lu</button></div>`;
      dropdown.insertBefore(header, dropdown.firstChild);
    } else {
      // ensure button has proper attributes (in case it existed with inline onclick)
      const existingMark = dropdown.querySelector('#mark-all-read-btn');
      if (existingMark && !existingMark.dataset.action) existingMark.dataset.action = 'mark-all-read';
    }

    // Créer notification-list si absent
    if (!document.getElementById('notification-list')) {
      const list = document.createElement('div');
      list.className = 'notification-list';
      list.id = 'notification-list';
      list.innerHTML = `
        <div class="notification-empty">
          <div style="font-size:3rem;margin-bottom:1rem;">🔔</div>
          <p>Aucune notification</p>
        </div>
      `;
      const footer = dropdown.querySelector('.notification-footer');
      if (footer) dropdown.insertBefore(list, footer);
      else dropdown.appendChild(list);
    }

    // Ensure footer exists and has refresh button with data-action
    let footer = dropdown.querySelector('.notification-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'notification-footer';
      footer.innerHTML = `<button class="btn btn-sm" data-action="refresh">Actualiser</button>`;
      dropdown.appendChild(footer);
    } else {
      const refreshBtn = footer.querySelector('button');
      if (refreshBtn && !refreshBtn.dataset.action) refreshBtn.dataset.action = 'refresh';
    }

    // Small accessibility defaults
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-hidden', dropdown.classList.contains('show') ? 'false' : 'true');

    // Ensure bell has proper aria attributes
    const bell = document.getElementById('notification-bell');
    if (bell) {
      bell.setAttribute('aria-controls', 'notification-dropdown');
      bell.setAttribute('aria-haspopup', 'true');
      bell.setAttribute('aria-expanded', dropdown.classList.contains('show') ? 'true' : 'false');
    }

    // Attach delegated handlers only once
    if (!dropdown.__notifHandlersAttached) {
      dropdown.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        e.preventDefault();
        e.stopPropagation();

        if (action === 'mark-all-read') {
          if (typeof window.markAllNotificationsRead === 'function') {
            // call and handle errors
            Promise.resolve().then(() => window.markAllNotificationsRead())
              .catch(err => {
                console.error('markAllNotificationsRead error:', err);
                if (typeof window.showToast === 'function') showToast('Erreur lors du marquage', 'error');
              });
          } else {
            console.warn('markAllNotificationsRead is not defined');
          }
        } else if (action === 'refresh') {
          if (typeof window.loadNotifications === 'function') {
            Promise.resolve().then(() => window.loadNotifications())
              .catch(err => {
                console.error('loadNotifications error:', err);
                if (typeof window.showToast === 'function') showToast('Erreur lors de l\'actualisation', 'error');
              });
          } else {
            console.warn('loadNotifications is not defined');
          }
        }
      }, { passive: false });

      // Also attach keyboard support for Enter on buttons inside dropdown
      dropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const btn = e.target.closest('button[data-action]');
          if (btn) {
            btn.click();
            e.preventDefault();
          }
        }
      });

      dropdown.__notifHandlersAttached = true;
    }

    // Debug helper
    window.__debugNotifications = function () {
      return {
        hasDropdown: !!dropdown,
        markBtn: !!document.getElementById('mark-all-read-btn'),
        refreshBtn: !!dropdown.querySelector('.notification-footer button[data-action="refresh"]'),
        markFn: typeof window.markAllNotificationsRead,
        loadFn: typeof window.loadNotifications
      };
    };

    console.log('notifications-fallback: ensured dropdown structure and handlers attached');
  } catch (err) {
    console.warn('notifications-fallback error:', err);
  }
})();