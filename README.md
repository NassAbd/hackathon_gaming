# SonicCheck

A voice-first arcade chess puzzle game in development for the {Tech: Europe}
AI Gaming Hack. This slice adds **real microphone input through Gradium STT**, feeding the existing
Gemini intent resolver and deterministic chess.js game. Typed intent, coordinate
input, and board controls remain available. There is no TTS.

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
- `GRADIUM_API_KEY`: your Gradium API key, used only by the server to issue a
  short-lived, single-use browser token.

Restart the server after changing credentials. Do not use a `VITE_` prefix for
secrets, paste keys into the browser, or commit local env files. Shell environment
variables are also supported. No key is needed for board/coordinate play.

This implementation uses the **Gemini Developer API**, not Vertex AI service-account
credentials. The hackathon key must permit the selected model. If your resources
provide only Vertex AI access, the server authentication adapter needs adapting.
The typed Gemini flow was reported working before this slice. Its local credential
is preserved. No separate hackathon resources were found. A Gradium key became available during
implementation; live token issuance, microphone initialization and STT readiness
were verified. The user subsequently confirmed a working spoken end-to-end flow; their observed timings are recorded in the production-readiness report. Uploaded iframe testing is still outstanding.

1. Study the position. Optionally prepare a natural-language description before
   pressing **Start round**.
2. Press **Resolve** within five seconds, or select a piece and destination, or
   type coordinates such as `a1 a8` / `a1a8` and press Enter in the coordinate field.
3. Any legal checkmate wins. Wins add `100 × new combo` points; three consecutive
   wins total 600. A legal non-mating move ends the round and resets the combo.
4. Press **Next puzzle**, then **Start round**. After results, **Play again** resets.

Descriptions for the current pack:

- Rook: “put the rook on the back rank”
- Queen: “move the queen from g6 to g7” / “la dame en g7”
- Knight: “put the horse on f7” / “le cavalier en f7”

Typed requests retain their existing five-second deadline behavior. Voice uses the
commit-time reservation described below. Click and coordinate controls remain
available during processing; using a fallback cancels pending voice first.

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
| `npm run preview` | Serve production build with local API adapters |
| `npm run eval:intent -- LABEL` | Separate paid live semantic evaluation; writes results under evals/results |
| `npm run build:api` | Portable stateless function bundle in server-dist/ |
| `npm run build:itch` | Build, scan and package static ZIP; requires public HTTPS API base |
| `npm run scan:secrets` | Check dist and current source/HEAD against configured keys and common patterns |

## Architecture

`typed utterance + current FEN → /api/intent → Gemini proposal → chess.js → game`

- TypeScript + Vite; existing browser DOM/CSS, no UI framework or vendor SDK.
- `server/gemini.ts`: native-fetch adapter using
  `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  with server-only `x-goog-api-key` authentication.
- Context is derived using chess.js: FEN, side to move, piece map, and **all legal
  moves**, including captures/promotions. No puzzle objective, SAN, check/mate labels
  or move-strength rankings are supplied. Winning outcomes are not semantic evidence.
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
  rejects unapproved origins, non-POST and non-JSON requests.
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

Production assets use relative URLs. The `dist/` folder contains static client assets;
production API routes are supplied separately by a stateless function, not by itch.io.
See [production readiness](docs/production-readiness.md) for official research, exact
configuration, evaluation results, latency boundaries and remaining manual checks.
No public deployment or uploaded Draft compatibility claim exists yet.

Manual check: build/preview; prepare the descriptions above; Start then Resolve.
Inspect the proposal and chess.js-generated SAN. With no key, verify the clear
configuration message and use coordinates to complete the pack. Test an illegal
coordinate (`a1 b3`), legal miss (`a1 a2`), timeout, 600-point run, and replay.

## Microphone / Gradium slice

1. Configure `GRADIUM_API_KEY` in ignored `.env.local` and restart the server.
   Keep the existing `GEMINI_API_KEY`. Never paste permanent keys into the browser.
2. Press **Enable microphone** before **Start round**. Grant microphone permission.
   Audio hardware opens, but no samples are streamed until the round starts.
3. Start, speak, and press **Send speech** strictly before the deadline. This explicit
   commit avoids guessing when a player has finished speaking. The microphone is
   stopped; Gradium finishes transcription, then the existing Gemini resolver runs.
4. **Cancel voice** or any typed/coordinate/board move cancels the attempt. A fresh
   microphone attempt obtains a new token. Connections are never silently retried.

The first locally received audio chunk above RMS 0.01 marks `speechStart`. This is
an energy gate, not semantic VAD: noise can pass it and very quiet speech can fail
it. A commit requires this local signal; empty/overlong final transcripts do not
call Gemini. Before commit, the normal five-second deadline applies. At commit,
the remaining time is reserved and displayed while remote work runs. On failure
or cancellation the exact remainder resumes from the current time. Success goes
through the existing `submitMove` and score/combo logic. Model/network duration
cannot turn an on-time voice submission into a timeout or reduce its points.

Reservation is scoped to the active voice operation and held game state. Cancel,
fallback input, replay, and puzzle transitions invalidate it. A previous round's
transcript/proposal can never execute, even if its FEN is identical.

### API and browser/server boundary

- Server: `GET https://api.gradium.ai/api/api-keys/token`, authenticated with the
  permanent key in `x-api-key`. The local `POST /api/gradium-token` endpoint returns
  only the temporary token and `expires_at`, with no-store caching.
- Browser: `wss://api.gradium.ai/api/speech/asr?token=…`, one new token per connection.
  Never log the token or store it persistently. The backend does not relay audio.
- Setup: model `default`, `json_config.language = en` (English-only MVP),
  `json_config.keywords = { words: ["rook", "knight", "bishop", "queen", "king", "pawn", "check", "checkmate"], boost: 3 }`.
  `delay_in_frames` and `temp` remain unset (no latency tuning).
  `input_format = pcm_<actual sample rate>`. AudioWorklet captures mono PCM; samples
  are clipped and encoded as signed 16-bit little-endian, in ~80 ms base64 chunks.
  The requested graph rate is 24 kHz; supported actual rates are 16/24/48 kHz.
- Wait for `ready` before streaming. On commit, drain the worklet's last chunk, send
  `end_of_stream`, accumulate `text` segments, and wait for provider `end_of_stream`.
  Intermediate text is never prematurely submitted as the complete utterance.
- Gradium does no chess intent resolution. The final transcript uses the same
  `requestIntent` → `/api/intent` → server `resolveIntent` as typed descriptions.
  Runtime schema/legal-space checks and chess.js remain unchanged.

Adapters live in `server/gradium.ts` and `src/services/gradium/`. Permission denied,
missing/unreadable microphone, unsupported audio APIs, missing key, rejected token,
network/provider failure, invalid/empty transcript and timeout all produce readable
feedback. Audio tracks, worklet, context and sockets are released on completion,
failure, cancellation or page exit. A late permission grant is stopped immediately.
Token issuance has a 4-second server timeout; connection/final STT response each
have a 5-second bound; unused prepared connections expire after 30 seconds. The
permission prompt has a 15-second application timeout. No automatic retry spends
additional credits or reuses a single-use token.

### Latency telemetry

Expand **Voice latency telemetry**. Timestamps are actual browser `performance.now()`
values in milliseconds since the page time origin; unreached stages are null:

- `speechStart`: locally observed energy threshold crossing (not acoustic onset).
- `speechCommitted`: Send speech click; the end/commit boundary used for the clock.
- `transcriptAvailable`: receipt of the finalized Gradium utterance.
- `intentRequestStart` / `intentResolved`: existing Gemini request round trip.
- `validationComplete`: synchronous chess.js validation returned.
- `moveCommitted`: validated result assigned to game state, only for an executed move.

Derived durations show speech interval, final-transcription wait, intent round trip,
validation and commit-to-move. These include local scheduling and network overhead;
they are not fabricated provider-only latency figures. Raw audio is not retained.

### itch.io deployment

Use static itch assets plus the portable `handleApi(Request, env)` export in
`server-dist/api.js` (`npm run build:api`). Deploy it on a Fetch-compatible edge or
Node serverless HTTP host; no database, persistent session or audio relay is needed.
Keep `/api/intent` and `/api/gradium-token` as POST routes, both supporting OPTIONS.
The existing Vite middleware remains local-only.

Server bindings: `GEMINI_API_KEY`, optional `GEMINI_MODEL`, `GRADIUM_API_KEY`, and
`ALLOWED_ORIGINS` (comma-separated exact HTTPS iframe origins). Set public frontend
`VITE_API_BASE_URL=https://YOUR_API/api` at build time. Blank retains local relative
routes. Never put either permanent key in a VITE variable or URL.

The handler enforces exact-origin CORS and 4 KiB JSON limits, without cookies. CORS
is not authentication and a shared itch CDN origin cannot distinguish game paths.
Gradium recommends authenticated token clients; this anonymous Draft omits login
as requested and needs platform rate limits, concurrency/credit caps and an emergency
disable path before exposure. It cannot be made abuse-proof with CORS alone.

Configure HTTPS and at least 10 seconds platform execution time, with a bounded
request upload duration. Upstream adapter calls still abort at 4 seconds; browser
budgets remain 4.5 seconds for intent and 5 seconds for token preparation. Cold starts
consume those budgets. Gemini ephemeral tokens work only for Live API, so they do
not replace the server key for our REST intent adapter.

Run `npm run build:itch` with the public base set. It builds and secret-scans dist,
creates `release/soniccheck-itch.zip` with root `index.html`, extracts and scans the
ZIP. Requires `zip`/`unzip`. A missing base fails closed. Packaging was tested using
a reserved `.invalid` API; `release/soniccheck-itch.test-only.zip` is not uploadable
as a working API demo. Rebuild with the real endpoint.

Upload that real ZIP as an itch HTML5 **Draft**, choose play-in-browser, inspect the
actual running iframe origin and configure it in `ALLOWED_ORIGINS`. Check CORS and
both APIs, then microphone permission, real speech, fallback controls and latency
in embed/fullscreen. HTTPS plus parent microphone delegation and a usable frame
origin are required. The child cannot override parent policy. Itch's HTML5 guide
does not guarantee our Draft's microphone access; manual validation is mandatory.
The [readiness report](docs/production-readiness.md) contains exact release steps.

Official references consulted before implementation:
[Browser tokens](https://docs.gradium.ai/guides/browser-websockets),
[browser audio recipe](https://docs.gradium.ai/guides/recipes/browser-microphone-stt),
[STT protocol](https://docs.gradium.ai/api-reference/endpoint/stt-websocket),
[stream lifecycle](https://docs.gradium.ai/guides/websocket-lifecycle).

Offline tests cover voice orchestration, saved time, slow results, empty transcripts,
Gemini errors/illegal proposals, cancellation/replay races, PCM encoding, protocol
ordering/finalization, provider errors/timeouts, token sanitization, permission
failure and late-grant cleanup. These are mocks, not proof of live STT accuracy.

## Semantic contract and measured evaluation

Gemini resolves intent; it does not solve the puzzle. A move needs unique evidence
in the utterance. Nonsense, ambiguity, impossible requests and outcome-only commands
abstain. “Finish him with the horse” and “smother the king with my knight” no longer
justify selecting the mating move. “La dame juste à côté du roi” is ambiguous in
this position. This is intentional semantic hardening; typed and voice inputs share
exactly the same resolver and unchanged chess.js validation.

The 42-case live evaluation improved from 10 wrong resolutions to 0: final run had
18 correct resolutions, 24 correct abstentions, no false abstentions or API errors.
Mean/median/p95 adapter durations: 823/795/1075 ms. This is one small evaluation,
not proof against unseen semantic mistakes. [Dataset and methodology](evals/README.md)
and [full production report](docs/production-readiness.md) document limitations.

## Vercel API deployment

Vercel is selected for the first API deployment. `api/intent.ts` and
`api/gradium-token.ts` use Vercel's supported Fetch-style Node Functions, delegating
to `server/vercel.ts`, which passes exactly four server environment bindings to
unchanged `handleApi(Request, env)`. No framework or SDK dependency is added.
`vercel.json` selects Other (not Vite), Node 24 through package.json, a 10-second
function limit, and an isolated `vercel-static` output containing only robots.txt.
Vercel compiles the two API entrypoints; it does not deploy the game frontend.
`.vercelignore` excludes local env files and generated frontend/release artifacts.

Production API deployed and remotely verified on 2026-09-26:

- Stable URL: https://soniccheck-api.vercel.app
- Frontend base: `VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api`
- Project: `abdallahs-projects-0774a09b/soniccheck-api`
- Verified deployment: `dpl_Ak2aW5BxcEPzRaR86uNQbuNgGi3d`
- Both permanent keys are configured as Vercel Production secrets via stdin;
  optional model override is unset (existing default unchanged).
- Current `ALLOWED_ORIGINS=https://soniccheck-verification.invalid` is an exact
  temporary verification origin. Replace it with the actual itch iframe origin
  after Draft inspection, then redeploy; never replace it with a wildcard.

Remote checks passed: HTTPS, both preflights (204), disallowed/missing origins (403),
malformed JSON (400), oversized requests (413), three expected Gemini proposals,
and one valid Gradium browser token (not displayed or retained). Remote intent
round trips were 1244, 1234 and 877 ms (mean 1118 ms), separately measured from the
local semantic benchmark. Build/runtime logs and response bodies were checked for
configured secret leakage; no matches were found. Frontend/source/env URLs return
404. The initial deployment's Node ESM import failure was fixed using explicit
.js import specifiers; a compiled-entrypoint regression check now runs in
`build:vercel`. Request logic, prompts and model were unchanged.

For a fresh checkout/account, link to the existing project:

```sh
npx --yes vercel@60.1.3 login
npx --yes vercel@60.1.3 link --project soniccheck-api
```

Select the existing SonicCheck API project and account/team. Keep
repository root as the project root, Other framework and Node 24. In Project
Settings → Environment Variables, set for **Production**:

- `GEMINI_API_KEY` and `GRADIUM_API_KEY` as server secrets (copy locally, never chat).
- `GEMINI_MODEL` optionally; the existing default remains unchanged.
- `ALLOWED_ORIGINS`: explicit comma-separated HTTPS origins, no wildcard/trailing
  slash. Empty/unset rejects all origins. For initial command-line verification,
  use `https://soniccheck-verification.invalid` as a temporary exact test origin;
  replace it with the observed itch iframe origin after Draft inspection.

Then deploy:

```sh
npx --yes vercel@60.1.3 deploy --prod
```

Environment changes require a new production deployment. Configure Vercel Firewall
rate limits and spending/provider quota limits before public use. Ensure production
Deployment Protection allows anonymous API clients and OPTIONS; never embed a
protection-bypass secret in the frontend. Keep preview protection as appropriate.

After deployment, verify HTTPS, OPTIONS on both paths, denied origins, malformed
and >4096-byte bodies, a legal Gemini proposal, and Gradium temporary token issuance
with the allowed test origin. Do not print/log the returned Gradium token. Verify
responses and function/static artifacts contain neither permanent key. These remote
checks passed on the verified deployment above; repeat them after deployment changes.

The verified production API base is `https://soniccheck-api.vercel.app/api`:

```sh
VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api npm run build:itch
```

This uses the verified stable production domain. No itch
frontend upload is performed by Vercel deployment or this packaging command.

Official documentation checked before implementation:
[Vercel Node Fetch Functions](https://vercel.com/docs/functions/runtimes/node-js),
[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
[project configuration](https://vercel.com/docs/project-configuration/vercel-json),
[deployment exclusions](https://vercel.com/docs/deployments/vercel-ignore),
[CLI login](https://vercel.com/docs/cli/login).

## Microphone lifecycle diagnostics and region fix

The always-visible development panel reports permission acquisition, MediaStream
identity/active state, strongly held capture reference, track state/enabled/muted,
AudioContext state, graph connections, worklet callback/input-frame counts, RMS,
PCM chunk/sample counts, WebSocket state, protocol readiness, message counts/types,
transcript, last error and cleanup reason. The last lifecycle events use actual
`performance.now()` timestamps relative to Enable; console transitions carry the
`[SonicCheck mic]` prefix. Counts distinguish sample frames from 80 ms PCM chunks.
No token, socket URL with credentials, raw audio or raw provider error is logged.

The production short-lived-microphone symptom was reproduced as Gradium token
rejection, which correctly triggered track.stop/context.close. Token issuance on
Vercel in the US and a browser in Europe hit different clusters behind Gradium's
geo-routed hostname. Fresh production tokens worked on US ASR but failed on EU ASR
with error 1008. Both adapters now use the same explicit **eu.api.gradium.ai** host.
This keeps browser-direct streaming and the portable API architecture unchanged.
The server fix is deployed; a new production token was verified to reach EU `ready`.
The response reports best-effort EU routing, not a paid residency guarantee.

After Enable, expect granted, active=true, live/enabled/unmuted, running, increasing
worklet frames and changing RMS, WS open and protocol ready=true. **Before Start,
PCM sent remains zero intentionally**; the microphone graph is live but samples stay
local. Start the round, speak, and Send speech before the existing deadline. PCM
counts should increase; Gradium text appears in the panel, and the final utterance
triggers the existing intent request. Cancel, commit, timeout/round end and provider
failure deliberately stop the mic; the diagnostic cleanup reason explains which.
Prepared connections still expire at 30 seconds. No game/clock rules changed.

A slow first permission prompt can consume the token's brief lifetime or exceed the
existing 15-second permission timeout. The panel distinguishes that from token-region
rejection; after granting permission, retry Enable. Late-granted tracks are stopped
rather than leaked. This was also observed locally and remains a demo constraint.

A real local capture stayed live for >12 seconds with 301056 measured input frames
and measurable RMS. Full spoken input on the newly uploaded itch build still needs
human verification; no successful speech→move claim is inferred from WS 101 alone.

Generate the diagnostic build (already exercised locally, never auto-uploaded):

```sh
VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api npm run build:itch
```

Upload `release/soniccheck-itch.zip` to the existing Draft and reload it. The new ZIP
is needed for the pinned browser endpoint and visible diagnostics. No CORS/env change
is required. See [lifecycle investigation](tasks/microphone-lifecycle.md).

Browser research: [getUserMedia permission/iframe requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[Chrome user-activation and AudioContext resume](https://developer.chrome.com/blog/autoplay),
[AudioWorklet secure contexts and processor errors](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode),
[itch iframe hosting](https://itch.io/docs/creators/html5),
[Gradium regional routing](https://docs.gradium.ai/guides/data-residency).
The observed successful mic acquisition/graph rules out a blanket permission denial
in the local test; the actual itch embed still requires its own permission grant.

### English STT quality check

The English language hint and chess keywords follow Gradium's documented
[transcription settings](https://docs.gradium.ai/guides/transcription-settings) and
[keyword boosting](https://docs.gradium.ai/guides/recipes/keyword-boosting).
Boost 3 is the recommended starting point, not a guarantee of accurate recognition.
There are no transcript replacements. The existing 80 ms PCM chunks match the
[browser streaming guidance](https://docs.gradium.ai/guides/recipes/browser-microphone-stt).
The graph requests 24 kHz and declares its actual rate; no resampling was added.

After uploading the new ZIP to the itch.io Draft, test each phrase below twice in
roughly the same quiet setting and at the same microphone distance. For each trial,
Enable microphone, Start round, speak, then Send speech before the deadline.
Use Replay as needed. Read/copy **TRANSCRIPT** from microphone diagnostics before
starting the next attempt; judge the raw Gradium text, not Gemini's move or success.
These are STT probes: some intentionally do not describe a legal move on the puzzle.

- move the rook to the top
- rook to a eight
- move the knight beside the king
- put the queen next to the king
- move the bishop across the board
- rook behind the king
- checkmate with the rook
- move the pawn forward

Record expected phrase, raw transcript, chess-word errors and
`transcriptAvailable - speechCommitted` from Voice latency telemetry for each trial.
Ignore punctuation/case; note equivalent coordinate renderings such as “a8”.
Compare against the old Draft under the same conditions if it remains available.
No spoken accuracy or latency improvement has been measured for this configuration
in automated tests; human microphone testing is required.

Build the updated ZIP with:

```sh
VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api npm run build:itch
```
