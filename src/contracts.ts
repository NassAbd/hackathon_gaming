export interface Candidate { from: string; to: string; promotion?: string }
export interface Puzzle { id: string; title: string; fen: string; solution: Candidate }
export type Phase = 'ready' | 'playing' | 'result' | 'complete';
export interface GameState {
  phase: Phase;
  puzzleIndex: number;
  fen: string;
  score: number;
  combo: number;
  solved: number;
  deadline: number | null;
  outcome: 'mate' | 'miss' | 'timeout' | null;
  feedback: string;
  lastMove: { from: string; to: string } | null;
}
