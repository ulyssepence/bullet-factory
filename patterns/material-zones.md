# Material Zones

Assign multiple GrayboxMaterial styles to different regions of a single mesh using shader-side classification. No mesh modification needed — zones are determined per-fragment from object-space position and normals.

## Zone config format

Each model that needs multi-zone materials gets a JSON file at `material-zones/<model-name>.json`:

```json
{
  "zones": [
    {
      "name": "hat",
      "debugColor": "#ff0000",
      "style": "worn",
      "color": "#6b3e2e",
      "height": [0.82, 1.0]
    },
    {
      "name": "torso",
      "debugColor": "#0000ff",
      "style": "metallic",
      "color": "#7a6e5a",
      "height": [0.4, 0.72],
      "radial": [0.0, 0.35]
    }
  ],
  "fallback": {
    "debugColor": "#888888",
    "style": "rough",
    "color": "#555555"
  }
}
```

### Zone conditions

All ranges are normalized 0-1 (except `normalY` which is -1 to 1). Zones are evaluated in order — first match wins.

| Condition | What it measures | Range | Useful for |
|-----------|-----------------|-------|------------|
| `height` | Y position in bounding box | [0, 1] bottom to top | Hat vs body vs legs |
| `radial` | Distance from Y axis | [0, 1] center to max extent | Arms vs torso (combined XZ) |
| `absX` | Absolute X distance from center | [0, 1] center to max X extent | Arms vs torso on T-pose (X-axis only) |
| `absZ` | Absolute Z distance from center | [0, 1] center to max Z extent | Front vs back thickness |
| `slope` | Surface angle from horizontal | [0, 1] flat to vertical | Top surfaces vs sides |
| `normalY` | Raw Y component of surface normal | [-1, 1] down-facing to up-facing | Undersides, overhangs |

Prefer `absX`/`absZ` over `radial` when you need to distinguish features along a single axis. `radial` conflates X and Z — a T-pose model's arms and torso can have similar radial distances but very different `absX` values.

> **Note:** `slope` and `normalY` use per-face normals derived from screen-space derivatives, not vertex normals. Classification is flat-shaded — fine for broad regions but may look faceted on curved surfaces. This is because Meshy-generated models often lack vertex normal data.

Combine conditions to handle complex shapes. A cowboy hat brim: `height > 0.85` AND `radial > 0.3` AND `slope < 0.3` (high up, far from center, flat surface).

## Bone-weight classification (rigged models)

For rigged characters, bone weights provide far more accurate zone classification than position alone. Position-only classification bleeds between overlapping regions (e.g. arms and torso at the same height). Bone weights classify each vertex by which skeleton bone has the strongest influence.

### How it works

The preview tool (`material-preview.html`) uses a hybrid approach:
1. **Island detection** — finds disconnected mesh regions (e.g. a hat floating above the head)
2. **Bone-weight classification** — for the main body island, each vertex is assigned to the zone whose `bones` list contains the vertex's dominant bone
3. **Position override** — zones without `bones` (like a hat) use `height` thresholds on disconnected islands

### Adding bones to zone configs

Add a `bones` array to each zone that corresponds to skeleton parts. Meshy-rigged models use 24 standard Mixamo bones:

| Zone | Bones |
|------|-------|
| head | `neck`, `Head`, `head_end`, `headfront` |
| arms | `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `RightShoulder`, `RightArm`, `RightForeArm`, `RightHand` |
| torso | `Hips`, `Spine`, `Spine01`, `Spine02` |
| legs | `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, `RightUpLeg`, `RightLeg`, `RightFoot`, `RightToeBase` |
| hat (boneless) | No `bones` array — uses `height: [0.88, 1.0]` position override |

These bone names are consistent across all Meshy-rigged characters. When a zone has a `bones` array, bone-weight classification takes priority over `height`/`absX`/`radial` for that zone. Position conditions still serve as fallback for vertices with no strong bone influence.

Example zone with bones:
```json
{
  "name": "arms",
  "bones": ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand"],
  "debugColor": "#00ff00",
  "style": "worn",
  "color": "#8b6914"
}
```

### Rigged GLB auto-detection

The preview script (`preview-material-zones.ts`) auto-detects `<model>-rigged.glb` when it exists alongside `<model>.glb`. Run `npx tsx scripts/generate-meshes.ts <slug>` to generate rigged GLBs for all characters. When zones have `bones` arrays, the preview logs `[bone-zones]` diagnostics showing every bone's vertex count and zone assignment — verify that no bones are UNMAPPED and fallback is <1%.

## Mesh manifest `role` field

Each entry in `mesh-manifest.json` can include an optional `role` string describing the mesh's gameplay purpose (e.g. "Fast melee enemy that charges the player", "Destructible wooden barrel"). The preview tool displays this role alongside palette swatches so agents can make informed zone color decisions.

## Preview tool

```bash
npx tsx scripts/preview-material-zones.ts <slug> <model-name>
```

Renders 6 orthographic debug screenshots (front, three-quarter, right, back, left, top) with hemisphere-lit zone colors and height boundary lines. Saves to `games/<slug>/material-previews/`. Inspect with the Read tool to verify zone boundaries.

The preview tool reads the game's `src/spec.ts` and `mesh-manifest.json` to display context: game title, palette swatches (as colored squares in a header bar visible in screenshots), mesh name, role, and generation prompt. This lets agents verify zone colors are drawn from the game palette.

## Iteration loop

1. Write initial zone config based on model description and expected anatomy
2. Run preview tool
3. Inspect screenshots — check each zone boundary with binary questions:
   - "Is the hat zone (red) covering only the hat?"
   - "Does the torso zone (blue) bleed into the arms?"
4. **Palette check** — verify zone colors are drawn from the game palette (visible as swatches in the preview header bar). If a zone's `color` doesn't match a palette hex, fix it.
5. **Gestalt check** — after per-zone correctness, verify each zone covers a substantial, visually distinct region (~10%+ of visible surface from the front view). If any zone is a thin sliver or visually merges with an adjacent zone, it's not a usable material boundary — adjust thresholds. Ask: "Would a fresh pair of eyes call this 5 distinct zones?"
6. Adjust thresholds in the JSON. Common fixes:
   - Zone too large → narrow the height/radial range
   - Zone bleeds into neighbor → add a second condition (e.g. add radial to separate arms from torso)
   - Concave shape misclassified → use slope or normalY instead of height
   - Thin feature missed → add a dedicated zone with tight ranges
7. Re-run preview, re-inspect. Repeat up to 10 times.
8. If not converging after 3-4 iterations, rethink the approach — switch axis, add conditions, reorder zones

## Integration into game rendering

Once zones are verified, the game's material system reads the zone config and applies it in the GrayboxMaterial `onBeforeCompile` injection. Each zone gets its own noise style and color, blended at boundaries via `smoothstep`.

The zone classification runs per-fragment alongside the existing triplanar noise — it adds ~2-3 `smoothstep` calls per zone boundary, negligible vs the noise evaluation.
