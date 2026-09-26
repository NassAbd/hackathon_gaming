import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it.each([16000, 24000, 48000])('streams 80 ms chunks at %i Hz and flushes final samples on commit', sampleRate => {
  const chunkSize = sampleRate * 0.08;
  const postMessage = vi.fn();
  const port: { postMessage: typeof postMessage; onmessage?: (event: { data: string }) => void } = { postMessage };
  let Processor: (new () => { process: (input: Float32Array[][]) => boolean }) | undefined;
  runInNewContext(readFileSync(new URL('./capture-worklet.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: class { port = port; },
    registerProcessor: (_name: string, constructor: typeof Processor) => { Processor = constructor; },
    sampleRate, Float32Array, Math,
  });
  if (!Processor) throw new Error('Processor not registered');
  const processor = new Processor();
  processor.process([[new Float32Array(chunkSize).fill(0.5)]]);
  expect(postMessage.mock.calls[0][0]).toMatchObject({ type: 'diagnostic', processCalls: 1, inputFrames: chunkSize, rms: 0.5 });
  postMessage.mockClear();
  port.onmessage?.({ data: 'start' });
  processor.process([[new Float32Array(chunkSize).fill(0.5)]]);
  expect(postMessage.mock.calls[0][0]).toMatchObject({ type: 'audio', speech: true });
  expect(postMessage.mock.calls[0][0].samples.length).toBe(chunkSize);
  processor.process([[new Float32Array(128)]]);
  port.onmessage?.({ data: 'stop' });
  expect(postMessage.mock.calls[1][0]).toMatchObject({ type: 'audio', speech: false });
  expect(postMessage.mock.calls[1][0].samples.length).toBe(128);
  expect(postMessage.mock.calls[2][0]).toEqual({ type: 'stopped' });
  processor.process([[new Float32Array(chunkSize)]]);
  expect(postMessage).toHaveBeenCalledTimes(3);
});

it('preserves every sample in order across irregular blocks and the final partial chunk', () => {
  const messages: { type: string; samples?: Float32Array; offset?: number }[] = [];
  const port = { postMessage: (data: typeof messages[number]) => messages.push(data), onmessage: (event: { data: string }) => { void event; } };
  let Processor: (new () => { process(input: Float32Array[][]): boolean }) | undefined;
  runInNewContext(readFileSync(new URL('./capture-worklet.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: class { port = port; }, registerProcessor: (_name: string, constructor: typeof Processor) => { Processor = constructor; }, sampleRate: 24000, Float32Array, Math,
  });
  if (!Processor) throw new Error('Missing processor'); const processor = new Processor(); port.onmessage({ data: 'start' });
  const input = Float32Array.from({ length: 5231 }, (_, i) => (i - 2600) / 10000);
  let offset = 0;
  for (const size of [128, 512, 128, 2048, 2415]) { processor.process([[input.slice(offset, offset + size)]]); offset += size; }
  port.onmessage({ data: 'stop' });
  const chunks = messages.filter(m => m.type === 'audio');
  expect(chunks.map(c => c.offset)).toEqual([0, 1920, 3840]);
  expect(chunks.flatMap(c => [...c.samples!])).toEqual([...input]);
});
