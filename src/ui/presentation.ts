import { Chess } from 'chess.js';
import type { GameState } from '../contracts';
export function subtitleText(phase: GameState['phase'], listening: boolean, pending: boolean, partial: string, final: string, failed = false): string {
  if (phase !== 'playing' || (!listening && !pending && !failed)) return '';
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
    const captured = moved && before && state.lastMove ? new Chess(before.fen).board().flat().some(piece => piece?.square === state.lastMove?.to) : false;
    const check = moved && new Chess(state.fen).isCheck();
    this.previous = state;
    return { moved, captured, check, result, complete, transition, bestCombo: Math.max(0, ...this.combos.values()), gain: moved && before ? state.score - before.score : 0 };
  }
}

/** Fixed presentation only, never a puzzle hint or generated dialogue. */
export function kingLine(state: GameState): string {
  if (state.phase === 'ready') return 'Five seconds. Show me.';
  if (state.phase === 'complete') return state.solved === 3 ? 'Okay. You win.' : 'Another round?';
  if (state.phase === 'result') return state.outcome === 'mate' ? 'Well played.' : state.outcome === 'miss' ? 'Still standing.' : 'Time waits for no king.';
  return '';
}
