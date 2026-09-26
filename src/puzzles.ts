import type { Puzzle } from './contracts';

export const PUZZLES: readonly Puzzle[] = [
  { id: 'back-rank', title: 'The back rank', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', solution: { from: 'a1', to: 'a8' } },
  { id: 'close-quarters', title: 'Close quarters', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', solution: { from: 'g6', to: 'g7' } },
  { id: 'smothered', title: 'No escape', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solution: { from: 'g5', to: 'f7' } },
];
