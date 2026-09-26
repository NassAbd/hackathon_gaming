import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleIntent } from './intent-api';
import type { GeminiOptions } from './gemini';

/** Local-only development/preview adapter. Never imported by browser code. */
export function intentPlugin(options: GeminiOptions): Plugin {
  let active = 0;
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/intent') return next();
    const sendError = (status: number) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'error', code: 'unavailable' }));
    };
    if (active >= 4) return sendError(429);
    active++;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        size += buffer.length;
        if (size > 4096) { sendError(413); return; }
        chunks.push(buffer);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
      }
      const request = new Request(`http://${req.headers.host}/api/intent`, {
        method: req.method, headers,
        ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Buffer.concat(chunks).toString('utf8') }),
      });
      const response = await handleIntent(request, options);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch { if (!res.headersSent) sendError(400); else res.end(); }
    finally { active--; }
  };
  return {
    name: 'soniccheck-intent',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
