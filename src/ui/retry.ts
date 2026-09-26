import type { GameState } from '../contracts';
/** Snapshot is taken on entry to the puzzle, before any points can be awarded. */
export function retryPuzzle(initial: GameState, cancelPending: () => void): GameState {
  cancelPending();
  return { ...initial, phase: 'ready', deadline: null, outcome: null, lastMove: null };
}
