# Game Factory

LLM-agent-driven game generation: give it a prompt, get a playable 3D game (Vampire Survivors-like).

## Stack

Three.js + React Three Fiber + Rapier (physics) + Zustand (state) + esbuild. Capacitor for iOS/Android (`build:ios`, `build:android`). All TypeScript.

## Project Structure

```
scripts/              — scaffold, build, asset generation, preview/debug tools
template/
  SOP.md              — the SOP worksheet (copied per game)
  src/                — game engine skeleton: main, store, systems/, level/, particles, popups, audio, input, palette, postfx, meta, graybox-material, profile
  static/audio/       — graybox sounds (individual wavs + subdirs: footstep/, impact/, powerup/, rpg/, tone/, ui/, weapon/)
tools/                — standalone tool apps (audio-music, grass, mesh-generation, level-ca, pathfinding, etc.)
patterns/             — implementation patterns (read before implementing a feature)
games/<slug>/         — each game: SOP.md (working doc), docs/ (history), src/, static/
fonts/                — curated font library (library.json + .woff2 files)
docs/                 — project-wide research, brainstorms, decisions
```

All games share root `node_modules`. All scripts run from **project root**, not from inside a game dir.

## Key Scripts

| Command | What it does |
|---------|-------------|
| `npm run new <slug> [prompt...]` | Scaffold a new game from template + launch SOP session |
| `npm run dev <slug>` | Dev server with watch + live reload |
| `npm run build <slug>` | Production build |
| `npm run build:ios <slug>` | Capacitor iOS build |
| `npm run smoke-test <slug>` | Playwright smoke test (headless) |
| `npm run generate-music <slug>` | Generate music tracks via API |
| `npm run clean` | Delete all `dist/` dirs |
| `npx tsx scripts/generate-sounds.ts` | Generate sound effects |
| `npx tsx scripts/generate-meshes.ts` | Generate 3D meshes via Meshy |
| `npx tsx scripts/generate-image.ts` | Generate images |
| `npx tsx scripts/preview-palettes.ts` | Preview color palettes |
| `npx tsx scripts/preview-fonts.ts` | Preview font library |
| `npx tsx scripts/bot-runner.ts` | Automated bot playtesting |

## Creating a New Game

`npm run new <slug> [prompt...]` — scaffolds from `template/`, launches Claude session that works through SOP autonomously. Pauses only at "User review" gates.

## Build Output

`dist/` directories are ephemeral build output — safe to delete anytime. Every asset in `dist/` is either bundled from `src/` or copied from `static/`. Run `npm run clean` to remove all of them, or `npm run build <slug>` to regenerate.

## Key Pattern

`patterns/game-architecture.md` — read before building a game.
