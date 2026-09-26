import type { GameState } from '../contracts';
export const KING_LINES = {
  'start-1': 'Ten seconds. Show me.', 'start-2': 'Your move.',
  unresolved: 'Speak clearly. Time is running.', 'not-mate': 'Still standing.',
  checkmate: '...well played.', 'run-complete': 'Fine. You win.',
} as const;
export type KingCue = keyof typeof KING_LINES;
export function kingCue(state: GameState, round: number, unresolved: boolean, now: number): KingCue | null {
  if (state.phase === 'ready') return round % 2 ? 'start-1' : 'start-2';
  if (state.phase === 'complete') return 'run-complete';
  if (state.phase === 'result') return state.outcome === 'mate' ? 'checkmate' : state.outcome === 'miss' ? 'not-mate' : null;
  return unresolved && state.deadline !== null && now < state.deadline ? 'unresolved' : null;
}
interface LocalAudio {
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: string): void;
  load(): void;
}
/** Optional local playback. No timers, remote synthesis, or callbacks into gameplay. */
export class BlackKingVoice {
  private audio: LocalAudio | null = null;
  private key = '';
  private pending: KingCue | null = null;
  private unlocked = false;
  private silent = false;
  constructor(private readonly urls: Record<KingCue, string>, private readonly blocked: () => boolean,
    private readonly createAudio: (url: string) => LocalAudio = url => new Audio(url)) {}
  set muted(value: boolean) { this.silent = value; if (value) this.stop(); }
  unlock(): void { this.unlocked = true; this.playPending(); }
  update(key: string, cue: KingCue | null): void {
    if (this.blocked()) { this.stop(); this.key = key; return; }
    if (key === this.key) return;
    this.stop(); this.key = key; this.pending = cue; this.playPending();
  }
  stop(): void {
    this.pending = null;
    if (this.audio) this.dispose(this.audio);
    this.audio = null;
  }
  private dispose(audio: LocalAudio): void {
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch { /* Cosmetic only. */ }
  }
  private playPending(): void {
    if (!this.unlocked || !this.pending) return;
    const cue = this.pending; this.pending = null;
    if (this.silent || this.blocked()) return;
    try {
      const audio = this.createAudio(this.urls[cue]); this.audio = audio;
      void audio.play().then(() => {
        if (this.audio !== audio || this.silent || this.blocked()) this.dispose(audio);
      }).catch(() => { this.dispose(audio); if (this.audio === audio) this.audio = null; });
    } catch { /* Missing audio, autoplay, or device failure never affects gameplay. */ }
  }
}
