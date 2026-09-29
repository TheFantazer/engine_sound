import { DEFAULT_CONFIG, normalizeConfig, type EngineConfig } from '../core/config'
import { DEFAULT_CONTROL, type VehicleConfig } from '../core/vehicle'

export interface VehicleModel {
  schemaVersion: 1
  id: string
  category: 'cars' | 'motorcycles' | 'other'
  manufacturer: string
  name: string
  source: string
  config: EngineConfig
  vehicle: VehicleConfig
  calibration: { status: 'estimated' | 'measured'; notes: string }
}
type RecordValue = Record<string, unknown>
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected object`)
  return value as RecordValue
}
function check(ok: boolean, path: string, message: string): asserts ok {
  if (!ok) throw new Error(`${path}: ${message}`)
}
function number(value: unknown, path: string, min: number, max: number) {
  check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, path, `expected finite number in [${min}, ${max}]`)
}
function keys(value: RecordValue, allowed: string[], path: string) {
  for (const key of Object.keys(value)) check(allowed.includes(key), `${path}.${key}`, 'unknown field')
}
/** Strict authoring boundary: catalog errors must not silently become defaults. */
export function parseModel(input: unknown, path = 'model'): VehicleModel {
  const m = object(input, path)
  keys(m, ['schemaVersion','id','category','manufacturer','name','source','config','vehicle','calibration'], path)
  check(m.schemaVersion === 1, path, 'unsupported schemaVersion')
  for (const key of ['id','manufacturer','name','source']) check(typeof m[key] === 'string' && (m[key] as string).trim().length > 0, `${path}.${key}`, 'required string')
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.id as string), path, 'id must be a lowercase slug')
  check(['cars','motorcycles','other'].includes(m.category as string), path, 'invalid category')
  check(/^https?:\/\//.test(m.source as string), path, 'source must be an HTTP(S) URL')
  const c = object(m.config, `${path}.config`)
  keys(c, [...Object.keys(DEFAULT_CONFIG), 'firingOffsets', 'primaryLengths'], `${path}.config`)
  const normalized = normalizeConfig(c)
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    check(c[key] === normalized[key as keyof EngineConfig], `${path}.config.${key}`, 'missing or outside supported range')
  }
  check(normalized.idle < normalized.redline, path, 'idle must be below redline')
  for (const key of ['firingOffsets','primaryLengths'] as const) {
    if (c[key] !== undefined) check(JSON.stringify(c[key]) === JSON.stringify(normalized[key]), `${path}.config.${key}`, 'invalid per-cylinder array')
  }
  const v = object(m.vehicle, `${path}.vehicle`)
  keys(v, ['ratios','primary','finalDrive','radius','mass','dragArea','rolling','efficiency','brakeDeceleration','maxDriveAcceleration','torqueCurve','control'], `${path}.vehicle`)
  const ranges: Record<string, [number,number]> = {primary:[.1,20],finalDrive:[.1,20],radius:[.05,2],mass:[30,50000],dragArea:[0,20],rolling:[0,.2],efficiency:[.1,1],brakeDeceleration:[.1,30],maxDriveAcceleration:[.1,30]}
  for (const [key, range] of Object.entries(ranges)) if (key !== 'maxDriveAcceleration' || v[key] !== undefined) number(v[key], `${path}.vehicle.${key}`, ...range)
  check(Array.isArray(v.ratios) && v.ratios.length >= 2 && v.ratios.length <= 13 && v.ratios[0] === 0, path, 'ratios must start with neutral 0 and contain 1–12 forward gears')
  v.ratios.slice(1).forEach((r: unknown, i: number) => {
    number(r, `${path}.vehicle.ratios[${i+1}]`, .05, 30)
    if (i > 0) check((r as number) < (v.ratios as number[])[i], path, 'forward ratios must decrease')
  })
  check(Array.isArray(v.torqueCurve) && v.torqueCurve.length >= 2, path, 'torqueCurve requires at least two crankshaft net torque points')
  let previous = -1
  for (const point of v.torqueCurve) {
    check(Array.isArray(point) && point.length === 2, path, 'torque point must be [rpm, Nm]')
    number(point[0], path, 0, 20000); number(point[1], path, 0, 10000)
    check(point[0] > previous, path, 'torque RPM must strictly increase'); previous = point[0]
  }
  check(v.torqueCurve[0][0] <= normalized.idle && previous >= normalized.redline, path, 'torque curve must cover idle through redline')
  const control = object(v.control, `${path}.vehicle.control`)
  keys(control, Object.keys(DEFAULT_CONTROL), `${path}.vehicle.control`)
  for (const key of Object.keys(DEFAULT_CONTROL)) {
    const range: [number,number] = key === 'launchRpmRiseFraction' ? [.05,.8] : key === 'launchRpmFollow' ? [0,.5] : key === 'launchRpmRetention' ? [.5,1] : key === 'preloadRpmFraction' ? [.1,.95] : key === 'clutchLockSpeed' ? [.1,100] : key.endsWith('Seconds') ? [.005,2] : [0,10]
    number(control[key], `${path}.vehicle.control.${key}`, ...range)
  }
  check((control.preloadRpmFraction as number) * normalized.redline > normalized.idle, path, 'clutch preload RPM must exceed idle')
  check((control.clutchBase as number) + (control.clutchPreload as number) > 0, path, 'launch clutch capacity must be positive')
  const calibration = object(m.calibration, `${path}.calibration`)
  keys(calibration, ['status','notes'], `${path}.calibration`)
  check(['estimated','measured'].includes(calibration.status as string) && typeof calibration.notes === 'string' && calibration.notes.length > 0, path, 'calibration status and notes required')
  return { ...m, config: normalized } as unknown as VehicleModel
}
export function loadCatalog(files: Record<string, unknown>): VehicleModel[] {
  const ids = new Set<string>()
  return Object.entries(files).sort(([a],[b]) => a.localeCompare(b)).map(([path, value]) => {
    const model = parseModel(value, path)
    check(!ids.has(model.id), path, `duplicate id ${model.id}`); ids.add(model.id)
    return model
  })
}
