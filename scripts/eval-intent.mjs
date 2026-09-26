import process from 'node:process';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer, loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), '');
if (!env.GEMINI_API_KEY?.trim()) {
  console.error('Configure GEMINI_API_KEY in .env.local or the environment. No calls made.');
  process.exit(1);
}
const label = process.argv[2] || 'latest';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple alphanumeric report label.');
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { INTENT_CASES } = await server.ssrLoadModule('/evals/intent-cases.ts');
  const { PUZZLES } = await server.ssrLoadModule('/src/puzzles.ts');
  const { resolveIntent, DEFAULT_MODEL } = await server.ssrLoadModule('/server/gemini.ts');
  const { summarize } = await server.ssrLoadModule('/evals/metrics.ts');
  const rows = [];
  for (const test of INTENT_CASES) {
    const start = performance.now();
    const result = await resolveIntent({ fen: PUZZLES.find(p => p.id === test.puzzle).fen, utterance: test.utterance },
      { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
    rows.push({ test, result, latencyMs: performance.now() - start });
    console.log(`${test.id}: ${result.status}`);
    if (result.status === 'error' && ['missing_credentials', 'upstream'].includes(result.code)) {
      console.error('Provider unavailable; stopping to avoid spending further requests.');
      break;
    }
  }
  const report = { measuredAt: new Date().toISOString(), model: env.GEMINI_MODEL || DEFAULT_MODEL,
    adapterSha256: createHash('sha256').update(await readFile('server/gemini.ts')).digest('hex'),
    datasetSha256: createHash('sha256').update(await readFile('evals/intent-cases.ts')).digest('hex'),
    plannedCases: INTENT_CASES.length, summary: summarize(rows), rows };
  await mkdir('evals/results', { recursive: true });
  await writeFile(`evals/results/${label}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary, null, 2));
  if (rows.length !== INTENT_CASES.length || report.summary.errors || report.summary.wrongResolutions || report.summary.falseAbstentions) process.exitCode = 1;
} finally { await server.close(); }
