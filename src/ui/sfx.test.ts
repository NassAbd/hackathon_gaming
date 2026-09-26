import { afterEach, expect, it, vi } from 'vitest';
import { LocalSfx } from './sfx';
afterEach(() => vi.unstubAllGlobals());
it('creates one output context and stays silent before interaction, when muted, or during capture', () => {
  const oscillator = vi.fn(() => ({ frequency: { value: 0 }, connect() {}, start() {}, stop() {}, disconnect() {}, onended: null }));
  const constructed = vi.fn();
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; destination = {};
    constructor() { constructed(); }
    resume() { return Promise.resolve(); }
    createOscillator = oscillator;
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  });
  let capturing = false; const sfx = new LocalSfx(() => capturing);
  sfx.play('mate'); expect(oscillator).not.toHaveBeenCalled();
  sfx.unlock(); sfx.unlock(); expect(constructed).toHaveBeenCalledOnce();
  sfx.play('mate'); expect(oscillator).toHaveBeenCalledTimes(3);
  capturing = true; sfx.play('lock'); capturing = false; sfx.muted = true; sfx.play('fail');
  expect(oscillator).toHaveBeenCalledTimes(3);
});
it('autoplay or unavailable audio cannot throw into gameplay', async () => {
  vi.stubGlobal('AudioContext', class { state = 'suspended'; resume() { return Promise.reject(new Error('blocked')); } });
  const sfx = new LocalSfx(() => false); expect(() => { sfx.unlock(); sfx.play('complete'); }).not.toThrow(); await Promise.resolve();
  vi.stubGlobal('AudioContext', undefined); expect(() => new LocalSfx(() => false).unlock()).not.toThrow();
});
