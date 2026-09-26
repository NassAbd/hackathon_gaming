/** Local-only opt-in copy of PCM bytes successfully queued to the STT socket. */
export class DebugAudio {
  enabled = false;
  private recording = false;
  private rate = 24000;
  private chunks: Uint8Array[] = [];
  frames = 0;
  begin(rate: number): void {
    this.recording = this.enabled; this.rate = rate;
    this.chunks = []; this.frames = 0;
  }
  append(base64: string): void {
    if (!this.recording || !this.enabled) return;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const keep = Math.min(bytes.length, Math.max(0, this.rate * 8 - this.frames) * 2);
    if (keep) { this.chunks.push(bytes.slice(0, keep)); this.frames += keep / 2; }
  }
  clear(): void { this.recording = false; this.chunks = []; this.frames = 0; }
  wav(): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + this.frames * 2); const view = new DataView(buffer);
    const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + this.frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, this.rate, true); view.setUint32(28, this.rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, this.frames * 2, true);
    let offset = 44; for (const chunk of this.chunks) { new Uint8Array(buffer).set(chunk, offset); offset += chunk.length; }
    return buffer;
  }
}
export const debugAudio = new DebugAudio();
