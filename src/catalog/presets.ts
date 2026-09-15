import { DEFAULT_CONFIG, normalizeConfig, type EngineConfig } from '../core/config'

export interface EngineTemplate { id: string; name: string; config: EngineConfig }
export interface VehicleModel {
  id: string
  category: 'cars' | 'motorcycles' | 'other'
  manufacturer: string
  name: string
  config: EngineConfig
  source: string
}
export interface SavedEngine { id: string; name: string; config: EngineConfig }
const config = (overrides: Partial<EngineConfig>) => normalizeConfig({ ...DEFAULT_CONFIG, ...overrides })

// Templates belong to the Custom editor, not the vehicle catalog.
export const TEMPLATES: EngineTemplate[] = [
  { id: 'inline4', name: 'Inline-four · 2.0 L', config: config({}) },
  { id: 'six', name: 'Inline-six · 3.0 L', config: config({ cylinders: 6, displacement: 3, idle: 750, redline: 7500, primaryLength: 0.6, exhaustLength: 2.2, roughness: 0.035, damping: 0.5, inertia: 0.3 }) },
  { id: 'v8', name: 'Eight-cylinder · 5.0 L', config: config({ cylinders: 8, displacement: 5, idle: 700, redline: 6500, primaryLength: 0.85, lengthSpread: 0.65, exhaustLength: 2.7, damping: 0.35, pulseWidth: 95, roughness: 0.12, inertia: 0.45 }) },
  { id: 'single', name: 'Single-cylinder 2-stroke · 125 cc', config: config({ cylinders: 1, strokes: 2, displacement: 0.125, idle: 1500, redline: 11000, primaryLength: 0.4, primaryDiameter: 28, exhaustLength: 0.8, damping: 0.18, pulseWidth: 50, intakeLength: 0.12, plenumVolume: 0.4, roughness: 0.15, inertia: 0.06 }) },
  { id: 'twin', name: 'Parallel twin 270° · 700 cc', config: config({ cylinders: 2, displacement: 0.7, firing: 'twin270', idle: 1200, redline: 10000, primaryLength: 0.55, primaryDiameter: 35, exhaustLength: 1.2, damping: 0.35, inertia: 0.13, pulseWidth: 70, plenumVolume: 1.5 }) },
]
export const CATEGORIES = [
  { id: 'cars', name: 'Cars' },
  { id: 'motorcycles', name: 'Motorcycles' },
  { id: 'other', name: 'Other' },
] as const
export const MODELS: VehicleModel[] = [{
  id: 'r1', category: 'motorcycles', manufacturer: 'Yamaha', name: 'YZF-R1',
  source: 'https://cdn2.yamaha-motor.eu/prod/product-assets/2017/YZF1000R1/Factsheets/2017-YZF1000R1_en.pdf',
  config: config({ cylinders: 4, displacement: 0.998, firing: 'crossplane', idle: 1250, redline: 14000, primaryLength: 0.45, primaryDiameter: 35, exhaustLength: 0.9, damping: 0.3, pulseWidth: 45, intakeLength: 0.16, plenumVolume: 1.5, roughness: 0.04, inertia: 0.1 }),
}]
