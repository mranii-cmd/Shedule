/**
 * DatabaseService (REST adapter) - JWT-aware
 *
 * - Adds:
 *    - login(username, password) -> stores token in localStorage
 *    - logout() -> removes token
 *    - Authorization: Bearer <token> header injected automatically on requests
 *    - on 401 responses token is cleared (fail-safe)
 *
 * Usage:
 *  const db = new DatabaseService();
 *  await db.open();
 *  await db.login('admin','verysecret'); // optional, for protected routes
 *  await db.load('global_data');
 *  await db.save('session_MaSession', sessionData);
 */

const DEFAULT_TIMEOUT_MS = 12_000; // 12s
const TOKEN_STORAGE_KEY = 'EDT_API_TOKEN';
const TOKEN_EXPIRY_KEY = 'EDT_API_TOKEN_EXP'; // optional ISO timestamp

function getApiBase() {
    try {
        const raw = window && window.EDT_API_BASE;
        if (raw && String(raw).trim()) {
            return String(raw).replace(/\/+$/, ''); // remove trailing slash
        }
    } catch (e) { /* noop */ }
    try {
        return `${location.origin}/api`;
    } catch (e) {
        return '/api';
    }
}

/**
 * Token helpers
 */
function getToken() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(TOKEN_STORAGE_KEY);
        }
    } catch (e) { /* noop */ }
    return null;
}
function setToken(token, expiresAtIso = null) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            if (token) {
                window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
                if (expiresAtIso) window.localStorage.setItem(TOKEN_EXPIRY_KEY, expiresAtIso);
                else window.localStorage.removeItem(TOKEN_EXPIRY_KEY);
            } else {
                window.localStorage.removeItem(TOKEN_STORAGE_KEY);
                window.localStorage.removeItem(TOKEN_EXPIRY_KEY);
            }
        }
    } catch (e) { /* noop */ }
}
function clearToken() {
    setToken(null);
    try { if (typeof window !== 'undefined') window.__edt_authenticated = false; } catch (e) { /* noop */ }
}
function isTokenExpired() {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return false;
        const iso = window.localStorage.getItem(TOKEN_EXPIRY_KEY);
        if (!iso) return false;
        const t = Date.parse(iso);
        if (isNaN(t)) return false;
        return Date.now() > t;
    } catch (e) {
        return false;
    }
}

async function httpRequest(path, { method = 'GET', body = null, headers = {}, timeout = DEFAULT_TIMEOUT_MS, credentials = 'same-origin', keepalive = false } = {}) {
   // Base API : configurable via window.__API_BASE_URL__ (utile pour dev/prod)
    // Use an explicit localhost backend during local development, otherwise fall back to getApiBase()
    const API_BASE = (typeof window !== 'undefined' && window.__API_BASE_URL__)
        ? window.__API_BASE_URL__
        : (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
            ? 'http://localhost:4000'
            : getApiBase());

    // Si path est une URL absolue, on l'utilise telle quelle.
    let url = path;
    if (!/^https?:\/\//i.test(path)) {
        // normaliser leading slash
        if (!path.startsWith('/')) path = '/' + path;

        // Si c'est une route API (commence par /api/), préfixer par API_BASE
        if (path.startsWith('/api/')) {
            url = API_BASE.replace(/\/$/, '') + path;
        } else {
            // sinon garder le chemin relatif (ex: assets), dirigé vers le serveur courant (localhost:8080)
            url = path;
        }
    }

      // Detect API request and inject token if present
    const isApiRequest = url.startsWith(API_BASE) || /^https?:\/\/[^/]+\/api\//i.test(url) || url.startsWith('/api/');
    try {
        if (isApiRequest) {
            const token = getToken();
            if (token) {
                headers = Object.assign({}, headers, { Authorization: `Bearer ${token}` });
            }
        }
    } catch (e) { /* noop */ }

    const init = {
        method,
        headers: Object.assign({ 'Accept': 'application/json' }, headers),
        credentials: isApiRequest ? 'include' : credentials,
        keepalive: !!keepalive
    };

    if (body != null) {
        if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
            init.body = JSON.stringify(body);
            init.headers['Content-Type'] = 'application/json';
        } else {
            init.body = body;
        }
    }

  // When keepalive is requested, don't create an AbortController (browser will handle send during unload).
    let controller = null;
    if (!keepalive) {
        controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        if (controller) {
            init.signal = controller.signal;
            setTimeout(() => controller.abort(), timeout);
        }
    }

   let res;
    try {
        res = await fetch(url, init);
    } catch (err) {
        // Enrich error with context to help debugging and allow callers to decide
        const e = new Error('NetworkError when attempting to fetch resource');
        e.cause = err;
        // small hint flags:
        try {
            const causeMsg = String((err && (err.message || err.name)) || '');
            if (/NS_BINDING_ABORTED|aborted|Failed to fetch/i.test(causeMsg)) e.abortedByUnload = true;
        } catch (ee) { /* noop */ }
        throw e;
    }

    const contentType = res.headers.get('content-type') || '';
    let parsed = null;
    if (contentType.includes('application/json')) {
        parsed = await res.json().catch(() => null);
    } else {
        parsed = await res.text().catch(() => null);
    }

   // If unauthorized, clear stored token (fail-safe) so UI can react
    if (res.status === 401) {
        try { clearToken(); } catch (e) { /* noop */ }
    }

    if (!res.ok) {
        const err = new Error(parsed && parsed.message ? parsed.message : `HTTP ${res.status}`);
        err.status = res.status;
        err.response = parsed;
        throw err;
    }

    return parsed;
}

export default class DatabaseService {
    constructor() {
        this.apiBase = getApiBase();
        this._healthChecked = false;
        // Initialize runtime auth flag from stored token to reduce race conditions
        try {
            if (typeof window !== 'undefined') {
                const t = getToken();
                window.__edt_authenticated = !!t && !isTokenExpired();
            }
        } catch (e) { /* noop */ }
    }

    /**
     * open()
     * For REST backend perform a light health-check.
     */
    async open() {
        try {
            // perform health-check but treat 404 (no global data endpoint) as non-fatal
            const res = await this._getGlobalRaw().catch((err) => {
                if (err && err.status === 404) {
                    // backend doesn't expose /global — that's acceptable
                    return null;
                }
                // rethrow other errors so main init can decide what to do
                throw err;
            });
            // mark health-checked even if res is null
            this._healthChecked = true;
            return true;
        } catch (e) {
            console.warn('DatabaseService.open: health-check failed', e && e.message);
            return false;
        }
    }

    /**
     * --- Authentication helpers ---
     */
    async login(username, password) {
        if (!username || !password) throw new Error('username and password required');

        // Primary attempt: POST /api/login
        try {
            const res = await httpRequest('/api/login', { method: 'POST', body: { username, password } });
            if (res && res.token) {
                // if server also returns expiresIn (seconds or ISO), try to store expiry
                if (res.expiresIn) {
                    const n = Number(res.expiresIn);
                    if (!Number.isNaN(n)) {
                        const iso = new Date(Date.now() + n * 1000).toISOString();
                        setToken(res.token, iso);
                    } else {
                        setToken(res.token, String(res.expiresIn));
                    }
                } else {
                    setToken(res.token, null);
                }
                // keep runtime flag in sync immediately to avoid UI races
                try { if (typeof window !== 'undefined') { window.__edt_authenticated = true; window.localStorage && window.localStorage.removeItem && window.localStorage.removeItem('edt_unload_state'); } } catch (e) { /* noop */ }
                return { ok: true, token: res.token, meta: res };
            }
        } catch (err) {
            // If server does not accept POST (405 / "Unsupported method") try GET fallback for legacy/backends.
            const msg = (err && err.message) ? String(err.message) : '';
            const status = err && err.status ? err.status : null;
             console.warn('DatabaseService.login: POST /api/login failed', status, msg);

           const unsupported = status === 405 || /unsupported method/i.test(msg) || /not implemented/i.test(msg);
            if (unsupported) {
                try {
                    const query = `/api/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
                    const res2 = await httpRequest(query, { method: 'GET' });
                    if (res2 && res2.token) {
                        if (res2.expiresIn) {
                            const n2 = Number(res2.expiresIn);
                            if (!Number.isNaN(n2)) {
                                const iso2 = new Date(Date.now() + n2 * 1000).toISOString();
                                setToken(res2.token, iso2);
                            } else {
                                setToken(res2.token, String(res2.expiresIn));
                            }
                        } else {
                            setToken(res2.token, null);
                        }
                        try { if (typeof window !== 'undefined') { window.__edt_authenticated = true; window.localStorage && window.localStorage.removeItem && window.localStorage.removeItem('edt_unload_state'); } } catch (e) { /* noop */ }
                        return { ok: true, token: res2.token, meta: res2 };
                    }
                } catch (err2) {
                    console.warn('DatabaseService.login: GET /api/login fallback also failed', err2 && err2.message);
                }
            }
            // Not a supported-method issue or fallback failed -> fall through to potential dev fallback or rethrow
        }

        // Developer convenience fallback on localhost or explicit flag
        try {
            if (typeof window !== 'undefined' && window.EDT_DEV_ALLOW_FAKE_LOGIN === true) {
                const fakeToken = `dev-mock-token-${Date.now()}`;
                setToken(fakeToken, null); 
                try { window.__edt_authenticated = true; } catch (e) { /* noop */ }
                console.warn('DatabaseService.login: using dev fallback mock token (insecure) — EDT_DEV_ALLOW_FAKE_LOGIN is true');
                return { ok: true, token: fakeToken, meta: { mock: true } };
            }
        } catch (e) { /* noop */ }

        // If we reach here authentication truly failed
        throw new Error('Login failed');
    }

    async logout() {
        try {
            clearToken();
        } catch (e) { /* noop */ }
        // ensure runtime flag cleared (defensive)
        try { if (typeof window !== 'undefined') { window.__edt_authenticated = false; window.localStorage && window.localStorage.removeItem && window.localStorage.removeItem('edt_unload_state'); } } catch (e) { /* noop */ }
        return true;
    }

    isAuthenticated() {
        const t = getToken();
        return !!t && !isTokenExpired();
    }

    getTokenRaw() {
        return getToken();
    }

    // --- StateManager-compatible methods ---

    async load(key) {
        if (!key) return null;
        try {
            if (key === 'global_data') {
                // tolerate missing endpoint: return null if not available
                const res = await this._getGlobalRaw().catch((err) => {
                    if (err && err.status === 404) return null;
                    // If httpRequest threw other error (network), log and return null (don't throw)
                    console.warn('DatabaseService.load: _getGlobalRaw failed', err && (err.message || err.status));
                    return null;
                });
                return (res && (res.data ?? res)) || null;
            }
            if (key === 'last_active_session_name') {
                const res = await this._getGlobalRaw().catch(() => null);
                const global = (res && (res.data ?? res)) || {};
                return (global && global.header && global.header.session) ? global.header.session : null;
            }
            if (key.startsWith('session_')) {
                const name = key.slice('session_'.length);
                const res = await this._getSessionRaw(name).catch((err) => {
                    console.warn('DatabaseService.load: _getSessionRaw failed for', name, err && err.message);
                    return null;
                });
                return (res && (res.data ?? res)) || null;
            }
            const res = await this._getSessionRaw(key).catch((err) => {
                console.warn('DatabaseService.load: _getSessionRaw failed for', key, err && err.message);
                return null;
            });
            return (res && (res.data ?? res)) || null;
        } catch (err) {
            console.warn('DatabaseService.load failed for', key, err && err.message);
            // Return null instead of throwing so StateManager can continue initialization
            return null;
        }
    }

    async save(key, value) {
        if (!key) throw new Error('DatabaseService.save: key required');
        try {
            if (key === 'global_data') {
                await this._postGlobal(value);
                return true;
            }
            if (key === 'last_active_session_name') {
                const current = await this._getGlobalRaw().catch(() => ({}));
                const global = (current && (current.data ?? current)) || {};
                global.header = global.header || {};
                global.header.session = value;
                await this._postGlobal(global);
                return true;
            }
            if (key.startsWith('session_')) {
                const name = key.slice('session_'.length);
                await this._postSessionRaw(name, value);
                return true;
            }
            await this._postSessionRaw(key, value);
            return true;
        } catch (err) {
            console.error('DatabaseService.save error for', key, err && err.message);
        // If we are unloading or the fetch was aborted by navigation, treat it as non-fatal:
        try {
            const unloading = (typeof window !== 'undefined' && !!window.__edt_unloading);
            const causeMsg = String((err && (err.cause && (err.cause.message || err.cause.name))) || (err && err.message) || '');
            const aborted = !!(err && err.abortedByUnload) || /NS_BINDING_ABORTED|aborted|Failed to fetch|NetworkError/i.test(causeMsg);
            if (unloading || aborted) {
                // Log at warn level and return false so callers don't throw
                console.warn('DatabaseService.save: network aborted or page unloading — ignoring remote save error for', key);
                return false;
            }
        } catch (ee) { /* noop */ }
        throw err;
        }
    }

    async clear() {
        try {
            try {
                const res = await httpRequest('/clear', { method: 'DELETE' }).catch(() => null);
                if (res) return true;
            } catch (e) { /* noop */ }

            try {
                const sessionsRes = await httpRequest('/sessions', { method: 'GET' }).catch(() => null);
                const list = (sessionsRes && (sessionsRes.sessions || sessionsRes)) || [];
                if (Array.isArray(list)) {
                    for (const s of list) {
                        const name = typeof s === 'string' ? s : (s.name || null);
                        if (!name) continue;
                        await httpRequest(`/api/session/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => null);
                    }
                }
            } catch (e) {
                console.warn('DatabaseService.clear: session deletion fallback failed', e && e.message);
            }

            try {
                await this._postGlobal({});
            } catch (e) {
                console.warn('DatabaseService.clear: failed to reset global_data', e && e.message);
            }

            return true;
        } catch (err) {
            console.error('DatabaseService.clear failed', err && err.message);
            throw err;
        }
    }

    // Internal helpers
    async _getGlobalRaw() {
        try {
            return await httpRequest('/api/global', { method: 'GET' });
        } catch (err) {
            // Treat 404 / "File not found" as absent endpoint => return null
            if (err && err.status === 404) {
                return null;
            }
            // If error message indicates file not found or similar, be tolerant
            if (err && typeof err.message === 'string' && /file not found/i.test(err.message)) {
                return null;
            }
            // otherwise rethrow so callers can handle or log
            throw err;
        }
    }

    async _postGlobal(data, opts = {}) {
        // opts peut contenir keepalive, timeout, etc.
        return await httpRequest('/api/global', Object.assign({ method: 'POST', body: { data } }, opts));
    }

    async _getSessionRaw(name) {
        if (!name) return null;
        return await httpRequest(`/api/session/${encodeURIComponent(name)}`, { method: 'GET' });
    }

    async _postSessionRaw(name, data) {
        if (!name) throw new Error('_postSessionRaw: name required');
        return await httpRequest(`/api/session/${encodeURIComponent(name)}`, { method: 'POST', body: { data } });
    }
}