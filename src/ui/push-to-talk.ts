import type { SpeechCapture } from '../services/gradium/contracts';

export type TalkPhase = 'idle' | 'preparing' | 'listening' | 'processing';
interface TalkAccess {
  allowed(): boolean;
  prepare(signal: AbortSignal): Promise<SpeechCapture>;
  start(capture: SpeechCapture): void;
  commit(): Promise<void>;
  cancel(): void;
  changed(): void;
  failed(error: unknown): void;
}
/** Owns a single held gesture. VoiceSession continues to own move/time validation. */
export class PushToTalk {
  phase: TalkPhase = 'idle';
  private operation: AbortController | null = null;
  constructor(private readonly access: TalkAccess) {}
  async press(): Promise<void> {
    if (this.phase !== 'idle' || !this.access.allowed()) return;
    const operation = new AbortController();
    this.operation = operation;
    this.phase = 'preparing'; this.access.changed();
    try {
      const capture = await this.access.prepare(operation.signal);
      if (this.operation !== operation) { capture.cancel(); return; }
      if (!this.access.allowed()) { capture.cancel(); this.cancel(); return; }
      this.phase = 'listening';
      this.access.start(capture);
      this.access.changed();
    } catch (error) {
      if (this.operation !== operation) return;
      this.cancel(); this.access.failed(error);
    }
  }
  async release(): Promise<void> {
    if (this.phase === 'preparing') { this.cancel(); return; }
    if (this.phase !== 'listening') return;
    const operation = this.operation;
    this.phase = 'processing';
    // commit captures the clock synchronously at release, before any remote await.
    const completion = this.access.commit();
    this.access.changed();
    try { await completion; }
    finally { if (this.operation === operation) { this.reset(); this.access.changed(); } }
  }
  /** Invalidate gesture ownership when the existing game cancels/ends a round. */
  reset(): void { this.operation?.abort(); this.operation = null; this.phase = 'idle'; }
  cancel(): void { this.reset(); this.access.cancel(); this.access.changed(); }
}
