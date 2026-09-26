import { expect, it } from 'vitest';
import { DebugAudio, debugAudio } from './debug-audio';
import { GradiumStream, pcm16Base64 } from './stream';
it('exports the exact socket PCM bytes as signed mono WAV with the actual rate', async () => {
  class Socket extends EventTarget {
    readyState = 1; bufferedAmount = 0; audio = '';
    send(raw: string) { const data = JSON.parse(raw); if (data.type === 'audio') this.audio += atob(data.audio); }
    close() {}
  }
  const socket = new Socket(); debugAudio.enabled = true;
  const stream = new GradiumStream('fixture', 24000, () => {}, () => socket);
  socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'ready' }) })); await stream.ready;
  stream.audio(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2])); stream.audio(new Float32Array([0.25])); stream.cancel();
  const wav = debugAudio.wav(); const view = new DataView(wav);
  expect(view.getUint32(24, true)).toBe(24000); expect(view.getUint16(22, true)).toBe(1); expect(view.getUint16(34, true)).toBe(16);
  expect([...new Uint8Array(wav, 44)]).toEqual([...socket.audio].map(c => c.charCodeAt(0)));
  expect(view.getInt16(48, true)).toBe(-16384); expect(view.getInt16(52, true)).toBe(16383);
  debugAudio.enabled = false; debugAudio.clear();
});
it('does not retain audio unless enabled and caps local recording at eight seconds', () => {
  const record = new DebugAudio(); record.begin(16000); record.append(pcm16Base64(new Float32Array(20))); expect(record.frames).toBe(0);
  record.enabled = true; record.begin(16000); record.append(pcm16Base64(new Float32Array(16000 * 9)));
  expect(record.frames).toBe(16000 * 8); expect(record.wav().byteLength).toBe(44 + 16000 * 8 * 2);
  record.clear(); expect(record.frames).toBe(0);
});
