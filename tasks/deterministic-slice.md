# Deterministic playable slice

Goal: prove the local candidate → chess.js → feedback → score → next puzzle loop.

Scope: a small Vite/strict TypeScript browser app, three checked mate-in-one
positions, five-second rounds, square selection or coordinate input, score,
combo, timeout, result feedback, and replay. A round starts only on an explicit
Start/Next action so players can read instructions. A legal non-mating move ends
the round as a miss; malformed/illegal input leaves the board unchanged and
allows retry until the deadline. Any legal mate solves the puzzle.

Files: package/config files, src/game.ts (public contracts and pure transitions),
src/puzzles.ts, src/game.test.ts, src/main.ts, src/style.css, index.html, README.md.

Acceptance: all three fixtures have verified mates; only chess.js changes board
state; invalid input never changes FEN; late or duplicate submissions cannot score;
score is 100 × new combo on success, combo resets on a miss/timeout; rounds advance
through a results screen and replay resets all state; the production build runs.

Sequence: define contracts → regression/behavior tests → engine → UI → typecheck
→ lint → tests → production build → browser smoke check.

Tests: fixture validity/mates, malformed and illegal candidates, legal misses,
exact deadline, duplicate submission, progression, completed session, replay.

Out of scope: voice, natural-language interpretation, Gemini, Gradium, network
services, deployment, sound, and advanced animations. This is a foundation, not a
spec-complete submission. SPEC.md remains unchanged.
