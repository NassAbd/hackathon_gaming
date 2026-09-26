import { expect, it } from 'vitest';
import { SessionLog } from './session-log';
import { createGame } from '../game';
import { MicDiagnostics } from '../services/gradium/diagnostics';
const telemetry = { speechStart: 10, speechCommitted: 100, transcriptAvailable: 200, intentRequestStart: 200, intentResolved: 400, validationComplete: 401, moveCommitted: 402, remainingMs: 4900 };
it('preserves separate attempts across retries with final transcript, SAN and measured durations', () => {
  const log = new SessionLog({ appVersion: 'test', userAgent: 'test', language: 'en', viewport: '1100x620' });
  const diag = new MicDiagnostics(() => {});
  for (let retry = 0; retry < 3; retry++) {
    const id = log.begin(createGame(), 1, retry + 1, retry);
    log.update(id, `rook to a eight ${retry}`, telemetry, diag);
    log.finish(id, { result: 'mate', resolverStatus: 'resolved', proposal: { from: 'a1', to: 'a8' } }, diag);
  }
  const data = JSON.parse(log.export());
  expect(data.attempts.map((a: { index: number }) => a.index)).toEqual([1, 2, 3]);
  expect(data.attempts[2]).toMatchObject({ retry: 2, finalTranscript: 'rook to a eight 2', san: 'Ra8#', validation: 'legal', durationsMs: { speech: 90, finalTranscriptionWait: 100, intent: 200, validation: 1, commitToMove: 302 } });
  log.finish(1, { result: 'cancelled' }, diag);
  log.update(1, 'late response', telemetry, diag);
  expect(log.attempts[0].result).toBe('mate'); expect(log.attempts[0].transcript).toBe('rook to a eight 0');
});
it('excludes secret-bearing diagnostic fields, runtime extras and candidate extras from export', () => {
  const secret = 'configured-secret-fixture'; const token = 'browser-token-fixture';
  const log = new SessionLog({ appVersion: 'test', userAgent: 'test', language: 'en', viewport: 'test', ...{ GEMINI_API_KEY: secret } });
  const diag = Object.assign(new MicDiagnostics(() => {}), { GRADIUM_API_KEY: secret, token, url: `wss://example.invalid/?token=${token}`, headers: { Authorization: secret }, lastError: secret, events: [token] });
  const id = log.begin(createGame(), 1, 1, 0);
  log.update(id, 'rook', { ...telemetry, ...{ token } }, diag);
  log.finish(id, { result: 'mate', proposal: { from: 'a1', to: 'a8', ...{ token } } }, diag);
  const json = log.export(); expect(json).not.toContain(secret); expect(json).not.toContain(token); expect(json).not.toContain('wss:'); expect(json).not.toContain('Authorization');
});
it('keeps unavailable measurements null and logs setup cancellation without inventing STT', () => {
  const log = new SessionLog({ appVersion: 'test', userAgent: 'test', language: 'en', viewport: 'test' });
  const id = log.begin(createGame(), 1, 1, 0);
  log.finish(id, { result: 'cancelled' }, new MicDiagnostics(() => {}));
  expect(JSON.parse(log.export()).attempts[0]).toMatchObject({ finalTranscript: null, proposal: null, san: null, durationsMs: { intent: null, speech: null } });
});
