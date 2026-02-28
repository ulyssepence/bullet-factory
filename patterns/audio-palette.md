# Audio Palette

The template ships with ~400 CC0 sounds (Kenney.nl) organized by category:

| Category | Contents | Count |
|----------|----------|-------|
| `audio/impact/` | glass, metal, wood, bell, punch, soft | 105 |
| `audio/weapon/` | lasers, zaps, knife slices | 21 |
| `audio/footstep/` | carpet, concrete, grass, snow, wood | 35 |
| `audio/powerup/` | power ups, phase jumps, phaser sweeps | 27 |
| `audio/ui/` | clicks, switches, confirms, errors, selects | 151 |
| `audio/rpg/` | books, doors, coins, cloth, metal | 35 |
| `audio/tone/` | blips, peps, stings | 20 |

Root directory also has 7 generated WAVs (hit, death, hurt, pickup, levelup, shoot, ambient).

Browse with `ls static/audio/<category>/` and pick the best fit per event. Reference as e.g. `audio/impact/impactPunch_heavy_000.ogg` in the manifest.

## SFX Audition Tool

An interactive browser tool for auditioning sounds and building event mappings lives at `games/tool-audio-sfx/`. To use it:

```bash
npx tsx scripts/build.ts tool-audio-sfx --watch --serve
```

The tool shows all ~400 sounds organized by category. Click any sound to preview it instantly via Web Audio API. Use the right panel to assign sounds to game events (hit, death, hurt, pickup, levelup, shoot, dash, block, coin, menuClick, menuHover). Export the mapping as JSON — the output format matches `audio.ts`'s `preload(manifest)` signature (`Record<string, string>` mapping event name to audio path).

Workflow: audition → assign → export JSON → paste into game's audio manifest.
