# Music System

## Architecture

One OGG Opus track per game phase, crossfaded at runtime via `audio.Player`. No stems, no vertical layering — just full tracks and crossfades.

**Never use MP3.** MP3 encoders add padding that breaks seamless loops. OGG Opus has sample-accurate loop points and full browser support.

## Tracks

Typical VS-like needs 2-4 tracks:

| Track | Loop | Fade in | Notes |
|-------|------|---------|-------|
| `gameplay.ogg` | yes | 3s | Main loop, plays most of the run |
| `boss.ogg` | yes | 1s | Triggers on boss spawn, fast crossfade |
| `victory.ogg` | no | 0.5s | One-shot sting on win |
| `defeat.ogg` | no | 0.5s | One-shot sting on death |

All looping tracks should share BPM and key signature so crossfades sound natural.

## Generation

Run `npm run generate-music <slug>` (or `--dry-run` to preview). Requires `FALAI_API_KEY` in `.env`.

The script reads **Music direction** from the game's SOP, generates each track via fal.ai's ACE-Step endpoint, then post-processes:
- **Loops:** crossfade tail-splice (last 3s into first 3s) → loudness normalization → OGG Opus
- **Stings:** loudness normalization → OGG Opus (no loop processing)

Loops are 120s, stings are 15s. Cost: ~$0.024/loop, ~$0.003/sting. A full game ≈ $0.10.

### SOP prompt tips
- Loop prompts: include BPM, key, `"seamless loop, no fade in, no fade out"`
- All gameplay tracks share BPM and key so crossfades sound natural
- Sting prompts: specify length in bars (`"8 bars"`, `"4 bars"`), no loop keywords
- Genre/mood descriptors: `"driving percussion, dark synth, retro arcade"`

## Player API

```ts
import * as audio from './audio'

// Preload music tracks alongside SFX
await audio.player.preload({
  ...audio.defaultManifest,
  gameplay: 'audio/music/gameplay.ogg',
  boss: 'audio/music/boss.ogg',
  victory: 'audio/music/victory.ogg',
  defeat: 'audio/music/defeat.ogg',
})

// Start gameplay music
audio.player.playMusic('gameplay')

// Boss spawns — fast crossfade
audio.player.playMusic('boss', { fade: 1 })

// Boss dies — back to gameplay
audio.player.playMusic('gameplay', { fade: 3 })

// Player wins — one-shot sting
audio.player.stopMusic(0.5)
audio.player.playMusic('victory', { fade: 0.5, loop: false })

// Player dies — one-shot sting
audio.player.stopMusic(0.5)
audio.player.playMusic('defeat', { fade: 0.5, loop: false })
```

## Phase Transitions

Wire `playMusic` calls to game state changes. Keep it simple — discrete transitions, not continuous intensity mapping:

```ts
// In game loop or store subscriber
if (bossAlive && currentTrack !== 'boss') {
  audio.player.playMusic('boss', { fade: 1 })
} else if (!bossAlive && currentTrack === 'boss') {
  audio.player.playMusic('gameplay', { fade: 3 })
}
```

## Testing via Playwright

The `audio.Player` singleton is exposed on `window.__audioPlayer` for testing. After triggering a music transition:

```ts
// Verify correct track is active after transition
const track = await page.evaluate(() => (window as any).__audioPlayer.currentTrack)
expect(track).toBe('boss')

// Verify AudioContext is healthy
const state = await page.evaluate(() => (window as any).__audioPlayer.contextState)
expect(state).toBe('running')
```

The smoke test (`scripts/smoke-test.ts`) includes a basic audio health check. Game-specific Playwright tests should verify that phase transitions trigger the correct `playMusic` calls.

## File Layout

```
games/<slug>/static/audio/music/
  gameplay.ogg
  boss.ogg
  victory.ogg
  defeat.ogg
```
