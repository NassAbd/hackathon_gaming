# Retry and session diagnostics

Add a retry snapshot at puzzle entry (rollback current puzzle contribution),
structured optional voice outcome observation, and an in-memory allowlisted log.
Expose Retry only at result; add debug restart for pending-request QA, copy/download
JSON with selectable fallback. Keep all handlers registered once.

Files: UI retry/log modules and tests, main UI wiring, optional VoiceSession
observer, small result-row CSS, README. No provider settings, prompt, API, chess
rule, puzzle or SPEC changes.

Verify reset/exact FEN, score anti-farming, stale async cancellation, gesture reset,
history identity/persistence, secret-field exclusion, next-puzzle flow; run all
checks and production viewport/mocked browser QA. No deployment.
