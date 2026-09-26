import { expect, it, vi } from 'vitest';
import { GradiumStream, pcm16Base64 } from './stream';

class FakeSocket extends EventTarget {
  readyState = 1; bufferedAmount = 0;
  send = vi.fn(); close = vi.fn();
  message(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
}
it('encodes clipped little-endian signed PCM', () => {
  const data = Uint8Array.from(atob(pcm16Base64(new Float32Array([-2, 0, 2]))), c => c.charCodeAt(0));
  expect([...data]).toEqual([0, 128, 0, 0, 255, 127]);
});
it('uses token/setup, waits for ready, streams audio and waits for final transcript', async () => {
  const socket = new FakeSocket(); let url = '';
  const stream = new GradiumStream('temporary', 24000, vi.fn(), value => { url = value; return socket; });
  expect(url).toBe('wss://eu.api.gradium.ai/api/speech/asr?token=temporary');
  stream.audio(new Float32Array([0])); expect(socket.send).not.toHaveBeenCalled();
  socket.dispatchEvent(new Event('open'));
  expect(JSON.parse(socket.send.mock.calls[0][0])).toMatchObject({ type: 'setup', input_format: 'pcm_24000', json_config: { language: 'en', keywords: { words: ['rook', 'knight', 'bishop', 'queen', 'king', 'pawn', 'check', 'checkmate'], boost: 3 } } });
  socket.message({ type: 'ready' }); await stream.ready;
  stream.audio(new Float32Array([1]));
  expect(JSON.parse(socket.send.mock.calls[1][0]).type).toBe('audio');
  socket.message({ type: 'text', text: 'la dame' });
  const final = stream.finish(); const completed = vi.fn(); void final.then(completed);
  socket.message({ type: 'text', text: 'à côté du roi' }); await Promise.resolve(); expect(completed).not.toHaveBeenCalled();
  socket.message({ type: 'end_of_stream' });
  expect(await final).toBe('la dame à côté du roi'); expect(socket.close).toHaveBeenCalled();
});
it('handles provider errors, malformed text, disconnect and timeout', async () => {
  for (const mode of ['error', 'malformed', 'close', 'timeout']) {
    const socket = new FakeSocket(); const stream = new GradiumStream('temporary', 48000, vi.fn(), () => socket, 5);
    socket.message({ type: 'ready' }); await stream.ready;
    const final = stream.finish(); const check = expect(final).rejects.toThrow();
    if (mode === 'error') socket.message({ type: 'error', message: 'private upstream detail' });
    if (mode === 'malformed') socket.message({ type: 'text', text: {} });
    if (mode === 'close') socket.dispatchEvent(new Event('close'));
    await check;
  }
});
it('rejects readiness on cancellation and ignores later messages', async () => {
  const socket = new FakeSocket(); const stream = new GradiumStream('temporary', 24000, vi.fn(), () => socket);
  const rejected = expect(stream.ready).rejects.toThrow(); stream.cancel(); await rejected;
  socket.message({ type: 'ready' }); expect(socket.close).toHaveBeenCalledTimes(1);
});
it('records provider rejection before cleanup without leaking token or provider body', async () => {
  const { MicDiagnostics } = await import('./diagnostics');
  const lines: string[] = [];
  const diagnostic = new MicDiagnostics(line => lines.push(line));
  const socket = new FakeSocket(); const failed = vi.fn();
  const stream = new GradiumStream('secret-token-fixture', 24000, failed, () => socket, 5000, diagnostic);
  const rejected = expect(stream.ready).rejects.toThrow();
  socket.dispatchEvent(new Event('open'));
  socket.message({ type: 'error', code: 1008, message: 'Invalid or expired token: secret-token-fixture' });
  await rejected;
  expect(diagnostic.lastError).toBe('Gradium rejected token (1008)');
  expect(diagnostic.messages).toBe(1);
  expect(diagnostic.sentFrames).toBe(0);
  expect(failed).toHaveBeenCalledOnce();
  expect(lines.join('\n')).not.toContain('secret-token-fixture');
  expect(diagnostic.display()).not.toContain('secret-token-fixture');
});

it.each([16000, 24000, 48000])('declares the actual %i Hz PCM rate and leaves latency settings unchanged', async sampleRate => {
  const socket = new FakeSocket();
  const stream = new GradiumStream('temporary', sampleRate, vi.fn(), () => socket);
  socket.dispatchEvent(new Event('open'));
  const setup = JSON.parse(socket.send.mock.calls[0][0]);
  expect(setup.input_format).toBe(`pcm_${sampleRate}`);
  expect(setup.json_config).not.toHaveProperty('delay_in_frames');
  expect(setup.json_config).not.toHaveProperty('temp');
  socket.message({ type: 'ready' }); await stream.ready;
  socket.message({ type: 'text', text: 'move the book to the top' });
  const final = stream.finish();
  socket.message({ type: 'end_of_stream' });
  expect(await final).toBe('move the book to the top');
});
