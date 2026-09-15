import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG as base, normalizeConfig, firingAngles, firingFrequency, intakeResonance, encodeConfig, decodeConfig, soundSpeed } from '../src/core/config'
import { EngineDSP, Pipe } from '../src/core/dsp'
import { Dynamics } from '../src/core/dynamics'

const rms = (values: Float32Array) => Math.sqrt(values.reduce((s, x) => s + x * x, 0) / values.length)
const render = (load: number, overrides = {}) => {
  const dsp = new EngineDSP(normalizeConfig({ ...base, ...overrides }), 24000)
  const state = { rpm: 3000, load, fuel: true }
  const warmup = new Float32Array(12000); dsp.render(warmup, state)
  const data = new Float32Array(12000); dsp.render(data, state)
  return data
}
describe('configuration and causality', () => {
  it('rejects nonfinite settings and normalizes incompatible firing patterns', () => {
    const c = normalizeConfig({ cylinders: 100, strokes: 7, displacement: NaN, firing: 'crossplane', primaryLength: -1 })
    expect(c.cylinders).toBe(12); expect(c.displacement).toBe(base.displacement)
    expect(c.firing).toBe('even'); expect(c.primaryLength).toBe(0.15); expect(c.strokes).toBe(4)
  })
  it('models four/two stroke event rates and uneven schedules', () => {
    expect(firingFrequency(3000, base)).toBe(100)
    expect(firingFrequency(3000, { ...base, strokes: 2 })).toBe(200)
    expect(firingAngles({ ...base, firing: 'crossplane' })).toEqual([0, 270, 450, 540])
    expect(firingAngles({ ...base, cylinders: 2, firing: 'twin270' })).toEqual([0, 270])
  })
  it('doubles plenum volume to lower Helmholtz resonance by sqrt(2)', () => {
    expect(intakeResonance({ ...base, plenumVolume: base.plenumVolume * 2 }) / intakeResonance(base)).toBeCloseTo(1 / Math.sqrt(2), 8)
  })
  it('roundtrips a versioned link and rejects malformed payloads', () => {
    expect(decodeConfig(encodeConfig(base))).toEqual(base)
    expect(decodeConfig('%junk')).toBeNull(); expect(decodeConfig(encodeURIComponent('{"version":9}'))).toBeNull()
  })
})
describe('audio core', () => {
  it('renders reproducibly and increases energy under load at identical RPM', () => {
    const quiet = render(0.1), loud = render(0.9)
    expect(render(0.1)).toEqual(quiet)
    expect(rms(loud)).toBeGreaterThan(rms(quiet) * 1.5)
  })
  it('changes the waveform when timing/pipe geometry changes, not displacement pitch', () => {
    const a = render(0.5), b = render(0.5, { primaryLength: 1.3 }), cross = render(0.5, { firing: 'crossplane' })
    expect(rms(Float32Array.from(a, (x, i) => x - b[i]))).toBeGreaterThan(0.02)
    expect(rms(Float32Array.from(a, (x, i) => x - cross[i]))).toBeGreaterThan(0.02)
    expect(firingFrequency(3000, { ...base, displacement: 4 })).toBe(firingFrequency(3000, base))
  })
  it('delays first pipe arrival by L/c and doubles arrival delay with length', () => {
    const onset = (length: number) => {
      const pipe = new Pipe(length, 42, 20, 0.3, 48000)
      for (let i = 0; i < 500; i++) if (Math.abs(pipe.process(i === 0 ? 1 : 0)) > 1e-5) return i
      return -1
    }
    expect(onset(1)).toBeCloseTo(Math.floor(48000 / soundSpeed(20)), 0)
    expect(Math.abs(onset(2) - 2 * onset(1))).toBeLessThanOrEqual(1)
  })
  it('moves the first pipe resonance down when length doubles', () => {
    const peak = (length: number) => {
      const rate = 12000, pipe = new Pipe(length, 42, 20, 0.1, rate)
      const impulse = Float32Array.from({ length: 6000 }, (_, i) => pipe.process(i === 0 ? 1 : 0))
      let bestFrequency = 0, bestPower = 0
      for (let f = 30; f <= 110; f++) {
        let real = 0, imaginary = 0
        for (let i = 0; i < impulse.length; i++) { real += impulse[i] * Math.cos(2 * Math.PI * f * i / rate); imaginary += impulse[i] * Math.sin(2 * Math.PI * f * i / rate) }
        const power = real * real + imaginary * imaginary
        if (power > bestPower) { bestPower = power; bestFrequency = f }
      }
      return bestFrequency
    }
    const short = peak(1), long = peak(2)
    expect(short).toBeGreaterThan(80); expect(short).toBeLessThan(90)
    expect(Math.abs(short / long - 2)).toBeLessThan(0.08)
  })
  it('stays finite and bounded for extreme valid settings across rates', () => {
    for (const rate of [22050, 44100, 48000]) {
      const dsp = new EngineDSP(normalizeConfig({ ...base, cylinders: 12, displacement: 10, damping: 0.05, roughness: 0.4, strokes: 2, pulseWidth: 20, primaryLength: 0.15 }), rate)
      for (let i = 0; i < rate; i++) {
        const sample = dsp.sample({ rpm: i < rate / 2 ? 16000 : 600, load: 1, fuel: i % 1000 < 800 })
        if (!Number.isFinite(sample) || Math.abs(sample) > 0.7) throw new Error(`Unstable at ${rate}, ${i}`)
      }
    }
  })
  it('has negligible residual DC after settling', () => {
    const data = render(0.6)
    expect(Math.abs(data.reduce((a, b) => a + b, 0) / data.length)).toBeLessThan(0.03)
  })
})
describe('free-rev dynamics', () => {
  it('defaults to free revving and settles at idle without throttle', () => {
    const d = new Dynamics(); d.reset(base)
    expect(d.fixedRpm).toBe(false)
    for (let i = 0; i < 600; i++) d.tick(1 / 60, base)
    expect(d.state.rpm).toBeCloseTo(base.idle, 0)
    expect(d.state.fuel).toBe(true)
  })
  it('holds the requested RPM and ignores throttle when fixed', () => {
    const d = new Dynamics(); d.fixedRpm = true; d.targetRpm = 4200; d.gas = 1
    for (let i = 0; i < 120; i++) d.tick(1 / 60, base)
    expect(d.state.rpm).toBe(4200); expect(d.state.throttle).toBe(0)
    d.targetRpm = 50000; d.tick(1 / 60, base)
    expect(d.state.rpm).toBe(base.redline)
  })
  it('raises RPM on throttle and returns to idle without cutting fuel on release', () => {
    const d = new Dynamics(); d.reset(base); d.gas = 1
    for (let i = 0; i < 60; i++) d.tick(1 / 60, base)
    const high = d.state.rpm; expect(high).toBeGreaterThan(3000)
    d.gas = 0
    for (let i = 0; i < 15; i++) d.tick(1 / 60, base)
    expect(d.state.fuel).toBe(true)
    expect(d.state.rpm).toBeLessThan(high)
    expect(d.state.load).toBeGreaterThanOrEqual(0.12)
    for (let i = 0; i < 900; i++) d.tick(1 / 60, base)
    expect(d.state.rpm).toBeCloseTo(base.idle, 0)
  })
  it('keeps exhaust audible while coasting down and after settling at idle', () => {
    const c = { ...base, intakeLevel: 0, mechanicalLevel: 0 }
    const rate = 24000, d = new Dynamics(), dsp = new EngineDSP(c, rate)
    d.reset(c); d.gas = 1
    const block = new Float32Array(rate / 60)
    for (let i = 0; i < 60; i++) dsp.render(block, d.tick(1 / 60, c))
    d.gas = 0
    const coasting: number[] = []
    for (let i = 0; i < 180; i++) {
      dsp.render(block, d.tick(1 / 60, c))
      if (i > 30) coasting.push(rms(block))
    }
    expect(Math.min(...coasting)).toBeGreaterThan(0.003)
    for (let i = 0; i < 720; i++) dsp.render(block, d.tick(1 / 60, c))
    expect(rms(block)).toBeGreaterThan(0.003)
  })
  it('retains a pumping signal when combustion is cut', () => {
    const dsp = new EngineDSP({ ...base, intakeLevel: 0, mechanicalLevel: 0 }, 24000)
    const data = new Float32Array(12000)
    const state = { rpm: 5000, load: 0, fuel: false }
    dsp.render(data, state); dsp.render(data, state)
    expect(rms(data)).toBeGreaterThan(0.002)
  })
  it('bounds integration and transitions back from fixed RPM without a reset', () => {
    const d = new Dynamics(); d.fixedRpm = true; d.targetRpm = 4000; d.tick(0.05, base)
    d.fixedRpm = false; d.tick(1 / 60, base)
    expect(d.state.rpm).toBeLessThan(4000); expect(d.state.rpm).toBeGreaterThan(3900)
    d.tick(Infinity, base); expect(Number.isFinite(d.state.rpm)).toBe(true)
  })
})

describe('transmission', () => {
  const finishShift = (d: Dynamics) => { for (let i = 0; i < 18; i++) d.tick(0.01, base) }
  it('changes RPM progressively with ratios and preserves RPM on neutral engagement', () => {
    const d = new Dynamics(); d.reset(base); d.state.rpm = 5000
    expect(d.shift(1, base)).toBe(true); finishShift(d)
    expect(d.state.rpm).toBeCloseTo(5000, 5)
    expect(d.shift(1, base)).toBe(true)
    d.tick(0.05, base)
    expect(d.state.rpm).toBeLessThan(5000)
    expect(d.state.rpm).toBeGreaterThan(5000 * 2.1 / 3.2)
    for (let i = 0; i < 13; i++) d.tick(0.01, base)
    expect(d.state.rpm).toBeCloseTo(5000 * 2.1 / 3.2, 5)
    expect(d.shift(-1, base)).toBe(true); finishShift(d)
    expect(d.state.rpm).toBeCloseTo(5000, 5)
  })
  it('blocks overlapping shifts, over-rev downshifts and shifts at fixed RPM', () => {
    const d = new Dynamics(); d.state.gear = 2; d.state.rpm = 6000
    expect(d.shift(-1, base)).toBe(false); expect(d.state.gear).toBe(2)
    d.state.rpm = 3000
    expect(d.shift(1, base)).toBe(true)
    expect(d.shift(1, base)).toBe(false)
    d.fixedRpm = true; d.targetRpm = 4200; d.tick(0.02, base)
    expect(d.shift(-1, base)).toBe(false); expect(d.state.rpm).toBe(4200)
    d.fixedRpm = false; d.tick(0.01, base)
    expect(d.state.rpm).toBeGreaterThan(4100)
  })
  it('bounds gears and resets to neutral', () => {
    const d = new Dynamics(); d.reset(base)
    expect(d.shift(-1, base)).toBe(false)
    for (let i = 1; i <= 6; i++) { expect(d.shift(1, base)).toBe(true); finishShift(d) }
    expect(d.shift(1, base)).toBe(false); expect(d.state.gear).toBe(6)
    d.reset(base); expect(d.state.gear).toBe(0)
  })
  it('builds RPM more slowly in higher gears', () => {
    const low = new Dynamics(), high = new Dynamics()
    low.state.gear = 1; high.state.gear = 6; low.gas = high.gas = 1
    for (let i = 0; i < 60; i++) { low.tick(1 / 60, base); high.tick(1 / 60, base) }
    expect(low.state.rpm).toBeGreaterThan(high.state.rpm + 1000)
    expect(high.state.rpm).toBeGreaterThan(base.idle)
  })
})
