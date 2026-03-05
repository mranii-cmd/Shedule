// services/api.js
// Utilitaire centralisé pour appeler l'API (ES module)

const DEFAULT_BASE = 'http://localhost:4000';
const TOKEN_KEY = 'EDT_API_TOKEN';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
export function setToken(token) {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
}
export function removeToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

/**
 * apiFetch(path, options)
 * - path: '/api/...' (sera préfixé par BASE)
 * - options: { method, headers, body, credentials, timeoutMs }
 *   body: objet JS (sera JSON.stringify) ou FormData (laisser tel quel)
 */
export async function apiFetch(path, options = {}) {
  const { method = 'GET', headers = {}, body, credentials, timeoutMs } = options;

  // Normalize base and path to avoid duplicate "/api" segments.
  const rawBase = window.EDT_API_BASE || DEFAULT_BASE;
  const base = String(rawBase).replace(/\/+$/, ''); // remove trailing slash(es)

  let p = String(path || '');
  // If base ends with '/api' and path starts with '/api', drop the leading '/api' from the path.
  if (base.endsWith('/api') && p.startsWith('/api')) {
    p = p.replace(/^\/api/, '');
  }
  const url = base + (p.startsWith('/') ? p : '/' + p);

  const token = getToken();

  const hdrs = new Headers(headers);
  // Si body est un objet JS (pas FormData), envoyer JSON
  const isForm = (typeof FormData !== 'undefined') && (body instanceof FormData);
  if (!isForm && body !== undefined && !hdrs.has('Content-Type')) {
    hdrs.set('Content-Type', 'application/json');
  }
  if (token && !hdrs.has('Authorization')) {
    hdrs.set('Authorization', 'Bearer ' + token);
  }

  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  if (timeoutMs && controller) {
    setTimeout(() => controller.abort(), timeoutMs);
  }

  const init = {
    method,
    headers: hdrs,
    signal,
  };
  if (credentials) init.credentials = credentials;
  if (body !== undefined) init.body = isForm ? body : JSON.stringify(body);

  const res = await fetch(url, init);

  // 204 No Content
  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const data = contentType.includes('application/json') && text ? JSON.parse(text) : text;

  if (!res.ok) {
    const err = new Error((data && data.error) ? data.error : `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// Quelques helpers pratiques
export const api = {
  fetch: apiFetch,
  get: (path, opts = {}) => apiFetch(path, Object.assign({}, opts, { method: 'GET' })),
  post: (path, body, opts = {}) => apiFetch(path, Object.assign({}, opts, { method: 'POST', body })),
  put: (path, body, opts = {}) => apiFetch(path, Object.assign({}, opts, { method: 'PUT', body })),
  del: (path, opts = {}) => apiFetch(path, Object.assign({}, opts, { method: 'DELETE' })),
  getToken,
  setToken,
  removeToken
};

export default api;