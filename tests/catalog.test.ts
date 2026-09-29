import { describe, expect, it } from 'vitest'
import { MODELS } from '../src/catalog/presets'
import { loadCatalog, parseModel } from '../src/catalog/schema'
import { benchmarkAcceleration } from '../src/core/benchmark'
import { EngineDSP } from '../src/core/dsp'
import { firingAngles, decodeConfig, encodeConfig } from '../src/core/config'
import { Dynamics } from '../src/core/dynamics'
const example = () => structuredClone(MODELS.find(m => m.id === 'r1-2004')!)

describe('catalog authoring boundary', () => {
  it.each([
    ['negative mass', (m: any) => m.vehicle.mass = -1],
    ['zero radius', (m: any) => m.vehicle.radius = 0],
    ['missing drivetrain', (m: any) => delete m.vehicle],
    ['missing engine parameter', (m: any) => delete m.config.inertia],
    ['unknown parameter', (m: any) => m.vehicle.typo = 1],
    ['bad gear order', (m: any) => m.vehicle.ratios = [0, 1, 2]],
    ['duplicate torque RPM', (m: any) => m.vehicle.torqueCurve[1][0] = m.vehicle.torqueCurve[0][0]],
    ['truncated curve', (m: any) => m.vehicle.torqueCurve.pop()],
    ['zero shift duration', (m: any) => m.vehicle.control.shiftSeconds = 0],
    ['bad firing angles', (m: any) => m.config.firingOffsets = [0, 720, 180, 360]],
    ['bad pipe lengths', (m: any) => m.config.primaryLengths = [0, .4, .4, .4]],
  ])('rejects %s with file context', (_, mutate) => {
    const m = example(); mutate(m)
    expect(() => parseModel(m, 'new-model.json')).toThrow(/new-model.json/)
  })
  it('rejects duplicate identifiers', () => {
    expect(() => loadCatalog({ a: example(), b: example() })).toThrow(/duplicate id/)
  })
  it('supports a new two-cylinder five-speed model entirely through data', () => {
    const raw = example(); raw.id = 'test-twin'; raw.config.cylinders = 2
    raw.config.firingOffsets = [0, 315]; raw.config.primaryLengths = [.4, .65]
    raw.vehicle.ratios = [0, 2.5, 1.9, 1.5, 1.2, 1]
    const m = parseModel(raw)
    expect(firingAngles(m.config)).toEqual([0,315])
    expect(decodeConfig(encodeConfig(m.config))).toEqual(m.config)
    const d = new Dynamics(); d.vehicle = m.vehicle; d.reset(m.config); d.state.gear = 5
    expect(d.shift(1, m.config)).toBe(false)
    const report = benchmarkAcceleration(m.config, m.vehicle, { initialRpm: 7500, targetsKph: [30,60,100], durationSeconds: 12, shiftAtFraction: .98 })
    expect(report.checkpoints.every(p => p.seconds !== null)).toBe(true)
    const render = (config: typeof m.config) => {
      const dsp = new EngineDSP(config, 48000); const samples = new Float32Array(24000)
      dsp.render(samples, { rpm: 5000, load: .7, fuel: true }); return samples
    }
    const custom = render(m.config), even = render({ ...m.config, firingOffsets: undefined, primaryLengths: undefined })
    expect(custom.every(Number.isFinite)).toBe(true)
    expect(custom.reduce((sum, x, i) => sum + Math.abs(x-even[i]), 0)).toBeGreaterThan(1)
  })
})

it.each(MODELS.map(m => [m.id, m] as const))('catalog report: %s', (_, m) => {
  const run = benchmarkAcceleration(m.config, m.vehicle, { initialRpm: Math.max(m.config.idle, m.config.redline*.55), targetsKph: [30,60,100,200], durationSeconds: 20, shiftAtFraction: .98 })
  expect(run.checkpoints[0].seconds).not.toBeNull()
  expect(run.peakRpm).toBeLessThanOrEqual(m.config.redline*1.015)
  for (const sampleRate of [44100,48000]) {
    const dsp = new EngineDSP(m.config, sampleRate), samples = new Float32Array(sampleRate/2)
    for (const load of [.12,1]) {
      dsp.render(samples, { rpm: m.config.redline*.8, load, fuel: true })
      expect(samples.every(x => Number.isFinite(x) && Math.abs(x) <= .7)).toBe(true)
      expect(samples.reduce((sum,x) => sum+x*x,0)/samples.length).toBeGreaterThan(1e-7)
    }
  }
  console.info(JSON.stringify({ model: m.id, calibration: m.calibration.status, ...run }))
})

it('reports unreachable speed as null and rejects invalid benchmark time steps', () => {
  const m=example()
  const run={initialRpm:7500,targetsKph:[1000],durationSeconds:1,shiftAtFraction:.98}
  expect(benchmarkAcceleration(m.config,m.vehicle,run).checkpoints[0].seconds).toBeNull()
  expect(()=>benchmarkAcceleration(m.config,m.vehicle,{...run,stepSeconds:0})).toThrow()
})
