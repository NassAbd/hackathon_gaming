# SonicCheck

A voice-first arcade chess puzzle game in development for the {Tech: Europe}
AI Gaming Hack. This slice adds **real microphone input through Gradium STT**, feeding the existing
Gemini intent resolver and deterministic chess.js game. Typed intent, coordinate
input, and board controls remain available in debug mode. There is no TTS.

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

1. Press **PREPARE MIC** and grant permission. The puzzle stays hidden while
   microphone/audio/socket setup completes. Wait for **MIC READY**.
2. Press **START PUZZLE**. The board appears and the ten-second timer starts
   together. Thinking time counts. Hold **HOLD TO SPEAK** (pointer or Space/Enter),
   speak, and release before zero.
3. Remaining time is captured on release while transcription/intent finish.
   Checkmate still adds `100 × new combo` points; no speed multiplier was added.
4. **Next puzzle** returns to hidden READY. Prepare and Start again.
   **Retry** restores the puzzle-entry score/solved/combo snapshot, replacing rather
   than accumulating its reward. **Play again** returns to hidden Puzzle 1.

The player view is composed for 1280×720 and 1100×620 with no required scrolling.
**Debug** opens a scrollable drawer; `?debug=1` opens it on load. It retains legacy
Enable/Start/Send controls, typed intent, coordinates, microphone lifecycle,
Gradium state, raw transcript, intent proposal, validation and latency telemetry.
Board clicks are enabled while this drawer is open. Debug Start begins the usual
ten-second clock; Close returns to the player view. No provider configuration,
semantic prompt/model, API contract, chess rules or puzzle fixtures changed.

Release during a fallback setup cancels without resetting the active round. Pointer cancellation,
lost capture, leaving the window while held, hidden page and keyboard focus loss
cancel rather than submit. Late setup results are disposed. Release commits exactly
once through the existing VoiceSession, including its time reservation and stale
response guards. First-time permission is handled by Prepare before Start. Retry setup during an already active round uses its remaining time.

Descriptions for the current pack:

- Rook: “put the rook on the back rank”
- Queen: “move the queen from g6 to g7”
- Knight: “put the horse on f7”

Typed requests retain their existing ten-second deadline behavior. Voice uses the
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

## Microphone / Gradium slice (legacy debug controls)

1. Configure `GRADIUM_API_KEY` in ignored `.env.local` and restart the server.
   Keep the existing `GEMINI_API_KEY`. Never paste permanent keys into the browser.
2. Press **Enable microphone** before **Start round**. Grant microphone permission.
   Audio hardware opens, but no samples are streamed until push-to-talk starts.
3. Start, hold to speak, and release (or use **Send speech**) strictly before the deadline. This explicit
   commit avoids guessing when a player has finished speaking. The microphone is
   stopped; Gradium finishes transcription, then the existing Gemini resolver runs.
4. **Cancel voice** or any typed/coordinate/board move cancels the attempt. A fresh
   microphone attempt obtains a new token. Connections are never silently retried.

The first locally received audio chunk above RMS 0.01 marks `speechStart`. This is
an energy gate, not semantic VAD: noise can pass it and very quiet speech can fail
it. A commit requires this local signal; empty/overlong final transcripts do not
call Gemini. Before commit, the normal ten-second deadline applies. At commit,
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

The debug drawer’s development panel reports permission acquisition, MediaStream
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
hold the voice button, wait for LISTENING, speak, and release before the deadline.
Open Debug to inspect detailed telemetry.
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

## Player experience release check

Baseline before UX changes: git commit `b196609`. Automated verification includes
hold preparation/release/cancellation, duplicate release, late async completion,
and a real VoiceSession integration with a committed move after the original
clock deadline. Existing unresolved, illegal and stale-result tests remain.
Local Chrome production-build checks at 1280×720 and 1100×620 found no page scroll,
and exercised debug fallback → checkmate → next puzzle. A simulated browser test
also exercised hold → transcript → unresolved → retry → checkmate and pointer
cancellation with no browser errors. These mocks do not establish live mic/STT
behavior in the uploaded iframe.

Manual itch.io release test (do not auto-deploy):

1. Upload `release/soniccheck-itch.zip` to the existing Draft. Reload at 1280×720,
   then ~1100×620; verify board, timer, score, voice button and next action fit.
2. Hold the main button, grant permission if needed, retry the hold if the dialog
   interrupted it. Wait for LISTENING, say “rook to a eight”, release before zero.
3. Check HEARD, UNDERSTANDING, frozen remaining time, then CHECKMATE and score/combo.
4. On a fresh run, say “rook” and release: an unresolved result must leave the board
   unchanged. Try a specific move again if time remains. Also test silence,
   permission denial, release during setup, and a hold exceeding ten seconds.
5. Release outside the button; pointer capture should still commit once. Cancel a
   hold by switching away; returning must not apply a late move. Test keyboard
   Space/Enter hold/release, next puzzle and replay.
6. Open Debug; inspect microphone/latency/proposal details and test typed,
   coordinate and board fallbacks. Close it to restore the clean player view.

The new ZIP is required; the Vercel API does not need redeployment for this pass.

## Retry puzzle and QA session log

**Retry puzzle** appears beside Next puzzle / See results after a result. It restores
that puzzle's exact initial FEN, ready state and full ten-second timer, clearing
selection, result, transcript and interaction status. It aborts pending voice and
typed requests and resets push-to-talk ownership before restoring state. Debug also
provides **Restart current puzzle**, including during processing, for stale-result QA.

Retry rolls score, combo and solved count back to their values on entry to the
current puzzle. Solving again replaces that puzzle's contribution; it cannot add a
second reward. Earlier puzzles remain credited. This also lets a retry recover from
a miss without permanently losing the incoming combo. Next puzzle and Play again
retain their existing behavior. History survives retries, next puzzle and new runs;
reloading/closing the page clears it. No persistence, backend or analytics is added.

Open **Debug → Session log** (or `?debug=1`) for a compact attempt list. Every voice
setup/hold attempt, including cancelled or failed setup, gets a unique index.
Typed and coordinate moves remain fallbacks and are not presented as voice attempts.
Use **Copy session log** for structured JSON, or **Download JSON** for a local file.
If iframe clipboard access fails, the complete JSON is displayed and selected for
manual copying. The download is a second fallback. Export takes a snapshot at click.

Schema version 1 includes:

- Session start, app version, browser user agent/language and initial viewport.
- Attempt index and wall-clock start/end; run, round and retry indices; puzzle ID,
  name and the expected pre-attempt FEN.
- Latest transcript, Gradium final transcript (null if unavailable), candidate,
  resolver status, chess validation outcome and chess.js-generated SAN if executed.
- Structured result: mate, legal_non_mate, unresolved, illegal, empty, timeout,
  cancelled or provider_failure; safe error code when available.
- Existing monotonic telemetry and remaining milliseconds captured at commit;
  derived speech, final-transcription wait, intent, validation and commit-to-move
  durations. Unreached stages are null, never invented zero-duration measurements.
- Selected microphone/Gradium state: permission, track state, context, worklet,
  sample/frame counts, RMS, socket readiness and message count at the snapshot.

Only selected fields enter the log. It does not serialize raw errors, provider
payloads, URLs, headers, API keys, temporary tokens, device IDs or microphone audio.
Speech duration retains its existing RMS-threshold definition. SAN reconstruction
uses chess.js against the recorded FEN; it never asks Gemini for SAN or changes play.

Manual QA after uploading the new ZIP to the existing itch Draft:

1. Hold/speak/release “rook to a eight”; inspect HEARD and the result.
2. Retry puzzle; confirm the rook returns to a1, timer shows 10.0s and the score
   returns to the puzzle-entry value. Try “move the rook to the back rank”.
3. Retry and try a third phrase. For unresolved input, use Debug Restart if you
   want a fresh ten-second attempt without waiting for the result timeout.
4. Open Debug → Session log. Confirm three separate entries with the same puzzle
   FEN and distinct retry indices. Copy or download and inspect all three entries.
5. During another UNDERSTANDING state, use Debug Restart. A late response must not
   move a piece or alter the restored score. Next puzzle must still advance once.
6. Check both 1280×720 and 1100×620: Retry and Next remain visible, and session
   diagnostics remain confined to the debug drawer.

Generate the new ZIP (no API redeployment is necessary):

```sh
VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api npm run build:itch
```

## Short audio-path diagnostic pass

No STT settings, Gemini behavior or capture processing constraints were changed.
Debug now shows the selected track label, actual track settings (unsupported fields
are null), context/worklet rates and channel count, sent input format, provider
ready sample rate, PCM peak/clipping count and chunk sample-offset discontinuities.
Audio settings/counts also accompany session-log entries; device labels/IDs and
raw audio are not included in session JSON.

The current constraints request mono, echoCancellation=true and noiseSuppression=true;
autoGainControl is unspecified, so the browser decides. These can suppress speaker
echo/background noise, but can also alter speech transients or levels. A headset
reduces acoustic feedback, so their benefit may be smaller; this pass leaves them
unchanged rather than assuming either configuration improves recognition.

A live local Chrome measurement on 2026-09-26 selected **Default — MacBook Pro
Microphone (Built-in)**, not a headset. This isolated browser result does not establish
which device the existing itch.io browser selected. The track reported 48000 Hz,
16-bit, mono, EC/NS/AGC=true, latency=0.01 s. Context and worklet were 24000 Hz;
Gradium setup was pcm_24000 and ready reported 24000 Hz. 27 chunks contained 51840
samples (2.16 seconds), received=sent, zero observed sample-offset discontinuities,
peak 0.16231, zero samples at/above full scale. No controlled speech was supplied:
this is transport measurement, not a speech-quality listening test.

48 kHz track → 24 kHz Web Audio graph entails browser resampling. Gradium's
[current browser recipe](https://docs.gradium.ai/guides/recipes/browser-microphone-stt)
also requests a 24 kHz context; its simple ScriptProcessor example is ~85.3 ms per
2048-sample block, with AudioWorklet recommended for production. SonicCheck uses
80 ms chunks (1920 samples at 24 kHz), with a final partial chunk flushed on commit.
The recipe's clamp and negative×32768/positive×32767 scaling match our conversion;
our DataView explicitly writes little-endian PCM16. Explicit PCM rate names are
supported by the [STT protocol](https://docs.gradium.ai/api-reference/endpoint/stt-websocket).
The [Web Audio specification](https://www.w3.org/TR/webaudio/#MediaStreamAudioSourceNode)
requires resampling when source and context rates differ. Conversion alone is not
evidence of faulty audio. Tests verify sample order across chunk boundaries and
byte-for-byte equality between socket payload PCM and exported WAV data.

For a headset test on the real itch build:

1. Open Debug. Check **Record next voice stream locally (max 8s)** before holding.
2. Close Debug, hold and speak one short known phrase, then release normally.
3. Reopen Debug. Check DEVICE identifies the intended headset and inspect actual
   track/context/worklet/provider rates, processing flags, peak and sample counts.
4. Click **Download exact-stream WAV** before beginning another attempt. Listen
   locally for speed/pitch errors, clipping or missing/distorted words. Export the
   session JSON as well to correlate settings, transcript and model result.
5. Uncheck recording to clear audio from memory. Reload also clears it.

Recording is off by default and only available in Debug. It retains up to eight
seconds of the exact base64-decoded PCM bytes successfully queued via WebSocket.send,
then adds a mono PCM16 WAV header at the same sample rate. This is not a second mic
recording, and no new upload occurs. Socket queue success is not proof of delivery
to Gradium; counts/offsets cannot prove absence of upstream driver dropouts. Each
new stream replaces the prior recording. No subjective clean-WAV claim has been
made; the user's real headset phrase is still needed for that comparison.

No concrete capture/encoding defect was found in this pass. Verify the actual
itch device and listen to its exact-stream WAV before any further STT tuning.
A new frontend ZIP is required for these diagnostics; no API redeployment is needed.

## Final player polish

The existing board/voice-panel composition remains. Short onboarding is “Find the
mate — Hold. Say your move. Release.” The old permanent HEARD box is replaced by a
subtitle in a reserved gutter below the board; it never covers squares. Existing
Gradium partial text updates while listening; the finalized utterance takes priority
while understanding. Result/cancel/retry hides it immediately without deleting the
full transcript in Debug/session history. Long text is limited to two display lines.
A speaker attribute supports future distinct styling; no opponent voice or TTS exists.

Press compresses the button immediately, preparation remains honestly labelled until
capture is ready, and LISTENING displays a small level meter driven by existing RMS.
Release immediately enters UNDERSTANDING. No synthetic waveform or new processing
was added. The original clock reservation and stale-response protections are intact.

Validated moves animate the destination glyph from its source for 170 ms, after
chess.js has already committed the move. Checkmate adds a subtle 180 ms board impact,
240 ms title pop, score/combo pop and point gain. Next/Retry use a 150 ms fade.
Animations never gate state, input or progression, and repeated renders do not replay
move/result effects. Reduced-motion disables movement/pulsing and leaves static
feedback. Unresolved reads DIDN’T CATCH THAT / Try again; deadline expiry reads
TIME’S UP with an explicit release-before-zero reminder.

Sound on/off controls a tiny local sine-tone system: activation, command lock,
failure, checkmate and completion. Checkmate's rising tones also accompany move and
combo feedback. It creates one output AudioContext after user interaction, catches
autoplay/device failures and never connects to the mic graph. Tones are suppressed
while capture is active; the lock cue waits for capture release and may be omitted
if resolution is already complete. This deliberately favors clean capture over a
sound at every stage. No external sound assets, network calls or dependencies.

RUN COMPLETE shows final score, puzzles solved and best combo. Best combo is UI-only
bookkeeping for retained puzzle results; Retry rolls its current-puzzle contribution
back just like score/solved count. Play again resets the run and best combo while
preserving the current browser's debug history.

Draft QA for the new ZIP:

1. Upload `release/soniccheck-itch.zip`. At 1280×720 and 1100×620, confirm no page
   scroll and that subtitles sit below, not over, the board.
2. Hold and speak “rook to a eight”. Check immediate press feedback, honest setup,
   LISTENING/level, partial/final subtitle and immediate UNDERSTANDING on release.
3. Check the animated Ra8#, checkmate impact, time-bonus/combo feedback and optional sound.
   Toggle Sound off and repeat; test headphones/speakers for sensible output volume.
4. Retry immediately during an effect: exact board/score reset, no ghost piece and
   no extra points. Test unresolved “rook”, silence, cancellation and timeout; no
   failure should pretend a move succeeded. Debug Restart during processing must
   still reject a late response.
5. Complete all three puzzles (debug coordinates: a1 a8, g6 g7, g5 f7). Expect a time-dependent score, solved 3/3, best combo ×3. Play again returns score/combo to zero and ready
   ten seconds; history remains. Also test a miss to break the combo.
6. Enable OS/browser reduced motion: no movement, shake or pulse. Test keyboard
   hold/release and visible focus. Confirm Debug typed/coordinate controls,
   microphone/WAV diagnostics, latency, history and exports still work.

Offline tests cover presentation transitions, unchanged score state, best-combo
rollback/reset, cue gating/context reuse and safe autoplay failures. Local Chrome
checks exercised full run/replay, reduced motion, retry/export and mocked voice
unresolved/retry/mate. Those do not replace a live headset/iframe rehearsal of the
new build. Provider/capture/game/API files and SPEC remain unchanged in this pass.
Particles, delayed progression and sounds during recording were deliberately omitted.


## Reveal-started clock release

This flow supersedes older hold-to-start QA notes below. Ready omits board squares,
piece accessibility labels and the identifying puzzle title entirely; it is not a
blurred position. First exposure and the guarded deadline start in one synchronous
UI action. A 120 ms fade does not delay input and is skipped for reduced motion.
Push-to-talk never starts or resets the deadline. Preparation acquires the existing
microphone graph and provider readiness before Start; PCM streaming starts only on
hold. Prepared connections retain their existing 30-second expiry. The UI retires an
unused prepared capture after 15 seconds, leaving a full round plus margin; prepare
again before revealing. After an unsuccessful committed attempt, a fresh connection uses the
remaining round time as before. No provider/capture settings changed.

Debug Start explicitly bypasses microphone readiness for typed/coordinate QA.
Debug history and exports remain available only in the drawer. Retry restores the
snapshot and invalidates pending work; it also returns to hidden READY for consistency.
Scoring remains combo-only: thinking now consumes eligibility time, not a new bonus.
Remote latency still preserves the remainder captured at a valid release.

The abandoned Gemini Live STT adapter, tests, manifest, reports, runner/npm command
and experiment docs were removed. Real local WAVs remain untouched under
`evals/stt/audio/` and ignored by Git. Semantic evals and production debug WAV/session
exports are preserved. No new dependency or API deployment is needed.

Draft QA (upload manually; never auto-deploy):
1. At 1280×720 and 1100×620, verify hidden READY, generic title, ten seconds,
   no piece labels, and visible Prepare/Start. Prepare and grant permission.
2. Start: board appears and timer falls immediately. Think for one second, then
   hold; verify the timer does not reset. Say “rook to a eight” and release before
   zero. Verify frozen time during UNDERSTANDING and validated Ra8#.
3. Retry: score rolls back; prepare/start and solve again without adding a second
   reward. Let a round expire while holding; a late release must not move.
4. Next: next position stays hidden until its own Start. Complete all three and
   inspect final results; Play again must show hidden Puzzle 1.
5. Test permission denial, prepared-connection expiry, silence and retry. Debug
   Start + coordinates remain available without microphone setup.
6. Debug Restart during UNDERSTANDING must reject the stale response. Inspect
   latency/session exports and exact-stream WAV export. Test reduced motion:
   no reveal movement/fade; timing and controls still work.

Build: `VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api npm run build:itch`.

## Experience completion pass

Current gameplay retains hidden READY → Prepare → Start/reveal + ten-second
clock → hold/speak/release. Player copy encourages “Move…” / “Put…” without imposing
a grammar or notation. Provider credits now live in Debug. The board has shallow
CSS depth, an immediate 180 ms reveal and urgent clock color; none delays gameplay.
Reduced motion removes animation. No external visual/audio assets were added.

A fixed **BLACK KING** subtitle appears in the reserved board gutter before a
round and after results. It gives no puzzle hints. Player speech takes priority
during capture/processing; failed recognition stays visible while the player can
try again, so they can see what was heard. Legal non-mates explicitly say the move
was understood. Ready/retry/next clears old player text.

Local Web Audio tones distinguish ready/start, lock, move, capture, check,
checkmate/combo, timeout, next and run completion. Event metadata is read from
chess.js positions after deterministic execution. Cues replace each other rather
than stack; mute and capture start immediately stop queued/sounding tones.
Input feedback remains visual when a press tone is stopped to protect speech.

**Gradium TTS was deliberately skipped.** The official
[TTS WebSocket protocol](https://docs.gradium.ai/api-reference/endpoint/tts-websocket)
requires synthesis setup and streamed audio handling. Adding voice selection,
playback/cancellation and cache validation expands the release surface; this pass
keeps the character text-only with zero added network calls or credentials.

The controlled intent-tolerance candidate passed once but failed confirmation with
two wrong legal moves. The original production resolver is retained. See
[56-case evaluation results](evals/README.md); a clean transcript such as queen
“next to the king” still abstains when multiple legal moves match. No semantic or
API redeployment is required for this frontend release.

The previous working ZIP is preserved at
`release/backups/soniccheck-before-experience-fc84f47.zip`.
Build the new ZIP with:
`VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api npm run build:itch`.

Draft QA: test Prepare → hidden READY → Start; think, hold/speak/release before zero;
check subtitle/understanding/mate and Retry rollback. Try an unresolved phrase,
a legal non-mate, and a late release. Complete all three, check hidden Next,
results and Play Again. At 1280×720 and 1100×620 test mute, reduced motion and Debug
typed/coordinate/WAV/session exports. Real headset/iframe rehearsal is required;
local mocked speech checks do not establish STT quality.

## Ten-second blitz and scoring

The final gameplay request overrides SPEC's five-second duration: competitive rounds now last ten seconds. SPEC.md is preserved. READY hides the board; Start reveals it and starts the deadline. Thinking and PTT consume that same clock. A valid voice commit reserves time and score before remote processing; PTT never resets time. Typed/click moves use remaining time when validated.

Per mate: **(100 + floor(remaining milliseconds / 100)) × new combo**, with remaining time clamped to 0–10,000 ms. At 9/7/5/3/1 seconds remaining, combo ×1 earns 190/170/150/130/110 points; ×2 doubles and ×3 triples these. Misses/timeouts earn zero and reset combo. Retry restores the puzzle-entry totals so attempts cannot accumulate points. Historical 600-point run observations above predate this bonus.

Offline Black King voice generation was stopped before any API calls or assets: [Gradium July 2026 terms §6.2](https://gradium.ai/terms-of-service) restrict free plans to internal/non-commercial use. The hackathon account's entitlement to distribute generated audio publicly has not been established. Confirm the applicable paid-plan or written hackathon permission before generation. No voice/model was selected, no speech files were generated, and no runtime TTS was introduced. Existing text and local synthesized SFX remain; PTT stops SFX before capture.

Draft QA: at 1280×720 and 1100×620, verify hidden READY → Prepare microphone → Start at 10.0 → think two seconds → hold/speak/release before zero. The timer must not reset on hold; remaining time freezes during processing. Check mate points against the formula, Retry rolls them back, Next conceals the next puzzle, all three solutions complete the run, and Play Again resets totals. Also wait to zero without speaking and verify timeout. No Black King spoken line is expected in this build.

## Local Black King voice integration — redistribution approval pending

Six pre-generated Gradium WAV files now provide cosmetic local character audio.
Model `default`, catalog voice Garrett (`POBHtemksfWQbng0`), WAV 48 kHz/16-bit/mono;
generated once through REST during private development. No runtime TTS or token
requests were added. WAVs remain gitignored under `src/assets/black-king/` while
rights are pending; a fresh checkout needs those six approved files to reproduce
the voiced build. Never publish that build without confirming redistribution rights.

READY alternates “Ten seconds. Show me.” and “Your move.” on successive attempts.
Unresolved intent says “Speak clearly. Time is running.” only with time remaining.
Legal non-mate: “Still standing.” Checkmate: “...well played.” Complete: “Fine. You win.”
The selected line supplies both the local audio and subtitle. Timeout keeps its
existing text-only reaction. Browser autoplay may suppress initial READY audio until
interaction; no gameplay action waits for audio. Failed playback leaves subtitles.

PTT/setup immediately cancels voice; playback is suppressed during capture. State
transitions replace/discard old playback, including pending play promises. Interrupted
lines never resume. The existing sound toggle mutes both SFX and character voice.

Clean fallback ZIP: `release/backups/soniccheck-pre-tts-ten-seconds.zip`.
Voiced evaluation ZIP: `release/soniccheck-itch-with-voices.zip` (also current
`release/soniccheck-itch.zip`). Neither was deployed. Draft QA should check READY
alternation, subtitle alignment, PTT interruption, mute, unresolved with time left,
miss/mate/complete reactions, immediate Next/Retry/Start/Play Again, and missing audio.
