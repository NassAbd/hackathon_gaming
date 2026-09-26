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
root.innerHTML = `
  <header><a class="brand" href="./">◉ SonicCheck<span>ARCADE CHESS</span></a><span class="mode">TYPED INTENT · GEMINI</span></header>
  <main>
    <section class="intro"><p class="eyebrow">THINK FAST. MAKE YOUR MOVE.</p><h1>Five seconds.<br> <em>One move.</em></h1><p>Find checkmate before the clock runs out.<br>Three puzzles. One perfect streak.</p></section>
    <section class="game" aria-label="Chess puzzle game">
      <div class="stats"><div><span>SCORE</span><strong id="score">0</strong></div><div><span>COMBO</span><strong id="combo">×0</strong></div><div><span>TIME LEFT</span><strong id="timer" role="timer">5.0s</strong></div></div>
      <div class="time-track"><div id="time-bar"></div></div>
      <div class="puzzle-heading"><div><p class="eyebrow" id="progress"></p><h2 id="title"></h2></div><span class="side">● White to move</span></div>
      <div id="board" class="board" role="group" aria-label="Chessboard, white at bottom"></div>
      <p id="feedback" role="status" aria-live="polite"></p>
      <div id="voice-controls" class="input-row"><button id="microphone" type="button">Enable microphone</button><button id="voice-send" type="button" disabled>Send speech</button><button id="voice-cancel" type="button" disabled>Cancel voice</button></div>
      <p id="voice-status" role="status" aria-live="polite">Enable before Start. Speak during the round, then Send speech before the deadline.</p>
      <section class="mic-diagnostics" aria-label="Microphone development diagnostics"><strong>Microphone diagnostics · development</strong><pre id="mic-diagnostics"></pre></section>
      <details><summary>Voice latency telemetry</summary><pre id="voice-trace">No voice attempt yet. Timestamps use the browser monotonic clock.</pre></details>
      <form id="intent-form"><label for="intent">Describe your move <span>(English)</span></label><div class="input-row"><input id="intent" maxlength="300" autocomplete="off" placeholder="put the rook on the back rank" aria-describedby="intent-help" /><button id="resolve" type="submit">Resolve ↗</button></div></form>
      <p id="intent-help">Prepare your words before Start, then Resolve during the round. The clock keeps running.</p>
      <p id="intent-status" role="status" aria-live="polite">Gemini requires a server API key. Fallback controls work without it.</p>
      <details id="intent-inspection"><summary>Inspect interpretation</summary><pre id="intent-trace">No request yet.</pre></details>
      <form id="move-form"><label for="move">Type a move <span>(e.g. a1 a8)</span></label><div class="input-row"><input id="move" autocomplete="off" spellcheck="false" placeholder="from → to" aria-describedby="controls-help" /><button id="submit" type="submit">Move ↗</button></div></form>
      <button id="action" class="primary" type="button">Start round →</button>
    </section>
    <aside><p class="eyebrow">HOW TO PLAY</p><h2>Spot it.<br> Send it.</h2><ol><li>Study the position, then start the clock.</li><li>Speak and Send speech, type and Resolve, or use the board and coordinate controls.</li><li>Deliver checkmate to build your combo.</li></ol><p id="controls-help">You have 5 seconds after Start. Illegal moves can be retried. A legal move that isn’t mate ends the round.</p><div class="dev-note"><strong>Voice input · Gradium</strong><p>Microphone audio is streamed to Gradium only while listening. Its transcript feeds Gemini; chess.js validates and executes the move. Typed input remains available. No TTS.</p></div></aside>
  </main><footer>SONICCHECK <span>02 / TYPED INTENT SLICE</span></footer>`;

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
let state = createGame();
let selected: Square | null = null;
let armedCapture: SpeechCapture | null = null;
let microphoneSetup: AbortController | null = null;
const voiceSession = new VoiceSession({
  getState: () => state,
  setState: next => { state = next; selected = null; },
  now: () => performance.now(),
  resolve: requestIntent,
  changed: () => render(),
  inspect: (message, transcript, timestamps, proposal) => {
    element('voice-status').textContent = message;
    if (transcript) intentInput.value = transcript;
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
function cancelVoice(reason = 'fallback or user cancellation'): void {
  if (microphoneSetup || armedCapture || voiceSession.listening || voiceSession.pending) microphoneDiagnostics.event(`cancelVoice: ${reason}; phase=${state.phase}`);
  microphoneSetup?.abort(); microphoneSetup = null;
  armedCapture?.cancel(); armedCapture = null;
  voiceSession.cancel();
}

function renderBoard(): void {
  const focusedSquare = document.activeElement instanceof HTMLButtonElement ? document.activeElement.dataset.square : undefined;
  board.replaceChildren();
  const chess = new Chess(state.fen);
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
      button.disabled = state.phase !== 'playing';
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
  element('combo').textContent = `×${state.combo}`;
  element('progress').textContent = state.phase === 'complete' ? 'RUN COMPLETE' : `PUZZLE ${state.puzzleIndex + 1} / ${PUZZLES.length}`;
  element('title').textContent = state.phase === 'complete' ? `${state.solved} of ${PUZZLES.length} solved` : PUZZLES[state.puzzleIndex].title;
  element('feedback').textContent = state.feedback;
  element('feedback').dataset.outcome = state.outcome ?? '';
  input.disabled = state.phase !== 'playing';
  element<HTMLButtonElement>('submit').disabled = state.phase !== 'playing';
  intentInput.disabled = (state.phase !== 'playing' && state.phase !== 'ready') || intentSession.pending;
  element<HTMLButtonElement>('resolve').disabled = state.phase !== 'playing' || intentSession.pending;
  element<HTMLButtonElement>('microphone').disabled = !['ready', 'playing'].includes(state.phase) || microphoneSetup !== null || armedCapture !== null || voiceSession.listening || voiceSession.pending || intentSession.pending;
  element<HTMLButtonElement>('microphone').textContent = microphoneSetup ? 'Connecting…' : armedCapture ? 'Microphone ready' : voiceSession.listening ? 'Listening…' : 'Enable microphone';
  element<HTMLButtonElement>('voice-send').disabled = !voiceSession.listening;
  element<HTMLButtonElement>('voice-cancel').disabled = !microphoneSetup && !armedCapture && !voiceSession.listening && !voiceSession.pending;
  action.disabled = microphoneSetup !== null;
  action.hidden = state.phase === 'playing';
  action.textContent = state.phase === 'ready' ? 'Start round →' : state.phase === 'complete' ? 'Play again ↻' : state.puzzleIndex === PUZZLES.length - 1 ? 'See results →' : 'Next puzzle →';
  renderBoard();
  renderTimer();
  if (state.phase !== 'playing') action.focus({ preventScroll: true });
}

element('microphone').addEventListener('click', async () => {
  if (microphoneSetup || armedCapture || voiceSession.listening || voiceSession.pending) return;
  const setup = new AbortController(); microphoneSetup = setup;
  element('voice-status').textContent = 'Preparing microphone and Gradium connection…'; render();
  try {
    const capture = await prepareMicrophone(setup.signal, error => {
      if (microphoneSetup !== setup && !armedCapture && !voiceSession.listening && !voiceSession.pending) return;
      element('voice-status').textContent = error.message;
      if (!voiceSession.pending) cancelVoice('capture failure callback');
      render();
    });
    if (microphoneSetup !== setup) { capture.cancel(); return; }
    microphoneSetup = null;
    if (state.phase === 'playing') voiceSession.listen(capture);
    else if (state.phase === 'ready') { armedCapture = capture; microphoneDiagnostics.event('Capture retained in armedCapture; phase=ready'); element('voice-status').textContent = 'Microphone ready. Start the round, speak, then Send speech.'; }
    else capture.cancel();
  } catch (error) {
    if (microphoneSetup === setup) element('voice-status').textContent = voiceFailure(error).message;
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
    intentInput.value = '';
    element('intent-status').textContent = 'Prepare a description, then start the round.';
    element('intent-trace').textContent = 'No request yet.';
  }
  if (state.phase === 'ready') state = startRound(state, performance.now());
  else if (state.phase === 'complete') state = createGame();
  else state = advance(state);
  if (state.phase === 'playing' && armedCapture) {
    const capture = armedCapture; armedCapture = null; voiceSession.listen(capture);
  }
  selected = null;
  input.value = '';
  render();
  if (state.phase === 'playing') (intentInput.value.trim() ? element('resolve') : input).focus();
});
setInterval(() => { element('mic-diagnostics').textContent = microphoneDiagnostics.display(); }, 250);
element('mic-diagnostics').textContent = microphoneDiagnostics.display();
setInterval(() => {
  const next = tick(state, performance.now());
  if (next !== state) { state = next; selected = null; render(); }
  else renderTimer();
}, 50);
render();
