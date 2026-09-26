# SonicCheck

**See it. Say it. Checkmate.**

SonicCheck is a **10-second voice-controlled chess blitz game**. The board stays
hidden until Start. Spot the winning move and describe it naturally—no chess
notation required. English-only hackathon build.

**[PLAY SONICCHECK](https://nassabd.itch.io/soniccheck)**

## Demo

**[▶ Watch the gameplay demo](https://github.com/user-attachments/assets/28a0cf37-1313-43bb-99c6-1e060df40778)**

## How to play

1. Start the puzzle to reveal the board and begin the 10-second timer.
2. Find the checkmate.
3. Hold to speak and describe the move naturally.
4. Release before time runs out.
5. Solve quickly to score more and build your combo.

**You don't need chess notation — see the move, say the move.**

### Try saying

- “Rook goes to the top.”
- “The queen advance one case.”
- “Move the knight to H7.”

## How it works

- 🎙 **Gradium hears the player** with streaming speech-to-text and voices the
  Black King through pre-generated local reactions.
- 🧠 **Google Gemini understands** the natural-language move and proposes coordinates.
- ♟ **chess.js validates and executes** the move.

**AI interprets the player. AI never decides the rules.**

## Features

- Hidden puzzle reveal and ten-second time pressure
- Push-to-talk natural-language moves
- Time bonuses, combos, retry and replay
- Black King voice reactions, local SFX and responsive 16:9 presentation
- Deterministic chess validation; typed and coordinate fallbacks in Debug

## Tech stack

Gradium · Google Gemini · chess.js · TypeScript · Vite · Vercel · itch.io

## Run locally

Use **Node.js 24**, then:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set server-only `GEMINI_API_KEY` and `GRADIUM_API_KEY` in `.env.local`.
`GEMINI_MODEL` is optional. Production also requires server `ALLOWED_ORIGINS`.
Public `VITE_API_BASE_URL` is only an API URL; leave blank locally. Never put keys
in `VITE_*` variables. Debug coordinate play works without keys.

```sh
npm test
npm run build
```

## Technical details

→ [Architecture, security, deployment, testing and release checklist](docs/TECHNICAL.md)

## Hackathon

Built at the **{Tech: Europe} AI Gaming Hack in Paris**, using Google Gemini and
Gradium partner technologies.
