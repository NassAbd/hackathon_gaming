import type { GameState } from '../contracts';
export function subtitleText(phase: GameState['phase'], listening: boolean, pending: boolean, partial: string, final: string): string {
  if (phase !== 'playing' || (!listening && !pending)) return '';
  return final || partial;
}
export function failureTitle(timeout: boolean): string { return timeout ? 'TIME’S UP' : 'DIDN’T CATCH THAT'; }
export function motionDuration(reduced: boolean, duration: number): number { return reduced ? 0 : duration; }
/** Presentation bookkeeping only; never modifies the deterministic game state. */
export class RunPresentation {
  private run = 0;
  private combos = new Map<number, number>();
  private previous: GameState | null = null;
  observe(state: GameState, run: number) {
    if (run !== this.run) { this.run = run; this.combos.clear(); this.previous = null; }
    const before = this.previous;
    if (state.phase === 'ready') this.combos.delete(state.puzzleIndex);
    if (state.phase === 'result') this.combos.set(state.puzzleIndex, state.combo);
    const moved = !!before && before.fen !== state.fen && state.phase === 'result' && !!state.lastMove;
    const result = state.phase === 'result' && before?.phase !== 'result';
    const complete = state.phase === 'complete' && before?.phase !== 'complete';
    const transition = !!before && state.phase === 'ready' && (before.phase !== 'ready' || before.puzzleIndex !== state.puzzleIndex);
    this.previous = state;
    return { moved, result, complete, transition, bestCombo: Math.max(0, ...this.combos.values()), gain: moved && before ? state.score - before.score : 0 };
  }
}
