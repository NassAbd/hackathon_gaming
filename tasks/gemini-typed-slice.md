# Typed Gemini intent slice

## Investigation

The current SPEC.md and its only committed version (3a8f4ac) specify no puzzle
count and no four-position pack. The completed deterministic-slice plan explicitly
scoped three fixtures, which src/puzzles.ts implements. No fourth fixture was
removed. A separate four-puzzle requirement cannot be verified from this checkout.
Preserve SPEC.md and the three fixtures pending that source.

## Goal and scope

Typed utterance → local server → Gemini candidate → chess.js → existing game.
Keep click/coordinate fallbacks and existing UI layout. No microphone or Gradium.

Use the Gemini Developer API REST generateContent endpoint, native fetch, and
server-only GEMINI_API_KEY. Default GEMINI_MODEL: gemini-3.5-flash-lite (current
stable structured-output model); override for the model enabled by hackathon keys.
No local Gemini/Google credentials or credential instructions were found.
Use a small Vite server/preview middleware for this local slice; static itch.io
hosting will require a separately hosted HTTPS adapter in a later deployment slice.

Files: shared intent contracts/parser, server Gemini adapter and HTTP handler,
Vite middleware, browser request/session adapter, main.ts, small CSS additions,
offline tests, .env.example, README, TypeScript config.

## Acceptance and tests

- Server derives FEN, pieces, side to move, and verbose legal moves via chess.js.
- Schema constrains status/from/to/promotion; unresolved uses null coordinates.
- Runtime parsing rejects extra fields, bad coordinates, malformed/truncated or
  blocked responses; legal-space membership checked before returning candidate.
- Only submitMove updates game board/score and generates SAN via chess.js.
- Missing keys, upstream errors, timeout, invalid input/output and unresolved
  intent show useful local feedback without executing a move.
- Request identity, position, phase and deadline prevent stale/duplicate execution.
- Five-second clock is unchanged and keeps running; text may be prepared before
  Start. Late responses cannot score. Click/coordinate fallbacks stay available.
- Inspect utterance, candidate, result, and measured request duration in UI details.
- Tests use injected fetch/resolver: all failure paths, prompt context/schema,
  legal candidate acceptance, HTTP boundary, stale response/replay/deadline races.
- Preserve deterministic tests; run typecheck, lint, tests, build and browser checks.

## Docs checked before coding

- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/api/generate-content

Out of scope: fourth-puzzle invention, spec edits, voice, Gradium, UI redesign,
public deployment, authentication, new scoring or timer rules.

## Verification completed

- Typecheck, lint, 55 offline tests (including all 16 original tests), and production
  build passed.
- Browser production preview: natural-language submission reached the real local
  HTTP endpoint; missing-key feedback appeared, score remained zero and rook stayed
  on a1; coordinate fallback immediately delivered Ra8# for 100 points. Inspection
  showed the utterance, missing_credentials result, and measured request duration.
- Production client assets contain none of the server endpoint/authentication
  implementation or test key marker. SPEC.md has no diff.
- Live Gemini semantic/latency testing is blocked until GEMINI_API_KEY is configured
  and model access is confirmed. No mocked success was presented as a live result.
