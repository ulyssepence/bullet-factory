# Mesh Style Coherence

All meshes in a game should look like they belong in the same world. Meshy (text-to-3D) has no memory between prompts — style coherence must be baked into every prompt.

## How It Works

`mesh-manifest.json` has a top-level `"style"` field containing shared art direction keywords. `generate-meshes.ts` prepends this style to every character and prop prompt automatically.

```json
{
  "style": "Low-poly stylized, flat shading, bold saturated colors, mobile game aesthetic, T-pose",
  "characters": [
    {"name": "goblin", "prompt": "Small hunched goblin, pointed ears, crude wooden club, snaggletooth"}
  ],
  "props": [
    {"name": "barrel", "prompt": "Wooden barrel, iron bands, slightly dented"}
  ]
}
```

The generated prompts become:
- `"Low-poly stylized, flat shading, bold saturated colors, mobile game aesthetic, T-pose, Small hunched goblin, pointed ears, crude wooden club, snaggletooth"`
- `"Low-poly stylized, flat shading, bold saturated colors, mobile game aesthetic, T-pose, Wooden barrel, iron bands, slightly dented"`

## Writing the Style Block

Include 3-5 descriptors covering:

1. **Art style** — low-poly, stylized, realistic, voxel, chibi
2. **Shading** — flat shading, cel shading, smooth shading, hand-painted
3. **Color treatment** — bold saturated, muted pastel, monochrome, warm earth tones
4. **Material** — plastic, metallic, organic, clay, wood
5. **Era/genre** — medieval fantasy, sci-fi, modern, post-apocalyptic

Reference `palette.ts` color tones to keep meshes and graybox consistent.

For characters, include `T-pose` in the style block so all characters generate in a rigging-ready pose.

## Writing Per-Entry Prompts

Focus on **identity** — what makes this thing recognizable:
- Silhouette (stocky, lanky, round, spiky)
- Distinguishing features (big horns, glowing eyes, tattered cape)
- Size/proportion hints (small, towering, compact)

Do NOT repeat style words in per-entry prompts. The style prefix handles that.

## Good vs Bad

**Good manifest:**
```json
{
  "style": "Low-poly stylized, flat shading, warm earth tones, fantasy tavern aesthetic, T-pose",
  "characters": [
    {"name": "knight", "prompt": "Armored knight, broad shoulders, great helm, tower shield"},
    {"name": "rat", "prompt": "Giant rat, mangy fur, long tail, hunched posture, beady eyes"}
  ],
  "props": [
    {"name": "barrel", "prompt": "Wooden barrel, iron bands, cork stopper"}
  ]
}
```

**Bad manifest:**
```json
{
  "characters": [
    {"name": "knight", "prompt": "Low poly stylized medieval knight with flat shading and warm colors, armored, broad shoulders, great helm, tower shield, game character, T-pose, simple geometry"},
    {"name": "rat", "prompt": "Cute stylized giant rat, cartoon style, cel shaded, vibrant colors, mangy fur, long tail, hunched posture, beady eyes, low poly game asset"}
  ]
}
```

Problems with the bad version:
- No shared style — each prompt reinvents style keywords independently
- Style drift — "stylized medieval" vs "cute cartoon cel shaded" produce incoherent results
- Verbose — Meshy works best with focused prompts; too many words dilute the signal

## Prompt Length

Keep combined prompt (style + identity) concise. Aim for 3-5 descriptors per section. Meshy's text-to-3D works best with focused, specific prompts. Long prompts dilute the style signal and produce generic results.
