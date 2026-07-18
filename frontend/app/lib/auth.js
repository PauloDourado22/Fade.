const TOKEN_KEY = 'barbershop:token';

// Small wrapper around localStorage so every component reads/writes the
// token the same way — and so there's one place to change if this ever
// moves to an httpOnly cookie (see backend/src/middleware/auth.js for the
// trade-off note).
export const auth = {
  saveToken(token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  getToken() {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  clearToken() {
    window.localStorage.removeItem(TOKEN_KEY);
  },
};
