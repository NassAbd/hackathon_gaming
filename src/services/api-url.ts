/// <reference types="vite/client" />
/** Public routing only. Never put credentials in this URL or any VITE_ variable. */
export function apiUrl(endpoint: 'intent' | 'gradium-token', base = import.meta.env.VITE_API_BASE_URL ?? ''): string {
  if (!base.trim()) return `./api/${endpoint}`;
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || /^(localhost|127\.|\[::1\])/.test(url.hostname)) throw new Error('API base must be a public HTTPS URL without credentials, query or fragment.');
  return `${url.href.replace(/\/$/, '')}/${endpoint}`;
}
