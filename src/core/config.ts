export interface EngineConfig {
  cylinders: number
  strokes: 2 | 4
  displacement: number // total litres
  idle: number
  redline: number
  firing: 'even' | 'crossplane' | 'twin270'
  primaryLength: number // metres
  primaryDiameter: number // mm
  lengthSpread: number // relative length difference
  exhaustLength: number // metres
  damping: number // 0..1, acoustic losses
  intakeLength: number // metres
  intakeDiameter: number // mm
  plenumVolume: number // litres
  temperature: number // exhaust degrees C
  pulseWidth: number // crank degrees
  roughness: number // stochastic cycle variation
  inertia: number // kg m² (effective free-rev inertia)
  intakeLevel: number
  exhaustLevel: number
  mechanicalLevel: number
}

export const DEFAULT_CONFIG: EngineConfig = {
  cylinders: 4, strokes: 4, displacement: 2, idle: 850, redline: 7500,
  firing: 'even', primaryLength: 0.65, primaryDiameter: 42, lengthSpread: 0,
  exhaustLength: 1.8, damping: 0.55, intakeLength: 0.28, intakeDiameter: 45,
  plenumVolume: 3, temperature: 450, pulseWidth: 65, roughness: 0.07,
  inertia: 0.22, intakeLevel: 0.35, exhaustLevel: 0.8, mechanicalLevel: 0.12,
}
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const ranges: Partial<Record<keyof EngineConfig, [number, number]>> = {
  cylinders: [1, 12], displacement: [0.05, 10], idle: [500, 2200], redline: [3000, 16000],
  primaryLength: [0.15, 1.8], primaryDiameter: [20, 90], lengthSpread: [0, 0.8],
  exhaustLength: [0.25, 4], damping: [0.05, 0.95], intakeLength: [0.08, 0.8],
  intakeDiameter: [20, 90], plenumVolume: [0.2, 12], temperature: [20, 850],
  pulseWidth: [20, 140], roughness: [0, 0.4], inertia: [0.05, 0.8],
  intakeLevel: [0, 1], exhaustLevel: [0, 1], mechanicalLevel: [0, 1],
}
export function normalizeConfig(input: unknown): EngineConfig {
  const result = { ...DEFAULT_CONFIG }
  if (!input || typeof input !== 'object') return result
  const data = input as Record<string, unknown>
  for (const [key, range] of Object.entries(ranges)) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      ;(result as unknown as Record<string, unknown>)[key] = clamp(value, range[0], range[1])
    }
  }
  result.cylinders = Math.round(result.cylinders)
  result.strokes = data.strokes === 2 ? 2 : 4
  result.firing = data.firing === 'crossplane' && result.cylinders === 4 && result.strokes === 4
    ? 'crossplane' : data.firing === 'twin270' && result.cylinders === 2 && result.strokes === 4
      ? 'twin270' : 'even'
  return result
}

/** Angles in crank degrees; ignition reference. Exhaust timing is a fixed offset in v1. */
export function firingAngles(config: EngineConfig): number[] {
  if (config.firing === 'crossplane') return [0, 270, 450, 540]
  if (config.firing === 'twin270') return [0, 270]
  return Array.from({ length: config.cylinders }, (_, i) => i * config.strokes * 180 / config.cylinders)
}
export const firingFrequency = (rpm: number, config: EngineConfig) => rpm * config.cylinders / (config.strokes * 30)
export const soundSpeed = (celsius: number) => Math.sqrt(1.4 * 287.05 * (celsius + 273.15))
export function intakeResonance(config: EngineConfig): number {
  const radius = config.intakeDiameter / 2000
  return soundSpeed(20) / (2 * Math.PI) * Math.sqrt(Math.PI * radius ** 2 / (config.plenumVolume / 1000 * (config.intakeLength + 1.7 * radius)))
}

export function encodeConfig(config: EngineConfig): string {
  return encodeURIComponent(JSON.stringify({ version: 1, config: normalizeConfig(config) }))
}
export function decodeConfig(hash: string): EngineConfig | null {
  try {
    if (hash.length > 12000) return null
    const value = JSON.parse(decodeURIComponent(hash.replace(/^#/, '')))
    return value.version === 1 && value.config && typeof value.config === 'object' ? normalizeConfig(value.config) : null
  } catch { return null }
}
