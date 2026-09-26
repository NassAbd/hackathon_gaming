import { expect, it, vi } from 'vitest';
import { createGame, startRound, submitMove, advance } from '../game';
import { retryPuzzle } from './retry';
import { PUZZLES } from '../puzzles';
it('restores exact starting position and rolls back score without farming; next still works', () => {
  const initial = createGame(); const cancel = vi.fn();
  for (let i = 0; i < 3; i++) {
    const ready = retryPuzzle(initial, cancel);
    expect(ready).toEqual(initial); expect(ready).not.toBe(initial);
    const result = submitMove(startRound(ready, 0), PUZZLES[0].solution, 100);
    expect(result.score).toBe(100); expect(result.solved).toBe(1);
    expect(advance(result)).toMatchObject({ puzzleIndex: 1, score: 100 });
  }
  expect(cancel).toHaveBeenCalledTimes(3);
});
it('retains earlier puzzle score/combo, not current puzzle contributions', () => {
  const initial = advance(submitMove(startRound(createGame(), 0), PUZZLES[0].solution, 100));
  expect(retryPuzzle(initial, vi.fn())).toMatchObject({ score: 100, combo: 1, solved: 1, fen: PUZZLES[1].fen });
});
it('retry resets hold state and blocks a late Gemini result even with the same FEN', async () => {
  const { PushToTalk } = await import('./push-to-talk');
  const { VoiceSession } = await import('../services/gradium/session');
  const initial = createGame(); let state = initial;
  let resolveIntent: (value: { status: 'resolved'; candidate: { from: string; to: string } }) => void = () => {};
  const voice = new VoiceSession({ getState: () => state, setState: next => { state = next; }, now: () => 100,
    inspect: vi.fn(), resolve: () => new Promise(resolve => { resolveIntent = resolve; }) });
  const capture = { start: (speech: () => void) => speech(), cancel: vi.fn(), finish: async () => 'rook to a eight' };
  const start = vi.fn(() => { voice.listen(capture); });
  const talk = new PushToTalk({ allowed: () => true, prepare: async () => capture, start, commit: () => voice.commit(), cancel: () => voice.cancel(), changed: vi.fn(), failed: vi.fn() });
  state = startRound(state, 0);
  await talk.press(); const pending = talk.release(); await Promise.resolve();
  state = retryPuzzle(initial, () => { talk.reset(); voice.cancel(); });
  const restored = state; resolveIntent({ status: 'resolved', candidate: { from: 'a1', to: 'a8' } }); await pending;
  expect(state).toBe(restored); expect(state).toEqual(initial); expect(talk.phase).toBe('idle');
  for (let i = 0; i < 3; i++) {
    state = startRound(state, 0); await talk.press(); state = retryPuzzle(initial, () => { talk.reset(); voice.cancel(); });
  }
  expect(start).toHaveBeenCalledTimes(4); expect(talk.phase).toBe('idle');
});
