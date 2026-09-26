import { beginMicrophoneDiagnostics } from './diagnostics';
import type { MicDiagnostics } from './diagnostics';
import { apiUrl } from '../api-url';
import { isRecord } from '../gemini/contracts';
import type { SpeechCapture, VoiceError } from './contracts';
import { VoiceFailure, VOICE_MESSAGES, voiceFailure } from './contracts';
import { GradiumStream } from './stream';

export async function prepareMicrophone(signal: AbortSignal, onFailure: (error: VoiceFailure) => void, diagnostic: MicDiagnostics = beginMicrophoneDiagnostics()): Promise<SpeechCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') { diagnostic.error('Media capture unsupported'); throw new VoiceFailure('unsupported'); }
  diagnostic.event(`User activation=${navigator.userActivation?.isActive ?? 'unknown'}; secure=${globalThis.isSecureContext ?? 'unknown'}`);
  let media: MediaStream | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: AudioWorkletNode | null = null;
  let stream: GradiumStream | null = null;
  let cancelled = false;
  let speech: (() => void) | null = null;
  let stopped: (() => void) | null = null;
  let failure: VoiceFailure | null = null;
  let released = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  const detach: (() => void)[] = [];
  const snapshot = () => {
    diagnostic.streamActive = media?.active ?? null;
    diagnostic.tracks = media?.getTracks().map(track => ({ id: track.id, readyState: track.readyState, enabled: track.enabled, muted: track.muted })) ?? [];
    diagnostic.context = context?.state ?? 'not created';
  };
  const releaseAudio = (reason: string) => {
    if (released) return;
    released = true; diagnostic.cleanup = reason; diagnostic.event(`releaseAudio: ${reason}`);
    clearInterval(poll);
    node?.disconnect(); source?.disconnect(); diagnostic.graph = 'disconnected'; diagnostic.recording = false; diagnostic.worklet = 'stopped';
    media?.getTracks().forEach(track => { diagnostic.event(`track.stop(): ${reason}`); track.stop(); });
    snapshot(); diagnostic.reference = 'held (stopped; awaiting disposal)';
    if (context && context.state !== 'closed') {
      diagnostic.event(`AudioContext.close(): ${reason}`);
      void context.close().then(() => { snapshot(); diagnostic.event(`AudioContext state=${context?.state}`); }).catch(() => diagnostic.error('AudioContext close failed'));
    }
    for (const remove of detach) remove();
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true; diagnostic.event(`capture.cancel(); signal.aborted=${signal.aborted}`);
    releaseAudio(signal.aborted ? 'setup/controller abort' : 'capture cancelled'); stream?.cancel(); stopped?.();
    signal.removeEventListener('abort', cancel); diagnostic.event('abort listener removed');
  };
  signal.addEventListener('abort', cancel, { once: true });
  const check = () => { if (cancelled || signal.aborted) throw new VoiceFailure('cancelled'); };
  try {
    check();
    // Resume in the button's user-activation turn, before network/permission awaits.
    context = new AudioContext({ sampleRate: 24000 });
    diagnostic.contextRate = context.sampleRate;
    diagnostic.context = context.state; diagnostic.event(`AudioContext created state=${context.state} rate=${context.sampleRate}`);
    const contextChanged = () => { snapshot(); diagnostic.event(`AudioContext statechange=${context?.state}`); };
    context.addEventListener?.('statechange', contextChanged);
    detach.push(() => context?.removeEventListener?.('statechange', contextChanged));
    if (!context.audioWorklet || ![16000, 24000, 48000].includes(context.sampleRate)) throw new VoiceFailure('unsupported');
    diagnostic.event('AudioContext.resume() called in user gesture');
    const audioReady = context.resume();
    // Some embedded browsers leave resume pending. Do not let that hide server errors.
    void audioReady.catch(() => {});
    // Check server setup before requesting access to the user's microphone.
    const response = await fetch(apiUrl('gradium-token'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
    const token: unknown = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    if (isRecord(token) && typeof token.error === 'string' && Object.hasOwn(VOICE_MESSAGES, token.error)) throw new VoiceFailure(token.error as VoiceError);
    if (!response.ok || !isRecord(token) || typeof token.token !== 'string' || !token.token || typeof token.expires_at !== 'string' || !(Date.parse(token.expires_at) > Date.now())) throw new VoiceFailure('unavailable');
    check();
    // Permission prompts cannot be aborted; stop any stream that arrives after cancellation.
    diagnostic.permission = 'requested'; diagnostic.event('getUserMedia called');
    const permission = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    let permissionTimeout: ReturnType<typeof setTimeout> | undefined;
    media = await Promise.race([
      permission.then(value => {
        diagnostic.permission = 'granted'; diagnostic.streamId = value.id; diagnostic.event(`getUserMedia resolved stream=${value.id}`);
        if (cancelled) { value.getTracks().forEach(track => { diagnostic.event('track.stop(): late permission grant after cancellation'); track.stop(); }); throw new VoiceFailure('cancelled'); }
        return value;
      }, error => { diagnostic.permission = 'rejected'; diagnostic.error(`getUserMedia rejected: ${voiceFailure(error).code}`); throw error; }),
      new Promise<never>((_resolve, reject) => { permissionTimeout = setTimeout(() => { cancel(); reject(new VoiceFailure('timeout')); }, 15000); }),
    ]).finally(() => clearTimeout(permissionTimeout));
    const audioTrack = media.getAudioTracks?.()[0] ?? media.getTracks()[0];
    diagnostic.deviceLabel = audioTrack?.label || 'not exposed';
    const settings = audioTrack?.getSettings?.() ?? {};
    diagnostic.trackSettings = Object.fromEntries(['sampleRate', 'sampleSize', 'channelCount', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'latency'].map(key => [key, settings[key as keyof MediaTrackSettings] ?? null]));
    diagnostic.reference = 'strongly held by capture closures'; snapshot();
    for (const track of media.getTracks()) {
      for (const name of ['ended', 'mute', 'unmute']) {
        const changed = () => { snapshot(); diagnostic.event(`track ${name} state=${track.readyState} muted=${track.muted}`); };
        track.addEventListener?.(name, changed); detach.push(() => track.removeEventListener?.(name, changed));
      }
    }
    poll = setInterval(snapshot, 250);
    check();
    if (!(Date.parse(token.expires_at) > Date.now())) { diagnostic.error('Token expired while waiting for microphone permission'); throw new VoiceFailure('unavailable'); }
    let audioTimeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      audioReady,
      new Promise<never>((_resolve, reject) => { audioTimeout = setTimeout(() => reject(new VoiceFailure('unsupported')), 3000); }),
    ]).finally(() => clearTimeout(audioTimeout));
    check();
    diagnostic.event('AudioWorklet addModule called');
    await context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url).href); check();
    diagnostic.event('AudioWorklet module loaded');
    node = new AudioWorkletNode(context, 'soniccheck-capture', { channelCount: 1, channelCountMode: 'explicit' });
    diagnostic.worklet = 'created'; diagnostic.event('AudioWorkletNode created');
    source = context.createMediaStreamSource(media); diagnostic.event('MediaStreamAudioSourceNode created');
    const processorError = () => { diagnostic.error('AudioWorklet processorerror'); failure = new VoiceFailure('unavailable'); releaseAudio('worklet processorerror'); onFailure(failure); };
    node.addEventListener?.('processorerror', processorError);
    detach.push(() => node?.removeEventListener?.('processorerror', processorError));
    node.port.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isRecord(data) || cancelled) return;
      if (data.type === 'diagnostic' && typeof data.processCalls === 'number' && typeof data.inputFrames === 'number' && typeof data.rms === 'number') {
        if (diagnostic.processCalls === 0) diagnostic.event('First AudioWorklet process heartbeat');
        if (typeof data.sampleRate === 'number') diagnostic.workletRate = data.sampleRate;
        if (typeof data.channels === 'number') diagnostic.workletChannels = data.channels;
        diagnostic.worklet = 'active'; diagnostic.processCalls = data.processCalls; diagnostic.inputFrames = data.inputFrames;
        diagnostic.rms = data.rms; diagnostic.lastFrameAt = performance.now();
      } else if (data.type === 'audio' && data.samples instanceof Float32Array) {
        if (typeof data.offset === 'number' && data.offset !== diagnostic.receivedFrames) diagnostic.discontinuities++;
        diagnostic.receivedFrames += data.samples.length;
        diagnostic.audioChunks++;
        if (data.speech === true) speech?.();
        stream?.audio(data.samples);
      } else if (data.type === 'stopped') stopped?.();
    };
    diagnostic.tokenRemainingMs = Date.parse(token.expires_at) - Date.now();
    diagnostic.event('Opening Gradium socket with fresh token (value omitted)');
    stream = new GradiumStream(token.token, context.sampleRate, error => {
      failure = error;
      releaseAudio(`Gradium failure: ${error.code}`);
      if (error.code !== 'cancelled') onFailure(error);
    }, undefined, undefined, diagnostic);
    await stream.ready; check();
    diagnostic.event('Gradium ready accepted');
    source.connect(node); node.connect(context.destination);
    diagnostic.graph = 'source → worklet → destination (silent)'; diagnostic.event('Audio graph connected');
    for (const track of media.getTracks()) track.addEventListener('ended', () => { if (!cancelled) { failure = new VoiceFailure('no_microphone'); onFailure(failure); cancel(); } });
    return {
      start(onSpeech) { check(); speech = onSpeech; diagnostic.recording = true; diagnostic.event('capture.start(): round listening'); node?.port.postMessage('start'); },
      async finish() {
        check(); if (failure) throw failure;
        diagnostic.event('capture.finish(): committed utterance');
        let flushTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            stopped = resolve;
            flushTimeout = setTimeout(() => reject(new VoiceFailure('timeout')), 1000);
            node?.port.postMessage('stop');
          });
        } finally { clearTimeout(flushTimeout); stopped = null; releaseAudio('utterance committed; capture complete'); }
        check(); if (failure) throw failure;
        return await stream!.finish();
      },
      cancel,
    };
  } catch (error) {
    const result = voiceFailure(error);
    if (diagnostic.lastError === 'none' && result.code !== 'cancelled') diagnostic.error(`Capture setup failed: ${result.code}`);
    releaseAudio(`setup failed: ${result.code}`); cancel(); throw result;
  }
}
