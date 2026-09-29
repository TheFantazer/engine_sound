import type { EngineConfig } from './config'
import { Dynamics } from './dynamics'
import type { VehicleConfig } from './vehicle'

export interface AccelerationRun {
  initialRpm: number
  targetsKph: number[]
  durationSeconds: number
  shiftAtFraction: number
  stepSeconds?: number
}
/** Deterministic virtual test rider. Missing targets return null, never invented times. */
export function benchmarkAcceleration(config: EngineConfig, vehicle: VehicleConfig, run: AccelerationRun) {
  const dt = run.stepSeconds ?? 1 / 240
  if (!(dt > 0 && dt <= .1) || !Number.isFinite(run.durationSeconds) || run.durationSeconds <= 0 || run.durationSeconds > 120
    || !Number.isFinite(run.initialRpm) || run.initialRpm < config.idle || run.initialRpm > config.redline
    || !(run.shiftAtFraction > .5 && run.shiftAtFraction < 1)
    || run.targetsKph.length === 0 || run.targetsKph.some((v,i) => !Number.isFinite(v) || v <= 0 || (i > 0 && v <= run.targetsKph[i-1]))) throw new Error('Invalid acceleration scenario')
  const d = new Dynamics(); d.vehicle = vehicle; d.reset(config)
  d.state.rpm = run.initialRpm; d.gas = 1; d.shift(1, config)
  const checkpoints = run.targetsKph.map(kph => ({ kph, seconds: null as number | null }))
  let cursor = 0, peakRpm = d.state.rpm
  const shifts: { seconds: number; gear: number; rpm: number; kph: number }[] = []
  for (let t = 0; t < run.durationSeconds && cursor < checkpoints.length;) {
    const beforeGear = d.state.gear, beforeSpeed = d.state.speed * 3.6
    if (d.state.rpm >= config.redline * run.shiftAtFraction) d.shift(1, config)
    const h = Math.min(dt, run.durationSeconds-t)
    d.tick(h, config)
    const speed = d.state.speed * 3.6
    if (d.state.gear !== beforeGear) shifts.push({ seconds: t+h, gear: d.state.gear, rpm: d.state.rpm, kph: speed })
    while (cursor < checkpoints.length && speed >= checkpoints[cursor].kph) {
      const fraction = speed > beforeSpeed ? (checkpoints[cursor].kph-beforeSpeed)/(speed-beforeSpeed) : 1
      checkpoints[cursor++].seconds = t + Math.max(0, Math.min(1, fraction)) * h
    }
    peakRpm = Math.max(peakRpm, d.state.rpm)
    t += h
  }
  return { checkpoints, shifts, peakRpm, finalSpeedKph: d.state.speed * 3.6 }
}
