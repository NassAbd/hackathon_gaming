# Reveal starts the round
- Remove isolated Gemini Live evaluation code/results only; retain local WAVs and production diagnostics.
- Ready renders no board/puzzle title. Prepare mic using existing capture, then explicit Start reveals and starts the guarded five-second clock.
- Push-to-talk consumes prepared capture without touching the deadline. Preserve commit reservation, cancellation, retry rollback and all provider settings.
- Test concealment, reveal once, thinking time, late release, next/replay, stale results and debug fallbacks. Verify full checks and itch packaging, then browser layouts/reduced motion.
- No provider, semantic, scoring-formula, API or SPEC changes; no deployment.

## Verification
- Cleanup-only baseline: 122 production tests, typecheck and lint passed.
- Final: 125 tests across 20 files, typecheck, lint, production build, build:itch and secret scans passed.
- Browser: normal ready accessibility tree contains no squares/pieces or puzzle title. Coordinate full run scored 600, retry rolled back to zero, Next and Play Again concealed positions.
- 1280×720 and 1100×620 layout bounds fit without page scrolling. Reduced-motion reveal has zero active board animations.
- Mocked browser voice: one second thinking + 0.5 second speech reserved ~3495 ms; ~5008 ms simulated processing still committed Ra8#. Holding beyond deadline produced timeout with rook unchanged. These are orchestration tests, not live provider latency measurements.
- Actual headset/itch iframe rehearsal remains manual. No deployment performed.
