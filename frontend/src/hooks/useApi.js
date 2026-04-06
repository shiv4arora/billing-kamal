// In-memory token store (survives re-renders, lost on tab close)
let _token = null;
// Cached availability: null = not yet checked, true/false = known
let _apiAvailable = null;

export function setToken(t) { _token = t; }
export function getToken() { return _token; }
export function clearToken() { _token = null; }

const BASE = import.meta.env.VITE_API_BASE || '';

/** Returns true if the backend is reachable (cached after first check). */
export async function checkApiAvailable() {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    _apiAvailable = res.ok;
  } catch {
    _apiAvailable = false;
  }
  return _apiAvailable;
}

export function isApiAvailable() { return _apiAvailable; }
export function setApiAvailable(v) { _apiAvailable = v; }

export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(`${BASE}/api${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
