# Popups

World-space billboard text/icons that rise, scale, and fade over a lifetime. Pool of 32 sprites with canvas-rendered content. For damage numbers, status messages, achievement flashes, kill icons.

```ts
import * as popups from './popups'
```

Mount `<popups.PopupPool />` inside `<Canvas>` once.

## Curves

| Curve | Visual | Use cases |
|-------|--------|-----------|
| `rise-fade` | Float up, fade out (1s) | Damage numbers, healing, XP gains |
| `pop-shrink` | Quick scale-up then shrink to nothing (0.6s) | Status cleared, enemy killed, pickup |
| `slam` | Big scale-up, hold, then fade (1.2s) | Level up, boss kill, achievement |

## Text API

```ts
popups.emit('rise-fade', { at: [x, y, z], text: '-25', color: '#ff4444' })
popups.emit('pop-shrink', { at: enemy.position, text: 'DEAD', color: palette.accent })
popups.emit('slam', { at: player.position, text: 'LEVEL UP!', color: '#44ff44', fontSize: 40 })
```

## Icon API

Preload icons at startup, then emit by name. The `color` option tints the icon.

```ts
await popups.preloadIcon('skull', '/audio/skull.png')  // any image path
await popups.preloadIcon('star', '/audio/star.png')

popups.emit('pop-shrink', { at: enemy.position, icon: 'skull', color: '#ff4444' })
popups.emit('slam', { at: player.position, icon: 'star' })
```

## Color convention

Use palette colors. Red for damage, green for healing/level-up, accent for kills/pickups. For icons, `color` applies a tint overlay.

## Performance

Pool of 32 sprites. Overflow silently drops. Each emit re-renders a 128x128 canvas texture — negligible cost at <30/sec. Sprites render with `depthTest: false` and high `renderOrder` so they always appear on top. Text popups auto-size their aspect ratio to fit content.
