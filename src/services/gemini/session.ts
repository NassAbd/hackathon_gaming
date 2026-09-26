import type { GameState } from '../../contracts';
import { submitMove } from '../../game';
import { INTENT_MESSAGES } from './contracts';
import type { IntentRequest, IntentResult } from './contracts';

export type Resolver = (request: IntentRequest, signal: AbortSignal) => Promise<IntentResult>;
export interface IntentInspection { utterance: string; result: IntentResult | null; elapsedMs: number; message: string }

/** Owns only request identity, not chess state. All execution goes through submitMove. */
export class IntentSession {
  private active: AbortController | null = null;
  get pending(): boolean { return this.active !== null; }
  cancel(): void { this.active?.abort(); this.active = null; }

  async run(utterance: string, access: {
    getState: () => GameState;
    setState: (state: GameState) => void;
    inspect: (inspection: IntentInspection) => void;
    now: () => number;
    resolve: Resolver;
  }): Promise<void> {
    const snapshot = access.getState();
    const started = access.now();
    if (this.pending || snapshot.phase !== 'playing' || snapshot.deadline === null || started >= snapshot.deadline) return;
    if (!utterance.trim() || utterance.length > 300) {
      access.inspect({ utterance, result: { status: 'error', code: 'invalid_request' }, elapsedMs: 0, message: INTENT_MESSAGES.invalid_request });
      return;
    }
    const controller = new AbortController();
    this.active = controller;
    access.inspect({ utterance, result: null, elapsedMs: 0, message: 'Interpreting with Gemini… The clock is still running.' });
    let result: IntentResult;
    try { result = await access.resolve({ utterance: utterance.trim(), fen: snapshot.fen }, controller.signal); }
    catch { result = { status: 'error', code: 'network' }; }
    if (this.active !== controller) return;
    this.active = null;
    const current = access.getState();
    const finished = access.now();
    if (current.phase !== 'playing' || current.fen !== snapshot.fen || current.puzzleIndex !== snapshot.puzzleIndex || current.deadline !== snapshot.deadline || finished >= snapshot.deadline) {
      access.inspect({ utterance, result, elapsedMs: finished - started, message: 'Response discarded: the round expired or the position changed.' });
      return;
    }
    let message: string;
    if (result.status === 'resolved') {
      // Even a compromised endpoint cannot bypass deterministic legality or deadline checks.
      const next = submitMove(current, result.candidate, finished);
      access.setState(next);
      message = next.feedback;
    } else message = INTENT_MESSAGES[result.status === 'unresolved' ? 'unresolved' : result.code];
    access.inspect({ utterance, result, elapsedMs: finished - started, message });
  }
}
