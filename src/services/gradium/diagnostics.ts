/** Measured browser diagnostics. Never pass tokens, socket URLs, or raw provider bodies. */
export class MicDiagnostics {
  readonly startedAt = performance.now();
  permission = 'not requested';
  streamId = 'none';
  streamActive: boolean | null = null;
  reference = 'none';
  tracks: { id: string; readyState: string; enabled: boolean; muted: boolean }[] = [];
  deviceLabel = 'not measured';
  trackSettings: Record<string, unknown> = {};
  contextRate: number | null = null;
  workletRate: number | null = null;
  workletChannels: number | null = null;
  inputFormat = 'not sent';
  providerRate: number | null = null;
  receivedFrames = 0;
  discontinuities = 0;
  peak = 0;
  clippedSamples = 0;
  context = 'not created';
  graph = 'disconnected';
  worklet = 'not created';
  processCalls = 0;
  inputFrames = 0;
  rms = 0;
  lastFrameAt: number | null = null;
  audioChunks = 0;
  recording = false;
  socket = 'not created';
  ready = false;
  sentChunks = 0;
  sentFrames = 0;
  messages = 0;
  messageTypes: Record<string, number> = {};
  transcript = '';
  lastError = 'none';
  cleanup = 'none';
  tokenRemainingMs: number | null = null;
  readonly events: string[] = [];
  constructor(private readonly log: (line: string) => void = line => console.debug(line)) {}
  event(name: string): void {
    const line = `${(performance.now() - this.startedAt).toFixed(1)}ms ${name}`;
    this.events.push(line);
    if (this.events.length > 80) this.events.shift();
    this.log(`[SonicCheck mic] ${line}`);
  }
  error(reason: string): void { this.lastError = reason; this.event(`ERROR ${reason}`); }
  display(): string {
    return [
      `MIC PERMISSION: ${this.permission}`,
      `STREAM: ${this.streamId} / active=${this.streamActive ?? 'unknown'} / reference=${this.reference}`,
      `TRACK: ${this.tracks.map(t => `${t.id}: ${t.readyState} / ${t.enabled ? 'enabled' : 'disabled'} / ${t.muted ? 'muted' : 'unmuted'}`).join('; ') || 'none'}`,
      `DEVICE: ${this.deviceLabel} / SETTINGS: ${JSON.stringify(this.trackSettings)}`,
      `RATES: context=${this.contextRate} / worklet=${this.workletRate} / channels=${this.workletChannels} / input_format=${this.inputFormat} / provider=${this.providerRate}`,
      `PCM AUDIT: received=${this.receivedFrames} / sent=${this.sentFrames} / discontinuities=${this.discontinuities} / peak=${this.peak.toFixed(5)} / clipped=${this.clippedSamples}`,
      `AUDIO CONTEXT: ${this.context} / GRAPH: ${this.graph}`,
      `WORKLET: ${this.worklet} / process calls=${this.processCalls} / input frames=${this.inputFrames}`,
      `LAST FRAME AGE: ${this.lastFrameAt === null ? 'none' : `${Math.round(performance.now() - this.lastFrameAt)}ms`} / RMS: ${this.rms.toFixed(4)}`,
      `RECORDING: ${this.recording ? 'yes' : this.ready && this.cleanup === 'none' ? 'no (prepared; press Start)' : 'no'} / PCM CHUNKS RECEIVED: ${this.audioChunks}`,
      `GRADIUM WS: ${this.socket} / protocol ready=${this.ready}`,
      `PCM SENT: ${this.sentChunks} chunks / ${this.sentFrames} sample frames`,
      `MESSAGES RECEIVED: ${this.messages} ${JSON.stringify(this.messageTypes)}`,
      `TRANSCRIPT: ${JSON.stringify(this.transcript)}`,
      `TOKEN LIFETIME AT CONNECT: ${this.tokenRemainingMs === null ? 'unknown' : `${this.tokenRemainingMs}ms`}`,
      `LAST ERROR: ${this.lastError} / CLEANUP: ${this.cleanup}`,
      'RECENT LIFECYCLE (relative timestamps):', ...this.events.slice(-12),
    ].join('\n');
  }
}
export let microphoneDiagnostics = new MicDiagnostics();
export function beginMicrophoneDiagnostics(): MicDiagnostics {
  microphoneDiagnostics = new MicDiagnostics();
  microphoneDiagnostics.event('Enable microphone');
  return microphoneDiagnostics;
}
