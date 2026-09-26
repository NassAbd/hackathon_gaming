import { expect, it } from 'vitest';
import { advance, createGame, startRound, submitMove, tick } from '../game';
import { roundView } from './round-view';
import { PUZZLES } from '../puzzles';
import { motionDuration } from './presentation';
it('omits the initial position and identifying title until timed reveal', () => {
  const ready = createGame();
  expect(roundView(ready)).toEqual({ fen: null, title: 'Find the mate', label: 'Puzzle hidden until Start' });
  expect(JSON.stringify(roundView(ready))).not.toContain(PUZZLES[0].fen);
  const revealed = startRound(ready, 1000);
  expect(roundView(revealed).fen).toBe(PUZZLES[0].fen);
  expect(revealed.deadline).toBe(6000);
  expect(startRound(revealed, 3000)).toBe(revealed);
  expect(tick(revealed, 6000).outcome).toBe('timeout');
});
it('conceals every Next position and Play Again, with no cosmetic delay', () => {
  let state = createGame();
  for (const puzzle of PUZZLES) {
    expect(roundView(state).fen).toBeNull();
    state = advance(submitMove(startRound(state, 0), puzzle.solution, 100));
  }
  expect(state.phase).toBe('complete');
  expect(roundView(createGame()).fen).toBeNull();
  expect(motionDuration(true, 120)).toBe(0);
});
