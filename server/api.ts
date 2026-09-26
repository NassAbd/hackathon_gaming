import { handleIntent } from './intent-api.js';
import { createGradiumToken } from './gradium.js';

/** Provider wrapper supplies secret bindings; no process state or Node server required. */
export interface ApiEnvironment {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GRADIUM_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
}
export async function handleApi(request: Request, env: ApiEnvironment, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; } catch { return false; }
  });
  const headers = new Headers({ 'cache-control': 'no-store', vary: 'Origin' });
  const error = (status: number) => Response.json({ status: 'error', code: 'unavailable', error: 'unavailable' }, { status, headers });
  if (!origin || !allowed.includes(origin)) return error(403);
  headers.set('access-control-allow-origin', origin);
  const path = new URL(request.url).pathname;
  if (path !== '/api/intent' && path !== '/api/gradium-token') return error(404);
  if (request.method === 'OPTIONS') {
    const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
    if (request.headers.get('access-control-request-method') !== 'POST' || requestedHeaders.some(value => value !== 'content-type')) return error(403);
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'Content-Type');
    headers.set('access-control-max-age', '600');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') return error(405);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return error(415);
  // Enforce a streaming byte cap, including requests without Content-Length.
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    if (reader) while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { void reader.cancel(); return error(413); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let response: Response;
    if (path === '/api/intent') {
      response = await handleIntent(new Request(request.url, { method: 'POST', headers: request.headers, body }), {
        apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, fetcher, allowedOrigins: allowed,
      });
    } else {
      const parsed: unknown = JSON.parse(body);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length) return error(400);
      response = Response.json(await createGradiumToken({ apiKey: env.GRADIUM_API_KEY, fetcher }));
    }
    for (const [key, value] of headers) response.headers.set(key, value);
    return response;
  } catch { return error(400); }
  finally { reader?.releaseLock(); }
}
