import type { IntentResult } from '../src/services/gemini/contracts';
import type { IntentCase } from './intent-cases';
export interface EvalRow { test: IntentCase; result: IntentResult; latencyMs: number }
export function summarize(rows: EvalRow[]) {
  let correctResolutions = 0, correctAbstentions = 0, wrongResolutions = 0, falseAbstentions = 0, errors = 0;
  for (const { test, result } of rows) {
    if (result.status === 'error') errors++;
    else if (result.status === 'unresolved') {
      if (test.expected === null) correctAbstentions++; else falseAbstentions++;
    } else if (test.expected && result.candidate.from === test.expected.from && result.candidate.to === test.expected.to
      && result.candidate.promotion === test.expected.promotion) correctResolutions++;
    else wrongResolutions++;
  }
  const times = rows.map(row => row.latencyMs).sort((a, b) => a - b);
  const n = times.length;
  return { total: n, correctResolutions, correctAbstentions, wrongResolutions, falseAbstentions, errors,
    // Wall-clock adapter duration, including failed calls; p95 uses nearest rank.
    averageMs: n ? times.reduce((a, b) => a + b, 0) / n : null,
    medianMs: n ? (times[Math.floor((n - 1) / 2)] + times[Math.floor(n / 2)]) / 2 : null,
    p95Ms: n ? times[Math.ceil(n * 0.95) - 1] : null };
}
