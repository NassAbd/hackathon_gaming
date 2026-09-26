import { expect, it, vi } from 'vitest';
import { createGame, startRound, tick } from '../../game';
import type { IntentResult } from '../gemini/contracts';
import { VoiceSession } from './session';
import { VoiceFailure, voiceFailure } from './contracts';

function harness() {
  let state = startRound(createGame(), 0); let now = 100;
  let transcript: (value: string) => void = () => {};
  let failTranscript: (value: Error) => void = () => {};
  let resolveIntent: (value: IntentResult) => void = () => {};
  const capture = { start: (speech: () => void) => speech(), cancel: vi.fn(), finish: () => new Promise<string>((resolve, reject) => { transcript = resolve; failTranscript = reject; }) };
  const access = { getState: () => state, setState: (value: typeof state) => { state = value; }, now: () => now, inspect: vi.fn(), resolve: vi.fn(() => new Promise<IntentResult>(resolve => { resolveIntent = resolve; })) };
  const session = new VoiceSession(access);
  session.listen(capture);
  return { session, capture, access, time: (value: number) => { now = value; }, transcript: (value: string) => transcript(value), fail: (error: Error) => failTranscript(error), result: (value: IntentResult) => resolveIntent(value) };
}
const mate: IntentResult = { status: 'resolved', candidate: { from: 'a1', to: 'a8' } };

it('reserves committed time, uses existing resolver, validates and commits after original deadline', async () => {
  const h = harness(); h.time(9000); const pending = h.session.commit();
  expect(h.session.remainingMs).toBe(1000);
  expect(tick(h.access.getState(), 14000)).toBe(h.access.getState());
  h.time(14000); h.transcript('put the rook on the back rank'); await Promise.resolve();
  expect(h.access.resolve).toHaveBeenCalledWith({ utterance: 'put the rook on the back rank', fen: createGame().fen }, expect.any(AbortSignal));
  h.time(15000); h.result(mate); await pending;
  expect(h.access.getState()).toMatchObject({ score: 110, outcome: 'mate' });
  expect(h.session.telemetry).toMatchObject({ speechStart: 100, speechCommitted: 9000, transcriptAvailable: 14000, intentRequestStart: 14000, intentResolved: 15000, validationComplete: 15000, moveCommitted: 15000, remainingMs: 1000 });
});
it('empty transcript and Gradium failure never call Gemini and restore remaining time', async () => {
  for (const failed of [false, true]) {
    const h = harness(); h.time(3000); const pending = h.session.commit(); h.time(8000);
    if (failed) h.fail(new VoiceFailure('timeout')); else h.transcript(' ');
    await pending;
    expect(h.access.resolve).not.toHaveBeenCalled();
    expect(h.access.getState()).toMatchObject({ phase: 'playing', deadline: 15000, score: 0, fen: createGame().fen });
  }
});
it('Gemini failure or illegal candidate resumes time without corrupting the board', async () => {
  for (const result of [{ status: 'error', code: 'network' }, { status: 'unresolved' }, { status: 'resolved', candidate: { from: 'a1', to: 'b3' } }] as IntentResult[]) {
    const h = harness(); h.time(2000); const pending = h.session.commit();
    h.transcript('rook'); await Promise.resolve(); h.time(12000); h.result(result); await pending;
    expect(h.access.getState()).toMatchObject({ phase: 'playing', deadline: 20000, score: 0, fen: createGame().fen });
    expect(h.session.telemetry.moveCommitted).toBeNull();
  }
});
it('cannot commit at deadline or without local speech', async () => {
  const h = harness(); h.time(10000); await h.session.commit();
  expect(h.access.resolve).not.toHaveBeenCalled(); expect(h.session.remainingMs).toBeNull();
  const silent = harness(); silent.session.cancel();
  silent.session.listen({ ...silent.capture, start: () => {} }); await silent.session.commit();
  expect(silent.access.getState().deadline).toBe(10000);
});
it('cancellation/replay and duplicate commit cannot execute stale results', async () => {
  const h = harness(); const pending = h.session.commit(); await h.session.commit();
  h.transcript('rook'); await Promise.resolve(); h.session.cancel();
  const replay = startRound(createGame(), 0); h.access.setState(replay);
  h.result(mate); await pending;
  expect(h.access.getState()).toBe(replay); expect(h.access.resolve).toHaveBeenCalledTimes(1);
});
it('a changed round cannot be overwritten even without cancellation', async () => {
  const h = harness(); const pending = h.session.commit();
  const replay = startRound(createGame(), 0); h.access.setState(replay);
  h.transcript('rook'); await pending;
  expect(h.access.getState()).toBe(replay); expect(h.access.resolve).not.toHaveBeenCalled();
});
it('classifies permission and device failures for usable fallbacks', () => {
  expect(voiceFailure(new DOMException('', 'NotAllowedError')).code).toBe('permission');
  expect(voiceFailure(new DOMException('', 'NotFoundError')).code).toBe('no_microphone');
});

it('cancelling a committed utterance restores time for a fallback and rejects its late transcript', async () => {
  const h = harness(); h.time(4000); const pending = h.session.commit();
  h.time(11000); h.session.cancel();
  expect(h.access.getState()).toMatchObject({ phase: 'playing', deadline: 17000, score: 0 });
  h.transcript('rook'); await pending; expect(h.access.resolve).not.toHaveBeenCalled();
});
it('a voice commit just before the deadline remains valid after arbitrarily slow processing', async () => {
  const h = harness(); h.time(9999.999); const pending = h.session.commit();
  h.time(30000); h.transcript('rook'); await Promise.resolve(); h.result(mate); await pending;
  expect(h.access.getState().score).toBe(100);
});

it.each([9000, 7000, 5000, 3000, 1000])('scores voice at its %i ms reserved remainder despite remote delay', async remaining => {
  const h = harness(); h.time(10000 - remaining); const pending = h.session.commit();
  h.time(30000); h.transcript('rook'); await Promise.resolve();
  h.time(45000); h.result(mate); await pending;
  expect(h.access.getState().score).toBe(100 + remaining / 100);
});
