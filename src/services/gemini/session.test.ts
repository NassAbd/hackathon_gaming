import { describe, expect, it, vi } from 'vitest';
import { createGame, startRound, submitMove, tick } from '../../game';
import type { IntentResult } from './contracts';
import { IntentSession } from './session';
import { requestIntent } from './client';

const resolved: IntentResult = { status: 'resolved', candidate: { from: 'a1', to: 'a8' } };
function harness() {
  let state = startRound(createGame(), 0);
  let now = 100;
  let finish: (result: IntentResult) => void = () => { throw new Error('not started'); };
  const inspect = vi.fn();
  const resolve = vi.fn(() => new Promise<IntentResult>(r => { finish = r; }));
  const access = { getState: () => state, setState: (value: typeof state) => { state = value; }, inspect, now: () => now, resolve };
  return { access, finish: (result: IntentResult) => finish(result), time: (value: number) => { now = value; } };
}

describe('intent session race safety', () => {
  it('executes only through chess.js and ignores duplicate in-flight submission', async () => {
    const h = harness(); const session = new IntentSession();
    const pending = session.run('rook on back rank', h.access);
    await session.run('again', h.access);
    expect(h.access.resolve).toHaveBeenCalledTimes(1);
    h.finish(resolved); await pending;
    expect(h.access.getState()).toMatchObject({ score: 100, outcome: 'mate' });
    expect(h.access.getState().feedback).toContain('Ra8#');
    expect(session.pending).toBe(false);
  });
  it.each<IntentResult>([{ status: 'unresolved' }, { status: 'error', code: 'missing_credentials' }, { status: 'error', code: 'network' }, { status: 'error', code: 'malformed' }, { status: 'error', code: 'timeout' }])('does not mutate game on failure %j', async result => {
    const h = harness(); const before = h.access.getState();
    const pending = new IntentSession().run('horse', h.access);
    h.finish(result); await pending;
    expect(h.access.getState()).toBe(before);
  });
  it('rejects illegal endpoint candidates in the game engine', async () => {
    const h = harness(); const before = h.access.getState();
    const pending = new IntentSession().run('horse', h.access);
    h.finish({ status: 'resolved', candidate: { from: 'a1', to: 'b3' } }); await pending;
    expect(h.access.getState()).toMatchObject({ fen: before.fen, phase: 'playing', score: 0 });
  });
  it('discards a response at the deadline even if timer tick has not run', async () => {
    const h = harness(); const before = h.access.getState();
    const pending = new IntentSession().run('rook', h.access);
    h.time(5000); h.finish(resolved); await pending;
    expect(h.access.getState()).toBe(before);
    expect(h.access.inspect.mock.lastCall?.[0].message).toContain('discarded');
  });
  it('cannot overwrite a fallback move or expired round', async () => {
    for (const transition of [() => submitMove(startRound(createGame(), 0), { from: 'a1', to: 'a2' }, 200), () => tick(startRound(createGame(), 0), 5000)]) {
      const h = harness(); const pending = new IntentSession().run('rook', h.access);
      const next = transition(); h.access.setState(next);
      h.finish(resolved); await pending;
      expect(h.access.getState()).toBe(next);
    }
  });
  it('cancellation protects replay even with an identical FEN/deadline', async () => {
    const h = harness(); const session = new IntentSession();
    const pending = session.run('rook', h.access);
    session.cancel(); h.access.setState(startRound(createGame(), 0));
    h.finish(resolved); await pending;
    expect(h.access.getState().score).toBe(0);
    expect(h.access.inspect).toHaveBeenCalledTimes(1);
  });
  it('discards a previous round response by deadline identity', async () => {
    const h = harness(); const pending = new IntentSession().run('rook', h.access);
    const next = startRound(createGame(), 1000); h.access.setState(next);
    h.finish(resolved); await pending;
    expect(h.access.getState()).toBe(next);
  });
  it('rejects blank or oversized text and unavailable phases without calling resolver', async () => {
    const h = harness(); const session = new IntentSession();
    await session.run(' ', h.access); await session.run('x'.repeat(301), h.access);
    h.access.setState(createGame()); await session.run('rook', h.access);
    expect(h.access.resolve).not.toHaveBeenCalled();
  });
});

describe('browser HTTP adapter', () => {
  const request = { utterance: 'rook', fen: createGame().fen };
  const signal = new AbortController().signal;
  it('parses a candidate and rejects invalid server data', async () => {
    expect(await requestIntent(request, signal, async () => Response.json(resolved))).toEqual(resolved);
    expect(await requestIntent(request, signal, async () => Response.json({ status: 'resolved', candidate: { from: 'z1', to: 'a8' } }))).toEqual({ status: 'error', code: 'malformed' });
    expect(await requestIntent(request, signal, async () => Response.json({ status: 'error', code: 'arbitrary diagnostics' }))).toEqual({ status: 'error', code: 'malformed' });
  });
  it('handles unavailable endpoint, non-JSON page, broken JSON and network failures', async () => {
    for (const response of [new Response('', { status: 404 }), new Response('<html>app</html>')]) expect(await requestIntent(request, signal, async () => response)).toEqual({ status: 'error', code: 'unavailable' });
    expect(await requestIntent(request, signal, async () => new Response('broken', { headers: { 'content-type': 'application/json' } }))).toEqual({ status: 'error', code: 'malformed' });
    expect(await requestIntent(request, signal, async () => { throw new Error(); })).toEqual({ status: 'error', code: 'network' });
  });
});
