import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES } from '../src/puzzles';
import { INTENT_CASES } from './intent-cases';
import { summarize } from './metrics';

describe('semantic evaluation contract (offline)', () => {
  it('uses real puzzles and only legal expected moves', () => {
    expect(new Set(INTENT_CASES.map(test => test.id)).size).toBe(INTENT_CASES.length);
    for (const test of INTENT_CASES) {
      const puzzle = PUZZLES.find(p => p.id === test.puzzle);
      expect(puzzle).toBeDefined();
      if (test.expected) expect(new Chess(puzzle!.fen).move(test.expected)).not.toBeNull();
    }
    for (const puzzle of PUZZLES) {
      const cases = INTENT_CASES.filter(test => test.puzzle === puzzle.id);
      expect(cases.some(test => test.expected === null)).toBe(true);
      expect(cases.some(test => test.expected !== null)).toBe(true);
    }
  });
  it('counts errors separately from abstention and wrong legal moves as wrong resolutions', () => {
    const yes = INTENT_CASES[0], no = INTENT_CASES.find(test => test.expected === null)!;
    expect(summarize([
      { test: yes, result: { status: 'resolved', candidate: yes.expected! }, latencyMs: 10 },
      { test: no, result: { status: 'unresolved' }, latencyMs: 20 },
      { test: no, result: { status: 'resolved', candidate: yes.expected! }, latencyMs: 30 },
      { test: yes, result: { status: 'unresolved' }, latencyMs: 40 },
      { test: no, result: { status: 'error', code: 'network' }, latencyMs: 50 },
      { test: yes, result: { status: 'resolved', candidate: { from: 'a1', to: 'a2' } }, latencyMs: 60 },
    ])).toEqual({ total: 6, correctResolutions: 1, correctAbstentions: 1, wrongResolutions: 2,
      falseAbstentions: 1, errors: 1, averageMs: 35, medianMs: 35, p95Ms: 60 });
    expect(summarize([]).medianMs).toBeNull();
  });
});
