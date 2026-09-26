import { GRADIUM_ASR } from './region';
import type { MicDiagnostics } from './diagnostics';
import { isRecord } from '../gemini/contracts';
import { VoiceFailure } from './contracts';

export function pcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
type Socket = Pick<WebSocket, 'send' | 'close' | 'addEventListener' | 'readyState' | 'bufferedAmount'>;

export class GradiumStream {
  readonly ready: Promise<void>;
  private socket: Socket;
  private timer: ReturnType<typeof setTimeout>;
  private error: VoiceFailure | null = null;
  private ended = false;
  private finishing = false;
  private initialized = false;
  private text: string[] = [];
  private resolveReady: () => void = () => {};
  private rejectReady: (error: Error) => void = () => {};
  private resolveFinal: ((text: string) => void) | null = null;
  private rejectFinal: ((error: Error) => void) | null = null;

  constructor(token: string, sampleRate: number, private readonly onFailure: (error: VoiceFailure) => void,
    socketFactory: (url: string) => Socket = url => new WebSocket(url), private readonly timeoutMs = 5000, private readonly diagnostic?: MicDiagnostics) {
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    const url = new URL(GRADIUM_ASR); url.searchParams.set('token', token);
    this.socket = socketFactory(url.toString());
    if (diagnostic) { diagnostic.socket = 'connecting'; diagnostic.event('Gradium WS connecting (EU)'); }
    this.timer = setTimeout(() => this.fail(new VoiceFailure('timeout')), timeoutMs);
    this.socket.addEventListener('open', () => {
      if (diagnostic) { diagnostic.socket = 'open'; diagnostic.event('Gradium WS open; sending setup'); }
      this.send({ type: 'setup', model_name: 'default', input_format: `pcm_${sampleRate}`, json_config: {
        language: 'en',
        keywords: { words: ['rook', 'knight', 'bishop', 'queen', 'king', 'pawn', 'check', 'checkmate'], boost: 3 },
      } });
    });
    this.socket.addEventListener('message', event => this.message((event as MessageEvent<unknown>).data));
    this.socket.addEventListener('error', () => { diagnostic?.error('WebSocket error'); this.fail(new VoiceFailure('network')); });
    this.socket.addEventListener('close', event => {
      if (diagnostic) { diagnostic.socket = 'closed'; diagnostic.event(`Gradium WS closed code=${(event as CloseEvent).code ?? 'unknown'}`); }
      if (!this.ended) this.fail(new VoiceFailure('network'));
    });
  }
  private send(value: unknown): boolean {
    if (this.ended) return false;
    try {
      if (this.socket.readyState !== 1 || this.socket.bufferedAmount > 256000) throw new Error();
      this.socket.send(JSON.stringify(value)); return true;
    } catch { this.fail(new VoiceFailure('network')); return false; }
  }
  private message(raw: unknown): void {
    if (this.ended) return;
    try {
      if (typeof raw !== 'string') throw new Error();
      const data: unknown = JSON.parse(raw);
      if (!isRecord(data)) throw new Error();
      if (this.diagnostic) {
        const type = ['ready', 'text', 'end_of_stream', 'error', 'step', 'vad', 'end_text', 'flushed'].includes(String(data.type)) ? String(data.type) : 'unknown';
        this.diagnostic.messages++;
        this.diagnostic.messageTypes[type] = (this.diagnostic.messageTypes[type] ?? 0) + 1;
        if (type !== 'step' && type !== 'vad') this.diagnostic.event(`Gradium message: ${type}`);
      }
      switch (data.type) {
        case 'ready':
          if (this.initialized) throw new Error();
          this.initialized = true;
          if (this.diagnostic) this.diagnostic.ready = true;
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.fail(new VoiceFailure('timeout')), 30000);
          this.resolveReady(); break;
        case 'text':
          if (!this.initialized || typeof data.text !== 'string' || data.text.length > 300) throw new Error();
          this.text.push(data.text);
          if (this.diagnostic) this.diagnostic.transcript = this.text.join(' ').slice(0, 300);
          if (this.text.join(' ').length > 300) throw new Error();
          break;
        case 'end_of_stream':
          if (!this.finishing) throw new Error();
          this.ended = true; clearTimeout(this.timer);
          this.resolveFinal?.(this.text.join(' ').trim()); this.close('final transcript complete'); break;
        case 'error':
          this.diagnostic?.error(typeof data.message === 'string' && data.message.startsWith('Invalid or expired token')
            ? 'Gradium rejected token (1008)' : `Gradium provider error code=${typeof data.code === 'number' ? data.code : 'unknown'}`);
          this.fail(new VoiceFailure('unavailable')); break;
        case 'step': case 'vad': case 'end_text': case 'flushed': break;
        default: throw new Error();
      }
    } catch { this.fail(new VoiceFailure('malformed')); }
  }
  audio(samples: Float32Array): void {
    if (this.initialized && !this.finishing && this.send({ type: 'audio', audio: pcm16Base64(samples) }) && this.diagnostic) {
      this.diagnostic.sentChunks++; this.diagnostic.sentFrames += samples.length;
    }
  }
  finish(): Promise<string> {
    if (this.error) return Promise.reject(this.error);
    if (!this.initialized || this.finishing || this.ended) return Promise.reject(new VoiceFailure('unavailable'));
    this.finishing = true;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.fail(new VoiceFailure('timeout')), this.timeoutMs);
    return new Promise((resolve, reject) => {
      this.resolveFinal = resolve; this.rejectFinal = reject;
      this.send({ type: 'end_of_stream' });
    });
  }
  private fail(error: VoiceFailure): void {
    if (this.ended) return;
    this.error = error; this.ended = true; clearTimeout(this.timer);
    if (this.diagnostic && error.code !== 'cancelled' && this.diagnostic.lastError === 'none') this.diagnostic.error(`Gradium ${error.code}`);
    this.rejectReady(error); this.rejectFinal?.(error); this.close(error.code); this.onFailure(error);
  }
  private close(reason: string): void {
    if (this.diagnostic) { this.diagnostic.socket = 'closing'; this.diagnostic.event(`WebSocket.close(): ${reason}`); }
    this.socket.close();
  }
  cancel(): void { this.fail(new VoiceFailure('cancelled')); }
}
