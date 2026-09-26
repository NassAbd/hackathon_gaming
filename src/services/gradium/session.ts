import { microphoneDiagnostics } from './diagnostics';
import type { GameState } from '../../contracts';
import { submitMove } from '../../game';
import type { Resolver } from '../gemini/session';
import { INTENT_MESSAGES } from '../gemini/contracts';
import type { SpeechCapture, VoiceTelemetry } from './contracts';
import { VoiceFailure, voiceFailure } from './contracts';

interface Access {
  getState: () => GameState;
  setState: (state: GameState) => void;
  now: () => number;
  resolve: Resolver;
  inspect: (message: string, transcript: string, telemetry: VoiceTelemetry, proposal?: unknown) => void;
  changed?: () => void;
}
const emptyTelemetry = (): VoiceTelemetry => ({ speechStart: null, speechCommitted: null, transcriptAvailable: null, intentRequestStart: null, intentResolved: null, validationComplete: null, moveCommitted: null, remainingMs: null });

export class VoiceSession {
  private capture: SpeechCapture | null = null;
  private controller: AbortController | null = null;
  private snapshot: GameState | null = null;
  private held: GameState | null = null;
  telemetry = emptyTelemetry();
  constructor(private readonly access: Access) {}
  get listening(): boolean { return this.capture !== null && this.controller === null; }
  get pending(): boolean { return this.controller !== null; }
  get remainingMs(): number | null { return this.held ? this.telemetry.remainingMs : null; }
  private report(message: string, transcript = '', proposal?: unknown): void {
    this.access.inspect(message, transcript, { ...this.telemetry }, proposal);
  }
  listen(capture: SpeechCapture): void {
    this.cancel();
    const state = this.access.getState();
    if (state.phase !== 'playing' || state.deadline === null || this.access.now() >= state.deadline) { capture.cancel(); return; }
    microphoneDiagnostics.event('VoiceSession retains capture; round listening');
    this.snapshot = state;
    this.capture = capture;
    this.telemetry = emptyTelemetry();
    capture.start(() => {
      if (this.capture === capture && !this.pending && this.telemetry.speechStart === null) {
        this.telemetry.speechStart = this.access.now();
        this.report('Speech detected locally. Press Send speech before time runs out.');
      }
    });
    this.report('Listening with Gradium. Press Send speech when finished.');
  }
  cancel(): void {
    if (this.capture || this.controller) microphoneDiagnostics.event('VoiceSession.cancel(): abort intent and release capture');
    this.controller?.abort(); this.controller = null;
    this.capture?.cancel(); this.capture = null;
    this.resume(); this.snapshot = null;
  }
  private resume(now = this.access.now()): void {
    if (this.held && this.access.getState() === this.held) {
      this.access.setState({ ...this.held, deadline: now + (this.telemetry.remainingMs ?? 0) });
    }
    this.held = null;
  }
  async commit(): Promise<void> {
    if (!this.capture || this.pending) return;
    const state = this.access.getState();
    const now = this.access.now();
    if (state.phase !== 'playing' || state.deadline === null || now >= state.deadline || state.fen !== this.snapshot?.fen || state.deadline !== this.snapshot.deadline) {
      this.cancel(); this.report('Speech was not committed before the round deadline.'); return;
    }
    if (this.telemetry.speechStart === null) { this.cancel(); this.report(new VoiceFailure('empty').message); return; }
    const capture = this.capture;
    const controller = new AbortController(); this.controller = controller;
    this.telemetry.speechCommitted = now;
    this.telemetry.remainingMs = state.deadline - now;
    // Null deadline is a bounded processing reservation, not a new chess state.
    this.held = { ...state, deadline: null };
    this.access.setState(this.held);
    this.report('Speech committed. Remaining game time is held during processing.');
    const current = () => this.controller === controller && this.held !== null && this.access.getState() === this.held;
    let transcript = '';
    try {
      transcript = (await capture.finish()).trim();
      if (!current()) return;
      microphoneDiagnostics.event('Final transcript delivered to VoiceSession');
      this.telemetry.transcriptAvailable = this.access.now();
      if (!transcript || transcript.length > 300) throw new VoiceFailure('empty');
      this.telemetry.intentRequestStart = this.access.now();
      this.report('Transcript ready. Resolving with Gemini…', transcript);
      microphoneDiagnostics.event('Existing intent resolver requested');
      const result = await this.access.resolve({ utterance: transcript, fen: state.fen }, controller.signal);
      if (!current()) return;
      const resolvedAt = this.access.now();
      this.telemetry.intentResolved = resolvedAt;
      this.resume(resolvedAt);
      if (result.status === 'resolved') {
        const before = this.access.getState();
        const next = submitMove(before, result.candidate, resolvedAt);
        this.telemetry.validationComplete = this.access.now();
        this.access.setState(next);
        if (next.fen !== before.fen) this.telemetry.moveCommitted = this.access.now();
        this.report(next.feedback, transcript, result.candidate);
      } else this.report(INTENT_MESSAGES[result.status === 'unresolved' ? 'unresolved' : result.code], transcript);
    } catch (error) {
      if (current()) { this.resume(); this.report(voiceFailure(error).message, transcript); }
    } finally {
      if (this.controller === controller) {
        this.controller = null; this.capture?.cancel(); this.capture = null; this.held = null;
        this.access.changed?.();
      }
    }
  }
}
