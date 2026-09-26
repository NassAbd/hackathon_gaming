# Semantic intent evaluation

`npm run eval:intent -- LABEL` makes paid live Gemini requests using server-only
`GEMINI_API_KEY` / optional `GEMINI_MODEL` from environment or ignored `.env.local`.
It writes `evals/results/LABEL.json` and exits nonzero for any wrong resolution,
false abstention, API error or incomplete run. The core `npm test` never calls Gemini.
The runner is sequential and stops on provider rejection to avoid repeated quota/auth
failures. It does not retry failures or print keys/provider error bodies.

42 cases were authored before baseline execution against the real puzzle FENs.
Expected moves are independently legality-checked offline, including nonwinning
moves. Null means insufficient or impossible intent, not permission to guess the
puzzle solution. Outcome-only language is intentionally unresolved. Spatial direction
uses the displayed White orientation. Queen adjacency is genuinely ambiguous here.
The reported transcript is a regression example in the dataset, never a production
special case. None of these fixtures is imported by production code.

Metrics count exact from/to/promotion matches; wrong resolutions include moves on
abstention cases and mismatched moves on positive cases. False abstentions are only
explicit unresolved responses on positive cases. API errors are separate. Latency
includes the full adapter request even for failures; median averages the middle pair,
p95 is nearest-rank. Reports include model, UTC time, adapter/dataset hashes and all
case outputs. These tests measure semantics, not STT audio accuracy or browser latency.

See [readiness report](../docs/production-readiness.md) for baseline/intermediate/final
results and limitations. A perfect single run on a small known set is not proof of
semantic safety on unseen input. Use new unseen cases and repeated runs before a
broader release; do not encode phrase-specific corrections into the resolver.
