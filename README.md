# SonicCheck

A voice-first arcade chess puzzle game in development for the {Tech: Europe}
AI Gaming Hack. This slice adds **typed natural-language intent with Gemini** to
the deterministic game. Microphone input and Gradium are not integrated.

## Setup and local play

Use Node.js 24 (`.node-version`) and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Edit the ignored `.env.local` locally before starting the server:

- `GEMINI_API_KEY`: your Google AI Studio / Gemini Developer API key.
- `GEMINI_MODEL`: optional model ID; defaults to `gemini-3.5-flash-lite`.

Restart the server after changing credentials. Do not use a `VITE_` prefix for
secrets, paste keys into the browser, or commit local env files. Shell environment
variables are also supported. No key is needed for board/coordinate play.

This implementation uses the **Gemini Developer API**, not Vertex AI service-account
credentials. The hackathon key must permit the selected model. If your resources
provide only Vertex AI access, the server authentication adapter needs adapting.
No credentials or hackathon-specific credential documentation were present during
implementation, so live Gemini quality/latency and model entitlement are unverified.

1. Study the position. Optionally prepare a natural-language description before
   pressing **Start round**.
2. Press **Resolve** within five seconds, or select a piece and destination, or
   type coordinates such as `a1 a8` / `a1a8` and press Enter in the coordinate field.
3. Any legal checkmate wins. Wins add `100 × new combo` points; three consecutive
   wins total 600. A legal non-mating move ends the round and resets the combo.
4. Press **Next puzzle**, then **Start round**. After results, **Play again** resets.

Descriptions for the current pack:

- Rook: “put the rook on the back rank”
- Queen: “la dame juste à côté du roi”
- Knight: “smother the king with my knight” / “finish him with the horse”

The existing five-second deadline continues during network/interpretation time.
Late responses cannot score. Prepare text before Start for the local demo; this
slice does not silently pause or extend the timer. An AI error does not change the
board, score, combo, or puzzle; the ordinary timer can still expire independently.
Click and coordinate controls remain usable while Gemini is pending.

The status line shows pending/error/success. **Inspect interpretation** reveals the
utterance, candidate coordinates, result, validation feedback, and measured total
request duration (not a claim about pure model latency). User/model text is rendered
as text, never HTML. Descriptions and board context are sent to Google on Resolve.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Vite server with `/api/intent` adapter |
| `npm test` | Offline deterministic and Gemini-boundary tests |
| `npm run typecheck` | Strict TypeScript checks, including server/config |
| `npm run lint` | ESLint checks |
| `npm run build` | Typecheck and production browser build in `dist/` |
| `npm run preview` | Serve production build with local `/api/intent` adapter |

## Architecture

`typed utterance + current FEN → /api/intent → Gemini proposal → chess.js → game`

- TypeScript + Vite; existing browser DOM/CSS, no UI framework or vendor SDK.
- `server/gemini.ts`: native-fetch adapter using
  `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  with server-only `x-goog-api-key` authentication.
- Context is derived using chess.js: FEN, side to move, piece map, and **all legal
  moves**, including captures/promotions and engine-computed check/mate flags.
  No stored puzzle solution is provided. Gemini is asked to resolve the player's
  intention, not to supply authoritative SAN or board state.
- `generationConfig.responseMimeType = application/json` and `responseJsonSchema`
  require exactly `status`, `from`, `to`, `promotion`. Status is resolved/unresolved;
  coordinates are constrained to source/destination enums from legal moves or null;
  promotion is q/r/b/n or null. Unresolved must have all three move fields null.
  Runtime parsing enforces the relationship and rejects extra properties. Schema
  compliance alone does not imply legality: exact legal-move tuple membership is
  checked on the server, including promotion.
- `server/intent-api.ts`: validates request shape, text/FEN limits and FEN validity;
  rejects cross-origin browser requests, non-POST and non-JSON requests.
- `server/vite-intent.ts`: small local dev/preview middleware, 4 KiB body limit,
  maximum four concurrent requests. Secrets never enter Vite's browser `define` or
  `VITE_*` variables. This is a local adapter, not a hardened public API service.
- `src/services/gemini/`: shared runtime contracts, browser HTTP adapter, and
  request lifecycle. Responses are checked against request identity, FEN, puzzle,
  phase and deadline. Cancelling/resetting prevents old responses from executing.
- `src/game.ts`: **only** `submitMove` changes the game board following chess.js
  validation; chess.js generates SAN/checkmate. Gemini never mutates game state.
- `src/puzzles.ts`: the original three fixtures and their test solutions remain.
- Vitest + ESLint/typescript-eslint; all tooling is installed project-locally.

## Failure behavior

Missing credentials returns a safe configuration message without a provider call.
Network errors, provider rejection/quota/authentication failures, blocked/truncated
responses, invalid JSON/schema, unresolved intent, and illegal proposals return
non-executable results. Raw provider error bodies and credentials are never sent
to the browser or logged. Gemini requests abort after 4 seconds; the browser request
has a 4.5-second bound. There are no automatic retries or guessed moves. A static
host without `/api/intent` gives an actionable unavailable-service message.

## Puzzle-count investigation

The current `SPEC.md` and its only committed version (`3a8f4ac`) define **no puzzle
count and no four-puzzle pack**. The completed deterministic-slice plan explicitly
chose three positions; the implementation follows it. No fourth fixture was
removed. The claimed four-puzzle source is not present in this checkout; its
location is needed to identify that missing requirement. `SPEC.md` is unchanged.
See [the original plan](tasks/deterministic-slice.md) and
[the typed-intent plan](tasks/gemini-typed-slice.md).

## Documentation used for the API choice

- [Google key handling](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [generateContent REST reference](https://ai.google.dev/api/generate-content)

## Verification and remaining work

Tests inject fake fetch/resolver responses; the core suite makes no live Gemini
calls. Coverage includes all existing deterministic behavior plus schema parsing,
legal-space validation, prompt context, missing credentials, provider/network/
timeout failures, HTTP input validation, stale/late/cancelled requests, fallback
races, duplicate submissions, and replay protection. Mocked responses validate
plumbing, not real semantic model performance.

Production assets use relative URLs for future iframe/subpath hosting. The `dist/`
folder contains **only static client assets**: uploading it to itch.io will preserve
fallback gameplay but cannot host a private Gemini key or this Node adapter.
Deployment needs a separate HTTPS service and an explicitly allowed frontend
origin; that is outside this local slice. No public deployment exists yet.

Gradium, microphone permissions, real voice-to-intent gameplay, deployment,
live model/demo validation, and final submission preparation remain outstanding.
This is not a claim of full SPEC compliance.

Manual check: build/preview; prepare the descriptions above; Start then Resolve.
Inspect the proposal and chess.js-generated SAN. With no key, verify the clear
configuration message and use coordinates to complete the pack. Test an illegal
coordinate (`a1 b3`), legal miss (`a1 a2`), timeout, 600-point run, and replay.
