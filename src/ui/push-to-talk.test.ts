import { expect, it, vi } from 'vitest';
import { PushToTalk } from './push-to-talk';
function harness() {
  const capture = { start: vi.fn(), finish: vi.fn(), cancel: vi.fn() };
  let prepared: (value: typeof capture) => void = () => {};
  let finished: () => void = () => {};
  const access = { allowed: () => true, prepare: vi.fn((_signal: AbortSignal) => new Promise<typeof capture>(resolve => { if (!_signal.aborted) prepared = resolve; })), start: vi.fn(), commit: vi.fn(() => new Promise<void>(resolve => { finished = resolve; })), cancel: vi.fn(), changed: vi.fn(), failed: vi.fn() };
  const talk = new PushToTalk(access);
  return { talk, access, capture, ready: () => prepared(capture), finish: () => finished() };
}
it('hold starts capture when ready and release commits exactly once', async () => {
  const h = harness(); const press = h.talk.press();
  expect(h.talk.phase).toBe('preparing'); expect(h.access.start).not.toHaveBeenCalled();
  h.ready(); await press;
  expect(h.access.start).toHaveBeenCalledExactlyOnceWith(h.capture);
  const release = h.talk.release(); await h.talk.release(); await h.talk.press();
  expect(h.talk.phase).toBe('processing'); expect(h.access.commit).toHaveBeenCalledOnce();
  h.finish(); await release; expect(h.talk.phase).toBe('idle');
});
it('release during setup cancels and disposes late capture without starting a round', async () => {
  const h = harness(); const press = h.talk.press(); await h.talk.release();
  expect(h.access.prepare.mock.calls[0][0].aborted).toBe(true);
  h.ready(); await press; expect(h.capture.cancel).toHaveBeenCalledOnce();
  expect(h.access.start).not.toHaveBeenCalled(); expect(h.access.commit).not.toHaveBeenCalled();
});
it('pointer cancellation during listening never commits', async () => {
  const h = harness(); const press = h.talk.press(); h.ready(); await press;
  h.talk.cancel(); await h.talk.release(); expect(h.access.cancel).toHaveBeenCalledOnce();
  expect(h.access.commit).not.toHaveBeenCalled();
});
it('late completion cannot reset the next gesture', async () => {
  const h = harness(); const press = h.talk.press(); h.ready(); await press;
  const release = h.talk.release(); h.talk.cancel();
  const next = h.talk.press(); h.finish(); await release;
  expect(h.talk.phase).toBe('preparing'); h.ready(); await next; h.talk.cancel();
});
it('setup failure returns to idle with visible feedback', async () => {
  const h = harness(); h.access.prepare.mockRejectedValueOnce(new Error('denied'));
  await h.talk.press(); expect(h.talk.phase).toBe('idle'); expect(h.access.failed).toHaveBeenCalledOnce();
});

it('preserves the reveal deadline while thinking and commits through VoiceSession at release', async () => {
  const { createGame, startRound } = await import('../game');
  const { VoiceSession } = await import('../services/gradium/session');
  let state = createGame(); let now = 1000;
  const session = new VoiceSession({ getState: () => state, setState: next => { state = next; }, now: () => now,
    inspect: vi.fn(), resolve: async () => ({ status: 'resolved', candidate: { from: 'a1', to: 'a8' } }) });
  let finalTranscript: (value: string) => void = () => {};
  const capture = { start: (speech: () => void) => speech(), cancel: vi.fn(), finish: () => new Promise<string>(resolve => { finalTranscript = resolve; }) };
  const talk = new PushToTalk({ allowed: () => state.phase === 'playing', prepare: async () => capture,
    start: ready => { session.listen(ready); }, commit: () => session.commit(),
    cancel: () => session.cancel(), changed: vi.fn(), failed: vi.fn() });
  await talk.press(); expect(state.phase).toBe('ready');
  state = startRound(state, now); now = 2000;
  await talk.press(); expect(state.phase).toBe('playing'); expect(state.deadline).toBe(11000);
  now = 3000; const release = talk.release(); expect(session.remainingMs).toBe(8000);
  now = 12000; finalTranscript('rook to a eight'); await release;
  expect(state).toMatchObject({ phase: 'result', outcome: 'mate', score: 180 });
  expect(talk.phase).toBe('idle'); expect(session.telemetry.speechCommitted).toBe(3000);
});

it('thinking and a held command past the reveal deadline cannot become a late valid attempt', async () => {
  const { createGame, startRound, tick } = await import('../game');
  const { VoiceSession } = await import('../services/gradium/session');
  let state = startRound(createGame(), 0); let now = 2000;
  const resolve = vi.fn();
  const capture = { start: (speech: () => void) => speech(), finish: vi.fn(async () => 'rook to a eight'), cancel: vi.fn() };
  const voice = new VoiceSession({ getState: () => state, setState: next => { state = next; }, now: () => now, resolve, inspect: vi.fn() });
  const talk = new PushToTalk({ allowed: () => state.phase === 'playing', prepare: async () => capture,
    start: c => voice.listen(c), commit: () => voice.commit(), cancel: () => voice.cancel(), changed: vi.fn(), failed: vi.fn() });
  await talk.press(); expect(state.deadline).toBe(10000);
  now = 10000; state = tick(state, now); await talk.release();
  expect(state.outcome).toBe('timeout'); expect(state.score).toBe(0);
  expect(resolve).not.toHaveBeenCalled(); expect(capture.finish).not.toHaveBeenCalled();
});
