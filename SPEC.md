# SonicCheck — Master Specification

## Hackathon
{Tech: Europe} AI Gaming Hack
Paris — September 26, 2026

Submission deadline: 19:00.

## Product

SonicCheck is a voice-first arcade chess puzzle game.

The player sees a tactical chess position and has five seconds
to describe the winning move using natural language.

Examples:

"Smother him with the horse."
"Put my queen right next to his king."
"La tour tout au fond."

The system converts that intention into a candidate chess move,
validates it deterministically, and executes it.

No chess notation is required.

## Core demo loop

VOICE
  ↓
VOICE / SPEECH TECHNOLOGY
  ↓
NATURAL LANGUAGE
  ↓
GEMINI INTENT RESOLUTION
  ↓
{ from, to, promotion? }
  ↓
CHESS.JS VALIDATION
  ↓
MOVE / CHECKMATE
  ↓
ARCADE FEEDBACK
  ↓
NEXT PUZZLE

## Partner technologies

### Google DeepMind — REQUIRED

Gemini is the semantic reasoning layer.

Responsibilities:
- understand natural-language move descriptions
- resolve references against the current board
- select a candidate legal chess move
- return structured output

Gemini MUST NOT directly mutate game state.

### Gradium — REQUIRED

Gradium provides the voice layer.

Exact integration depends on available hackathon API/resources.

The integration must be visible and demonstrable in the final product.

### Cognition — OPTIONAL

Use only if integration provides meaningful product or
development value without threatening the 19:00 deadline.

## Deterministic authority

chess.js is the sole authority for:
- legal moves
- board state
- SAN generation
- check/checkmate detection

AI output is NEVER authoritative.

## Competition priorities

The project will optimize for the published judging dimensions:

1. Performance
   - build quality
   - FPS
   - reliability
   - absence of demo-breaking bugs

2. Execution quality
   - game feel
   - visual polish
   - level design
   - balance

3. Novelty
   - natural-language voice control of a deterministic game

4. Stickiness
   - short rounds
   - score
   - combos
   - replayability

## Hard requirements

- Newly created during the hackathon.
- Minimum two partner technologies.
- Public GitHub repository.
- Complete source code.
- Comprehensive README.
- Setup and installation instructions.
- APIs/frameworks/tools documented.
- Technical documentation sufficient for jury evaluation.
- Free playable build published on itch.io.
- Submission before 19:00.

## Scope protection

Before 17:30, no feature may be added unless the complete
critical path works:

voice
→ interpretation
→ legal move
→ board animation
→ scoring
→ next puzzle

After 18:00:
NO NEW FEATURES.

Only:
- bugs
- deployment
- README
- submission
- demo rehearsal