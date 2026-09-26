# Player experience pass

Goal: a board-first 16:9 player view and hold/release voice control around the
working Gradium → Gemini → chess.js loop.

Scope: src/main.ts, src/style.css, a small src/ui/push-to-talk.ts controller and
regression tests; README play/debug instructions. No provider configuration,
semantic, API, puzzle, chess-rule or SPEC changes. Baseline is committed b196609.

Acceptance: fit 1280×720 and 1100×620; hold prepares capture then starts the round,
release commits once; early release/cancel never executes; remaining time is saved
by the existing VoiceSession; raw transcript visible before Gemini completes;
retry and result states are clear. Debug drawer preserves all fallbacks/telemetry.

Verification: offline gesture tests plus existing voice/game failure and stale
response tests, typecheck, lint, production build, browser layout/event checks,
and build:itch packaging/secrets checks. Real itch microphone testing remains a
human release check. No automatic deployment.
