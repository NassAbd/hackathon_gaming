import { GRADIUM_ORIGIN } from '../src/services/gradium/region.js';
import { isRecord } from '../src/services/gemini/contracts.js';
import type { VoiceError } from '../src/services/gradium/contracts.js';

export async function createGradiumToken(options: { apiKey?: string; fetcher?: typeof fetch }): Promise<{ token: string; expires_at: string } | { error: VoiceError }> {
  if (!options.apiKey?.trim()) return { error: 'missing_credentials' };
  try {
    const response = await (options.fetcher ?? fetch)(`${GRADIUM_ORIGIN}/api/api-keys/token`, {
      headers: { 'x-api-key': options.apiKey }, signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { error: 'unavailable' };
    try {
      const data: unknown = await response.json();
      if (!isRecord(data) || typeof data.token !== 'string' || !data.token || data.token.length > 8192
        || typeof data.expires_at !== 'string' || !(Date.parse(data.expires_at) > Date.now())) return { error: 'unavailable' };
      return { token: data.token, expires_at: data.expires_at };
    } catch { return { error: 'unavailable' }; }
  } catch (error) { return { error: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network' }; }
}
