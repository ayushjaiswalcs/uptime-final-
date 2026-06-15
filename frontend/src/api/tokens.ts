// Centralized token storage. "Remember me" decides whether tokens persist
// across browser restarts (localStorage) or only for the session (sessionStorage).
// We always read from both so a refreshed access token can be located regardless.

const ACCESS = 'access_token'
const REFRESH = 'refresh_token'

function read(key: string): string | null {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key)
}

export const tokens = {
  get access() {
    return read(ACCESS)
  },
  get refresh() {
    return read(REFRESH)
  },

  save(access: string, refresh: string, remember: boolean) {
    this.clear()
    const store = remember ? localStorage : sessionStorage
    store.setItem(ACCESS, access)
    store.setItem(REFRESH, refresh)
  },

  // Used when the interceptor refreshes the access token — keep it in whichever
  // store currently holds the refresh token.
  setAccess(access: string) {
    const store = localStorage.getItem(REFRESH) ? localStorage : sessionStorage
    store.setItem(ACCESS, access)
  },

  clear() {
    ;[localStorage, sessionStorage].forEach((s) => {
      s.removeItem(ACCESS)
      s.removeItem(REFRESH)
    })
  },
}
