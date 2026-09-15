import { clamp, type EngineConfig } from './config'

export interface RuntimeState { rpm: number; load: number; throttle: number; fuel: boolean; gear: number }

// Generic six-speed ratios; model-specific transmissions can supply their own later.
export const GEAR_RATIOS = [0, 3.2, 2.1, 1.5, 1.18, 0.96, 0.8] as const

/** Neutral free revving and a reduced geared load, with idle control. */
export class Dynamics {
  state: RuntimeState = { rpm: 850, load: 0.14, throttle: 0, fuel: true, gear: 0 }
  fixedRpm = false
  targetRpm = 3000
  gas = 0
  private shiftRemaining = 0
  private shiftTarget = 0

  reset(config: EngineConfig) {
    this.state = { rpm: config.idle, load: 0.14, throttle: 0, fuel: true, gear: 0 }
    this.gas = 0
    this.shiftRemaining = 0
  }
  shift(direction: -1 | 1, config: EngineConfig): boolean {
    if (this.fixedRpm || this.shiftRemaining > 0) return false
    const previous = this.state.gear
    const next = previous + direction
    if (next < 0 || next >= GEAR_RATIOS.length) return false
    // At the same virtual wheel speed, engine RPM follows the ratio change.
    // Neutral engagement is slipped; there is no vehicle-speed model here.
    const target = previous > 0 && next > 0
      ? this.state.rpm * GEAR_RATIOS[next] / GEAR_RATIOS[previous]
      : this.state.rpm
    if (target > config.redline) return false
    this.state.gear = next
    this.shiftTarget = Math.max(config.idle, target)
    this.shiftRemaining = 0.18
    return true
  }
  tick(dt: number, config: EngineConfig) {
    let remaining = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1)
    while (remaining > 1e-8) {
      const h = Math.min(remaining, 1 / 240)
      this.step(h, config)
      remaining -= h
    }
    return this.state
  }
  private step(dt: number, c: EngineConfig) {
    const s = this.state
    if (this.fixedRpm) {
      this.shiftRemaining = 0
      s.rpm = clamp(this.targetRpm, c.idle, c.redline)
      s.throttle = 0
      s.load = 0.14 + 0.12 * s.rpm / c.redline
      s.fuel = true
      return
    }
    if (this.shiftRemaining > 0) {
      const fraction = Math.min(1, dt / this.shiftRemaining)
      s.rpm += (clamp(this.shiftTarget, c.idle, c.redline) - s.rpm) * fraction
      s.throttle *= Math.exp(-dt / 0.035)
      s.load += (0.12 - s.load) * (1 - Math.exp(-dt / 0.04))
      s.fuel = true
      this.shiftRemaining = Math.max(0, this.shiftRemaining - dt)
      return
    }
    // Approximate reflected drivetrain inertia: higher gears build RPM more slowly.
    const inertia = c.inertia * (s.gear === 0 ? 1 : 1 + 2 / GEAR_RATIOS[s.gear] ** 2)
    const command = clamp(this.gas, 0, 1)
    const response = command < s.throttle ? 0.035 : 0.09
    s.throttle += (command - s.throttle) * (1 - Math.exp(-dt / response))
    const relative = s.rpm / c.redline
    const torque = c.displacement * 88 * Math.max(0.3, 1 - 1.25 * (relative - 0.55) ** 2)
    const drag = c.displacement * (7 + s.rpm * 0.003)
    // The idle governor balances losses. Closing the throttle does not switch off the engine.
    const idleDemand = clamp((drag + (c.idle - s.rpm) * inertia * (2 * Math.PI / 60) * 8) / torque, 0, 0.45)
    s.fuel = s.rpm < c.redline * 0.985
    const demand = Math.max(s.throttle, idleDemand)
    const combustion = s.fuel ? torque * demand : 0
    s.rpm = clamp(s.rpm + (combustion - drag) / inertia * 60 / (2 * Math.PI) * dt, c.idle * 0.8, c.redline * 1.015)
    // Residual firing remains audible at closed throttle; acoustic load is separate from torque demand.
    const acousticLoad = s.fuel ? Math.max(demand, 0.12) : 0
    s.load += (acousticLoad - s.load) * (1 - Math.exp(-dt / 0.08))
  }
}
