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

## Experience completion evaluation (2026-09-26)

Added 14 cases (56 total), preserving the original 42: action/spatial commands,
coordinates, synonyms, a mild piece-word corruption, elliptical commands, and
piece-only/outcome-only/unrelated/non-command/impossible/ambiguous negatives.
The directly-below positive uses the immediately neighboring square h7; adjacency
to the king alone has multiple legal matches and must abstain.

| Run | Correct moves | Correct abstentions | Wrong moves | False abstentions | API errors | Mean / median / p95 ms |
| --- | --- | --- | --- | --- | --- | --- |
| experience-baseline | 22 | 32 | 1 | 1 | 0 | 736 / 717 / 991 |
| experience-candidate | 24 | 32 | 0 | 0 | 0 | 721 / 706 / 956 |
| experience-confirmation | 22 | 32 | 2 | 0 | 0 | 758 / 738 / 1033 |

The candidate allowed linguistically plausible word repair only within a clear
action command and reinforced literal spatial offsets, board edges and enumerating
all neighboring-square matches. There were no word replacement tables.
Confirmation returned g5–e6 for “two ranks up and one file left” (expected f7), and
g6–g7 for “directly below the black king” (expected h7).
Although all 32 abstention cases stayed unresolved, wrong legal moves failed the
acceptance gate. The candidate was rejected and server/gemini.ts restored
byte-for-byte. These reports do not establish improved production semantics.
Model: unchanged gemini-3.5-flash-lite. Reports include case outputs and hashes.
