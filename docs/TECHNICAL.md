# SonicCheck technical documentation

Current release: ten-second, English-only voice chess with local Black King voice
assets. This document supersedes the historical production-readiness report and
implementation task notes. The user reported the production itch Draft working
end-to-end; the public game URL has not yet been supplied for the README.

## Architecture and trust boundaries

```text
itch.io static frontend
  microphone → AudioWorklet → Gradium EU WebSocket → transcript
       ↑ token from Vercel POST /api/gradium-token
  transcript + FEN → Vercel POST /api/intent → Gemini candidate
  candidate → browser runtime validation → chess.js → game state → local feedback
```

Vite/TypeScript/DOM/CSS, with no UI framework. chess.js is the sole rules engine.
The backend is the portable `handleApi(Request, env)` in `server/api.ts`. Two
Vercel Fetch-style Node Functions delegate through `server/vercel.ts`; there is no
database, session service, audio relay, authentication system or runtime TTS.
Vercel hosts only API functions and `robots.txt`; itch hosts the browser files.

Untrusted boundaries are microphone/provider text, HTTP JSON, Gemini responses,
and candidate moves. Provider replies cannot mutate game state. Client game state
and scores are local and editable by a determined player; there is no competitive
server leaderboard or anti-cheat claim.

## Game lifecycle, timing and score

READY conceals pieces and puzzle title. Prepare obtains mic/audio/provider readiness
without revealing the puzzle; Start reveals it and starts the same ten-second clock.
Thinking and holding consume time. PTT does not restart or extend the deadline.
A valid release strictly before the deadline reserves the remaining milliseconds
while transcription and intent finish. Failure resumes that remainder. Remote
latency does not reduce an on-time voice command's points. Typed/coordinate input
uses its normal execution-time deadline.

Mate reward: `(100 + floor(clamp(remainingMs, 0, 10000) / 100)) × newCombo`.
At 9/7/5/3/1 seconds remaining, combo ×1 earns 190/170/150/130/110 points.
Miss or timeout earns zero and resets combo. Retry restores the puzzle-entry
score/solved/combo snapshot, so attempts cannot accumulate rewards. Play Again
resets the run. Three curated mate-in-one positions form the current pack.

Operation identity, AbortController cancellation, current FEN, phase and deadline
checks discard stale work after Retry/Next/Replay/fallback input, even when a new
round has the same FEN. Chess validation occurs on a fresh engine before a board
update. Animations, sounds and character playback never gate game progression.

`SPEC.md` is unchanged: it still describes five seconds and multilingual examples;
subsequent explicit product decisions selected ten seconds and English-only.
The checked-in SPEC defines no four-puzzle pack; the initial deterministic plan
selected three. No fourth puzzle was silently removed.

## Gradium speech processing

`server/gradium.ts` requests a browser token from
`https://eu.api.gradium.ai/api/api-keys/token` using a server `x-api-key` header.
The browser receives only `token` and `expires_at`, with `Cache-Control: no-store`.
Expiry must be in the future, token length is bounded, unexpected fields are discarded,
and a token containing the permanent Gradium key is rejected. This final defensive
check is a local API change requiring a deliberate API deployment; it is not yet
claimed to be live.

The token is used once in the EU ASR WebSocket query string. It is not put in
application storage, logs or exports. Browser network tools can still see it; do
not publish HAR/network captures. Single-use/short-lived credentials reduce exposure
but anonymous issuance still permits abuse. Tokens are not proven STT-only scoped:
a recipient may attempt other Gradium operations supported by that credential.
See [Gradium browser authentication](https://docs.gradium.ai/guides/browser-websockets).

Setup uses model `default`, language `en`, and chess keywords rook/knight/bishop/
queen/king/pawn/check/checkmate with boost 3. No transcript substitutions, custom VAD,
or extra latency tuning: `delay_in_frames` and `temp` are unset.

getUserMedia requests audio; actual track settings are measured, not assumed.
The graph requests 24 kHz and supports actual rates 16/24/48 kHz. AudioWorklet sends
mono float samples in approximately 80 ms chunks, then clamps and converts them to
signed little-endian PCM16 with explicit `pcm_<actual rate>` setup. Final partial
chunks drain before `end_of_stream`. Browser resampling can occur when track and
graph rates differ. Partial text updates the UI; only provider-final transcription
is sent to Gemini. The transcript cap is 300 characters.

Timeouts: server token request 4 s; browser token request 5 s; permission setup 15 s;
WebSocket readiness/finalization 5 s each; prepared stream lifetime 30 s. The UI
retires unused preparation at 15 s to leave a complete round plus margin. No automatic
provider retry spends more credits. Completion/cancel/failure releases tracks,
context/worklet and socket. Late permissions/results cannot revive old captures.

## Gemini intent resolution

Gemini Developer API REST `generateContent`, not Vertex AI or Gemini Live.
Default model: `gemini-3.5-flash-lite`; optional server `GEMINI_MODEL` override.
No prompt/model changes were made in this release audit.

The server builds deterministic FEN, side-to-move, piece map and all legal move
coordinates with chess.js. It supplies no stored solution, SAN, strength rankings
or mate labels. The prompt requires unique evidence for the requested move;
outcome-only requests, nonsense and ambiguous spatial language should abstain.
This is semantic interpretation, not an AI puzzle solver.

JSON structured output constrains `status`, `from`, `to`, `promotion`, forbids extra
properties and restricts coordinates to legal-space enums. Runtime parsing checks
nullable relationships and exact tuple membership including promotion. The browser
validates the response and chess.js validates/executes again; SAN comes from chess.js.
A legal proposal can still misunderstand speech: legality does not prove intent.

The provider call aborts after 4 s; browser intent timeout is 4.5 s. Provider errors,
non-STOP completion, malformed JSON, ambiguous/illegal candidates and network failure
return fixed safe codes. No raw upstream body, stack or credential is returned.
No automatic retries. There is no explicit output-token cap in the existing resolver; structured output keeps the requested answer small, but provider quotas/spend controls are still required. The 56-case semantic eval suite is separate from offline
unit tests; `npm run eval:intent -- LABEL` makes paid live calls. Retained results
under `evals/results` are synthetic intent evaluation evidence, not private STT audio.

## Public API contract and CORS

Production base: `https://soniccheck-api.vercel.app/api`.

| Boundary | Enforced in code |
| --- | --- |
| Routes | `/api/intent`, `/api/gradium-token` |
| Methods | POST; OPTIONS preflight; other methods 405 |
| Origin | Exact allowlisted HTTPS origin; missing/null/unlisted origin 403 |
| Preflight | Requested method POST and only Content-Type header; success 204 |
| Body | JSON media type required (415); streaming cap 4096 bytes (413) |
| Intent JSON | Exactly `utterance` and `fen`; nonblank text ≤300 characters; valid FEN ≤200 characters |
| Token JSON | Exactly an empty object `{}` |
| Invalid input | Malformed JSON/schema/UTF-8 rejected, generally 400, before provider calls |
| Responses | No-store; `Vary: Origin`; no cookies or allow-credentials header |
| Functions | Vercel configured maxDuration 10 s; provider calls bounded separately |

Safe provider/application errors can use HTTP 200 with error JSON; callers validate
the body and never interpret status alone as success. HTTP boundary errors use
400/403/404/405/413/415. There is no application upload timer; request ingress is
also subject to the hosting platform's bounds. Local dev middleware is loopback-only
for token vending and caps concurrent requests at four; it is not production rate
limiting and must not be exposed as a public server.

Required production `ALLOWED_ORIGINS=https://html-classic.itch.zone`, no wildcard,
trailing slash or temporary verification origin. This audit remotely observed 204
with exact allow-origin on both routes for that origin, and 403 for both the old
verification origin and an unrelated origin. That tests behavior, not every possible
configured origin or private dashboard setting.

**CORS is not authentication.** A script can spoof Origin, and itch's shared iframe
origin does not distinguish one game from another. No client-shipped API secret or
custom header would fix this. Provider quotas and platform abuse limits remain
necessary for the intentionally anonymous demo.

## Rate limiting — MANUAL VERCEL DASHBOARD ACTION REQUIRED

No production rate limiter is implemented in this repository, and this audit did
not publish firewall rules or verify existing dashboard rules. Do not advertise
limits as enforced until the following setup and verification are complete.
Use platform WAF counters, not unreliable per-process maps in serverless functions.

In Vercel select **soniccheck-api → Firewall → Configure → New Rule**:

- With at least two available rate-limit rules: create one matching **method POST
  AND exact path `/api/intent`**, fixed window **60 seconds**, **30 requests**, key
  **IP**, action **429**. Create a second for `/api/gradium-token`, **10 requests**
  per 60 seconds per IP, action 429. Do not count OPTIONS.
- Hobby permits only one rate-limit rule. Use **method POST AND (path is
  `/api/intent` OR `/api/gradium-token`)**, fixed window **60 seconds**, limit **10**,
  key **IP**, action **429**. This stricter shared budget protects both routes
  without adding infrastructure. It allows roughly five fresh voice attempts/minute
  (one token plus one intent each), and shared venue NATs may hit it sooner.
- Save, **Review Changes → Publish**. Review any pricing notice yourself. Select
  the rule in Firewall traffic monitoring to confirm blocked requests. Leave no
  bypass rule above it that exempts these paths. Verify normal play, OPTIONS and
  rate-limited behavior; use malformed `{}` intent bodies to test counters without
  billable model work. Never print token responses during tests.

These are recommended settings, not a claim of live enforcement. Vercel counters
are regional; IP rotation, distributed traffic and NAT sharing remain limitations.
Platform 429 responses may lack application CORS headers; clients degrade to their
existing unavailable/network fallback. Official [WAF rate-limiting documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Credentials, quotas and emergency actions

| Variable | Location | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Server secret only | Gemini Developer API |
| `GRADIUM_API_KEY` | Server secret only | Temporary token issuance |
| `GEMINI_MODEL` | Server optional | Model override |
| `ALLOWED_ORIGINS` | Production server | Exact HTTPS origins |
| `VITE_API_BASE_URL` | Public frontend build | API URL, ending `/api`; blank locally |

No other VITE variable is required. Never put keys in Vite `define`, source, URLs,
public files or Git. `.env.example` contains names only; other env files are ignored.
API builds reference runtime bindings rather than embedding secrets. `.vercelignore`
excludes env files, private experiments, recordings, releases and non-API media.

Manual Google actions: select the key's project in AI Studio; inspect active model
RPM/TPM/RPD and usage on the Rate Limits page. Check the billing plan. On **Spend →
Monthly spend cap → Edit spend cap**, set an owner-approved cap if supported; do
not rely on billing alerts as a hard cutoff. Google's experimental project cap has
approximately ten minutes of accounting latency and can overrun. Configure billing
alerts and monitor usage during the event. Confirm API-key restrictions allow only
the needed Gemini service; do not impose browser-referrer restrictions on a server
key. Do not rotate working keys unless a leak is found.
[Gemini billing](https://ai.google.dev/gemini-api/docs/billing),
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

Manual Gradium actions: verify remaining credits, applicable plan/token restrictions,
overage settings and usage visibility in the account. Confirm public demo and voice
asset rights with the provider/hackathon contact. No account entitlement is inferred
from successful API calls. On abuse, use a Vercel WAF deny rule on both POST paths;
if necessary disable provider keys server-side. Removing allowed origins and
redeploying also fails closed, but does not revoke already issued provider sessions.
These dashboard/cost actions were not performed in this audit.

## Local character audio and release rights

Six browser-friendly WAV assets live in `src/assets/black-king/`: Garrett
(`POBHtemksfWQbng0`), Gradium production `default` TTS, 48 kHz/16-bit mono.
They were generated once via REST and are ordinary bundled files; no runtime TTS,
TTS route, voice token or network synthesis exists. READY alternates two lines;
unresolved plays only while another attempt has time; non-mate/mate/complete have
fixed reactions. Subtitles share the selected line. PTT, transitions and mute
invalidate playback, including delayed play promises; missing audio is harmless.
Initial playback remains subject to browser autoplay policy.

These files are now included in the proposed public source snapshot for reproducible
builds. **Their redistribution approval is still pending. Do not push the new audio
files or publish the voiced game until approval is confirmed.** The existing clean
pre-TTS ZIP remains available. Approval to integrate locally is not proof of a license.
[Gradium terms](https://gradium.ai/terms-of-service).

## Setup, reproducibility and deployment

Use Node 24 (`.node-version`), npm, and system zip/unzip for packaging. All JS tooling
is project-local. From the repository root:

```sh
npm ci
cp .env.example .env.local
# Edit server secrets locally; leave VITE_API_BASE_URL blank for local adapters.
npm run dev
```

Without credentials, Debug coordinates still exercise all deterministic gameplay.
Offline checks and builds require no provider keys:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run build:api
npm run build:vercel
npm run scan:secrets -- dist server-dist vercel-static
```

`dist/` is the static frontend; `server-dist/api.js` is the portable API build.
`build:vercel` checks Node ESM entrypoints and creates only `vercel-static/robots.txt`.
Preview with `npm run preview` (local API middleware remains available).

For an intentional API deployment, select the existing Vercel project (Other
framework, Node 24, root directory), configure Production environment variables,
then run `npx --yes vercel@60.1.3 deploy --prod`. No deployment was run in this audit.
The permanent domain is `https://soniccheck-api.vercel.app`. Environment changes
require redeployment. Production deployment protection must permit anonymous API
requests and preflight; never embed a protection-bypass credential in the game.

For a deliberate new itch package:

```sh
VITE_API_BASE_URL=https://soniccheck-api.vercel.app/api npm run build:itch
```

The command builds relative-path assets, scans, ZIPs root `index.html`, extracts and
scans again. It overwrites `release/soniccheck-itch.zip`; preserve named release
artifacts first. It does not upload. Upload manually as an HTML5 game; verify the
actual iframe's microphone delegation/permissions and HTTPS requests. Rehearse in
Draft at 1280×720 and 1100×620 and fullscreen before Public. No public itch URL has
been guessed. README has an explicit placeholder.

Existing artifacts retained without rebuilding this audit:

- `release/soniccheck-itch-with-voices.zip` — intended final voiced release
- `release/soniccheck-itch.zip` — same voiced build
- `release/backups/soniccheck-pre-tts-ten-seconds.zip` — clean fallback

Only the defensive token adapter changed at runtime; it needs API deployment, not
frontend repackaging. Current ZIPs remain compatible with the same API contract.

## Debug tooling, recordings and privacy

Debug contains typed intent, coordinates, board clicks, lifecycle/RMS/PCM counters,
raw transcript, candidate, SAN/validation, real latency timestamps and session history.
Speech start means the first observed RMS threshold crossing, not acoustic onset.
Commit-to-transcript and intent timings include transport/scheduling; no provider-only
latency claim follows. Session exports explicitly select diagnostic fields, excluding
socket URLs, tokens, raw errors and device identifiers; they still contain player
transcripts, FEN and runtime information and should be reviewed before sharing.

Optional exact-stream WAV export retains up to eight seconds of the PCM bytes queued
to Gradium, off by default, in memory only. No extra upload occurs. This proves queued
sample identity, not network delivery or headset quality. Private STT recordings
under `evals/stt/audio` and old private experiment outputs remain ignored and locally
untouched. Do not commit downloaded session JSON/WAVs or browser HAR files.

## Verification and limitations

Core Vitest tests do not call live providers. They cover deterministic mates, deadline
boundaries, saved voice time and score, retry/replay, stale response rejection,
malformed/illegal intent, provider failures, PCM/chunk ordering, mic teardown,
redacted diagnostics, HTTP/CORS boundaries and local audio cancellation/mute/failure.
Security regression coverage also rejects accidental permanent-key echoes from token
issuance and invalid payloads on both routes.

The audit scans known configured secret values and key/private-key patterns across
working files, builds, existing extracted release ZIPs, and reachable local Git
history. This is not a proof against every unknown secret format or remote GitHub
logs/caches/forks. Reachable history contained no private STT WAVs or secret env files;
synthetic intent reports are retained intentionally. No local absolute paths belong
in public documentation. See the final task report for measured check counts/results.

English-only; small three-puzzle pack; STT may mis-transcribe; ambiguity intentionally
abstains; voice needs microphone permission and working networks/providers. Shared
origin CORS and per-IP limits are not authentication or a global spending cap.
Live headset/iframe QA and operational quota monitoring remain necessary.

## Demo placeholder and public-release checklist

Reserve `assets/demo/soniccheck-demo.mp4` for a real 15–30 second capture:
READY → Start/reveal → think → PTT → transcript → move → checkmate/score/king reaction.
There is no fabricated file. The relative README link is a download/navigation link,
not a guaranteed GitHub inline player. For inline GitHub playback, upload the real
recording in GitHub's issue/PR attachment UI, then replace the README placeholder
with the resulting GitHub-hosted attachment URL; alternatively link a verified video
hosting page. Do not record Debug credentials or browser Network panels.

Before Public: confirm voice redistribution rights; publish source including approved
assets; activate and verify WAF rules; set provider quotas/caps; deliberately deploy
the audited API; test the retained voiced ZIP in the real iframe; add verified itch
URL and real demo recording; make the itch game public manually. None of these
publication/dashboard actions is silently treated as complete.

### Release audit results (2026-09-26)

- 147 offline tests in 21 files passed; typecheck, lint, browser build, portable API build and Vercel build check passed.
- Fresh proposed source snapshot (108 files, no ignored secrets or recordings): offline npm ci, all tests, frontend/API/Vercel builds passed. The six release WAVs must be committed with the approved source changes after redistribution clearance; the previous HEAD alone does not contain them.
- Secret scan: 249 artifact/source/HEAD files, including extracted ZIPs and six release WAVs, passed for two configured keys and common key/private-key patterns. Separate scan of 168 reachable historical blobs found no matches, private STT WAVs, private STT result files or secret env files. Six private local STT WAVs remain untouched.
- Both voiced ZIP copies have SHA-256 `b7279abcfd9aee2d13e74e1784ed4c0b5a0a53b561ebdc9ba82c2936f0ba94f5`. Extracted contents match the new frontend build byte-for-byte; no release ZIP was regenerated.
- Clean backup SHA-256: `c0389d4bd2c985493a99333b90b009f813357e7a7e2ce65301639001650d9518`; zero WAV assets.
- Production OPTIONS: both routes returned 204 for the exact itch origin and 403 for temporary/unrelated origins. Dashboard rate limits, account budgets and media rights remain manual/unverified.
