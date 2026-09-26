import { afterEach, expect, it, vi } from 'vitest';
import intent from '../api/intent';
import gradium from '../api/gradium-token';
import { handleApi } from './api';
vi.mock('./api', () => ({ handleApi: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each([['intent', intent], ['gradium-token', gradium]] as const)('forwards %s requests and only the four server bindings unchanged', async (path, route) => {
  vi.stubEnv('GEMINI_API_KEY', 'test-gemini');
  vi.stubEnv('GRADIUM_API_KEY', 'test-gradium');
  vi.stubEnv('GEMINI_MODEL', 'gemini-test');
  vi.stubEnv('ALLOWED_ORIGINS', 'https://verified.example');
  vi.stubEnv('UNRELATED_SECRET', 'not-forwarded');
  for (const method of ['POST', 'OPTIONS']) {
    const request = new Request(`https://api.example/api/${path}`, { method });
    const response = new Response(null, { status: 204 });
    vi.mocked(handleApi).mockResolvedValueOnce(response);
    expect(await route.fetch(request)).toBe(response);
    expect(handleApi).toHaveBeenLastCalledWith(request, {
      GEMINI_API_KEY: 'test-gemini', GRADIUM_API_KEY: 'test-gradium',
      GEMINI_MODEL: 'gemini-test', ALLOWED_ORIGINS: 'https://verified.example',
    });
  }
});
