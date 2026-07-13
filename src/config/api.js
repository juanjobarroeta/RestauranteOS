// HTTP layer against the contabilidad-os hub. RestauranteOS has no backend of
// its own — every call goes to the hub with a bearer JWT from /api/auth/token.
// Pattern per docs/INTEGRATION-GUIDE-SATELLITE-APPS.md in contabilidad-os.

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  'http://localhost:3000'

const TOKEN_KEY = 'restauranteos.token'

export const tokenStorage = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* noop */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ } },
}

export const api = (endpoint) => {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${API_URL}${clean}`
}

export async function apiFetch(path, opts = {}) {
  const { method = 'GET', body, headers = {}, skipAuth = false } = opts
  const finalHeaders = { Accept: 'application/json', ...headers }
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json'
  if (!skipAuth) {
    const token = tokenStorage.get()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  const res = await fetch(api(path), {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let data = null
  const text = await res.text()
  if (text) { try { data = JSON.parse(text) } catch { data = text } }

  if (!res.ok) {
    if (res.status === 401 && !skipAuth) {
      tokenStorage.clear()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      (data && data.error && JSON.stringify(data.error)) ||
      `Request failed: ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}
