import { expect, it, vi } from 'vitest';
import { handleApi } from './api';
import { PUZZLES } from '../src/puzzles';
const origin = 'https://html-classic.itch.zone';
const env = { ALLOWED_ORIGINS: origin };
function request(path = '/api/intent', method = 'POST', source = origin, body = JSON.stringify({ fen: PUZZLES[0].fen, utterance: 'rook to a8' })) {
  return new Request(`https://api.example${path}`, { method, headers: { origin: source, 'content-type': 'application/json', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }, ...(method === 'POST' ? { body } : {}) });
}
it('serves exact-origin preflight without provider calls', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const response = await handleApi(request('/api/intent', 'OPTIONS'), env, fetcher);
  expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  expect(response.headers.has('access-control-allow-credentials')).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it('fails closed for empty, wildcard, null, missing, or unlisted origins', async () => {
  for (const source of ['null', '', 'https://evil.example', `${origin}.evil.example`]) {
    expect((await handleApi(request('/api/intent', 'POST', source), env)).status).toBe(403);
  }
  expect((await handleApi(request(), {})).status).toBe(403);
  expect((await handleApi(request(), { ALLOWED_ORIGINS: '*' })).status).toBe(403);
});
it('routes both adapters and applies no-store/CORS to failures', async () => {
  const intent = await handleApi(request(), env);
  expect(await intent.json()).toEqual({ status: 'error', code: 'missing_credentials' });
  const token = await handleApi(request('/api/gradium-token', 'POST', origin, '{}'), env);
  expect(await token.json()).toEqual({ error: 'missing_credentials' });
  expect(token.headers.get('cache-control')).toBe('no-store');
  expect(token.headers.get('vary')).toBe('Origin');
  expect(token.headers.get('access-control-allow-origin')).toBe(origin);
});
it('bounds requests and rejects unsupported paths, methods and token bodies', async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect((await handleApi(request('/unknown'), env, fetcher)).status).toBe(404);
  expect((await handleApi(request('/api/intent', 'GET'), env, fetcher)).status).toBe(405);
  expect((await handleApi(request('/api/gradium-token', 'POST', origin, '{"key":"x"}'), env, fetcher)).status).toBe(400);
  expect((await handleApi(request('/api/intent', 'POST', origin, 'x'.repeat(4097)), env, fetcher)).status).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});
it('forwards validated intent using only server credentials', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ status: 'resolved', from: 'a1', to: 'a8', promotion: null }) }] } }] }));
  const result = await handleApi(request(), { ...env, GEMINI_API_KEY: 'fixture-key' }, fetcher);
  expect(await result.json()).toEqual({ status: 'resolved', candidate: { from: 'a1', to: 'a8' } });
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': 'fixture-key' });
});
