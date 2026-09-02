export const SESSION_AUTH_VALUE = "__aurel_dashboard_session__";
const STORAGE_KEY = "intentguard.apiKey";
const CSRF_STORAGE_KEY = "intentguard.csrfToken";

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(STORAGE_KEY) ?? SESSION_AUTH_VALUE;
}

export function storeApiKey(apiKey: string): void {
  if (typeof window === "undefined") return;
  const trimmed = apiKey.trim();
  if (trimmed) {
    window.sessionStorage.setItem(STORAGE_KEY, trimmed);
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

export function storeSessionAuth(csrfToken: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, SESSION_AUTH_VALUE);
  window.sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
}

export function apiKeyHeaders(apiKey: string): HeadersInit {
  const trimmed = apiKey.trim();
  if (trimmed === SESSION_AUTH_VALUE) {
    const csrfToken = typeof window === "undefined" ? "" : window.sessionStorage.getItem(CSRF_STORAGE_KEY) ?? "";
    return csrfToken ? { "x-aurel-csrf": csrfToken } : {};
  }
  return trimmed ? { "x-api-key": trimmed } : {};
}
