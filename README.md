# Engine Sound Lab

An English-language engine sound editor built with Vue 3, TypeScript and Web Audio. Audio is generated locally in an AudioWorklet. No server or account is required.

## Development

Node.js 22.12+ or 24.x and npm. Tested with Node.js 24.7.0.

```sh
npm ci
npm run dev
```

Open http://localhost:5173 and click **Start engine**.

```sh
npm test
npm run build
npm run test:browser
```

Browser tests use installed Google Chrome and automatically start the production preview on port 4173. Run the build first. Deploy `dist/` to a static HTTPS host. TypeScript 5.9 is pinned for compatibility with vue-tsc.

## Controls

- **Space / Hold to rev:** throttle while held. Neutral free-revs; an engaged gear accelerates the vehicle.
- **↑ / ↓:** shift up or down through neutral and the selected model’s forward gears. On-screen buttons also work on phones. Hold Space while shifting to accelerate through the gears.
- **B / Hold to brake:** wheel brakes while held. At low speed the automatic clutch keeps the engine idling.
- **Fixed RPM:** holds a chosen operating point and disables throttle, brake and gear changes.
- **Volume:** master output level.
- Both pedals are released on window blur. Audio pauses when the page is hidden.

## Catalog and editing

Custom is the default selection. Starting-point templates and editable engine settings exist only in Custom.
The vehicle catalog is a compact tree: Cars / Motorcycles / Other → manufacturer → model. A model loads its configuration automatically and displays read-only specifications. **Edit as Custom** copies it into the editor. Switching back to Custom preserves the previous custom configuration.

The Yamaha catalog distinguishes **YZF-R1 · 2004 RN12** (even firing) from **YZF-R1 · 2017** (crossplane). Empty categories are ready for more models; generic engine templates are not presented as vehicles.

Custom configurations can be saved locally (up to 30) or shared via a versioned URL. The URL contains engine parameters, not playback state, fixed RPM or device volume. Legacy local configurations from the first UI are migrated. User-created names are kept unchanged.

WAV export, the spectrum display, A/B, driving and stand mode have been removed from the product following UI review. Fonts are system fonts; the page does not request external fonts.

## Acoustic model

Per-cylinder events feed reduced pipe resonators with propagation delays and damped reflections. Intake uses a Helmholtz resonator. Mechanical and flow noise are separate sources.

On throttle release, residual firing remains audible while RPM decreases. A separate pumping source follows rotation even during a rev-limiter fuel cut. The free-rev model includes an idle governor and asymmetric throttle opening/closing response.

Transmission now integrates vehicle speed from wheel force, aerodynamic/rolling resistance and braking, including reflected engine inertia while coupled. Shifts between forward gears use a configurable duration (180 ms for the R1 profiles) and preserve vehicle speed. Neutral engagement preserves crankshaft RPM, allowing a prepared launch. Gear selection changes immediately, including during launch slip. A brief automatic torque cut and progressive clutch re-engagement allow Space to remain held; no request is queued and no redline threshold is required. Repeated commands during the short shift itself are ignored. Early upshifts at low road speed can still reduce RPM as the clutch couples: a quickshift does not create vehicle speed. A torque-limited automatic clutch solves engine and wheel momentum together; it no longer forces a 3750 RPM launch target. An estimated traction/wheelie acceleration envelope limits forward force. Over-rev downshifts are rejected. On a gear, road speed determines RPM, so coasting takes longer than free revving. Each R1 generation has its own gearbox and published torque/power anchors; intermediate torque points, rider mass, tire radius, drag and braking are estimates. Custom currently uses a generic car drivetrain, including when copying a model into Custom. Share links store engine acoustics, not vehicle parameters.

R1 reference specifications: [Yamaha 2017 factsheet](https://cdn2.yamaha-motor.eu/prod/product-assets/2017/YZF1000R1/Factsheets/2017-YZF1000R1_en.pdf). Gearbox reference: [Yamaha R1 generation owner's manual](https://www.yamaha-parts.ca/thumbs/y/pdf/p2cr28199e1e.pdf). The model year and exhaust of the user's video reference have not been established; this is not a claimed match to that particular motorcycle.

The sound source uses a load-shaped opening/decay pulse and pulse-correlated turbulence. Crank-order mechanical components no longer cancel between evenly spaced cylinders. Noise filters use sample-rate-aware coefficients, and a reduced outlet-radiation filter shapes the exhaust. These changes improve model structure; they have not been validated by a perceptual comparison or fitted to an R1 recording.

Engine losses separate speed-dependent friction from throttle-dependent pumping. Coefficients are generic warm-engine estimates; actual coastdown timing requires measured inertia/loss calibration.

The source amplitudes, diameter losses and acoustic load are approximations. This is not a calibrated prediction of modifications or absolute SPL. Named-model acoustic profiles and most geometry settings are approximate. Full gas exchange, injection, turbochargers, bank collector topology, structural acoustics and a tuned two-stroke expansion chamber are not yet implemented.

## Local notes

Planning and research notes live in `docs/`, which is intentionally ignored and not distributed with the repository. Tests live in `tests/`; run both the core and browser suites after changing audio or dynamics.

## RN12 acceleration benchmark

Reference: [AccelerationTimes RN12](https://ru.accelerationtimes.com/models/yamaha-yzf-r1-rn-12), supplied by the user. This is a third-party table, not a verified Yamaha test protocol. Engine anchors use [Yamaha's 2004 announcement](https://global.yamaha-motor.com/news/2003/1022/tms-03.html): 126.4 kW at 12500 RPM and 106.6 Nm at 10500 RPM. Stock gearbox ratios follow the Yamaha 5VY owner's/service manual (primary 65/43, final 45/17). The updated profile uses the service manual’s USA wet mass of 193 kg plus an assumed 75 kg rider. Clutch control, drag and acoustic parameters remain estimates.

The reproducible test starts at rest in neutral with 7500 crankshaft RPM, selects first, holds full throttle, and shifts automatically at 98% of redline. Runtime gear selection remains manual. Simulated 0–100 is approximately 3.06 s versus reference 3.2; 0–200 is 8.08 s versus 7.6. Discrepancies across the 20 milestones reach about 0.83 s; the model is not an exact fit. Starting directly at idle is tested separately.

To reproduce a prepared launch in the UI: select RN12, start in N, hold Space to reach about 7500 RPM, then press ↑ without releasing Space. Keep shifting near redline. B remains the wheel brake.

`tests/rn12-acceleration.test.ts` checks all 20 supplied speed milestones, timestep consistency, generation separation, and the removed 3750 RPM plateau. The source's unknown launch conditions and interpolation mean these regression bounds are calibration targets, not proof of real-world accuracy.

## Adding a vehicle

1. Copy `src/catalog/models/r1-2004.json` to a new JSON file in that directory.
2. Set a unique lowercase `id`, category, manufacturer, model/year, source URL and calibration notes. Files are discovered automatically; no registry or UI change is necessary.
3. Fill **every** `config` field (use the copied file as the complete template). Displacement is total litres; inertia is kg·m²; pipe lengths are metres, diameters mm, plenum litres, temperature °C, pulse width crank degrees, and levels dimensionless. These are supported model parameters, not a promise of exact measured acoustics.
4. Fill `vehicle`: total mass **including rider/driver** in kg, loaded wheel radius in m, `dragArea = Cd × frontal area` in m², rolling coefficient, efficiency, primary/final ratios and forward ratios preceded by neutral `0`. `torqueCurve` is ordered `[rpm, net crankshaft Nm]`, covering idle through redline. Do not feed wheel torque or gross indicated torque into this field. If deriving torque from power, use `T = watts / (rpm × π/30)`.
5. Tune `vehicle.control` separately: throttle time constants and shift time in seconds; clutch capacity multipliers, lock speed in m/s, preload RPM as a redline fraction, friction/pumping multipliers. These are controller/estimated calibration values, not gearbox specifications. The clutch multipliers scale the torque curve; a speed-dependent launch envelope is an approximation. `maxDriveAcceleration` is an optional traction/wheelie envelope in m/s².
6. Optional `config.firingOffsets`: one crank angle per cylinder in `[0, 720)` for four-stroke or `[0, 360)` for two-stroke; overrides the named firing pattern. Optional `primaryLengths`: one length per cylinder in matching order. Duplicate angles allow simultaneous firing. These arrays survive save/share; Custom can replace them with shared controls.
7. Run `npm run catalog:check`, `npm run build`, and `npm run test:browser`. Validation rejects missing fields, unknown keys, duplicate IDs, invalid units/ranges, unordered curves and incompatible arrays. The report prints simulated speed milestones and shifts for every discovered model; unreachable milestones are `null`. Its generic launch uses 55% redline, whereas the separate RN12 reference regression uses 7500 RPM.

`src/catalog/schema.ts` owns the validated catalog contract. `src/core/vehicle.ts` contains generic drivetrain types and interpolation, without named vehicles. `src/core/dynamics.ts` owns the integrator; `src/core/dsp.ts` owns audio. `src/core/benchmark.ts` is a reusable deterministic acceleration runner. `tests/catalog.test.ts` exercises every catalog entry at 44.1/48 kHz and a synthetic two-cylinder five-speed fixture that requires no new core code.

### Equations and scope

With total ratio `G = primary × gear × final`, engine inertia `J`, tire radius `r`, mass `m`, and clutch torque `Tc`:

- `J × dω/dt = combustion torque − losses − Tc`.
- `m × dv/dt = Tc × G × efficiency / r − ½ρCdA v² − rolling resistance − brake force` (efficiency direction reverses under engine braking).
- Coupled engine RPM is `v × G / r × 30/π`. The clutch bounds torque and dissipates slip; it does not directly map throttle to RPM.
- Net full-throttle torque is restored to gross torque by adding the full-throttle loss estimate before applying demand, then current losses are subtracted. This avoids subtracting full-throttle friction twice from published net torque.
- Firing event rate is `rpm × cylinders / (30 × strokes)`; interval pattern affects harmonic structure. Pipe travel time is `length / soundSpeed`; intake resonance uses the Helmholtz relation.

[PhysX vehicle documentation](https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/Vehicles.html) motivates separation of commands, model parameters and state, and joint engine/clutch/wheel integration. Our solver is a reduced longitudinal model, not PhysX or a full tire/suspension simulation.

[Crankcase Audio's REV example](https://github.com/CrankcaseAudio/CrankcaseAudioREVUnity) illustrates a recording-based granular alternative. [Pulse-Train-Resonator research](https://arxiv.org/html/2603.09391v1) supports event timing plus resonators as a useful sound representation; that paper also learns parameters from recordings. We use a deterministic procedural model, without its neural training or claims of matching its results. Real model identity still needs recordings at known RPM/load for spectral and listening calibration; passport specifications alone are insufficient.

### RN12 source-backed update

`src/catalog/references/r1-2004.json` retains the stock column of the [Two Brothers dyno report](https://www.revzilla.com/assets/0001/1090/two_brothers_m2_vale_slip_on_exhaust_yamaha_r120042006.pdf), provenance and assumptions. Twenty published rear-wheel horsepower points (3000–12500 RPM) replace guessed intermediate crank torque. Conversion uses mechanical hp and assumed 94% efficiency; this reproduces the measured wheel power after drivetrain losses, without treating wheel power as crank power. Curve tails remain estimated. This is one dyno run, not a complete Yamaha-certified torque map.

The [Yamaha 5VY service manual, pp. 2-1/2-2](https://www.slideshare.net/slideshow/yamaha-yzf-r1-2004-service-manual-lit-11616-17-55-5-vy-28197-10/5426750) specifies USA wet mass 193 kg and idle 1150–1250 RPM; the profile now uses the midpoint 1200 RPM. The 75 kg rider is explicitly assumed. Nominal 190/50ZR17 tire size does not measure loaded rolling radius, so the existing 0.305 m estimate is retained.

[Stock sound reference](https://www.youtube.com/watch?v=fcTdiQUljwQ): the uploader identifies a completely stock 2004 R1 and a Panasonic HDC600 camera. Metadata has been checked, but waveform, microphone placement, RPM and load have not been analysed. No acoustic coefficients have been fitted from that video. Updated idle implies an average firing rate of 40 Hz; this is a timing constraint, not a spectral match.

### Automatic launch and shift assistance

During a pre-revved launch the controller regulates both transmitted clutch torque and engine torque. `launchRpmRetention` sets the initial target as a fraction of the pre-rev speed (0.85); `slipResponseSeconds` sets the controller response (0.12 s). Both are estimated assistance parameters, not measured Yamaha hardware. `launchRpmRiseFraction` (0.45) follows wheel-side RPM rise specifically during N→forward engagement. `launchRpmFollow` (0.15) remains the separate setting for slipping forward-gear changes, so RPM follows vehicle acceleration instead of being held exactly constant. A gain below one lets the wheel-side shaft catch up; there is no universal 3750 RPM target. The target is released on synchronization, throttle release, braking, neutral, reset or fixed-RPM operation.

While slipping, a forward shift uses the ratio change to update the assisted RPM target and progressively engages the clutch. This avoids immediately forcing a high-rev engine to an almost stationary wheel speed, while also avoiding prolonged RPM sag from excessive clutch torque. The simulated speed never jumps when a gear is selected. This is an assisted clutch/torque controller, not a simulation of a stock RN12 quickshifter.

Removing uncontrolled launch flare changes the RN12 acceleration regression: the external 7.6 s target is unchanged, but the 0–200 error bound is now 0.75 s (previously 0.5 s). The computed result is now 8.08 s. The torque curve and traction ceiling were not boosted to mask this discrepancy. Multi-gear tests now inspect RPM after the initial transition for several shift cadences, rather than only checking gear labels and nonzero speed.

The 7000 RPM full-throttle launch regression now requires more than 500 RPM gain per half-second after the initial engagement, at 30/60/240 Hz, and synchronization by four seconds for both R1 profiles. At 0.5/1/2/3 seconds RN12 produces approximately 6401/7032/8333/9661 RPM. These are simulated controller responses, not measured factory launch behavior.

### Idle-start regression

Starting in first at idle previously bypassed the pre-rev controller. Increasing clutch capacity could then exceed available net engine torque and pull RPM backwards in the midrange. Idle launch now allocates torque using reflected vehicle inertia, preserving positive engine acceleration and allowing the wheel shaft to catch up. The controller fades to the coupled solution as slip closes. The 25% acceleration margin is an assistance heuristic, not a measured Yamaha clutch setting; published torque data is unchanged.

Tests cover both R1 profiles at 30/60/240 Hz, immediate throttle and a one-second wait in first before throttle, and every integration step until the limiter. They check RPM drawdown, speed continuity and eventual shaft synchronization. The browser suite also starts from idle and samples the whole first-gear run, including 4000–6500 RPM. Current RN12 simulation: approximately 4.18 s to 100 km/h and 6.09 s to 98.4% of redline on first (about 154 km/h near the limiter). These are separate from the pre-revved launch benchmark and are not measured real-world idle-start timings. The local 0.1-second telemetry report is in ignored `docs/idle-launch-validation.json`.
