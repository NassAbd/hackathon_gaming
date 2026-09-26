import { expect, it } from 'vitest';
import { RunPresentation, subtitleText, failureTitle, motionDuration } from './presentation';
import { advance, createGame, startRound, submitMove } from '../game';
import { PUZZLES } from '../puzzles';
it('uses partial/final subtitles only during the current voice operation', () => {
  expect(subtitleText('playing', true, false, 'rook', '')).toBe('rook');
  expect(subtitleText('playing', false, true, 'rook', 'rook to a eight')).toBe('rook to a eight');
  expect(subtitleText('result', false, true, 'rook', 'rook to a eight')).toBe('');
  expect(subtitleText('ready', false, false, 'stale', 'stale')).toBe('');
  expect(failureTitle(false)).not.toBe(failureTitle(true)); expect(motionDuration(true, 180)).toBe(0);
});
it('effects fire once, leave scoring untouched and reset best combo on retry/play again', () => {
  const ui = new RunPresentation(); const initial = createGame(); ui.observe(initial, 1);
  let state = startRound(initial, 0); ui.observe(state, 1);
  state = submitMove(state, PUZZLES[0].solution, 100); const copy = structuredClone(state);
  expect(ui.observe(state, 1)).toMatchObject({ moved: true, result: true, gain: 100, bestCombo: 1 });
  expect(ui.observe(state, 1)).toMatchObject({ moved: false, result: false, gain: 0 }); expect(state).toEqual(copy);
  expect(ui.observe({ ...initial }, 1)).toMatchObject({ transition: true, bestCombo: 0 });
  ui.observe(state, 1); state = advance(state); expect(ui.observe(state, 1).bestCombo).toBe(1);
  state = submitMove(startRound(state, 0), PUZZLES[1].solution, 100); expect(ui.observe(state, 1).bestCombo).toBe(2);
  expect(ui.observe(createGame(), 2).bestCombo).toBe(0);
});
