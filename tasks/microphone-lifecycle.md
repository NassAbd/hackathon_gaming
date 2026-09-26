# Microphone lifecycle diagnosis

Goal: identify premature capture shutdown in the real itch iframe, preserve the
existing Gradium → Gemini → chess pipeline, and expose measured lifecycle evidence.

Audit first: capture closures strongly retain media/context/nodes; no React cleanup.
Cleanup is explicit on setup failure, provider failure, abort/cancel, commit, round
end or pagehide. Prepared Gradium connections expire after 30 s. No context.suspend
call exists. HTTP 200/worklet 200/WS 101 do not prove protocol readiness or frames.

Plan: reproduce protocol/setup and cleanup behavior; add regression tests before
any proven fix; add bounded timestamped diagnostics for media, audio graph/worklet,
socket/messages and cancellation reason; add a compact always-visible live panel.
Verify offline suite/typecheck/lint/production build and real-URL ZIP readiness.

Files: Gradium capture/stream/worklet/session diagnostics and tests, main diagnostic
panel, README. No Gemini/chess/CORS/server changes, VAD, rules or auto deployment.

Acceptance: cleanup is attributable; stream/track/context and frame/RMS measurements
remain visible even after failure; tokens/raw socket URLs are never logged; idle
capture remains local until Start; Start/Send speech flow and stale protection stay
intact. A fresh itch upload is required for final real-iframe confirmation.

## Reproduced cause and fix

The captured HTTP/101 symptoms were reproduced without any microphone: fresh
production tokens had ~3.9 seconds remaining but ASR immediately returned error
1008, “Invalid or expired token”. The same production issuance path with fresh
single-use tokens reached `ready` on us.api.gradium.ai but failed on eu.api.gradium.ai.
Local-issued tokens reached ready from Europe. Vercel's function runs in iad1 (US);
the default Gradium hostname geo-routes to the nearest cluster. The tested tokens
were not usable across those clusters. The app's Gradium failure callback calls
releaseAudio → track.stop + context.close, explaining the brief mic indicator.
This was explicit error cleanup, not evidence of GC or a React lifecycle issue.

Fixed the two adapters to share documented eu.api.gradium.ai regional endpoints.
No change to handleApi, API routes, CORS, credentials, Gemini, chess or audio relay
architecture. The API-only fix was deployed as dpl_HZ6wQAt6RU93VHmCrHUsNjwk8jFk;
a fresh production token then reached EU ASR ready (best-effort; zone=eu).
This is observed routing consistency, not a contractual residency guarantee.

Live local browser: stream active, track live/enabled/unmuted, context running,
worklet 2352 callbacks/301056 frames (>12 seconds at 24 kHz), RMS 0.0083,
Gradium ready/open. Explicit Cancel then released capture. First attempt encountered
a slow permission grant (>15 seconds); the existing timeout/late-track-stop guard
worked and diagnostics recorded it. A subsequent permitted attempt stayed live.
No human spoken command was generated or claimed; final itch speech→move remains a
manual uploaded-build test.

98 tests, typecheck, lint, frontend/API/Vercel builds passed. Real-URL build:itch
packaging/scanning passed; root index.html ZIP prepared, not uploaded. Diagnostics
log only curated lifecycle metadata; raw provider messages/tokens are excluded.
