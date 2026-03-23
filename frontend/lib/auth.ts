export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1";

export const TOKEN_STORAGE_KEY = "chronify_token";
export const USER_STORAGE_KEY = "chronify_user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}

export function storeUser(user: { id: string; name: string; email: string }) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function getStoredUser(): { id: string; name: string; email: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

