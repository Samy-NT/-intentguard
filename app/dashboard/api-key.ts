const STORAGE_KEY = "intentguard.apiKey";

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
}

export function storeApiKey(apiKey: string): void {
  if (typeof window === "undefined") return;
  const trimmed = apiKey.trim();
  if (trimmed) window.sessionStorage.setItem(STORAGE_KEY, trimmed);
  else window.sessionStorage.removeItem(STORAGE_KEY);
}

export function apiKeyHeaders(apiKey: string): HeadersInit {
  const trimmed = apiKey.trim();
  return trimmed ? { "x-api-key": trimmed } : {};
}
