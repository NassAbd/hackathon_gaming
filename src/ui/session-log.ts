import { Chess } from 'chess.js';
import type { Candidate, GameState } from '../contracts';
import type { VoiceTelemetry } from '../services/gradium/contracts';
import type { MicDiagnostics } from '../services/gradium/diagnostics';
import { PUZZLES } from '../puzzles';
import type { AttemptResult, Completion } from '../services/gradium/contracts';
const empty = (): VoiceTelemetry => ({ speechStart: null, speechCommitted: null, transcriptAvailable: null, intentRequestStart: null, intentResolved: null, validationComplete: null, moveCommitted: null, remainingMs: null });
const duration = (a: number | null, b: number | null) => a === null || b === null ? null : b - a;
export class SessionLog {
  readonly sessionStart = new Date().toISOString();
  readonly attempts: Array<{
    index: number; startedAt: string; endedAt: string | null; run: number; round: number; retry: number;
    puzzle: { id: string; name: string; fen: string }; transcript: string; finalTranscript: string | null;
    proposal: Candidate | null; resolverStatus: string | null; validation: string | null; san: string | null;
    result: AttemptResult | null; errorCode: string | null; telemetry: VoiceTelemetry;
    gradium: ReturnType<SessionLog['diagnostics']> | null;
  }> = [];
  constructor(private readonly runtime: { userAgent: string; language: string; viewport: string; appVersion: string }) {}
  begin(state: GameState, run: number, round: number, retry: number): number {
    const puzzle = PUZZLES[state.puzzleIndex];
    this.attempts.push({ index: this.attempts.length + 1, startedAt: new Date().toISOString(), endedAt: null, run, round, retry,
      puzzle: { id: puzzle.id, name: puzzle.title, fen: state.fen }, transcript: '', finalTranscript: null,
      proposal: null, resolverStatus: null, validation: null, san: null, result: null, errorCode: null, telemetry: empty(), gradium: null });
    return this.attempts.length;
  }
  // Deliberately select fields. Never serialize capture/socket objects, URLs, errors or arbitrary payloads.
  private diagnostics(d: MicDiagnostics) {
    return { audio: { trackSettings: { sampleRate: d.trackSettings.sampleRate, sampleSize: d.trackSettings.sampleSize,
      channelCount: d.trackSettings.channelCount, echoCancellation: d.trackSettings.echoCancellation,
      noiseSuppression: d.trackSettings.noiseSuppression, autoGainControl: d.trackSettings.autoGainControl },
      contextRate: d.contextRate, workletRate: d.workletRate, workletChannels: d.workletChannels,
      inputFormat: d.inputFormat, providerRate: d.providerRate, receivedFrames: d.receivedFrames,
      discontinuities: d.discontinuities, peak: d.peak, clippedSamples: d.clippedSamples }, permission: d.permission, streamActive: d.streamActive, context: d.context,
      tracks: d.tracks.map(t => ({ readyState: t.readyState, enabled: t.enabled, muted: t.muted })),
      worklet: d.worklet, processCalls: d.processCalls, inputFrames: d.inputFrames, rms: d.rms,
      socket: d.socket, ready: d.ready, sentChunks: d.sentChunks, sentFrames: d.sentFrames, messages: d.messages };
  }
  update(id: number, transcript: string, telemetry: VoiceTelemetry, diagnostic: MicDiagnostics): void {
    const entry = this.attempts[id - 1]; if (!entry || entry.endedAt) return;
    entry.transcript = transcript || diagnostic.transcript;
    if (telemetry.transcriptAvailable !== null) entry.finalTranscript = transcript;
    entry.telemetry = Object.fromEntries(Object.keys(empty()).map(key => [key, telemetry[key as keyof VoiceTelemetry]])) as unknown as VoiceTelemetry;
    entry.gradium = this.diagnostics(diagnostic);
  }
  finish(id: number, outcome: Completion, diagnostic: MicDiagnostics): void {
    const entry = this.attempts[id - 1]; if (!entry || entry.endedAt) return;
    entry.gradium = this.diagnostics(diagnostic);
    entry.transcript ||= diagnostic.transcript;
    entry.result = outcome.result; entry.resolverStatus = outcome.resolverStatus ?? null;
    entry.errorCode = outcome.errorCode ?? null;
    if (outcome.proposal) {
      const p = outcome.proposal;
      entry.proposal = { from: p.from, to: p.to, ...(p.promotion ? { promotion: p.promotion } : {}) };
    }
    entry.validation = ['mate', 'legal_non_mate'].includes(outcome.result) ? 'legal' : outcome.result === 'illegal' ? 'rejected' : null;
    if (entry.validation === 'legal' && entry.proposal) {
      try { entry.san = new Chess(entry.puzzle.fen).move(entry.proposal).san; } catch { /* No invented SAN. */ }
    }
    entry.endedAt = new Date().toISOString();
  }
  export(): string {
    return JSON.stringify({ schemaVersion: 1, sessionStart: this.sessionStart,
      runtime: { appVersion: this.runtime.appVersion, userAgent: this.runtime.userAgent, language: this.runtime.language, viewport: this.runtime.viewport },
      attempts: this.attempts.map(a => ({ ...a, durationsMs: {
        speech: duration(a.telemetry.speechStart, a.telemetry.speechCommitted),
        finalTranscriptionWait: duration(a.telemetry.speechCommitted, a.telemetry.transcriptAvailable),
        intent: duration(a.telemetry.intentRequestStart, a.telemetry.intentResolved),
        validation: duration(a.telemetry.intentResolved, a.telemetry.validationComplete),
        commitToMove: duration(a.telemetry.speechCommitted, a.telemetry.moveCommitted),
      } })) }, null, 2);
  }
}
