# Current implementation plan

## Completed foundation

- [x] Framework-independent configuration, dynamics and DSP modules.
- [x] AudioWorklet adapter, smooth parameters, output protection.
- [x] Vue interface, local persistence and shareable engine configuration.
- [x] Causal acoustic tests and production browser validation.

## UI and behavior revision — September 15, 2026

Decisions before implementation:

1. Catalog: store real vehicle models separately from Custom starting templates. Render short tree rows grouped by category and manufacturer, so list size scales without large cards.
2. Editing: default to Custom; selecting a model uses its stored settings and read-only specs. Copying to Custom is explicit and preserves the previous custom editor when merely browsing models.
3. Controls: remove driving/stand modes; fixed RPM is a checkbox in free-rev controls. Disable gas in input handlers and in the dynamics model, not just visually.
4. Release audio: remove the free-rev overrun rule that zeroed combustion, retain residual firing and add a rotating pumping source. Verify exhaust-only energy during deceleration and combustion cutoff.
5. Visuals: neutral light surfaces, system font, short English labels, small header. Remove promotional copy, numbered headings, spectrum, export and ancillary controls.

Completed:

- [x] Compact category → manufacturer → model catalog.
- [x] Custom-only templates/settings and model → Custom conversion.
- [x] English copy, metadata, messages and accessible names.
- [x] Free revving with fixed RPM that ignores throttle.
- [x] Audible deceleration, idle governor and gas release on blur.
- [x] Remove WAV/worker and spectrum component; remove transmission model.
- [x] Preserve local custom configurations and sharing.
- [x] Regression tests, responsive layout inspection and production build.

## Future acoustic work

Calibration against a known engine's recordings at multiple RPM/load points, order analysis and holdout recordings. Then improve collector topology, valve/gas exchange behavior and detailed two-stroke exhaust modeling. These are not claimed complete by the UI revision.
