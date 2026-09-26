# AGENTS.md — SonicCheck

## Mission

Build SonicCheck into a polished, reliable, playable hackathon submission.

SonicCheck is a voice-first arcade chess puzzle game where players describe
moves using natural language instead of chess notation.

The repository is being built during the {Tech: Europe} AI Gaming Hack.

Submission deadline: 19:00, September 26, 2026.

Time is a hard constraint.

Prefer a small, complete, reliable game over a larger unfinished system.


## Source of Truth

`SPEC.md` is the authoritative product specification.

Before making significant implementation decisions:

1. Read `SPEC.md`.
2. Inspect the existing repository.
3. Understand what already works.
4. Identify the smallest useful next step toward the required product.

Do not silently change product requirements.

Do not modify `SPEC.md` merely to make the current implementation appear
compliant.

If the implementation and specification disagree, preserve the specification
and document the discrepancy.


## Core Product Loop

The critical path is:

User speaks
→ speech is processed
→ natural-language intent is interpreted
→ candidate chess move is produced
→ chess.js validates the move
→ board updates
→ arcade feedback is triggered
→ score/combo updates
→ next puzzle begins

This loop has priority over all optional features.


## Architecture Invariants

### chess.js is authoritative

`chess.js` is the sole authority for:

- legal moves
- board state transitions
- SAN generation
- check detection
- checkmate detection

AI output must NEVER directly mutate chess state.

AI systems may propose a move.

The deterministic chess engine must validate it before execution.


### AI must fail safely

Never execute a guessed or malformed move.

If an AI response:

- cannot be parsed
- is ambiguous
- references an illegal move
- does not correspond to the current position
- times out
- fails validation

then the game must reject the candidate and remain in a valid state.

Prefer:

`unresolved`

over inventing a move.


## Partner Technology Requirement

The hackathon requires the project to use at least two provided partner
technologies.

The intended required integrations are:

### Google DeepMind / Gemini

Role:

Natural-language semantic reasoning.

Gemini should interpret what the player means in the context of:

- current board state
- current player
- available legal moves

Gemini proposes intent.

Gemini does not control chess state.


### Gradium

Role:

Voice layer.

Use Gradium for a meaningful and demonstrable voice capability according to
the APIs/resources provided during the hackathon.

The final integration must be visible enough that its role can be explained
clearly to the jury.


### Cognition

Optional.

Do not add Cognition integration merely to increase the number of partner
logos.

Use it only if it materially improves the product or development workflow
without threatening delivery.


## Security

Never commit:

- API keys
- access tokens
- temporary credentials
- private endpoints containing credentials
- secrets of any kind

Use environment variables.

Maintain `.env.example` containing variable names only.

Ensure `.env` and equivalent secret files are ignored by Git.

Never expose server-side credentials in client-side bundles.

If an API is called directly from the browser, verify that the authentication
mechanism is intended for browser use.


## Implementation Strategy

Work in small vertical slices.

Before implementing a major feature:

1. Read the relevant parts of `SPEC.md`.
2. Inspect the current implementation.
3. Determine dependencies.
4. Define observable acceptance criteria.
5. Implement the smallest complete version.
6. Test it.
7. Run the application.
8. Fix regressions before continuing.

Do not build multiple unfinished systems in parallel.


## Planning

For non-trivial work, create a short implementation plan before coding.

You may create focused planning documents under:

`specs/`

or:

`tasks/`

only when they materially help implementation.

Do not generate documentation for its own sake.

A useful implementation plan should contain:

- goal
- scope
- files likely to change
- acceptance criteria
- tests
- explicit out-of-scope items

Implementation plans are subordinate to `SPEC.md`.


## Priority Order

Optimize work in this order:

1. Working end-to-end game loop
2. Correctness and reliability
3. Two demonstrable partner integrations
4. Performance
5. Game feel
6. Visual polish
7. Replayability / stickiness
8. Deployment
9. Jury documentation
10. Optional features

Never sacrifice a working critical path for an optional feature.


## Scope Discipline

Avoid unnecessary:

- abstractions
- frameworks
- state-management libraries
- dependencies
- backend services
- databases
- authentication systems
- infrastructure
- premature optimization

unless the existing implementation clearly requires them.

Prefer simple local state and deterministic logic where possible.

Do not refactor working code solely for architectural elegance during the
hackathon.


## Dependencies

Before installing a new dependency, ask:

1. Is this necessary?
2. Can the existing stack already solve the problem?
3. Does this increase demo risk?
4. Does this increase deployment complexity?

Avoid replacing existing working libraries without a concrete reason.


## Testing

Tests should focus on failure modes that could break the live demo.

Highest priority:

- puzzle loading
- legal move validation
- illegal move rejection
- board state consistency
- expected checkmates
- AI response parsing
- malformed AI responses
- external API failure
- game state transitions
- timer behavior
- score/combo behavior

The deterministic chess engine should be testable without network access.

External AI APIs should not be required for the core chess-engine test suite.


## Required Validation

After meaningful implementation changes, run the relevant project checks.

Prefer, where available:

- tests
- typecheck
- lint
- production build

Before declaring a task complete, ensure the production build succeeds.

Do not claim that a command passed unless it was actually run successfully.


## External APIs

Keep external services behind small, explicit adapters.

For example:

src/
  services/
    gemini/
    gradium/

Application/game logic should not depend directly on vendor SDK details when
a small adapter can avoid it.

Handle:

- network errors
- timeouts
- malformed responses
- disconnected sessions
- missing credentials

without crashing the game.


## Latency

Voice interaction should feel immediate.

Measure latency rather than assuming it.

Do not fake latency measurements.

Do not block local game feedback unnecessarily while waiting for unrelated
network operations.

Performance claims shown in the UI or documentation must correspond to actual
measured behavior.


## UX

This is a game, not an AI dashboard.

Prioritize:

- obvious game state
- readable timer
- satisfying successful moves
- immediate failure feedback
- visible score
- visible combo
- fast transitions
- clear microphone/listening state

Technical telemetry may be displayed when it strengthens the demo, especially:

Raw Speech
→ Interpreted Intent
→ Executed Move

but telemetry must not overwhelm the game.


## Accessibility

Voice-first interaction is a core product capability, not decorative polish.

The complete intended gameplay loop should eventually be possible without
dragging chess pieces with a mouse.

Do not make essential information available only through color.

Keep important UI text readable and high contrast.


## Demo Resilience

Assume the live demo environment may have:

- unstable Wi-Fi
- API latency
- microphone permission problems
- noisy audio
- service errors

Failures should degrade gracefully.

Where appropriate, maintain deterministic demo/test controls that exercise the
same game logic without bypassing validation.

Fallback mechanisms must never pretend an external partner API succeeded when
it did not.


## Observability

During development, make failures diagnosable.

Log useful information such as:

- speech result
- intent resolution
- proposed move
- validation result
- API error
- latency

Do not log secrets.

Production-facing debug information should be removable or hideable.


## README

Keep `README.md` useful throughout development.

By submission time it must document:

- what SonicCheck is
- how the game works
- local setup
- installation
- environment variables
- development commands
- production build
- architecture
- Google DeepMind / Gemini integration
- Gradium integration
- other APIs/frameworks/tools used
- technical decisions relevant to jury evaluation
- deployment / playable game link when available

Do not wait until the final minutes to reconstruct the architecture from
memory.


## Submission Requirements

The final project must be prepared for:

- public GitHub repository
- complete source code
- comprehensive README
- setup and installation instructions
- documentation of APIs/frameworks/tools
- technical documentation sufficient for jury evaluation
- free playable build on itch.io

Do not commit credentials when making the repository public.


## Definition of Done for a Feature

A feature is complete only when:

- it works through the intended user path
- invalid input fails safely
- existing functionality still works
- relevant tests pass
- TypeScript/type checks pass where configured
- production build passes where relevant
- required documentation is updated

"Code exists" does not mean "feature complete."


## Definition of Done for SonicCheck

The hackathon build is ready when:

1. The game launches reliably.
2. All required deterministic puzzles work.
3. A player can complete the core experience through voice.
4. Natural-language descriptions can resolve to chess moves.
5. Illegal moves can never mutate board state.
6. Google DeepMind / Gemini is genuinely integrated.
7. Gradium is genuinely integrated.
8. Score, timer, combo, and puzzle transitions work.
9. The experience is sufficiently polished for a live demonstration.
10. Production build succeeds.
11. The game is deployed for free on itch.io.
12. The public GitHub repository contains no secrets.
13. README and technical documentation satisfy submission requirements.


## Autonomous Agent Behavior

When given a development task:

- inspect before editing
- preserve working functionality
- make reasonable implementation decisions autonomously
- prefer the simplest solution satisfying `SPEC.md`
- test your work
- report actual results
- explicitly identify blockers

Do not stop for minor implementation choices that can be safely resolved from
the specification and existing code.

Do stop and report when:

- required credentials/resources are unavailable
- a requested action risks exposing secrets
- requirements fundamentally conflict
- a partner API cannot support the required behavior
- continuing would require inventing unknown external API behavior


## Time Constraint

This is a one-day hackathon.

Shipping matters.

When choosing between:

A. a sophisticated architecture that might work

and

B. a simple implementation that works reliably

choose B.

## itch.io Deployment

The final game is intended to run as an HTML5 game embedded on itch.io.

Deployment target:

npm run build
→ dist/
→ ZIP contents of dist/
→ itch.io HTML Game

Requirements:

- `index.html` must exist at the ZIP root.
- Production assets must work from relative paths.
- Do not assume the application is hosted at `/`.
- The game must work inside an iframe.
- All external API requests must use HTTPS.
- Test the production build independently from the Vite dev server.
- The game should adapt to different iframe/fullscreen dimensions.
- Microphone permissions and external API calls must be tested from the
  deployed itch.io environment before submission.

A working localhost build is not sufficient for Definition of Done.