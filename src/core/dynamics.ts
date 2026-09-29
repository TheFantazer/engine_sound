import { clamp, type EngineConfig } from './config'
import { DEFAULT_VEHICLE, DEFAULT_CONTROL, fullThrottleTorque, type VehicleConfig, type DrivetrainControl } from './vehicle'

export interface RuntimeState { rpm: number; load: number; throttle: number; fuel: boolean; gear: number; speed: number }

/** Reduced warm-engine losses, expressed as mean effective pressure (bar).
 * Polynomial coefficients are generic estimates, not measured model data.
 * Work per cycle = pressure × swept volume; crank angle per cycle = strokes × π.
 */
export function engineLossTorque(rpm: number, throttle: number, c: EngineConfig, control: DrivetrainControl = DEFAULT_CONTROL): number {
  const speed = Math.max(0, rpm) / 1000
  // Scale cycle-normalized friction so two-stroke cycling does not double mechanical drag.
  const frictionBar = (0.65 + 0.12 * speed + 0.025 * speed ** 2) * c.strokes / 4
  // Four-stroke throttling losses grow on closure. Two-stroke scavenging is only approximated.
  const pumpingBar = (c.strokes === 4 ? 0.65 : 0.15) * (1 - clamp(throttle, 0, 1)) ** 2
  return (frictionBar * control.frictionScale + pumpingBar * control.pumpingScale) * 1e5 * (c.displacement / 1000) / (c.strokes * Math.PI)
}

/** Free revving in neutral; longitudinal vehicle coupling on forward gears. */
export class Dynamics {
  state: RuntimeState = { rpm: 850, load: 0.14, throttle: 0, fuel: true, gear: 0, speed: 0 }
  fixedRpm = false
  targetRpm = 3000
  vehicle: VehicleConfig = DEFAULT_VEHICLE
  gas = 0
  brake = 0
  private launchSlip = false
  private slipReferenceWheelRpm = 0
  private slipTargetRpm: number | null = null
  private clutchEngagement = 1
  private shiftRemaining = 0
  private shiftTarget: number | null = null

  private get control() { return this.vehicle.control ?? DEFAULT_CONTROL }
  reset(config: EngineConfig) {
    this.state = { rpm: config.idle, load: 0.14, throttle: 0, fuel: true, gear: 0, speed: 0 }
    this.slipTargetRpm = null
    this.launchSlip = false
    this.slipReferenceWheelRpm = 0
    this.gas = 0
    this.brake = 0
    this.shiftRemaining = 0
    this.clutchEngagement = 1
  }
  shift(direction: -1 | 1, config: EngineConfig): boolean {
    if (this.fixedRpm || this.shiftRemaining > 0) return false
    const previous = this.state.gear
    const next = previous + direction
    if (next < 0 || next >= this.vehicle.ratios.length) return false
    const ratio = this.vehicle.ratios[next] * this.vehicle.primary * this.vehicle.finalDrive
    const target = next > 0 && previous > 0 ? this.state.speed / this.vehicle.radius * ratio * 30 / Math.PI : this.state.rpm
    if (target > config.redline) return false
    this.launchSlip = previous === 0 && next > 0
    this.state.gear = next
    const previousWheelRpm = previous > 0
      ? this.state.speed / this.vehicle.radius * this.vehicle.ratios[previous] * this.vehicle.primary * this.vehicle.finalDrive * 30 / Math.PI
      : this.state.rpm
    const synchronized = Math.abs(this.state.rpm - previousWheelRpm) < Math.max(100, this.state.rpm * 0.03)
    // Assisted rev matching retains launch slip across a ratio change instead
    // of forcing the engine to the much lower wheel-derived RPM.
    this.shiftTarget = previous === 0 || next === 0 ? null
      : Math.max(config.idle, synchronized ? target
        : this.state.rpm * this.vehicle.ratios[next] / this.vehicle.ratios[previous])
    this.slipTargetRpm = next === 0 ? null : previous === 0
      ? (this.state.rpm > config.idle * 1.5 ? Math.max(config.idle * 1.2, this.state.rpm * this.control.launchRpmRetention) : null)
      : synchronized ? null : this.shiftTarget
    this.slipReferenceWheelRpm = this.state.speed / this.vehicle.radius * ratio * 30 / Math.PI
    this.shiftRemaining = previous === 0 || next === 0 ? 0 : this.control.shiftSeconds
    if (this.shiftRemaining > 0) this.clutchEngagement = 0
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
    const control = this.control
    if (this.fixedRpm) {
      this.shiftRemaining = 0
      this.slipTargetRpm = null
      this.launchSlip = false
      this.clutchEngagement = 1
      s.rpm = clamp(this.targetRpm, c.idle, c.redline)
      s.throttle = 0
      if (s.gear > 0) s.speed = s.rpm * Math.PI / 30 * this.vehicle.radius / (this.vehicle.ratios[s.gear] * this.vehicle.primary * this.vehicle.finalDrive)
      s.load = 0.14 + 0.12 * s.rpm / c.redline
      s.fuel = true
      return
    }
    const v = this.vehicle
    const road = 0.5 * 1.225 * v.dragArea * s.speed ** 2 + v.mass * 9.81 * v.rolling * Math.min(1, s.speed)
    const braking = clamp(this.brake, 0, 1) * v.mass * v.brakeDeceleration
    if (this.shiftRemaining > 0) {
      s.speed = Math.max(0, s.speed - (road + braking) / v.mass * dt)
      const fraction = Math.min(1, dt / this.shiftRemaining)
      if (this.shiftTarget === null) {
        // Disengaged engine coasts during the torque cut. The clutch solver will
        // progressively resynchronize it after the shift, using bounded torque.
        s.rpm = Math.max(c.idle, s.rpm - engineLossTorque(s.rpm, 0, c, control) / c.inertia * 30 / Math.PI * dt)
      } else s.rpm += (clamp(this.shiftTarget, c.idle, c.redline) - s.rpm) * fraction
      s.throttle *= Math.exp(-dt / control.throttleCloseSeconds)
      s.load += (0.12 - s.load) * (1 - Math.exp(-dt / 0.04))
      s.fuel = true
      this.shiftRemaining = Math.max(0, this.shiftRemaining - dt)
      return
    }
    this.clutchEngagement = Math.min(1, this.clutchEngagement + dt / control.shiftSeconds)
    // Reflected engine inertia participates in vehicle acceleration while the clutch is locked.
    const inertia = c.inertia
    const command = clamp(this.gas, 0, 1)
    const response = command < s.throttle ? control.throttleCloseSeconds : control.throttleOpenSeconds
    s.throttle += (command - s.throttle) * (1 - Math.exp(-dt / response))
    const torque = fullThrottleTorque(s.rpm, c.displacement, c.redline, v) + engineLossTorque(s.rpm, 1, c, control)
    const drag = engineLossTorque(s.rpm, s.throttle, c, control)
    // The idle governor balances losses. Closing the throttle does not switch off the engine.
    const idleDemand = clamp((drag + (c.idle - s.rpm) * inertia * (2 * Math.PI / 60) * 8) / torque, 0, 0.45)
    s.fuel = s.rpm < c.redline * 0.985
    const demand = Math.max(s.throttle, idleDemand)
    const combustion = s.fuel ? torque * demand : 0
    let netTorque = combustion - drag
    let deliveredDemand = demand
    const ratio = v.ratios[s.gear] * v.primary * v.finalDrive
    if (s.gear === 0) {
      s.speed = Math.max(0, s.speed - (road + braking) / v.mass * dt)
      s.rpm = clamp(s.rpm + netTorque / inertia * 30 / Math.PI * dt, c.idle * 0.8, c.redline * 1.015)
    } else {
      const wheelRpm = s.speed / v.radius * ratio * 30 / Math.PI
      // Solve engine and wheel angular momentum together. A torque-limited clutch
      // dissipates slip; it must not prescribe a fixed launch RPM or create energy.
      const k = ratio / v.radius
      const omega = s.rpm * Math.PI / 30
      const freeSpeed = Math.max(0, s.speed - (road + braking) / v.mass * dt)
      const engaging = s.throttle > 0.02 || wheelRpm > c.idle * 1.1
      const launch = clamp(s.speed / control.clutchLockSpeed, 0, 1)
      const preload = clamp((s.rpm - c.idle) / (Math.max(1, c.redline * control.preloadRpmFraction - c.idle)), 0, 1)
      const capacity = engaging ? fullThrottleTorque(s.rpm, c.displacement, c.redline, v) * (control.clutchBase + control.clutchPreload * preload + control.clutchSpeedGain * launch) * this.clutchEngagement : 0
      // Forward traction/wheelie envelope limits wheel torque, including energy
      // released from a pre-revved engine; braking remains independently available.
      let forwardCapacity = v.maxDriveAcceleration === undefined ? capacity
        : Math.min(capacity, (v.mass * v.maxDriveAcceleration + road) / (k * v.efficiency))
      if (this.launchSlip && this.slipTargetRpm === null && this.gas > 0 && this.brake === 0 && s.fuel) {
        // Idle launch has no pre-rev target. Allocate torque using reflected
        // vehicle inertia so the wheel shaft catches up without pulling engine
        // RPM backwards. Fade to the coupled solution as slip disappears.
        const coupledAcceleration = Math.max(0,
          (netTorque - road / (k * v.efficiency))
          / (inertia + v.mass / (k * k * v.efficiency)))
        const slip = Math.max(0, s.rpm - wheelRpm)
        const engineAcceleration = coupledAcceleration * (1 - .25 * clamp(slip / 200, 0, 1))
        forwardCapacity = Math.min(forwardCapacity, Math.max(0,
          netTorque - inertia * engineAcceleration))
        if (slip < 1 && wheelRpm > c.idle * 1.1) this.launchSlip = false
      }
      // A traction limit must reduce engine torque as well as clutch torque.
      // Otherwise the untransmitted power spins the engine to redline and the
      // accumulated slip takes seconds to dissipate after subsequent shifts.
      if (this.slipTargetRpm !== null && this.gas > 0 && this.brake === 0) {
        // Follow wheel acceleration while slipping rather than holding an exact
        // pre-rev RPM. Gain < 1 lets the wheel shaft catch the engine naturally.
        const follow = this.launchSlip ? control.launchRpmRiseFraction : control.launchRpmFollow
        const movingTargetRpm = this.slipTargetRpm + follow
          * Math.max(0, wheelRpm - this.slipReferenceWheelRpm)
        const target = Math.max(movingTargetRpm, wheelRpm) * Math.PI / 30
        const governed = forwardCapacity + inertia * (target - omega) / control.slipResponseSeconds
        netTorque = Math.min(netTorque, Math.max(-drag, governed))
        // Do not demand more clutch torque than the recovering engine can
        // supply at the launch/shift target. The controller regulates both sides.
        forwardCapacity = Math.min(forwardCapacity, Math.max(0,
          netTorque - inertia * (target - omega) / control.slipResponseSeconds))
        deliveredDemand = clamp((netTorque + drag) / torque, 0, demand)
        if (wheelRpm >= movingTargetRpm && Math.abs(s.rpm-wheelRpm) < 100) this.slipTargetRpm = null
      } else if (this.gas <= 0 || this.brake > 0) this.slipTargetRpm = null
      const freeOmega = omega + netTorque / inertia * dt
      const difference = freeOmega - freeSpeed * k
      const efficiency = difference >= 0 ? v.efficiency : 1 / v.efficiency
      const requested = difference / (dt * (1 / inertia + k * k * efficiency / v.mass))
      const clutchTorque = clamp(requested, -capacity, forwardCapacity)
      s.speed = Math.max(0, freeSpeed + clutchTorque * k * efficiency / v.mass * dt)
      s.rpm = (freeOmega - clutchTorque / inertia * dt) * 30 / Math.PI
      s.rpm = clamp(s.rpm, c.idle, c.redline * 1.015)
    }
    // Residual firing remains audible at closed throttle; acoustic load is separate from torque demand.
    const acousticLoad = s.fuel ? Math.max(deliveredDemand, 0.12) : 0
    s.load += (acousticLoad - s.load) * (1 - Math.exp(-dt / 0.08))
  }
}
