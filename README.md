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

- **Space / Hold to rev:** throttle while held; release to return to idle.
- **↑ / ↓:** shift up or down through neutral and six forward gears. On-screen buttons also work on phones. Hold Space while shifting to accelerate through the gears.
- **Fixed RPM:** holds a chosen speed and disables throttle and gear changes.
- **Volume:** master output level.
- Throttle is released on window blur. Audio pauses when the page is hidden.

## Catalog and editing

Custom is the default selection. Starting-point templates and editable engine settings exist only in Custom.
The vehicle catalog is a compact tree: Cars / Motorcycles / Other → manufacturer → model. A model loads its configuration automatically and displays read-only specifications. **Edit as Custom** copies it into the editor. Switching back to Custom preserves the previous custom configuration.

Only Yamaha YZF-R1 is currently a named vehicle model. Empty categories are ready for more models; generic engine templates are not presented as vehicles.

Custom configurations can be saved locally (up to 30) or shared via a versioned URL. The URL contains engine parameters, not playback state, fixed RPM or device volume. Legacy local configurations from the first UI are migrated. User-created names are kept unchanged.

WAV export, the spectrum display, A/B, driving and stand mode have been removed from the product following UI review. Fonts are system fonts; the page does not request external fonts.

## Acoustic model

Per-cylinder events feed reduced pipe resonators with propagation delays and damped reflections. Intake uses a Helmholtz resonator. Mechanical and flow noise are separate sources.

On throttle release, residual firing remains audible while RPM decreases. A separate pumping source follows rotation even during a rev-limiter fuel cut. The free-rev model includes an idle governor and asymmetric throttle opening/closing response.

Transmission uses generic ratios (3.2, 2.1, 1.5, 1.18, 0.96, 0.8), a 180 ms shift with reduced acoustic load, and approximate reflected inertia. Ratio changes lower/raise RPM; over-rev downshifts are rejected. Neutral remains free revving. This is a reduced sound interaction, not a vehicle-speed or clutch simulation. Model-specific ratios are a future catalog extension.

The source amplitudes, diameter losses and acoustic load are approximations. This is not a calibrated prediction of modifications or absolute SPL. Named-model acoustic profiles and most geometry settings are approximate. Full gas exchange, injection, turbochargers, bank collector topology, structural acoustics and a tuned two-stroke expansion chamber are not yet implemented.

## Documentation

- [Implementation plan](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Research](docs/RESEARCH.md)
- [Validation](docs/VALIDATION.md)
