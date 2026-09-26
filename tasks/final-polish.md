# Final player polish

Keep current composition and all capture/provider/engine contracts unchanged.
Add a presentation-only subtitle in a reserved board gutter, short move/impact/
score/transition animations, optional local tones that never play during capture,
and a run summary with best combo bookkeeping that rolls back on retry.

Scope: main.ts, style.css, small UI presentation/SFX modules and tests, README.
Acceptance: immediate hold/release feedback, no effects delay state or controls,
reduced-motion support, no duplicate cues, full debug retained, summary/replay and
anti-farming unchanged. Verify both viewport sizes, simulated voice and deterministic
full run, all tests/typecheck/lint/build/itch/secrets. No deployment, TTS or assets.
