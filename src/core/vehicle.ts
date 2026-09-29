/** Estimated automatic-clutch controller settings; separate from measured hardware. */
export interface DrivetrainControl {
  launchRpmRiseFraction: number // wheel-side RPM rise followed only during N→forward launch
  launchRpmFollow: number // fraction of wheel-side RPM rise followed during slip, < 1
  launchRpmRetention: number // assisted launch target as fraction of pre-rev RPM
  slipResponseSeconds: number // automatic clutch/torque controller response
  shiftSeconds: number
  throttleOpenSeconds: number
  throttleCloseSeconds: number
  clutchBase: number
  clutchPreload: number
  clutchSpeedGain: number
  clutchLockSpeed: number // m/s
  preloadRpmFraction: number
  frictionScale: number
  pumpingScale: number
}
export const DEFAULT_CONTROL: DrivetrainControl = {
  launchRpmRiseFraction: .45, launchRpmFollow: .15, launchRpmRetention: .85, slipResponseSeconds: .12,
  shiftSeconds: .18, throttleOpenSeconds: .09, throttleCloseSeconds: .035,
  clutchBase: .3, clutchPreload: .4, clutchSpeedGain: 2, clutchLockSpeed: 30,
  preloadRpmFraction: .6, frictionScale: 1, pumpingScale: 1,
}
/** Vehicle parameters use SI units. Drag, rider mass and intermediate torque points are estimates. */
export interface VehicleConfig {
  ratios: readonly number[]
  primary: number
  finalDrive: number
  radius: number
  mass: number
  dragArea: number
  rolling: number
  efficiency: number
  brakeDeceleration: number
  maxDriveAcceleration?: number
  control?: DrivetrainControl
  torqueCurve?: readonly (readonly [number, number])[]
}
export const DEFAULT_VEHICLE: VehicleConfig = {
  ratios: [0, 3.2, 2.1, 1.5, 1.18, 0.96, 0.8], primary: 1, finalDrive: 4.1,
  radius: 0.31, mass: 1400, dragArea: 0.65, rolling: 0.015, efficiency: 0.92, brakeDeceleration: 8,
}
export function fullThrottleTorque(rpm: number, displacement: number, redline: number, v: VehicleConfig) {
  if (!v.torqueCurve) return displacement * 88 * Math.max(0.3, 1 - 1.25 * (rpm / redline - 0.55) ** 2)
  const curve = v.torqueCurve
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const [a, b] = [curve[i-1], curve[i]]
      const t = Math.max(0, Math.min(1, (rpm-a[0])/(b[0]-a[0])))
      return a[1] + (b[1]-a[1])*t
    }
  }
  return curve[curve.length-1][1]
}
