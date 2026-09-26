# Gradium microphone slice

Goal: microphone → Gradium STT → existing /api/intent → Gemini → submitMove/chess.js.
Preserve typed intent, coordinates, board controls, tests and SPEC.md.

## Architecture decision before implementation

Official Gradium docs support browser STT with a single-use token:
server GET https://api.gradium.ai/api/api-keys/token using x-api-key;
browser WSS wss://api.gradium.ai/api/speech/asr?token=... .
No permanent secret reaches the browser. Extend the existing local Vite adapter
with POST /api/gradium-token. Use AudioWorklet, mono signed 16-bit PCM at the actual
AudioContext rate, ~80 ms chunks, model default and language any (English/French).
Wait for ready; collect text segments; on explicit Send speech, flush captured
samples then send end_of_stream and await server end_of_stream before Gemini.
No speech-to-speech, semantic logic in STT, or TTS.

Production: itch.io hosts only static files. A separate HTTPS backend must host
token issuance and the existing Gemini adapter. Authenticate/authorize clients,
allow only the deployed game origin via CORS, rate-limit token issuance and Gemini
calls and enforce quota. Browser streams directly to Gradium over WSS. Both keys
remain on that backend. A future deployment must configure the client API base,
HTTPS and iframe microphone delegation (allow=microphone / Permissions-Policy),
and test on itch.io. The local token endpoint is loopback/same-origin only; it must
not be deployed as an unauthenticated public token vending service.

## Contract and clock

Prepare microphone while ready; stream only during the round. Speech start is the
first locally measured audio frame above the documented energy threshold (not an
invented model timestamp). Explicit Send speech marks speech end/commit. Only an
utterance with captured non-silent audio, committed strictly before the deadline,
reserves remaining time. Freeze that remainder during STT/Gemini. On failure or
cancel, restore that remainder from the current monotonic time. Do not award any
points until existing engine validation succeeds. Session identity + held-state
identity reject stale callbacks even after replay to identical positions. Typed
flow retains its current deadline behavior; using a fallback cancels voice and
restores the reserved time first.

Telemetry: actual performance.now timestamps for locally detected speech start,
commit, final transcript, Gemini request start/result, chess validation complete,
and move committed. Null means unreached; report durations only between reached
stages. Do not equate local energy detection with linguistic speech boundaries.

## Files / acceptance

Small Gradium server/token, protocol, capture and orchestration modules; additive
voice buttons/status/telemetry in main.ts; clock reservation helpers; README/env.
Test protocol ordering, PCM encoding, empty/error/timeout, no-secret token response,
permissions/no device, full voice-to-intent orchestration, slow success, failure
resume, exact deadline, fallback cancellation, stale/replay and duplicate results.
Preserve existing tests; run typecheck, lint, tests, build and browser fallback QA.

No GRADIUM_API_KEY is configured. Stop before live STT testing and report this exact
variable. Existing GEMINI_API_KEY is present locally and must remain untouched.

Docs read:
- https://docs.gradium.ai/guides/browser-websockets
- https://docs.gradium.ai/guides/recipes/browser-microphone-stt
- https://docs.gradium.ai/api-reference/endpoint/stt-websocket
- https://docs.gradium.ai/guides/websocket-lifecycle

Out of scope: UI redesign/polish, TTS, deployment, spec edits, intent duplication.

## Verification

A Gradium credential became available locally during implementation. Live token
issuance, browser microphone initialization, AudioWorklet loading and Gradium ready
handshake succeeded in the production preview. No permanent credential was printed
or included in client assets. A live typed Gemini regression returned a1→a8,
chess.js produced Ra8#, and score increased by 100 (843 ms request round trip).
No spoken utterance was supplied, so speech-stage latency is not claimed.
A human microphone test is pending; both keys are now present. SPEC.md unchanged.
