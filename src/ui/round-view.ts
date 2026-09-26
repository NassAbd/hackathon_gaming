import type { GameState } from '../contracts';
import { PUZZLES } from '../puzzles';
/** Ready deliberately has no position or puzzle-specific title to render/access. */
export function roundView(state: GameState) {
  return state.phase === 'ready'
    ? { fen: null, title: 'Find the mate', label: 'Puzzle hidden until Start' }
    : { fen: state.fen, title: state.phase === 'complete' ? `${state.solved} of ${PUZZLES.length} solved` : PUZZLES[state.puzzleIndex].title, label: 'Chessboard, white at bottom' };
}
