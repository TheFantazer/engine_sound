# Validation

Date: 2026-09-15. Node.js 24.7.0; installed Chrome through Playwright.

## Completed checks

- `npm test`: 20 passing tests.
  - Input normalization, shared configuration round trips, firing timing and frequency for two- and four-stroke engines.
  - Intake resonance response, deterministic DSP, load and geometry effects, displacement independent of firing frequency.
  - Pipe impulse arrival at L/c and resonance shift with pipe length.
  - Bounded output at 22050, 44100 and 48000 Hz with extreme valid configurations; DC rejection.
  - Free revving, idle recovery, fixed RPM ignoring throttle, target limits and transitions.
  - Progressive ratio-based shifts, gear bounds, neutral reset, over-rev protection, fixed-RPM lock and slower acceleration in higher gears.
  - Exhaust-only output remains present during deceleration and at idle; pumping sound remains during fuel cut.
- `npm run build`: TypeScript checks and Vite production build passed.
- `npm run test:browser`: 6 passing scenarios against the production build.
  - English interface, compact catalog, default Custom configuration, read-only vehicle specifications and Edit as Custom.
  - Actual AudioWorklet output after throttle release; Space immediately after starting; release on blur and stopping.
  - Fixed RPM disables keyboard and pointer throttle. Editing a target survives intervening animation frames and applies on blur.
  - Saved configurations survive reload; shared links restore settings in a clean browser context.
  - Desktop and 390 px phone layouts, no horizontal overflow, pointer pedal release.
  - Arrow-key shifting, auto-repeat suppression, on-screen shift buttons, RPM drop on upshift, fixed-RPM gear lock, editable-input shortcuts and reset to neutral.
- Desktop and phone screenshots visually inspected for layout and clipped controls.

Playwright writes screenshots to `test-results/desktop.png` and `test-results/mobile.png`; generated artifacts are ignored by Git.

## Limits

These checks establish mathematical behavior and technical operation. Output energy measurements verify that the signal does not disappear; they do not establish perceptual realism. Comparison with recordings of real engines has not been performed, so tests do not demonstrate acoustic accuracy of modifications.

Safari/iOS and low-powered mobile hardware have not been tested. The phone scenario checks layout in Chrome, not the iOS audio stack. Full collector junctions, physical injection, turbochargers and detailed two-stroke gas exchange remain outside the current reduced model.

## Next measurable step

1. Select one four-stroke engine with recordings at known RPM and load.
2. Control microphone position and exclude clipping, music and automatic normalization.
3. Compare engine orders, spectral envelope, modulation and noise.
4. Calibrate a small number of coefficients using a subset of operating points.
5. Validate against held-out operating points before expanding the model catalog.
