import type { Candidate } from '../../contracts';

export interface IntentRequest { utterance: string; fen: string }
export type IntentError = 'missing_credentials' | 'invalid_request' | 'network' | 'timeout' | 'upstream' | 'malformed' | 'illegal' | 'unavailable';
export type IntentResult =
  | { status: 'resolved'; candidate: Candidate }
  | { status: 'unresolved' }
  | { status: 'error'; code: IntentError };

export const INTENT_MESSAGES: Record<IntentError | 'unresolved', string> = {
  missing_credentials: 'Gemini is not configured. Set GEMINI_API_KEY on the server; click and coordinate controls still work.',
  invalid_request: 'Enter a description of 1–300 characters for the current position.',
  network: 'Could not reach the intent service. Try again or use the fallback controls.',
  timeout: 'Gemini took too long. No AI move was applied.',
  upstream: 'Gemini rejected the request or is unavailable. Check server credentials, model access, and quota.',
  malformed: 'Gemini returned an invalid response. No move was applied.',
  illegal: 'Gemini proposed an illegal move. The board is unchanged.',
  unavailable: 'Intent endpoint unavailable. Run the local Vite server or preview with the server adapter.',
  unresolved: 'The intent is ambiguous or could not be resolved. Be more specific.',
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Strict structured-output parser. No SAN, markdown recovery, or guessed defaults. */
export function parseProposal(value: unknown): IntentResult {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'from,promotion,status,to') return { status: 'error', code: 'malformed' };
  if (value.status === 'unresolved' && value.from === null && value.to === null && value.promotion === null) return { status: 'unresolved' };
  if (value.status !== 'resolved' || typeof value.from !== 'string' || !/^[a-h][1-8]$/.test(value.from)
    || typeof value.to !== 'string' || !/^[a-h][1-8]$/.test(value.to)
    || (value.promotion !== null && (typeof value.promotion !== 'string' || !/^[qrbn]$/.test(value.promotion)))) return { status: 'error', code: 'malformed' };
  return { status: 'resolved', candidate: { from: value.from, to: value.to, ...(value.promotion === null ? {} : { promotion: value.promotion }) } };
}
