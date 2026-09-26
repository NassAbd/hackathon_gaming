import { expect, it, vi } from 'vitest';
import { createGradiumToken } from './gradium';

it('never calls Gradium without a key', async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect(await createGradiumToken({ fetcher })).toEqual({ error: 'missing_credentials' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('requests a single-use token with server-only authentication and returns only required fields', async () => {
  const expires_at = new Date(Date.now() + 60000).toISOString();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ token: 'temporary', expires_at, extra: 'private' }));
  expect(await createGradiumToken({ apiKey: 'test-only', fetcher })).toEqual({ token: 'temporary', expires_at });
  expect(fetcher.mock.calls[0][0]).toBe('https://eu.api.gradium.ai/api/api-keys/token');
  expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'x-api-key': 'test-only' });
});
it('sanitizes upstream/network errors and rejects malformed/expired tokens', async () => {
  for (const response of [Response.json({}), Response.json({ token: 'x', expires_at: '2000-01-01' }), new Response('not json'), new Response('secret', { status: 403 })]) {
    expect(await createGradiumToken({ apiKey: 'test-only', fetcher: async () => response })).toEqual({ error: 'unavailable' });
  }
  expect(await createGradiumToken({ apiKey: 'test-only', fetcher: async () => { throw new Error('private'); } })).toEqual({ error: 'network' });
});
