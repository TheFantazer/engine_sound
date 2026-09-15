# Architecture

## Modules

Vue 3 + TypeScript + Vite, with a framework-independent engine core.

```text
src/
  core/
    config.ts          # units, validation, firing schedules, link serialization
    dynamics.ts        # free revving, reduced transmission, idle control, fixed RPM
    dsp.ts             # cylinder excitation, pumping, pipe/intake resonators
  audio/
    engine.worklet.ts  # sample-rate rendering, config crossfades
    controller.ts      # browser audio lifecycle, gain, limiter, diagnostic analyser
  catalog/
    presets.ts         # separate Custom templates and actual vehicle models
  components/
    RangeControl.vue
    Tachometer.vue
  App.vue              # catalog, selection, controls, persistence
  style.css            # compact English utility interface; system fonts
```

Dependencies point inward: Vue and Web Audio adapters consume the pure core. DSP has no UI clock. Its phase advances every audio sample.

## Runtime

Neutral provides free revving; six forward gears add an approximate reflected drivetrain inertia. Dynamics integrates throttle, torque and losses in bounded substeps. Idle control balances losses at the configured idle RPM. Closing the throttle does not gate off all cylinder sound. A rotating pumping source also survives the limiter's combustion cutoff.

Fixed RPM bypasses throttle input and dynamics integration at the requested operating point. Throttle and gear changes are disabled, and enabling fixed RPM releases any held throttle. Disabling it resumes deceleration from the held speed.

Audio buffers are preallocated per DSP instance. Config changes are debounced and crossfaded. RPM/load/fuel envelopes are smoothed. Output has DC removal and protection. Audio starts only after a user gesture; hidden pages suspend playback. A diagnostic analyser remains in the audio graph for regression testing, but there is no spectrum UI.

## Selection and persistence

Custom templates are not vehicle catalog entries. Catalog models have category/manufacturer/name plus their own config. Model view is read-only; editing explicitly copies it to Custom. Custom state survives switching models. Version-2 local storage migrates custom settings and saved names from version 1. Hash links remain compatible with version 1 engine payloads.

## Scope

The pipe network is a reduced set of resonators, not an energy-consistent full waveguide junction system. Source strength from volume/load and diameter-dependent losses are heuristic. Intake uses the Helmholtz approximation. Two-stroke changes the event cycle without implementing scavenging/expansion chambers. The model presets are not acoustically calibrated against recordings.

Driving, independent stand load, spectrum, WAV export and A/B were removed in the September 15 UI revision.

## Transmission interaction

Runtime gear is N (0) through 6 and resets to neutral on engine reset. The initial generic ratios are 3.2, 2.1, 1.5, 1.18, 0.96 and 0.8. Between engaged gears, target RPM follows new ratio / old ratio over 180 ms. Shifts reduce acoustic load without silencing residual firing. Overlapping shifts and downshifts above redline are rejected. Engagement from neutral preserves RPM, approximating clutch slip. Higher gears add heuristic reflected inertia proportional to inverse ratio squared; no wheel-speed state, road resistance or physical clutch is simulated.

Arrow shortcuts ignore editable controls and native interactive elements. Auto-repeat is suppressed, so each key press requests one shift. Touch buttons provide the same operation and return focus to engine controls. Fixed RPM cancels any pending shift and locks the selected gear until released. Transmission is runtime-only and is not serialized into engine share links. Model-specific ratios can replace the generic set when catalog data is added.
