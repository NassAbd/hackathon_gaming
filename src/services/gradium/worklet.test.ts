import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('streams only after Start, emits 80 ms chunks and flushes the final samples on commit', () => {
  const postMessage = vi.fn();
  const port: { postMessage: typeof postMessage; onmessage?: (event: { data: string }) => void } = { postMessage };
  let Processor: (new () => { process: (input: Float32Array[][]) => boolean }) | undefined;
  runInNewContext(readFileSync(new URL('./capture-worklet.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: class { port = port; },
    registerProcessor: (_name: string, constructor: typeof Processor) => { Processor = constructor; },
    sampleRate: 24000, Float32Array, Math,
  });
  if (!Processor) throw new Error('Processor not registered');
  const processor = new Processor();
  processor.process([[new Float32Array(1920).fill(0.5)]]);
  expect(postMessage.mock.calls[0][0]).toMatchObject({ type: 'diagnostic', processCalls: 1, inputFrames: 1920, rms: 0.5 });
  postMessage.mockClear();
  port.onmessage?.({ data: 'start' });
  processor.process([[new Float32Array(1920).fill(0.5)]]);
  expect(postMessage.mock.calls[0][0]).toMatchObject({ type: 'audio', speech: true });
  expect(postMessage.mock.calls[0][0].samples.length).toBe(1920);
  processor.process([[new Float32Array(128)]]);
  port.onmessage?.({ data: 'stop' });
  expect(postMessage.mock.calls[1][0]).toMatchObject({ type: 'audio', speech: false });
  expect(postMessage.mock.calls[1][0].samples.length).toBe(128);
  expect(postMessage.mock.calls[2][0]).toEqual({ type: 'stopped' });
  processor.process([[new Float32Array(1920)]]);
  expect(postMessage).toHaveBeenCalledTimes(3);
});
