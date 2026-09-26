import { INTENT_MESSAGES, isRecord, parseProposal } from './contracts';
import type { IntentError, IntentRequest, IntentResult } from './contracts';

export async function requestIntent(request: IntentRequest, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<IntentResult> {
  try {
    const response = await fetcher('./api/intent', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request), signal: AbortSignal.any([signal, AbortSignal.timeout(4500)]),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return { status: 'error', code: 'unavailable' };
    const data: unknown = await response.json();
    if (!isRecord(data)) return { status: 'error', code: 'malformed' };
    if (data.status === 'unresolved') return { status: 'unresolved' };
    if (data.status === 'error' && typeof data.code === 'string' && Object.hasOwn(INTENT_MESSAGES, data.code) && data.code !== 'unresolved') return { status: 'error', code: data.code as IntentError };
    if (data.status === 'resolved' && isRecord(data.candidate)) {
      const candidate = data.candidate;
      if (Object.keys(candidate).some(key => !['from', 'to', 'promotion'].includes(key))) return { status: 'error', code: 'malformed' };
      return parseProposal({ status: 'resolved', from: candidate.from, to: candidate.to, promotion: candidate.promotion ?? null });
    }
    return { status: 'error', code: 'malformed' };
  } catch (error) {
    return { status: 'error', code: error instanceof SyntaxError ? 'malformed' : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}
