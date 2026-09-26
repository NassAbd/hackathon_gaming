# Intent hardening and first Draft preparation

Goal: semantic abstention and a portable, static itch.io release path; preserve the
working voice/typed/chess loop and SPEC.md.

Contract: resolve only a uniquely identified legal move supported by the utterance.
Winning value is not evidence. Unclear, impossible and unrelated speech abstains.
No permanent browser keys. Production HTTP endpoints are stateless; audio remains
browser-to-Gradium. No authentication system or provider coupling is added.

Plan:
1. Add a balanced fixture-based semantic dataset, offline dataset/metrics tests,
   and a separate live evaluation runner; record a baseline.
2. Remove solver hints and strengthen the general intent-only prompt; rerun eval.
3. Add a portable Fetch HTTP entry point, exact-origin CORS and public API base
   configuration, with offline boundary tests. Preserve local middleware.
4. Add static ZIP packaging and secret scanning; document platform configuration,
   observed vs unmeasured latency, and manual Draft acceptance gates.
5. Run tests, typecheck, lint, build and packaging checks.

Likely files: server/gemini.ts, server HTTP adapters, shared client URL helper,
new evals/ and scripts/, README, .env.example, package.json, tests.

Acceptance: no solver labels in context; eval errors distinct from abstentions;
legal expected dataset moves checked by chess.js; no API calls in core tests;
CORS denies unknown/null origins; permanent keys absent from artifacts; ZIP root
index.html; documented actual iframe-origin and mic delegation tests still required.

Out of scope: TTS, visuals, gameplay, persistent backend, database, user auth,
provider deployment and itch publication. Official research: itch HTML5 guide,
MDN getUserMedia/CORS, Gradium browser WebSockets, Gemini ephemeral-token docs.
