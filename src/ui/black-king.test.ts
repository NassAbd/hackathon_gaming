import { expect, it, vi } from 'vitest';
import { BlackKingVoice, KING_LINES, kingCue, type KingCue } from './black-king';
import { createGame, startRound } from '../game';
const urls = Object.fromEntries(Object.keys(KING_LINES).map(key => [key, `${key}.wav`])) as Record<KingCue, string>;
function harness() {
  let blocked = false;
  const audios: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn>; resolve: () => void; reject: () => void }[] = [];
  const create = vi.fn(() => {
    let resolve = () => {}, reject = () => {};
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = () => no(new Error('missing')); });
    const audio = { play: vi.fn(() => promise), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(), resolve, reject };
    audios.push(audio); return audio;
  });
  const voice = new BlackKingVoice(urls, () => blocked, create);
  return { voice, audios, create, block: (value: boolean) => { blocked = value; } };
}
it('maps all six lines, alternates READY and permits unresolved only while time remains', () => {
  const ready = createGame(), playing = startRound(ready, 0);
  expect(kingCue(ready, 1, false, 0)).toBe('start-1');
  expect(kingCue(ready, 2, false, 0)).toBe('start-2');
  expect(kingCue(playing, 1, true, 9999)).toBe('unresolved');
  expect(kingCue(playing, 1, true, 10000)).toBeNull();
  expect(kingCue({...playing, deadline:null}, 1, true, 1)).toBeNull();
  expect(kingCue(playing, 1, false, 1)).toBeNull();
  expect(kingCue({...ready, phase:'result', outcome:'miss'}, 1, false, 0)).toBe('not-mate');
  expect(kingCue({...ready, phase:'result', outcome:'mate'}, 1, false, 0)).toBe('checkmate');
  expect(kingCue({...ready, phase:'result', outcome:'timeout'}, 1, true, 0)).toBeNull();
  expect(kingCue({...ready, phase:'complete'}, 1, false, 0)).toBe('run-complete');
});
it('starts only after interaction, once per event, and replaces without waiting', () => {
  const h=harness(); h.voice.update('ready1','start-1'); expect(h.create).not.toHaveBeenCalled();
  h.voice.unlock(); h.voice.update('ready1','start-1'); expect(h.create).toHaveBeenCalledTimes(1);
  h.voice.update('ready2','start-2'); expect(h.audios[0].pause).toHaveBeenCalled(); expect(h.create).toHaveBeenLastCalledWith('start-2.wav');
  h.voice.update('playing',null); expect(h.audios[1].removeAttribute).toHaveBeenCalledWith('src');
});
it('PTT stop invalidates pending playback; late completion cannot restart it or stop new audio', async () => {
  const h=harness(); h.voice.unlock(); h.voice.update('result','checkmate');
  h.voice.stop(); expect(h.audios[0].pause).toHaveBeenCalled();
  h.block(true); h.voice.update('capture',null); h.voice.update('blocked','unresolved');
  h.block(false); h.voice.update('blocked','unresolved'); h.voice.unlock(); expect(h.create).toHaveBeenCalledTimes(1);
  h.voice.update('new','start-2'); h.audios[0].resolve(); await Promise.resolve();
  expect(h.audios[1].pause).not.toHaveBeenCalled(); expect(h.create).toHaveBeenCalledTimes(2);
});
it('mute stops audio, prevents playback, and unmute never resumes stale lines', () => {
  const h=harness();h.voice.unlock();h.voice.update('1','start-1');h.voice.muted=true;
  expect(h.audios[0].pause).toHaveBeenCalled();h.voice.update('2','checkmate');h.voice.muted=false;h.voice.unlock();h.voice.update('2','checkmate');expect(h.create).toHaveBeenCalledTimes(1);
});
it('missing files, rejected autoplay and unavailable audio never throw into gameplay', async () => {
  const h=harness();h.voice.unlock();h.voice.update('1','start-1');h.audios[0].reject();await Promise.resolve();await Promise.resolve();
  expect(h.audios[0].pause).toHaveBeenCalled();
  const voice=new BlackKingVoice(urls,()=>false,()=>{throw new Error('unavailable');});
  expect(()=>{voice.unlock();voice.update('1','start-1');voice.stop();}).not.toThrow();
});
