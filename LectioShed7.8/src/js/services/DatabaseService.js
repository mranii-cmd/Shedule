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

/**
 * Low-level fetch with timeout, JSON parsing, and Authorization injection.
 */
async function httpRequest(path, { method = 'GET', body = null, headers = {}, timeout = DEFAULT_TIMEOUT_MS, credentials = 'same-origin' } = {}) {
    const API_BASE = getApiBase();
    const url = path.startsWith('http://') || path.startsWith('https://') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const id = controller ? setTimeout(() => controller.abort(), timeout) : null;

    const opts = {
        method,
        headers: Object.assign({ 'Accept': 'application/json' }, headers),
        credentials
    };

    if (body != null) {
        if (typeof body === 'string') {
            opts.body = body;
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
        } else {
            opts.body = JSON.stringify(body);
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
        }
    }

    // Attach Authorization header if token present and not expired
    try {
        const token = getToken();
        if (token && !isTokenExpired()) {
            opts.headers['Authorization'] = `Bearer ${token}`;
        } else if (token && isTokenExpired()) {
            // clear expired token proactively
            clearToken();
        }
    } catch (e) { /* noop */ }

    if (controller) opts.signal = controller.signal;

    let resp;
    try {
        resp = await fetch(url, opts);
    } catch (err) {
        if (err && err.name === 'AbortError') {
            const e = new Error(`Timeout after ${timeout}ms for ${method} ${url}`);
            e.status = 0;
            throw e;
        }
        throw err;
    } finally {
        if (id) clearTimeout(id);
    }

    const text = await resp.text().catch(() => null);
    let parsed = null;
    if (text) {
        try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
    }

    // Handle unauthorized globally: clear token and surface a 401 error
    if (!resp.ok) {
        if (resp.status === 401) {
            try { clearToken(); } catch (e) { /* noop */ }
            try { if (typeof window !== 'undefined') window.__edt_authenticated = false; } catch (e) { /* noop */ }
        }
        const message = (parsed && parsed.error) ? parsed.error : resp.statusText || `HTTP ${resp.status}`;
        const err = new Error(`Request failed ${method} ${url}: ${message}`);
        err.status = resp.status;
        err.response = parsed;
        throw err;
    }

    // Normalize: if server returns { ok: true, data: ... } prefer returning that whole payload
    if (parsed && typeof parsed === 'object' && ('ok' in parsed || 'data' in parsed)) {
        return parsed;
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

        // Primary attempt: POST /login
        try {
            const res = await httpRequest('/login', { method: 'POST', body: { username, password } });
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
            console.warn('DatabaseService.login: POST /login failed', status, msg);

            const unsupported = status === 405 || /unsupported method/i.test(msg) || /not implemented/i.test(msg);
            if (unsupported) {
                try {
                    const query = `/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
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
                    console.warn('DatabaseService.login: GET /login fallback also failed', err2 && err2.message);
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
                        await httpRequest(`/session/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => null);
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
            return await httpRequest('/global', { method: 'GET' });
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

    async _postGlobal(data) {
        return await httpRequest('/global', { method: 'POST', body: { data } });
    }

    async _getSessionRaw(name) {
        if (!name) return null;
        return await httpRequest(`/session/${encodeURIComponent(name)}`, { method: 'GET' });
    }

    async _postSessionRaw(name, data) {
        if (!name) throw new Error('_postSessionRaw: name required');
        return await httpRequest(`/session/${encodeURIComponent(name)}`, { method: 'POST', body: { data } });
    }
}