# Game Factory

LLM-agent-driven game generation: give it a prompt, get a playable 3D game (Vampire Survivors-like).

## Stack

For context, see `docs/2026-02-23_14-07-55_Game-engine-decision Three.js Capacitor.md`. Three.js + React Three Fiber + Rapier (physics) + Zustand (state) + esbuild. Capacitor for iOS/Android. All TypeScript, no binary scene formats, no editor dependency.

## Project Structure

```
package.json          — shared deps for all games (R3F, Three.js, etc.)
scripts/
  new-game.ts         — scaffold + launch Claude session
  build.ts            — esbuild + static asset copy
  generate-sounds.ts  — produce placeholder .wav files
  preview-palettes.ts — show 8 high-contrast palettes for selection
template/
  SOP.md              — the SOP worksheet (copied per game by `npm run new`)
  src/                — starter code (main, store, types, input, audio, palette, postfx)
  static/audio/       — placeholder graybox sounds
patterns/
  game-architecture.md — how to structure game code
  post-processing.md  — full-screen shader pass pipeline
  ...                  — other implementation patterns
games/
  <slug>/
    SOP.md            — this game's filled-in SOP (working document)
    docs/             — timestamped log of what was done (latest = current phase)
    src/              — game source code
    static/audio/     — sound files (copied from template, customizable)
docs/                 — project-wide research and decisions
```

Each game lives in `games/<slug>/`. All games share the root `node_modules`. A game's `SOP.md` is the working document — checkboxes are gates, blanks are deliverables. Its `docs/` directory is history — timestamped markdown files with prose rationale.

## Creating a New Game

`npm run new <slug> [prompt...]` scaffolds from `template/` and launches a Claude Code session that works through the SOP autonomously. The agent completes each phase (pre-production, graybox) without stopping, pausing only at "User review" gates. All scripts (palette preview, build, etc.) must be run from the **project root**, not from inside `games/<slug>/`.

1. **Pre-production** — agent drafts all sections autonomously, presents complete package for single user review.
2. **Graybox** — agent builds all steps in order, presents playable game for user review.
3. **Asset generation** — tuning, optional asset swap, post-processing.

## Technical Conventions

See `docs/2026-02-23-game-framework-conventions-brainstorm.md`

## Patterns

Implementation patterns live in `patterns/`. Agents should read relevant patterns before implementing a feature. See `patterns/game-architecture.md` for the core game structure.
