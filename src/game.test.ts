import { describe, expect, it } from 'vitest';
import { Chess, validateFen } from 'chess.js';
import { advance, createGame, startRound, submitMove, tick, ROUND_MS } from './game';
import { PUZZLES } from './puzzles';

const playing = () => startRound(createGame(), 100);

describe('puzzle pack', () => {
  it.each(PUZZLES)('$id is a valid playable mate in one', (puzzle) => {
    expect(validateFen(puzzle.fen).ok).toBe(true);
    const chess = new Chess(puzzle.fen);
    expect(chess.isGameOver()).toBe(false);
    expect(chess.isCheck()).toBe(false);
    chess.move(puzzle.solution);
    expect(chess.isCheckmate()).toBe(true);
  });
});

describe('deterministic game loop', () => {
  it('waits for start, with a ten-second deadline', () => {
    const ready = createGame();
    expect(ready.phase).toBe('ready');
    expect(tick(ready, 90000)).toBe(ready);
    expect(submitMove(ready, PUZZLES[0].solution, 0)).toBe(ready);
    expect(playing().deadline).toBe(100 + ROUND_MS);
    expect(startRound(playing(), 900)).toEqual(playing());
  });

  it.each([null, {}, 'a1a8', { from: 'z9', to: 'a8' }, { from: 'a1', to: 'a8', promotion: 'king' }, { from: 'a1', to: 'b3' }, { from: 'g8', to: 'f8' }])('rejects invalid input without changing board or score: %j', (input) => {
    const before = playing();
    const after = submitMove(before, input, 200);
    expect(after.fen).toBe(before.fen);
    expect(after.score).toBe(0);
    expect(after.phase).toBe('playing');
    expect(after.feedback).toMatch(/invalid|illegal/i);
  });

  it('accepts a legal mate and prevents duplicate scoring', () => {
    const won = submitMove(playing(), PUZZLES[0].solution, 200);
    expect(won.phase).toBe('result');
    expect(won.outcome).toBe('mate');
    expect(won.score).toBe(199);
    expect(won.combo).toBe(1);
    expect(new Chess(won.fen).isCheckmate()).toBe(true);
    expect(won.feedback).toContain('Ra8#');
    expect(submitMove(won, PUZZLES[0].solution, 300)).toBe(won);
  });

  it('executes a legal non-mate as a miss and resets the combo', () => {
    const state = { ...playing(), combo: 2, score: 300 };
    const missed = submitMove(state, { from: 'a1', to: 'a2' }, 200);
    expect(missed.outcome).toBe('miss');
    expect(missed.fen).not.toBe(state.fen);
    expect(missed.score).toBe(300);
    expect(missed.combo).toBe(0);
  });

  it('uses the exact deadline, including late submissions without a timer tick', () => {
    const state = { ...playing(), combo: 2 };
    expect(tick(state, 10099)).toBe(state);
    const expired = tick(state, 10100);
    expect(expired.outcome).toBe('timeout');
    expect(expired.combo).toBe(0);
    expect(expired.fen).toBe(state.fen);
    expect(submitMove(state, PUZZLES[0].solution, 10100)).toEqual(expired);
    expect(submitMove(state, PUZZLES[0].solution, 99999)).toEqual(expired);
  });

  it('plays the complete pack with escalating combos and a clean replay', () => {
    let state = createGame();
    for (const [index, puzzle] of PUZZLES.entries()) {
      expect(state.puzzleIndex).toBe(index);
      expect(state.fen).toBe(puzzle.fen);
      state = startRound(state, index * 10000);
      state = submitMove(state, puzzle.solution, index * 10000 + 1000);
      state = advance(state);
    }
    expect(state.phase).toBe('complete');
    expect(state.score).toBe(1140);
    expect(state.solved).toBe(3);
    expect(advance(state)).toBe(state);
    expect(createGame()).toMatchObject({ score: 0, combo: 0, solved: 0, puzzleIndex: 0, phase: 'ready' });
  });

  it('does not skip an active round, and advances after a timeout', () => {
    const state = playing();
    expect(advance(state)).toBe(state);
    const next = advance(tick(state, 10100));
    expect(next.phase).toBe('ready');
    expect(next.puzzleIndex).toBe(1);
    expect(next.deadline).toBeNull();
  });
});

 it.each([1, 2, 3])('awards deterministic time bonuses at combo %i', combo => {
  for (const [remaining, base] of [[9000,190],[7000,170],[5000,150],[3000,130],[1000,110],[0.001,100]]) {
    const state = { ...startRound(createGame(), 0), combo: combo - 1, score: 300 };
    expect(submitMove(state, PUZZLES[0].solution, ROUND_MS - remaining).score).toBe(300 + base * combo);
  }
 });
