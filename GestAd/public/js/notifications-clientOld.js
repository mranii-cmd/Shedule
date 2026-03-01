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
            fetchAndRenderNotifications().catch(() => {/* ignore */});
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
          fetchAndRenderNotifications().catch(() => {/* ignore */});
        } else {
          dropdown.classList.remove('show');
          dropdown.setAttribute('aria-hidden', 'true');
        }
      }, { passive: true });
    }
  }

  // Wrap or attach "mark all" and "refresh" in a safe way:
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

    // If there is a button for mark all and the app DID NOT provide a function, attach our handler
    const markBtn = dropdown.querySelector('#mark-all-read-btn') || Array.from(dropdown.querySelectorAll('button')).find(b => /marquer tout lu/i.test(b.textContent || '')) || null;
    if (markBtn && !markBtn.__markHandlerAttached) {
      // If app provides the function, don't override; else attach.
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

    // Refresh button: if app has loadNotifications we wrapped it already (see wrapAppLoadNotifications).
    // If no app function, attach a refresh handler to a visible button.
    const refreshBtn = dropdown.querySelector('button[data-action="refresh"]') || Array.from(dropdown.querySelectorAll('button')).find(b => /actualiser|rafraîchir|refresh/i.test(b.textContent || '')) || null;
    if (refreshBtn && !refreshBtn.__refreshHandlerAttached) {
      refreshBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        // prefer app's loadNotifications if present so app and client stay in sync
        if (typeof window.loadNotifications === 'function') {
          try { window.loadNotifications(); } catch (e) { fetchAndRenderNotifications().catch(()=>{}); }
        } else {
          fetchAndRenderNotifications().catch(()=>{});
        }
      }, { passive: false });
      refreshBtn.__refreshHandlerAttached = true;
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

  function init() {
    attachBell();
    attachListDelegation();
    attachFooterButtons();
    wrapAppLoadNotifications();

    // initial fetch (and keep periodic poll)
    fetchAndRenderNotifications().catch(() => {/* ignore */});

    if (!window.__notificationsClientIntervalInstalled) {
      window.__notificationsClientIntervalInstalled = true;
      setInterval(() => {
        try { fetchAndRenderNotifications(); } catch (e) { /* ignore */ }
      }, POLL_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
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