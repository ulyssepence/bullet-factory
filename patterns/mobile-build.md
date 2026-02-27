# Mobile Build (Capacitor)

Capacitor wraps the web build in a native WKWebView (iOS) or WebView (Android) shell.

## Usage

```bash
# Build + sync + open Xcode
npm run build:ios crazy-west -- --open

# Build + sync + open Android Studio
npm run build:android crazy-west -- --open

# Build + sync only (no IDE open)
npm run build:ios crazy-west
```

The script (`scripts/build-mobile.ts`) runs the esbuild production build, patches `index.html` with mobile viewport/safe-area CSS, then runs `cap sync` to copy into the native project.

## How it works

- `capacitor.config.ts` reads `GAME_SLUG` env var to point `webDir` at the right game's `dist/`
- `build-mobile.ts` sets this env var and orchestrates: build → patch HTML → cap sync → (optional) cap open
- Single `ios/` and `android/` native shell at project root, shared across all games
- Swapping games is just rebuilding with a different slug

## Native config

**iOS** (`ios/App/App/Info.plist`):
- Landscape-only orientation lock
- Status bar hidden via `UIStatusBarHidden`
- Safe area insets handled via `viewport-fit=cover` + `env(safe-area-inset-*)`

**Android** (`android/app/src/main/AndroidManifest.xml`):
- `android:screenOrientation="sensorLandscape"` on MainActivity
- Immersive sticky fullscreen (hides status + nav bars)
- `FLAG_KEEP_SCREEN_ON` to prevent screen dimming during gameplay

## Limitations

- Single `appId` (`com.gamefactory.app`) — all games share the same native identity. For App Store distribution of individual games, you'd fork the native project per game and change the bundle ID
- WebGL runs through WKWebView's Metal bridge — sufficient for graybox/procedural games, not for AAA
- Capacitor plugins (StatusBar, ScreenOrientation) are installed but not called from JS yet — native config handles orientation/fullscreen. Add JS calls if you need runtime toggling
