import { roundView } from './ui/round-view';
import { RunPresentation, subtitleText, failureTitle, motionDuration } from './ui/presentation';
import { LocalSfx } from './ui/sfx';
import { debugAudio } from './services/gradium/debug-audio';
import { retryPuzzle } from './ui/retry';
import { SessionLog } from './ui/session-log';
import type { Completion } from './services/gradium/contracts';
import { PushToTalk } from './ui/push-to-talk';
import { microphoneDiagnostics } from './services/gradium/diagnostics';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { advance, createGame, ROUND_MS, startRound, submitMove, tick } from './game';
import { PUZZLES } from './puzzles';
import { requestIntent } from './services/gemini/client';
import { IntentSession } from './services/gemini/session';
import { prepareMicrophone } from './services/gradium/capture';
import { VoiceSession } from './services/gradium/session';
import type { SpeechCapture } from './services/gradium/contracts';
import { voiceFailure } from './services/gradium/contracts';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing app root');
const debug = new URLSearchParams(location.search).get('debug') === '1';
root.innerHTML = `
  <header><a class="brand" href="./">◉ SonicCheck<span>VOICE CHESS · ENGLISH</span></a><span class="mode">ONE MOVE. FIVE SECONDS.</span><button id="sound-toggle" type="button" aria-pressed="false" aria-label="Mute sound effects">Sound on</button><button id="debug-toggle" type="button" aria-expanded="false">Debug</button></header>
  <main class="arena">
    <section class="board-stage" aria-label="Chess puzzle">
      <div class="puzzle-heading"><div><p class="eyebrow" id="progress"></p><h2 id="title"></h2></div><span class="side">White to move · Mate in one</span></div>
      <div id="board" class="board" role="group" aria-label="Chessboard, white at bottom"></div><div id="subtitle" class="subtitle" data-speaker="player" aria-live="polite" aria-atomic="true"><span class="speaker">YOU SAID</span><span id="heard"></span></div>
    </section>
    <section class="play-panel" aria-label="Voice controls and results">
      <div class="stats"><div><span>SCORE</span><strong id="score">0</strong></div><div><span>COMBO</span><strong id="combo">×0</strong></div><div><span>TIME LEFT</span><strong id="timer" role="timer">5.0s</strong></div></div>
      <div class="time-track"><div id="time-bar"></div></div>
      <div class="player-feedback" aria-live="polite"><p class="eyebrow" id="player-eyebrow">FIND THE MATE</p><div id="result-san" aria-hidden="true"></div><h1 id="player-state">READY</h1><p id="feedback"></p></div>
      <div id="score-gain" aria-hidden="true"></div><section id="run-summary" hidden aria-label="Final results"><div><span>FINAL SCORE</span><strong id="final-score"></strong></div><div><span>PUZZLES SOLVED</span><strong id="final-solved"></strong></div><div><span>BEST COMBO</span><strong id="best-combo"></strong></div></section><div id="listening-level" class="listening-level" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <button id="prepare" type="button" class="primary">PREPARE MIC</button><button id="start-puzzle" type="button" class="talk">START PUZZLE</button><button id="talk" type="button" class="talk" aria-describedby="talk-help">HOLD TO SPEAK</button>
      <p id="talk-help">The clock starts when the board appears. Hold. Say your move. Release.</p>
      <div class="result-actions"><button id="retry" class="primary" type="button" hidden>Retry puzzle ↻</button><button id="action" class="primary" type="button">Next puzzle →</button></div>
      <p class="partners">Voice by Gradium · Intent by Gemini · Rules by chess.js</p>
    </section>
  </main>
  <section id="debug-panel" class="debug-panel" hidden aria-label="Development controls"><div class="debug-heading"><strong>Development controls</strong><button id="debug-close" type="button">Close</button></div>
      <div id="voice-controls" class="input-row"><button id="microphone" type="button">Enable microphone</button><button id="voice-send" type="button" disabled>Send speech</button><button id="voice-cancel" type="button" disabled>Cancel voice</button></div>
      <p id="voice-status" role="status" aria-live="polite">Enable before Start. Speak during the round, then Send speech before the deadline.</p>
      <section class="mic-diagnostics" aria-label="Microphone development diagnostics"><strong>Microphone diagnostics · development</strong><pre id="mic-diagnostics"></pre></section>
      <details><summary>Voice latency telemetry</summary><pre id="voice-trace">No voice attempt yet. Timestamps use the browser monotonic clock.</pre></details>
      <form id="intent-form"><label for="intent">Describe your move <span>(English)</span></label><div class="input-row"><input id="intent" maxlength="300" autocomplete="off" placeholder="put the rook on the back rank" aria-describedby="intent-help" /><button id="resolve" type="submit">Resolve ↗</button></div></form>
      <p id="intent-help">Prepare your words before Start, then Resolve during the round. The clock keeps running.</p>
      <p id="intent-status" role="status" aria-live="polite">Gemini requires a server API key. Fallback controls work without it.</p>
      <details id="intent-inspection"><summary>Inspect interpretation</summary><pre id="intent-trace">No request yet.</pre></details>
      <form id="move-form"><label for="move">Type a move <span>(e.g. a1 a8)</span></label><div class="input-row"><input id="move" autocomplete="off" spellcheck="false" placeholder="from → to" aria-describedby="controls-help" /><button id="submit" type="submit">Move ↗</button></div></form>
<label><input id="record-pcm" type="checkbox" /> Record next voice stream locally (max 8s)</label><button id="download-wav" type="button">Download exact-stream WAV</button><p id="wav-status" role="status"></p><details id="session-log"><summary>Session log</summary><pre id="attempt-list">No voice attempts yet.</pre><div class="input-row"><button id="copy-log" type="button">Copy session log</button><button id="download-log" type="button">Download JSON</button></div><p id="export-status" role="status"></p><textarea id="session-json" readonly hidden aria-label="Session log JSON"></textarea></details><button id="debug-retry" class="primary" type="button">Restart current puzzle</button><p id="controls-help">Debug: start the clock, then type or click a move. Fallbacks cancel voice.</p><button id="debug-start" class="primary" type="button">Start round</button></section>`;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing ${id}`);
  return found as T;
}
const board = element<HTMLDivElement>('board');
const input = element<HTMLInputElement>('move');
const action = element<HTMLButtonElement>('action');
const intentInput = element<HTMLInputElement>('intent');
const intentSession = new IntentSession();
const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const glyphs = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const presentation = new RunPresentation();
const sfx = new LocalSfx(() => microphoneDiagnostics.recording);
let state = createGame();
let puzzleInitial = state;
let runIndex = 1, roundIndex = 1, retryIndex = 0;
let activeAttempt: number | null = null;
const history = new SessionLog({ appVersion: '0.1.0', userAgent: navigator.userAgent, language: navigator.language, viewport: `${innerWidth}x${innerHeight}` });
function finishAttempt(result: Completion, id = activeAttempt): void {
  if (id === null) return;
  history.finish(id, result, microphoneDiagnostics);
  if (activeAttempt === id) activeAttempt = null;
  renderHistory();
}
function renderHistory(): void {
  element('attempt-list').textContent = history.attempts.map(a => `Attempt ${a.index} · ${a.puzzle.name} · run ${a.run} / round ${a.round} / retry ${a.retry}
Transcript: ${a.transcript || '—'}
Proposal: ${JSON.stringify(a.proposal)}
Result: ${a.result ?? 'in progress'} · SAN: ${a.san ?? '—'}
STT: ${a.telemetry.transcriptAvailable === null || a.telemetry.speechCommitted === null ? '—' : Math.round(a.telemetry.transcriptAvailable - a.telemetry.speechCommitted)} ms · Intent: ${a.telemetry.intentResolved === null || a.telemetry.intentRequestStart === null ? '—' : Math.round(a.telemetry.intentResolved - a.telemetry.intentRequestStart)} ms`).join('\n\n') || 'No voice attempts yet.';
}
function prepareLogged(signal: AbortSignal, failed: (error: ReturnType<typeof voiceFailure>) => void): Promise<SpeechCapture> {
  const id = history.begin(state, runIndex, roundIndex, retryIndex); activeAttempt = id; renderHistory();
  return prepareMicrophone(signal, error => {
    if (activeAttempt !== id) return;
    if (!voiceSession.pending) finishAttempt({ result: error.code === 'timeout' ? 'timeout' : 'provider_failure', errorCode: error.code }, id);
    failed(error);
  }).catch(error => {
    const failure = voiceFailure(error);
    finishAttempt({ result: signal.aborted ? 'cancelled' : failure.code === 'timeout' ? 'timeout' : 'provider_failure', errorCode: failure.code }, id);
    throw error;
  });
}
let selected: Square | null = null;
let armedCapture: SpeechCapture | null = null;
let preparedAt = 0;
let microphoneSetup: AbortController | null = null;
let playerError = '';
let heard = '';
let debugOpen = debug;
const voiceSession = new VoiceSession({
  getState: () => state,
  setState: next => { state = next; selected = null; },
  now: () => performance.now(),
  resolve: requestIntent,
  changed: () => { if (state.phase === 'playing') playerError = 'Didn’t catch that — try again'; render(); },
  completed: (result, transcript, telemetry) => {
    if (activeAttempt !== null) history.update(activeAttempt, transcript, telemetry, microphoneDiagnostics);
    finishAttempt(result);
  },
  inspect: (message, transcript, timestamps, proposal) => {
    if (activeAttempt !== null) { history.update(activeAttempt, transcript, timestamps, microphoneDiagnostics); renderHistory(); }
    element('voice-status').textContent = message;
    if (transcript) { intentInput.value = transcript; heard = transcript; }
    if (timestamps.intentResolved !== null || (timestamps.speechCommitted !== null && !voiceSession.pending)) playerError = 'Didn’t catch that — try again';
    const duration = (start: number | null, end: number | null) => start === null || end === null ? null : end - start;
    element('voice-trace').textContent = JSON.stringify({
      transcript, proposal: proposal ?? null, timestamps,
      durationsMs: {
        speech: duration(timestamps.speechStart, timestamps.speechCommitted),
        finalTranscriptionWait: duration(timestamps.speechCommitted, timestamps.transcriptAvailable),
        intent: duration(timestamps.intentRequestStart, timestamps.intentResolved),
        validation: duration(timestamps.intentResolved, timestamps.validationComplete),
        commitToMove: duration(timestamps.speechCommitted, timestamps.moveCommitted),
      },
      speechStartDefinition: 'First locally observed audio chunk with RMS > 0.01; not semantic VAD.',
      result: message,
    }, null, 2);
    render();
  },
});
const talk = new PushToTalk({
  allowed: () => state.phase === 'playing' && state.deadline !== null && performance.now() < state.deadline && !voiceSession.pending && !intentSession.pending && !microphoneSetup,
  prepare: signal => {
    playerError = ''; heard = '';
    if (armedCapture) { const capture = armedCapture; armedCapture = null; return Promise.resolve(capture); }
    return prepareLogged(signal, error => {
      playerError = playerFailure(error);
      if (!voiceSession.pending) cancelVoice('capture failure');
      render();
    });
  },
  start: capture => {
    voiceSession.listen(capture);
  },
  commit: async () => { const round = roundIndex; heard = microphoneDiagnostics.transcript || heard; await voiceSession.commit(); if (round === roundIndex && state.phase === 'playing') playerError = 'Didn’t catch that — try again'; },
  cancel: () => cancelVoice('hold cancelled'),
  changed: () => render(),
  failed: error => { playerError = playerFailure(error); render(); },
});
function playerFailure(error: unknown): string {
  const code = voiceFailure(error).code;
  if (code === 'permission') return 'Allow microphone access, then hold again';
  if (code === 'no_microphone') return 'Connect a microphone, then try again';
  return 'Didn’t catch that — try again';
}
function cancelVoice(reason = 'fallback or user cancellation'): void {
  finishAttempt({ result: state.outcome === 'timeout' ? 'timeout' : 'cancelled' });
  if (microphoneSetup || armedCapture || voiceSession.listening || voiceSession.pending) microphoneDiagnostics.event(`cancelVoice: ${reason}; phase=${state.phase}`);
  talk.reset();
  microphoneSetup?.abort(); microphoneSetup = null;
  armedCapture?.cancel(); armedCapture = null;
  voiceSession.cancel();
}

let boardKey = '';
function renderBoard(): void {
  const key = `${state.fen}:${state.phase}:${selected}:${debugOpen}`;
  if (key === boardKey) return;
  boardKey = key;
  const focusedSquare = document.activeElement instanceof HTMLButtonElement ? document.activeElement.dataset.square : undefined;
  board.replaceChildren();
  const view = roundView(state);
  board.classList.toggle('concealed', view.fen === null);
  board.setAttribute('aria-label', view.label);
  if (view.fen === null) {
    board.textContent = 'READY?';
    return;
  }
  const chess = new Chess(view.fen);
  for (const [rowIndex, row] of chess.board().entries()) {
    for (let col = 0; col < 8; col++) {
      const piece = row[col];
      const square = `${'abcdefgh'[col]}${8 - rowIndex}` as Square;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.square = square;
      button.className = `square ${(rowIndex + col) % 2 ? 'dark' : 'light'} ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`;
      button.classList.toggle('selected', square === selected);
      button.classList.toggle('last-move', state.lastMove?.from === square || state.lastMove?.to === square);
      button.disabled = !debugOpen || state.phase !== 'playing';
      button.setAttribute('aria-pressed', String(square === selected));
      button.setAttribute('aria-label', `${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${names[piece.type]}` : ' empty'}`);
      const symbol = document.createElement('span');
      symbol.textContent = piece ? glyphs[piece.type] : '';
      symbol.setAttribute('aria-hidden', 'true');
      button.append(symbol);
      const coordinate = document.createElement('small');
      coordinate.textContent = square;
      coordinate.setAttribute('aria-hidden', 'true');
      button.append(coordinate);
      button.addEventListener('click', () => {
        if (selected === square) selected = null;
        else if (piece?.color === chess.turn()) selected = square;
        else if (selected) {
          const from = selected;
          cancelVoice();
          state = submitMove(state, { from, to: square }, performance.now());
          selected = null;
        }
        render();
      });
      board.append(button);
    }
  }
  if (focusedSquare) board.querySelector<HTMLButtonElement>(`[data-square="${focusedSquare}"]`)?.focus();
}

function renderTimer(): void {
  const remaining = voiceSession.remainingMs ?? (state.phase === 'playing' && state.deadline !== null
    ? Math.max(0, state.deadline - performance.now()) : state.phase === 'ready' ? ROUND_MS : 0);
  element('timer').textContent = `${(remaining / 1000).toFixed(1)}s`;
  element('time-bar').style.width = `${remaining / ROUND_MS * 100}%`;
}

function render(): void {
  if (state.phase === 'result' || state.phase === 'complete') cancelVoice('round ended/render');
  if (state.phase !== 'playing' && intentSession.pending) {
    intentSession.cancel();
    element('intent-status').textContent = 'Interpretation cancelled: the round ended. No pending AI move will be applied.';
  }
  element('score').textContent = String(state.score).padStart(3, '0');
  const nextCombo = `×${state.combo}`;
  element('combo').textContent = nextCombo;
  element('progress').textContent = state.phase === 'complete' ? 'RUN COMPLETE' : `PUZZLE ${state.puzzleIndex + 1} / ${PUZZLES.length}`;
  element('title').textContent = roundView(state).title;
  const processing = voiceSession.pending || talk.phase === 'processing';
  const status = state.phase === 'complete' ? 'RUN COMPLETE' : state.outcome === 'mate' ? 'CHECKMATE!' : state.outcome === 'miss' ? 'LEGAL MOVE — NOT MATE' : state.outcome === 'timeout' ? failureTitle(true) : microphoneSetup ? 'PREPARING MIC…' : state.phase === 'ready' && armedCapture ? 'MIC READY' : talk.phase === 'preparing' ? 'GETTING READY…' : voiceSession.listening ? 'LISTENING…' : processing ? 'UNDERSTANDING…' : (playerError.startsWith('Didn’t catch') ? failureTitle(false) : playerError) || (state.phase === 'ready' ? 'READY' : 'HOLD TO SPEAK');
  const previousStatus = element('player-state').textContent;
  element('player-state').textContent = status;
  root!.dataset.phase = state.phase;
  root!.dataset.mood = state.outcome ?? (voiceSession.listening ? 'listening' : processing ? 'processing' : playerError ? 'retry' : 'ready');
  if (previousStatus !== status) {
    animate(element('player-state'), [{ opacity: 0.5, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], 160);
    if (talk.phase === 'preparing') sfx.play('press');
    else if (status === failureTitle(false)) sfx.play('fail');
  }
  element('feedback').textContent = state.outcome === 'timeout' && state.phase === 'result' ? 'Release your command before the clock reaches zero.' : state.phase === 'complete' ? 'Another run. Another perfect streak?' : state.phase === 'result' ? state.feedback : talk.phase === 'preparing' ? 'Keep holding. Allow your microphone if asked.' : voiceSession.listening ? 'Describe your move. Release to send.' : processing ? 'Finding your move. Your time is saved.' : playerError ? 'Try again. Name the piece and its destination.' : state.phase === 'ready' ? 'The clock starts when the board appears.' : 'Think fast. Release before zero.';
  renderSubtitle();
  const talkButton = element<HTMLButtonElement>('talk');
  element('prepare').hidden = state.phase !== 'ready' || armedCapture !== null;
  element<HTMLButtonElement>('prepare').disabled = microphoneSetup !== null;
  element('prepare').textContent = microphoneSetup ? 'PREPARING MIC…' : 'PREPARE MIC';
  element('start-puzzle').hidden = state.phase !== 'ready';
  element<HTMLButtonElement>('start-puzzle').disabled = !armedCapture || microphoneSetup !== null;
  talkButton.hidden = state.phase === 'ready';
  talkButton.disabled = state.phase === 'ready' || state.phase === 'result' || state.phase === 'complete' || processing || intentSession.pending || microphoneSetup !== null;
  talkButton.textContent = talk.phase === 'preparing' ? 'KEEP HOLDING…' : voiceSession.listening ? 'RELEASE TO SEND' : processing ? 'UNDERSTANDING…' : 'HOLD TO SPEAK';
  talkButton.setAttribute('aria-pressed', String(talk.phase === 'preparing' || talk.phase === 'listening'));
  element('debug-panel').hidden = !debugOpen;
  element('debug-toggle').setAttribute('aria-expanded', String(debugOpen));
  element<HTMLButtonElement>('debug-start').disabled = state.phase !== 'ready' || microphoneSetup !== null;
  element('feedback').dataset.outcome = state.outcome ?? '';
  input.disabled = state.phase !== 'playing';
  element<HTMLButtonElement>('submit').disabled = state.phase !== 'playing';
  intentInput.disabled = (state.phase !== 'playing' && state.phase !== 'ready') || intentSession.pending;
  element<HTMLButtonElement>('resolve').disabled = state.phase !== 'playing' || intentSession.pending;
  element<HTMLButtonElement>('microphone').disabled = !['ready', 'playing'].includes(state.phase) || microphoneSetup !== null || armedCapture !== null || voiceSession.listening || voiceSession.pending || intentSession.pending;
  element<HTMLButtonElement>('microphone').textContent = microphoneSetup ? 'Connecting…' : armedCapture ? 'Microphone ready' : voiceSession.listening ? 'Listening…' : 'Enable microphone';
  element<HTMLButtonElement>('voice-send').disabled = !voiceSession.listening;
  element<HTMLButtonElement>('voice-cancel').disabled = !microphoneSetup && !armedCapture && !voiceSession.listening && !voiceSession.pending;
  element('retry').hidden = state.phase !== 'result';
  element<HTMLButtonElement>('debug-retry').disabled = state.phase === 'complete';
  action.disabled = microphoneSetup !== null;
  action.hidden = state.phase === 'playing' || state.phase === 'ready';
  action.textContent = state.phase === 'ready' ? 'Start round →' : state.phase === 'complete' ? 'Play again ↻' : state.puzzleIndex === PUZZLES.length - 1 ? 'See results →' : 'Next puzzle →';
  renderBoard();
  renderTimer();
  const effects = presentation.observe(state, runIndex);
  element('player-eyebrow').textContent = state.phase === 'complete' ? 'YOUR RUN' : 'FIND THE MATE';
  element('run-summary').hidden = state.phase !== 'complete';
  element('final-score').textContent = String(state.score);
  element('final-solved').textContent = `${state.solved}/${PUZZLES.length}`;
  element('best-combo').textContent = `×${effects.bestCombo}`;
  element('result-san').textContent = state.phase === 'result' && state.lastMove ? state.feedback.split(' ')[state.outcome === 'mate' ? 1 : 0] : '';
  if (effects.moved && state.lastMove) {
    const from = board.querySelector<HTMLElement>(`[data-square="${state.lastMove.from}"]`);
    const to = board.querySelector<HTMLElement>(`[data-square="${state.lastMove.to}"]`);
    const glyph = to?.querySelector<HTMLElement>('span');
    if (from && to && glyph) {
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      animate(glyph, [{ transform: `translate(${a.x - b.x}px, ${a.y - b.y}px)` }, { transform: 'translate(0, 0)' }], 170);
    }
  }
  if (effects.result) {
    sfx.play(state.outcome === 'mate' ? 'mate' : 'fail');
    if (state.outcome === 'mate') {
      animate(board, [{ transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], 180);
      animate(element('player-state'), [{ transform: 'scale(0.92)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }], 240);
      for (const id of ['score', 'combo']) animate(element(id), [{ transform: 'scale(1.2)', color: '#e4fa77' }, { transform: 'scale(1)' }], 220);
    }
  }
  if (effects.gain > 0) {
    element('score-gain').textContent = `+${effects.gain}`;
    animate(element('score-gain'), [{ opacity: 1, transform: 'translateY(8px)' }, { opacity: 0, transform: 'translateY(-10px)' }], 700);
  }
  if (effects.transition) { board.getAnimations().forEach(a => a.cancel()); animate(board, [{ opacity: 0.55 }, { opacity: 1 }], 150); }
  if (state.phase === 'ready') element('score-gain').textContent = '';
  if (effects.complete) sfx.play('complete');
}
function animate(target: HTMLElement, frames: Keyframe[], duration: number): void {
  const ms = motionDuration(matchMedia('(prefers-reduced-motion: reduce)').matches, duration);
  if (ms) target.animate?.(frames, { duration: ms, easing: 'ease-out' });
}
let lockedAttempt: number | null = null;
function renderSubtitle(): void {
  const text = subtitleText(state.phase, voiceSession.listening, voiceSession.pending,
    microphoneDiagnostics.transcript, heard);
  element('subtitle').dataset.visible = String(!!text);
  const subtitle = text ? `“${text}”` : '';
  if (element('heard').textContent !== subtitle) element('heard').textContent = subtitle;
  element('listening-level').style.setProperty('--level', String(Math.min(1, microphoneDiagnostics.rms * 12)));
  if (voiceSession.pending && !microphoneDiagnostics.recording && activeAttempt !== null && lockedAttempt !== activeAttempt) {
    lockedAttempt = activeAttempt; sfx.play('lock');
  }
}

element('microphone').addEventListener('click', async () => {
  if (microphoneSetup || armedCapture || voiceSession.listening || voiceSession.pending) return;
  const setup = new AbortController(); microphoneSetup = setup;
  element('voice-status').textContent = 'Preparing microphone and Gradium connection…'; render();
  try {
    const capture = await prepareLogged(setup.signal, error => {
      if (microphoneSetup !== setup && !armedCapture && !voiceSession.listening && !voiceSession.pending) return;
      element('voice-status').textContent = error.message; playerError = playerFailure(error);
      if (!voiceSession.pending) cancelVoice('capture failure callback');
      render();
    });
    if (microphoneSetup !== setup) { capture.cancel(); return; }
    microphoneSetup = null;
    if (state.phase === 'playing') voiceSession.listen(capture);
    else if (state.phase === 'ready') { armedCapture = capture; preparedAt = performance.now(); microphoneDiagnostics.event('Capture retained in armedCapture; phase=ready'); element('voice-status').textContent = 'Microphone ready. Start the round, speak, then Send speech.'; }
    else capture.cancel();
  } catch (error) {
    if (microphoneSetup === setup) { element('voice-status').textContent = voiceFailure(error).message; playerError = playerFailure(error); }
  } finally { if (microphoneSetup === setup) microphoneSetup = null; render(); }
});
element('voice-send').addEventListener('click', () => { void voiceSession.commit(); });
element('voice-cancel').addEventListener('click', () => {
  cancelVoice(); element('voice-status').textContent = 'Voice cancelled. Use voice again or a fallback control.'; render();
});
window.addEventListener('pagehide', () => cancelVoice('pagehide'));

element<HTMLFormElement>('intent-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  cancelVoice();
  await intentSession.run(intentInput.value, {
    getState: () => state,
    setState: (next) => { state = next; selected = null; },
    now: () => performance.now(),
    resolve: requestIntent,
    inspect: (inspection) => {
      element('intent-status').textContent = inspection.message;
      element('intent-trace').textContent = JSON.stringify({
        utterance: inspection.utterance,
        proposal: inspection.result?.status === 'resolved' ? inspection.result.candidate : null,
        result: inspection.result,
        elapsedMs: Math.round(inspection.elapsedMs),
        validation: inspection.message,
      }, null, 2);
      render();
    },
  });
});

element<HTMLFormElement>('move-form').addEventListener('submit', (event) => {
  event.preventDefault();
  cancelVoice();
  const match = /^([a-h][1-8])\s*([a-h][1-8])(?:\s*([qrbn]))?$/.exec(input.value.trim().toLowerCase());
  state = submitMove(state, match ? { from: match[1], to: match[2], ...(match[3] ? { promotion: match[3] } : {}) } : null, performance.now());
  selected = null;
  render();
});
action.addEventListener('click', () => {
  intentSession.cancel();
  if (state.phase !== 'ready') cancelVoice();
  if (state.phase !== 'ready') {
    playerError = ''; heard = '';
    intentInput.value = '';
    element('intent-status').textContent = 'Prepare a description, then start the round.';
    element('intent-trace').textContent = 'No request yet.';
  }
  if (state.phase === 'complete') { state = createGame(); puzzleInitial = state; runIndex++; roundIndex++; retryIndex = 0; }
  else { state = advance(state); if (state.phase === 'ready') { puzzleInitial = state; roundIndex++; retryIndex = 0; } }
  selected = null;
  input.value = '';
  render();
  if (state.phase === 'playing') (intentInput.value.trim() ? element('resolve') : input).focus();
});
function retryCurrent(): void {
  if (state.phase === 'complete') return;
  state = retryPuzzle(puzzleInitial, () => { cancelVoice('retry puzzle'); intentSession.cancel(); });
  pointer = null; keyboardHeld = false;
  roundIndex++; retryIndex++;
  playerError = ''; heard = ''; selected = null; input.value = ''; intentInput.value = '';
  element('voice-status').textContent = 'Ready for a new attempt.';
  element('voice-trace').textContent = 'No voice attempt yet.';
  element('intent-status').textContent = 'Ready for a new attempt.';
  element('intent-trace').textContent = 'No request yet.';
  render();
}
element('retry').addEventListener('click', retryCurrent);
element('debug-retry').addEventListener('click', retryCurrent);
element('record-pcm').addEventListener('change', () => {
  debugAudio.enabled = element<HTMLInputElement>('record-pcm').checked;
  if (!debugAudio.enabled) debugAudio.clear();
  element('wav-status').textContent = debugAudio.enabled ? 'Next voice attempt will be retained locally. No additional upload.' : 'Local audio cleared.';
});
element('download-wav').addEventListener('click', () => {
  if (!debugAudio.frames) { element('wav-status').textContent = 'No recorded PCM yet. Enable recording before a voice attempt.'; return; }
  const url = URL.createObjectURL(new Blob([debugAudio.wav()], { type: 'audio/wav' }));
  const link = document.createElement('a'); link.href = url; link.download = 'soniccheck-transmitted.wav'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  element('wav-status').textContent = `${debugAudio.frames} mono samples exported; same PCM bytes queued to Gradium (up to 8 seconds).`;
});
element('copy-log').addEventListener('click', async () => {
  const json = history.export();
  const area = element<HTMLTextAreaElement>('session-json'); area.value = json; area.hidden = false;
  try {
    await navigator.clipboard.writeText(json);
    element('export-status').textContent = 'Session JSON copied.';
  } catch {
    area.focus(); area.select();
    element('export-status').textContent = 'Clipboard unavailable. Copy the selected JSON or Download JSON.';
  }
});
element('download-log').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([history.export()], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'soniccheck-session.json';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
// One global unlock listener per input type; retries never register new handlers.
document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
document.addEventListener('keydown', () => sfx.unlock(), { capture: true });
element('sound-toggle').addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  element('sound-toggle').textContent = sfx.muted ? 'Sound off' : 'Sound on';
  element('sound-toggle').setAttribute('aria-pressed', String(sfx.muted));
  element('sound-toggle').setAttribute('aria-label', sfx.muted ? 'Enable sound effects' : 'Mute sound effects');
});
function revealPuzzle(development = false): void {
  if (state.phase !== 'ready' || microphoneSetup || (!armedCapture && !development)) return;
  if (armedCapture && performance.now() - preparedAt >= 20000) {
    cancelVoice('prepared capture expired before reveal');
    playerError = 'Prepare microphone again'; render(); return;
  }
  state = startRound(state, performance.now());
  playerError = ''; heard = '';
  render();
  animate(board, [{ opacity: 0.6 }, { opacity: 1 }], 120);
  sfx.play('press');
}
element('start-puzzle').addEventListener('click', () => revealPuzzle());
element('debug-start').addEventListener('click', () => revealPuzzle(true));
element('prepare').addEventListener('click', () => element('microphone').click());
element('debug-toggle').addEventListener('click', () => { debugOpen = !debugOpen; render(); });
element('debug-close').addEventListener('click', () => { debugOpen = false; render(); });
const talkButton = element<HTMLButtonElement>('talk');
let pointer: number | null = null;
let keyboardHeld = false;
talkButton.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointer !== null || keyboardHeld || talk.phase !== 'idle') return;
  event.preventDefault(); pointer = event.pointerId;
  talkButton.setPointerCapture(event.pointerId);
  void talk.press();
});
talkButton.addEventListener('pointerup', event => {
  if (pointer !== event.pointerId) return;
  pointer = null; void talk.release();
});
function cancelHold(): void {
  if (pointer === null && !keyboardHeld) return;
  pointer = null; keyboardHeld = false; talk.cancel();
}
talkButton.addEventListener('pointercancel', cancelHold);
talkButton.addEventListener('lostpointercapture', cancelHold);
talkButton.addEventListener('keydown', event => {
  if (![' ', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  if (event.repeat || keyboardHeld || pointer !== null) return;
  keyboardHeld = true; void talk.press();
});
talkButton.addEventListener('keyup', event => {
  if (![' ', 'Enter'].includes(event.key) || !keyboardHeld) return;
  event.preventDefault(); keyboardHeld = false; void talk.release();
});
talkButton.addEventListener('blur', () => { if (keyboardHeld) cancelHold(); });
window.addEventListener('blur', cancelHold);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHold(); });
setInterval(() => { element('mic-diagnostics').textContent = microphoneDiagnostics.display(); renderSubtitle(); }, 100);
element('mic-diagnostics').textContent = microphoneDiagnostics.display();
setInterval(() => {
  // Keep at least a full round plus processing margin inside the existing 30s connection lease.
  if (state.phase === 'ready' && armedCapture && performance.now() - preparedAt >= 20000) {
    cancelVoice('prepared capture expired before reveal');
    playerError = 'Prepare microphone again'; render();
  }
  const next = tick(state, performance.now());
  if (next !== state) { state = next; selected = null; render(); }
  else renderTimer();
}, 50);
render();
