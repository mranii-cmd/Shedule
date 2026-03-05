/**
 * AutoSyncService
 * - Restore state from server at startup (if available)
 * - Periodically save local state to server and on unload
 *
 * Usage:
 *   import AutoSyncService from './services/AutoSyncService.js';
 *   AutoSyncService.init({ intervalMs: 5*60*1000 }); // optionnel
 *
 * Notes:
 * - Requires StorageService.exportProject() / StorageService.importProject() to exist (fallback to localStorage 'project_state').
 * - Requires window.EDT_API_BASE to be set (e.g. http://localhost:4000/api). If not set, service becomes a no-op.
 */
import StorageService from './StorageService.js'; // optional, may exist

// Helper: try to find a JWT token in localStorage using common keys
function _getStoredToken() {
  try {
    const ls = window.localStorage;
    if (!ls) return null;
    // Try common keys used in this project
    const keys = ['EDT_API_TOKEN', 'EDT_TOKEN', 'TOKEN_STORAGE_KEY', 'edt_token', 'token', 'auth_token'];
    for (const k of keys) {
      try {
        const v = ls.getItem(k);
        if (v && String(v).trim()) return String(v).trim();
      } catch (e) { /* noop */ }
    }
  } catch (e) { /* noop */ }
  return null;
}

// Build headers for fetch: include Authorization if token present, otherwise plain JSON headers.
// If Authorization present we DO NOT set credentials:'include' (server expects token header).
function _getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = _getStoredToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return { headers, hasToken: !!token };
}

const AutoSyncService = {
  _intervalId: null,
  _opts: {
    intervalMs: 1000 * 60 * 5, // 5 minutes by default
    endpointBase: (window && window.EDT_API_BASE) ? window.EDT_API_BASE.replace(/\/+$/, '') : null
  },

  init(options = {}) {
    this._opts = Object.assign(this._opts, options || {});
    if (!this._opts.endpointBase) {
      console.debug('[AutoSyncService] EDT_API_BASE not configured — skipping remote sync');
      return;
    }

    // Try restore once at startup
    this._tryRestoreFromServer().catch(e => {
      console.debug('[AutoSyncService] restore attempt failed:', e && e.message);
    });

    // Periodic sync
    if (this._opts.intervalMs > 0) {
      this._intervalId = setInterval(() => {
        this._syncOnce().catch(e => console.debug('[AutoSyncService] periodic sync failed:', e && e.message));
      }, this._opts.intervalMs);
    }

    // Sync on unload (best-effort)
    window.addEventListener('beforeunload', () => {
      try {
        const payload = this._getExportPayload();
        if (!payload) return;
        const url = `${this._opts.endpointBase}/user/state`;
        const body = JSON.stringify({ state: payload });

        const { headers, hasToken } = _getAuthHeaders();

        if (!hasToken && navigator.sendBeacon) {
          // sendBeacon cannot set Authorization header — safe to use only when relying on cookie-based auth
          const blob = new Blob([body], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
          console.debug('[AutoSyncService] sendBeacon used for unload sync (cookie-based auth)');
        } else {
          // Use fetch keepalive so we can include Authorization header when needed
          fetch(url, {
            method: 'POST',
            headers,
            body,
            keepalive: true,
            // if no token and server uses cookies, include them
            credentials: hasToken ? undefined : 'include'
          }).catch(() => { /* best-effort */ });
          console.debug('[AutoSyncService] fetch keepalive used for unload sync');
        }
      } catch (e) { /* noop */ }
    }, { passive: true });

    console.info('[AutoSyncService] initialized', { endpoint: this._opts.endpointBase, intervalMs: this._opts.intervalMs });
  },

  async _tryRestoreFromServer() {
    const url = `${this._opts.endpointBase}/user/state`;
    try {
      const { headers, hasToken } = _getAuthHeaders();
      const fetchOpts = {
        method: 'GET',
        cache: 'no-store',
        headers
      };
      // If we don't have a token, rely on cookie/session auth
      if (!hasToken) fetchOpts.credentials = 'include';

      const res = await fetch(url, fetchOpts);
      if (!res.ok) {
        console.debug('[AutoSyncService] no remote state (status)', res.status);
        return null;
      }
      const payload = await res.json();
      if (!payload || !payload.state) {
        console.debug('[AutoSyncService] remote state empty');
        return null;
      }

      // Import into app
      try {
        if (StorageService && typeof StorageService.importProject === 'function') {
          StorageService.importProject(payload.state);
          console.info('[AutoSyncService] state restored from server via StorageService.importProject');
        } else if (window.StateManager && typeof window.StateManager.loadState === 'function') {
          // try generic StateManager loader if exists
          window.StateManager.loadState(payload.state);
          console.info('[AutoSyncService] state restored from server via StateManager.loadState');
        } else {
          // fallback: write to localStorage 'project_state' so app can pick it on next reload
          try { window.localStorage.setItem('project_state', JSON.stringify(payload.state)); } catch(e){}
          console.info('[AutoSyncService] state pulled and written to localStorage.project_state (fallback)');
        }
        return payload.state;
      } catch (impErr) {
        console.warn('[AutoSyncService] failed to import server state:', impErr);
        return null;
      }
    } catch (err) {
      console.debug('[AutoSyncService] fetch restore failed:', err && err.message);
      return null;
    }
  },

  _getExportPayload() {
    try {
      // Prefer StorageService.exportProject if available
      if (StorageService && typeof StorageService.exportProject === 'function') {
        const exported = StorageService.exportProject();
        // ensure JSON serializable
        return (typeof exported === 'string') ? JSON.parse(exported) : exported;
      }
    } catch (e) { console.debug('[AutoSyncService] exportProject failed:', e); }

    // fallback to reading localStorage project_state
    try {
      const raw = window.localStorage && window.localStorage.getItem('project_state');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* noop */ }

    return null;
  },

  async _syncOnce() {
    const payloadState = this._getExportPayload();
    if (!payloadState) {
      console.debug('[AutoSyncService] no local state to sync');
      return false;
    }
    const url = `${this._opts.endpointBase}/user/state`;
    try {
      const { headers, hasToken } = _getAuthHeaders();
      const fetchOpts = {
        method: 'POST',
        headers,
        body: JSON.stringify({ state: payloadState })
      };
      if (!hasToken) fetchOpts.credentials = 'include';

      const res = await fetch(url, fetchOpts);
      if (!res.ok) throw new Error('sync failed ' + res.status);
      console.debug('[AutoSyncService] sync to server successful');
      return true;
    } catch (err) {
      console.warn('[AutoSyncService] sync to server failed:', err && err.message);
      return false;
    }
  },

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    console.info('[AutoSyncService] stopped');
  }
};

export default AutoSyncService;