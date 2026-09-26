import { Chess } from 'chess.js';
import type { Candidate, GameState } from './contracts';
import { PUZZLES } from './puzzles';

export const ROUND_MS = 5000;

export function createGame(): GameState {
  return {
    phase: 'ready', puzzleIndex: 0, fen: PUZZLES[0].fen,
    score: 0, combo: 0, solved: 0, deadline: null, outcome: null,
    feedback: 'Find checkmate in one. White to move.', lastMove: null,
  };
}

export function startRound(state: GameState, now: number): GameState {
  if (state.phase !== 'ready') return state;
  return { ...state, phase: 'playing', deadline: now + ROUND_MS, feedback: 'Go! Find the finishing move.' };
}

export function tick(state: GameState, now: number): GameState {
  if (state.phase !== 'playing' || state.deadline === null || now < state.deadline) return state;
  return { ...state, phase: 'result', outcome: 'timeout', combo: 0, feedback: 'Time’s up! Take a breath and try the next puzzle.' };
}

function isCandidate(value: unknown): value is Candidate {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return typeof move.from === 'string' && /^[a-h][1-8]$/.test(move.from)
    && typeof move.to === 'string' && /^[a-h][1-8]$/.test(move.to)
    && (move.promotion === undefined || (typeof move.promotion === 'string' && /^[qrbn]$/.test(move.promotion)));
}

/** Untrusted candidates are validated on a fresh engine; rejected moves cannot mutate state. */
export function submitMove(state: GameState, candidate: unknown, now: number): GameState {
  const current = tick(state, now);
  if (current.phase !== 'playing') return current;
  if (!isCandidate(candidate)) return { ...current, feedback: 'Invalid move. Use coordinates such as a1 a8.' };
  const chess = new Chess(current.fen);
  try {
    const move = chess.move(candidate);
    const mate = chess.isCheckmate();
    const combo = mate ? current.combo + 1 : 0;
    return {
      ...current, fen: chess.fen(), phase: 'result', outcome: mate ? 'mate' : 'miss',
      score: current.score + (mate ? 100 * combo : 0), combo,
      solved: current.solved + (mate ? 1 : 0), lastMove: { from: move.from, to: move.to },
      feedback: mate ? `Checkmate! ${move.san} · +${100 * combo} points` : `${move.san} is legal, but it isn’t checkmate. Combo reset.`,
    };
  } catch {
    return { ...current, feedback: 'Illegal move. Your board is unchanged — try again!' };
  }
}

export function advance(state: GameState): GameState {
  if (state.phase !== 'result') return state;
  const puzzleIndex = state.puzzleIndex + 1;
  if (puzzleIndex === PUZZLES.length) return { ...state, phase: 'complete', deadline: null, feedback: 'Run complete. Ready for another?' };
  return {
    ...state, puzzleIndex, fen: PUZZLES[puzzleIndex].fen, phase: 'ready',
    deadline: null, outcome: null, lastMove: null, feedback: 'Find checkmate in one. White to move.',
  };
}
