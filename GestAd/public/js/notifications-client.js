// notifications-client.js
// Intégration aux éléments existants : #notification-bell, #notification-badge,
// #notification-dropdown, #notification-list, .notification-item, .notification-empty
(function () {
  const API_NOTIF = '/api/notifications';
  const POLL_MS = (typeof window.NOTIFICATION_POLL_MS === 'number') ? window.NOTIFICATION_POLL_MS : 30000;

  function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function el(id) { return document.getElementById(id); }

  function findBell() { return el('notification-bell') || document.querySelector('.notification-bell'); }
  function findBadge() { return el('notification-badge') || document.querySelector('.notification-badge'); }
  function findDropdown() { return el('notification-dropdown') || document.querySelector('.notification-dropdown'); }
  function findList() { return el('notification-list') || document.querySelector('.notification-list'); }

  function timeAgo(date) {
    try {
      const diff = Date.now() - (new Date(date)).getTime();
      const sec = Math.floor(diff / 1000);
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      if (min < 60) return `${min}m`;
      const h = Math.floor(min / 60);
      if (h < 24) return `${h}h`;
      const d = Math.floor(h / 24);
      return `${d}j`;
    } catch (e) { return ''; }
  }

  function getNotificationIcon(type) {
    const icons = {
      'event': '📅',
      'document': '📄',
      'reminder': '⏰',
      'system': '⚙️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌'
    };
    return icons[type] || '🔔';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderNotificationItem(notif) {
    const icon = getNotificationIcon(notif.type);
    const readClass = notif.read ? '' : ' unread';
    const safeLink = (notif.link || '').replace(/'/g, "\\'");
    const title = escapeHtml(notif.title || '');
    const message = notif.message ? `<div class="notification-message">${escapeHtml(notif.message)}</div>` : '';
    const time = timeAgo(notif.created_at || notif.createdAt || Date.now());
    // use data attributes (avoid inline onclick insertion)
    return `
      <div class="notification-item${readClass}" data-notif-id="${escapeHtml(String(notif.id || ''))}" data-notif-link="${escapeHtml(safeLink)}" tabindex="0" role="button">
        <div style="display:flex;align-items:flex-start;gap:1rem;">
          <div class="notification-icon">${icon}</div>
          <div class="notification-content">
            <div class="notification-title">${title}</div>
            ${message}
            <div class="notification-time">${time}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEmpty() {
    return `
      <div class="notification-empty">
        <div style="font-size:3rem;margin-bottom:1rem;">🔔</div>
        <p>Aucune notification</p>
      </div>
    `;
  }

  async function fetchAndRenderNotifications() {
    const listEl = findList();
    const badgeEl = findBadge();

    if (!listEl && !badgeEl) return;

    try {
      // console.debug('notifications-client: fetching', API_NOTIF);
      const resp = await fetch(API_NOTIF, { headers: getAuthHeaders() });
      // console.debug('notifications-client: response status', resp.status);
      if (!resp.ok) {
        console.warn('notifications-client: fetch failed', resp.status);
        return;
      }
      const data = await resp.json();
      // console.debug('notifications-client: payload', data);
      if (!data || !data.ok) {
        console.warn('notifications-client: invalid payload', data);
        return;
      }

      const notifications = data.notifications || [];

      // badge update
      if (badgeEl) {
        const unread = (typeof data.unreadCount === 'number') ? data.unreadCount : (notifications.filter(n => !n.read).length || 0);
        if (unread > 0) {
          badgeEl.textContent = unread > 99 ? '99+' : String(unread);
          badgeEl.style.display = 'flex';
          badgeEl.setAttribute('aria-hidden', 'false');
        } else {
          badgeEl.style.display = 'none';
          badgeEl.setAttribute('aria-hidden', 'true');
        }
      }

      // list update
      if (listEl) {
        if (!notifications || notifications.length === 0) {
          listEl.innerHTML = renderEmpty();
        } else {
          listEl.innerHTML = notifications.map(renderNotificationItem).join('');
        }
        // after changing list, re-attach delegation so clicks/keys are handled
        attachListDelegation();
      }

      // expose last payload for debugging
      window.__lastNotifications = data;
      return data;
    } catch (err) {
      console.error('notifications-client: error fetching notifications', err);
      throw err;
    }
  }

  function attachListDelegation() {
    const listEl = findList();
    if (!listEl) return;
    if (listEl.__notifDelegationAttached) return;

    listEl.addEventListener('click', function (ev) {
      const item = ev.target.closest('.notification-item');
      if (!item) return;
      ev.preventDefault();
      ev.stopPropagation();

      const id = item.dataset.notifId;
      const link = item.dataset.notifLink || '';

      if (typeof window.handleNotificationClick === 'function') {
        try {
          window.handleNotificationClick(Number(id), link);
          return;
        } catch (e) {
          console.warn('notifications-client: window.handleNotificationClick threw', e);
        }
      }

      (async () => {
        try {
          if (id) {
            await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
              method: 'PUT',
              headers: getAuthHeaders()
            });
            await fetchAndRenderNotifications();
          }
        } catch (e) {
          console.warn('notifications-client: mark read failed', e);
        }

        try {
          if (link) {
            if (link.startsWith('tab-')) {
              const dropdown = findDropdown();
              if (dropdown && dropdown.classList.contains('show') && typeof window.toggleNotifications === 'function') {
                window.toggleNotifications();
              }
              if (typeof window.switchToTab === 'function') {
                window.switchToTab(link);
              }
            } else {
              window.location.href = link;
            }
          }
        } catch (e) { /* ignore */ }
      })();
    }, { passive: false });

    listEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        const item = ev.target.closest('.notification-item');
        if (item) {
          ev.preventDefault();
          item.click();
        }
      }
    });

    listEl.__notifDelegationAttached = true;
  }

  function attachBell() {
    const bell = findBell();
    const dropdown = findDropdown();
    if (!bell || !dropdown) return;

    if (typeof window.toggleNotifications === 'function') {
      // if app provided toggleNotifications, ensure our fetch runs after it
      bell.addEventListener('click', function () {
        // small delay to allow app's toggle to run (if inline onclick exists)
        setTimeout(() => {
          // prefer app's loadNotifications; our wrapped version will ensure sync
          if (typeof window.loadNotifications === 'function') {
            try { window.loadNotifications(); } catch (e) { /* ignore */ }
          } else {
            fetchAndRenderNotifications().catch(() => {/* ignore */ });
          }
        }, 50);
      }, { passive: true });
    } else {
      // fallback toggle provided by this client
      bell.addEventListener('click', function () {
        const isOpen = dropdown.classList.contains('show');
        if (!isOpen) {
          dropdown.classList.add('show');
          dropdown.removeAttribute('aria-hidden');
          const first = dropdown.querySelector('button, [tabindex]:not([tabindex="-1"])');
          if (first && typeof first.focus === 'function') first.focus();
          fetchAndRenderNotifications().catch(() => {/* ignore */ });
        } else {
          dropdown.classList.remove('show');
          dropdown.setAttribute('aria-hidden', 'true');
        }
      }, { passive: true });
    }
  }

  // Wrap or attach "mark all" and "refresh" in a safe way:
  // --- Remplacez la fonction attachFooterButtons par la version suivante ---
  function attachFooterButtons() {
    const dropdown = findDropdown();
    if (!dropdown) return;

    // If the app defines markAllNotificationsRead, wrap it so we call our fetch after it.
    if (typeof window.markAllNotificationsRead === 'function' && !window.__notificationsClient_markAllWrapped) {
      const orig = window.markAllNotificationsRead;
      window.markAllNotificationsRead = async function (...args) {
        try {
          const res = orig.apply(this, args);
          if (res && typeof res.then === 'function') await res;
        } catch (e) {
          console.warn('notifications-client: wrapped markAllNotificationsRead threw', e);
        }
        try { await fetchAndRenderNotifications(); } catch (e) { /* ignore */ }
      };
      window.__notificationsClient_markAllWrapped = true;
    }

    // Mark-all button fallback
    const markBtn = dropdown.querySelector('#mark-all-read-btn') || Array.from(dropdown.querySelectorAll('button')).find(b => /marquer tout lu/i.test(b.textContent || '')) || null;
    if (markBtn && !markBtn.__markHandlerAttached) {
      if (typeof window.markAllNotificationsRead !== 'function') {
        markBtn.addEventListener('click', async function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            await fetch('/api/notifications/mark-all-read', { method: 'PUT', headers: getAuthHeaders() });
          } catch (e) { console.warn('notifications-client: mark-all-read failed', e); }
          await fetchAndRenderNotifications();
        }, { passive: false });
      }
      markBtn.__markHandlerAttached = true;
    }

    // Refresh button
    const refreshBtn = dropdown.querySelector('button[data-action="refresh"]') || Array.from(dropdown.querySelectorAll('button')).find(b => /actualiser|rafraîchir|refresh/i.test(b.textContent || '')) || null;
    if (refreshBtn && !refreshBtn.__refreshHandlerAttached) {
      refreshBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof window.loadNotifications === 'function') {
          try { window.loadNotifications(); } catch (e) { fetchAndRenderNotifications().catch(() => { }); }
        } else {
          fetchAndRenderNotifications().catch(() => { });
        }
      }, { passive: false });
      refreshBtn.__refreshHandlerAttached = true;
    }

    // --- remplacer le handler pour #clear-unread-btn par ceci ---
    const clearBtn = dropdown.querySelector('#clear-unread-btn');
    if (clearBtn && !clearBtn.__clearHandlerAttached) {
      // update label to reflect new behavior
      try { clearBtn.textContent = 'Effacer les notifications lues'; } catch (e) { /* ignore */ }

      clearBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();

        if (!confirm("Effacer toutes les notifications lues ?")) return;

        // UI lock rapide
        clearBtn.disabled = true;
        const originalText = clearBtn.textContent;
        clearBtn.textContent = 'Suppression...';

        // Fire-and-forget: call server, update UI quickly, sync in background
        (async () => {
          try {
            const res = await fetch(`${API_NOTIF}/read`, {
              method: 'DELETE',
              headers: {
                'Accept': 'application/json',
                ...(getAuthHeaders() || {})
              }
            });
            let body = null;
            try { body = await res.json(); } catch (e) { body = await res.text(); }
            console.log('DELETE /api/notifications/read =>', res.status, body);

            // Mise à jour UI immédiate (optimiste)
            const badgeEl = findBadge();
            if (badgeEl) {
              badgeEl.style.display = 'none';
              badgeEl.textContent = '';
              badgeEl.setAttribute('aria-hidden', 'true');
            }

            // fermer la dropdown proprement
            try {
              if (typeof closeNotificationDropdownSafely === 'function') closeNotificationDropdownSafely();
              else {
                const dd = findDropdown();
                const bell = findBell();
                if (dd && dd.classList.contains('show')) {
                  try { if (dd.contains(document.activeElement)) document.activeElement.blur(); } catch (e) { /* ignore */ }
                  if (bell && typeof bell.focus === 'function') bell.focus();
                  dd.classList.remove('show');
                  dd.setAttribute('aria-hidden', 'true');
                  if ('inert' in dd) dd.inert = true;
                  if (bell) bell.setAttribute('aria-expanded', 'false');
                }
              }
            } catch (e) { /* ignore */ }

            // sync en background (non bloquant)
            setTimeout(() => {
              if (typeof window.loadNotifications === 'function') {
                window.loadNotifications().catch(() => { });
              } else {
                fetchAndRenderNotifications().catch(() => { });
              }
            }, 100);
          } catch (err) {
            console.error('notifications-client: clear read failed', err);
            try { alert('Erreur suppression : ' + (err && err.message ? err.message : String(err))); } catch (e) { }
          } finally {
            clearBtn.disabled = false;
            clearBtn.textContent = originalText;
          }
        })();
      }, { passive: false });

      clearBtn.__clearHandlerAttached = true;
    }
  }

  // If the app provides loadNotifications, wrap it so our client updates too
  function wrapAppLoadNotifications() {
    if (typeof window.loadNotifications === 'function' && !window.__notificationsClient_loadNotificationsWrapped) {
      const orig = window.loadNotifications;
      window.loadNotifications = async function (...args) {
        try {
          // call original app behavior first
          const res = orig.apply(this, args);
          // await if original returned a promise
          if (res && typeof res.then === 'function') await res;
        } catch (e) {
          console.warn('notifications-client: wrapped loadNotifications original threw', e);
        }
        // then ensure our rendering is synced and re-attach handlers in case DOM changed
        try {
          await fetchAndRenderNotifications();
          attachListDelegation();
          attachFooterButtons();
        } catch (e) { /* ignore */ }
      };
      window.__notificationsClient_loadNotificationsWrapped = true;
    }
  }
  // utilitaire à ajouter dans notifications-client.js
  function closeNotificationDropdownSafely() {
    const bell = findBell();
    const dropdown = findDropdown();
    if (!dropdown) return;
    try {
      if (dropdown.contains(document.activeElement) && bell && typeof bell.focus === 'function') {
        try { document.activeElement.blur(); } catch (e) { /* ignore */ }
        bell.focus();
      }
    } catch (e) { /* ignore */ }

    dropdown.classList.remove('show');
    dropdown.setAttribute('aria-hidden', 'true');
    if ('inert' in dropdown) dropdown.inert = true;
    if (bell) bell.setAttribute('aria-expanded', 'false');
  }

  // ensuite, remplacez les usages directs de dropdown.classList.remove('show')/setAttribute('aria-hidden','true')
  // par closeNotificationDropdownSafely();
  function init() {
    attachBell();
    attachListDelegation();
    attachFooterButtons();
    wrapAppLoadNotifications();

    // initial fetch (and keep periodic poll)
    fetchAndRenderNotifications().catch(() => {/* ignore */ });

    if (!window.__notificationsClientIntervalInstalled) {
      window.__notificationsClientIntervalInstalled = true;
      setInterval(() => {
        try { fetchAndRenderNotifications(); } catch (e) { /* ignore */ }
      }, POLL_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var clearBtn = document.getElementById('clear-unread-btn');
      if (clearBtn) {
        clearBtn.onclick = async function () {
          if (!confirm("Effacer toutes les notifications non lues ?")) return;
          const token = localStorage.getItem('auth_token');
          if (!token) return alert("Non authentifié !");
          try {
            const res = await fetch('/api/notifications/unread', {
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) throw new Error(await res.text());
            // Recharge la liste après suppression
            if (typeof window.loadNotifications === "function") await window.loadNotifications();
          } catch (e) {
            alert("Erreur suppression : " + e.message);
          }
        };
      }
    });
  } else {
    init();
  }

  window.__notificationsClient = {
    fetchAndRenderNotifications,
    attachBell,
    attachListDelegation,
    attachFooterButtons
  };
})();