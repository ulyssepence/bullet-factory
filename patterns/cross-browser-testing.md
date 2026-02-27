# Cross-Browser Testing

Smoke tests that catch WebGL breakages before shipping. Run via `npm run smoke-test <url>`.

Used in the SOP at "Verified via playwright" gates (graybox steps) and before the user review at the end of graybox.

## What breaks

Safari/iOS is where WebGL breaks. Chrome and Firefox are relatively stable.

**Safari:** Context loss on tab switch (iOS 17+). M3/M4 crashes killing all tabs (macOS 15.3+). No `EXT_color_buffer_float` on any iOS device — 32-bit float render targets silently fail. `flat` qualifier in GLSL triggers slow Metal workarounds.

**Mobile:** Desktop GPUs promote `mediump` to `highp` silently. Mobile doesn't. `mediump` range is +/-16384 — specular math overflows. Always guard fragment precision:

```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif
```

**Firefox:** Links shaders with precision mismatches that Chrome rejects. No headless WebGL (needs `xvfb`).

**Silent cross-browser:** `antialias: true` may be ignored. `readPixels` only portable with `RGBA/UNSIGNED_BYTE`. `pow(x, y)` with negative x is undefined — some GPUs return 0, others NaN.

## Smoke test tiers

**Tier 1 (catches ~80% of breakages):**
1. WebGL2 context creation succeeds
2. First frame renders non-black (center pixel has color)
3. No GL errors after render (`gl.getError() === 0`)
4. Scene drew something (`renderer.info.render.calls > 0`)
5. No console errors/warnings

**Tier 2:**
6. Screenshot comparison against baseline
7. Context loss recovery (simulate via `WEBGL_lose_context`)
8. Log extension availability for mobile debugging

## Playwright gotchas

- **SwiftShader for CI:** `--use-gl=angle --use-angle=swiftshader` — pure software, no GPU needed, consistent results. Slow (~8fps) but fine for smoke tests.
- **Canvas readiness:** Don't `setTimeout`. Signal readiness via `canvas.dataset.ready = "1"` or wait for `renderer.info.render.calls > 0` via `page.evaluate`.
- **Screenshot tolerance:** SwiftShader != real GPU. Use `maxDiffPixelRatio: 0.03`.
- **Firefox needs xvfb:** `xvfb-run --auto-servernum npx playwright test`
- **Playwright WebKit is not Safari.** Won't catch Metal backend or iOS-specific bugs. Real Safari testing stays manual.
- **headless-gl is dead** — WebGL1 only, Three.js dropped WebGL1 in r163.
- **Baselines are OS-specific.** Generate on same platform as CI.

## Template requirements

Games must handle `webglcontextlost` on the canvas for iOS Safari. The R3F `<Canvas>` component creates the canvas — attach the listener in a `useEffect` on the root component or via `onCreated` callback.

## CI matrix

| Browser | Runner | Cost | Catches |
|---------|--------|------|---------|
| Chromium + SwiftShader | GH Actions Ubuntu | Free | Shader compilation, context, rendering |
| Firefox + xvfb | GH Actions Ubuntu | Free | Shader linking, precision mismatches |
| WebKit + xvfb | GH Actions Ubuntu | Free | Rough Safari proxy (not Metal) |
| Real Safari | Manual on Mac | Time | Metal backend, iOS context loss |
| Mobile | Manual or BrowserStack | $$$ | Precision, memory, touch |
