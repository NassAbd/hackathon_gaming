import { afterEach, expect, it, vi } from 'vitest';
import { prepareMicrophone } from './capture';

afterEach(() => vi.unstubAllGlobals());
const close = vi.fn(async () => {});
function environment(getUserMedia = vi.fn()) {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', class {
    sampleRate = 24000; state = 'running'; audioWorklet = { addModule: vi.fn() };
    resume = async () => {}; close = close;
  });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ token: 'temporary', expires_at: new Date(Date.now() + 60000).toISOString() })));
  return getUserMedia;
}
it('missing Gradium credentials never prompts for microphone access', async () => {
  const getUserMedia = environment();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'missing_credentials' })));
  await expect(prepareMicrophone(new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'missing_credentials' });
  expect(getUserMedia).not.toHaveBeenCalled(); expect(close).toHaveBeenCalled();
});
it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])('cleans up and reports browser microphone error %s', async name => {
  environment(vi.fn(async () => { throw new DOMException('', name); }));
  await expect(prepareMicrophone(new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: name === 'NotAllowedError' ? 'permission' : 'no_microphone' });
});
it('stops a media stream returned after permission cancellation', async () => {
  let permit: (value: unknown) => void = () => {};
  environment(vi.fn(() => new Promise(resolve => { permit = resolve; })));
  const controller = new AbortController();
  const pending = prepareMicrophone(controller.signal, vi.fn());
  await vi.waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
  controller.abort(); const stop = vi.fn(); permit({ getTracks: () => [{ stop }] });
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' }); expect(stop).toHaveBeenCalledOnce();
});
it('reports missing credentials even if the embedded browser never resumes audio', async () => {
  const getUserMedia = environment();
  vi.stubGlobal('AudioContext', class {
    sampleRate = 24000; state = 'suspended'; audioWorklet = {}; close = close;
    resume = () => new Promise<void>(() => {});
  });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'missing_credentials' })));
  await expect(prepareMicrophone(new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'missing_credentials' });
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('keeps prepared capture alive, measures local frames, and attributes provider-triggered shutdown', async () => {
  const { MicDiagnostics } = await import('./diagnostics');
  const diagnostic = new MicDiagnostics(() => {});
  vi.useFakeTimers();
  class Track extends EventTarget {
    id = 'track-fixture'; readyState = 'live'; enabled = true; muted = false;
    stop = vi.fn(() => { this.readyState = 'ended'; });
  }
  const track = new Track();
  const media = { id: 'stream-fixture', get active() { return track.readyState === 'live'; }, getTracks: () => [track] };
  const getUserMedia = vi.fn(async () => media);
  environment(getUserMedia);
  const disconnect = vi.fn();
  vi.stubGlobal('AudioContext', class extends EventTarget {
    sampleRate = 24000; state = 'running'; destination = {};
    audioWorklet = { addModule: vi.fn(async () => {}) };
    resume = async () => {};
    close = vi.fn(async () => { this.state = 'closed'; this.dispatchEvent(new Event('statechange')); });
    createMediaStreamSource = () => ({ connect: vi.fn(), disconnect });
  });
  let port: { onmessage?: (event: { data: unknown }) => void; postMessage: (data: string) => void } | undefined;
  vi.stubGlobal('AudioWorkletNode', class extends EventTarget {
    port = { postMessage: vi.fn() }; connect = vi.fn(); disconnect = disconnect;
    constructor() { super(); port = this.port; }
  });
  let socket: WebSocket | undefined;
  const send = vi.fn();
  vi.stubGlobal('WebSocket', class extends EventTarget {
    readyState = 1; bufferedAmount = 0; send = send; close = vi.fn();
    constructor() {
      super(); socket = this as unknown as WebSocket;
      queueMicrotask(() => {
        this.dispatchEvent(new Event('open'));
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'ready' }) }));
      });
    }
  });
  const onFailure = vi.fn();
  try {
    const capture = await prepareMicrophone(new AbortController().signal, onFailure, diagnostic);
    await vi.advanceTimersByTimeAsync(1000);
    expect(track.stop).not.toHaveBeenCalled();
    expect(diagnostic.context).toBe('running');
    expect(diagnostic.streamActive).toBe(true);
    expect(diagnostic.streamId).toBe('stream-fixture');
    expect(diagnostic.reference).toContain('strongly held');
    expect(diagnostic.ready).toBe(true);
    port?.onmessage?.({ data: { type: 'diagnostic', processCalls: 48, inputFrames: 6144, rms: 0.08 } });
    expect(diagnostic.rms).toBe(0.08);
    expect(diagnostic.sentFrames).toBe(0);
    capture.start(vi.fn());
    port?.onmessage?.({ data: { type: 'audio', samples: new Float32Array(1920), speech: true } });
    expect(diagnostic.sentFrames).toBe(1920);
    expect(diagnostic.sentChunks).toBe(1);
    track.muted = true; track.dispatchEvent(new Event('mute'));
    expect(diagnostic.tracks[0].muted).toBe(true);
    socket?.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'error', code: 1008, message: 'Invalid or expired token' }) }));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(diagnostic.cleanup).toBe('Gradium failure: unavailable');
    expect(diagnostic.lastError).toBe('Gradium rejected token (1008)');
    expect(diagnostic.streamActive).toBe(false);
    expect(onFailure).toHaveBeenCalledOnce();
    capture.cancel();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
