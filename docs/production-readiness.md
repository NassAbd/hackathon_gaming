# First itch.io Draft readiness — 2026-09-26

Deployment update: the API is now verified at https://soniccheck-api.vercel.app.
See README’s Vercel section for current deployment, env and verification details.
The audit below records the earlier provider-neutral preparation; its pending API
deployment items are superseded. Uploaded itch Draft/microphone checks remain pending.

## 1. Semantic evaluation

42 fixed cases, using the three actual repository positions: 18 explicit/unique
moves and 24 abstentions. Includes legal nonwinning moves; English/French, casual,
spatial, disfluent, ambiguous, nonsense, unrelated and impossible instructions.

| Live run | Correct moves | Correct abstentions | Wrong moves | False abstentions | API errors | Mean | Median | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 18 | 14 | 10 | 0 | 0 | 881 ms | 841 ms | 1218 ms |
| Initial hardening | 18 | 23 | 1 | 0 | 0 | 848 ms | 832 ms | 1073 ms |
| Final hardening | 18 | 24 | 0 | 0 | 0 | 823 ms | 795 ms | 1075 ms |

Model: `gemini-3.5-flash-lite`, Developer API `v1beta:generateContent`.
These are single sequential runs, not repeated statistical trials. Latency is the
local server adapter's wall-clock duration, not browser/STT or provider-only time.
[Full reports](../evals/results/) retain cases, proposals, timings and hashes.

The baseline reproduced the reported nonsense→Ra8 proposal. Removed objective and
check/mate labels from context, and changed the general instruction to require
unique semantic evidence and respect all explicit constraints. No phrase lookup.
The first hardening still repaired a forbidden king capture into another move;
the final contract explicitly prohibits such repair. Expectations did not change
between live runs.

## 2. Remaining semantic risks

A model may still confidently return a legal but unintended move. Runtime legality
cannot prove semantic fidelity. Small fixtures and one pass do not establish
real-world accuracy; repeated unseen utterances, noisy STT and multilingual testing
remain necessary. Add new failures to evals, not production phrase rules.

“Finish him with the horse”, “smother the king with my knight”, and “la dame juste
à côté du roi” now deliberately abstain: winning intent alone is insufficient,
and several queen moves are adjacent to the king. Use “horse to f7”, “queen to g7”,
or another unique spatial description. No score/gameplay rules changed.

## 3–5. Architecture, paths and functions

Static itch frontend → `POST https://YOUR_API/api/gradium-token` → Gradium token
service; browser then streams directly to Gradium WSS. Static frontend →
`POST https://YOUR_API/api/intent` → Gemini → candidate → client validation/chess.js.

`server/api.ts` exports portable `handleApi(Request, env): Promise<Response>`.
`npm run build:api` bundles it as `server-dist/api.js`, exporting `handleApi`.
Mount that handler at both paths; it also handles `OPTIONS`. A provider wrapper
passes only the four server env bindings below. For a Fetch-native runtime:

```js
import { handleApi } from './api.js';
export default { fetch: (request, env) => handleApi(request, env) };
```

Node function hosts need their normal HTTP-to-Fetch wrapper and environment map.
Do not deploy Vite dev/preview. No database, cookies, sessions, authentication
system or persistent game backend is implemented. No HTTP streaming or server-side
WebSocket support is needed; audio never passes through our function.

Gradium officially documents server key → temporary single-use token → direct
browser socket. Token issuance is stateless. Its security guide says to authenticate
users before vending tokens. Anonymous access works at the protocol level but does
not follow that recommendation: CORS is not authentication. Before exposing a
Draft API, configure provider-level per-IP rate limits, concurrency/request limits,
provider quotas/spending caps and an emergency disable switch. These mitigate,
but cannot eliminate, anonymous credit abuse; no claim of authenticated access.
[Gradium browser guide](https://docs.gradium.ai/guides/browser-websockets).

Gemini ephemeral tokens are **Live API only**; they cannot secure this REST
`generateContent` request. Switching to Live would change the working semantic
adapter and add session complexity. Keep its key in the stateless function.
[Google ephemeral-token documentation](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens).

## 6. Configuration and runtime

| Variable | Location | Value |
| --- | --- | --- |
| `GEMINI_API_KEY` | Server secret binding only | Gemini Developer API key |
| `GEMINI_MODEL` | Server only, optional | Default `gemini-3.5-flash-lite` |
| `GRADIUM_API_KEY` | Server secret binding only | Gradium permanent key |
| `ALLOWED_ORIGINS` | Server only | Comma-separated exact HTTPS origins; no trailing slash |
| `VITE_API_BASE_URL` | Frontend build, public | `https://YOUR_API/api` |

Use a modern JS runtime with ES2022, Fetch Request/Response, fetch, AbortController,
AbortSignal.timeout, TextEncoder/Decoder, Web Streams and timers. Local tooling uses
Node 24. The bundle includes chess.js; there are no runtime Node imports. Suitable
categories: Fetch-native edge functions or Node serverless HTTP functions. Choose a
nearby region, low startup overhead and simple managed secrets/rate limits. No
specific hosting provider is necessary or deployed here.

Configure HTTPS, both routes, 4 KiB gateway body limit, request upload timeout and
at least a 10-second platform execution allowance. Adapter upstream calls abort at
4 seconds; browser intent waits 4.5 seconds, token request 5 seconds. Cold starts
and transit consume those browser budgets, so test them before increasing limits.
No persistent files or in-memory counters should be relied on across invocations.

## 7. CORS and origin

Both routes allow `POST` plus `OPTIONS`; JSON sends `Content-Type: application/json`.
Preflight permits only that header and POST, caches for 600 seconds. Responses use
exact `Access-Control-Allow-Origin`, `Vary: Origin`, and `Cache-Control: no-store`.
No credentials/cookies or wildcard origin. Unknown, missing, `null`, and malformed
origins fail closed. Actual requests still require the allowed origin.

Capture the **game iframe's** `location.origin` / network `Origin` in the uploaded
Draft, not the creator page URL or a guessed CDN hostname. Configure only that
verified origin. Origins cannot include game paths: if itch serves multiple games
from one shared origin, the allowlist cannot distinguish them. Non-browser clients
can forge Origin. Keep abuse controls even with exact CORS.
[MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## 8. Microphone and iframe

HTTPS, explicit user permission and parent iframe microphone delegation are required.
If sandboxed, the frame also needs a usable origin (`allow-same-origin`). A restrictive
parent Permissions-Policy can block access even with an iframe allow attribute.
Our child page cannot override the parent. Enable microphone via the existing
button; keep typed fallback on denial. Test actual browser/OS permission behavior.
[MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Itch documents static HTML5 iframe hosting, relative paths and HTTPS external
requests, but its HTML5 guide does not guarantee microphone delegation for our
uploaded Draft. Inspect the actual embed and test microphone/STT in embedded and
fullscreen modes. A forum observation is not a deployment guarantee. If blocked,
request itch support/configuration; fullscreen alone is not a guaranteed policy fix.
[Itch HTML5 documentation](https://itch.io/docs/creators/html5).

## 9. Latency

User-reported local measurements (not newly measured here): final STT wait ~464 ms,
Gemini ~932 ms, validation ~2.6 ms, commit→move ~1398 ms; typed intent ~843 ms.
The live eval above measures a different boundary and is not an end-to-end comparison.

Token preparation adds browser→function→Gradium round trips before the round.
Audio has one direct browser→Gradium WSS path, avoiding a relay hop. Intent keeps
the existing browser→function→Gemini path. Production adds geographic transit,
possible CORS preflight and cold start overhead; there are no production measurements.
Preflight caching helps subsequent requests. Prefer a small warm/edge function near
players/providers; do not promise a latency improvement before measurement.
Existing voice commit-time reservation and stale-result protection remain unchanged.

## 10–11. Packaging and automation

`base: './'` and emitted relative worklet/assets support subdirectory hosting.
No runtime localhost dependency exists when the public API base is configured.
`npm run build:itch` requires the HTTPS base, builds, scans artifacts/source/HEAD,
zips **contents** of dist, extracts and scans again, verifies root `index.html`,
and writes `release/soniccheck-itch.zip`. Requires local `zip` and `unzip` commands.
No server bundle, env files, source maps or node_modules belong in the ZIP.

Packaging was exercised with reserved `.invalid` test infrastructure; the resulting
`release/soniccheck-itch.test-only.zip` is **not for upload**. No production API URL
has been supplied. Running packaging without one fails before creating a new ZIP.
The regular local production build was restored afterward. Automated scanning
checks actual configured key values plus common key/private-key patterns; it cannot
prove absence of every unknown secret or replace a repository-history audit.

Automated: deterministic tests, typecheck, lint, frontend/function builds, semantic
live eval, exact-origin request checks, artifact packaging and bounded secret scan.
Not automated: platform deployment/abuse controls, actual iframe origin, mic policy,
real human STT quality, cold starts, and uploaded Draft gameplay acceptance.

## 12. Exact human release steps

1. Choose a serverless host; deploy `server-dist/api.js` with the Fetch wrapper or
   host HTTP wrapper, HTTPS routes and the runtime/timeout/abuse limits above.
2. Store both keys as server secrets; set optional model and initially empty origin
   allowlist. Set public `VITE_API_BASE_URL=https://YOUR_API/api` in `.env.local` or
   the build environment. Never use VITE-prefixed permanent keys.
3. Run `npm ci`, checks, `npm run build:api`, then `npm run build:itch`. Upload only
   `release/soniccheck-itch.zip` to a new **Draft** HTML5 itch project, enable play in
   browser and select click-to-launch. Keep it nonpublic while checking.
4. Open the Draft; inspect the running iframe origin, its sandbox/allow attributes
   and Permissions-Policy. Add the exact origin to server `ALLOWED_ORIGINS`; redeploy
   function configuration. Confirm both preflights/POSTs succeed without cookies.
5. Grant mic permission and play through all three puzzles with explicit commands.
   Verify actual Gradium transcripts, Gemini proposals, chess-generated SAN and
   telemetry. Test denial, provider/network failure, cancellation, replay, a slow
   on-time committed voice result, stale results, typed and coordinate fallbacks.
6. Test desktop embed/fullscreen and intended mobile browsers. Measure cold/warm
   timing, inspect network/bundle for secrets, confirm rate limits/caps, then decide
   whether to publish. No itch.io compatibility claim until these checks pass.

## 13. Blockers / caveats

No deployed function URL or uploaded Draft is available. Exact iframe origin and
microphone policy therefore remain unverified. Gradium's authenticated-user security
recommendation conflicts with unrestricted anonymous token vending; the chosen
anonymous Draft requires explicit operational abuse limits and residual-risk awareness.
Gemini ephemeral tokens do not apply to this API. Neither finding requires a
persistent game server, database, or an invented browser credential mechanism.
