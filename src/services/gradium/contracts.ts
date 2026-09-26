export type VoiceError = 'missing_credentials' | 'permission' | 'no_microphone' | 'unsupported' | 'network' | 'unavailable' | 'timeout' | 'empty' | 'malformed' | 'cancelled';
export const VOICE_MESSAGES: Record<VoiceError, string> = {
  missing_credentials: 'Gradium is not configured. Set GRADIUM_API_KEY on the server and restart.',
  permission: 'Microphone permission denied. Allow it in browser settings or use typed input.',
  no_microphone: 'No usable microphone was found. Connect one or use typed input.',
  unsupported: 'Microphone capture requires HTTPS (or localhost), AudioWorklet, and microphone permission in the iframe.',
  network: 'Speech connection failed. No voice move was applied; typed input is available.',
  unavailable: 'Gradium is unavailable. Check the server configuration or use typed input.',
  timeout: 'Speech processing timed out. No voice move was applied.',
  empty: 'No speech was captured or transcribed. Try again or type your move.',
  malformed: 'Invalid speech response. No voice move was applied.',
  cancelled: 'Voice cancelled. Typed and coordinate controls remain available.',
};
export class VoiceFailure extends Error {
  constructor(readonly code: VoiceError) { super(VOICE_MESSAGES[code]); }
}
export function voiceFailure(error: unknown): VoiceFailure {
  if (error instanceof VoiceFailure) return error;
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return new VoiceFailure('permission');
    if (['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(error.name)) return new VoiceFailure('no_microphone');
    if (error.name === 'TimeoutError') return new VoiceFailure('timeout');
  }
  return new VoiceFailure('network');
}
export interface SpeechCapture {
  start(onSpeech: () => void): void;
  finish(): Promise<string>;
  cancel(): void;
}
export interface VoiceTelemetry {
  speechStart: number | null;
  speechCommitted: number | null;
  transcriptAvailable: number | null;
  intentRequestStart: number | null;
  intentResolved: number | null;
  validationComplete: number | null;
  moveCommitted: number | null;
  remainingMs: number | null;
}

export type AttemptResult = 'mate' | 'legal_non_mate' | 'unresolved' | 'timeout' | 'cancelled' | 'provider_failure' | 'empty' | 'illegal';
export interface Completion {
  result: AttemptResult;
  resolverStatus?: 'resolved' | 'unresolved' | 'error';
  proposal?: import('../../contracts').Candidate;
  errorCode?: string;
}
