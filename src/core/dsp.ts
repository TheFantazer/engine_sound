import { clamp, firingAngles, intakeResonance, normalizeConfig, soundSpeed, type EngineConfig } from './config'

/** Fractional delay with fixed storage. No allocation on the sample path. */
export class Delay {
  private buffer: Float32Array
  private cursor = 0
  constructor(private samples: number) { this.buffer = new Float32Array(Math.ceil(samples) + 2) }
  read(): number {
    const index = (this.cursor - this.samples + this.buffer.length) % this.buffer.length
    const left = Math.floor(index)
    const fraction = index - left
    return this.buffer[left] * (1 - fraction) + this.buffer[(left + 1) % this.buffer.length] * fraction
  }
  push(value: number) { this.buffer[this.cursor] = value; this.cursor = (this.cursor + 1) % this.buffer.length }
  process(value: number) { const y = this.read(); this.push(value); return y }
}

/** Reduced pipe model: flight time + damped, sign-inverted round trip (open/closed approximation). */
export class Pipe {
  private flight: Delay
  private roundTrip: Delay
  private low = 0
  private loss: number
  private reflect: number
  constructor(length: number, diameter: number, temperature: number, damping: number, sampleRate: number) {
    const travel = length / soundSpeed(temperature) * sampleRate
    this.flight = new Delay(Math.max(1, travel))
    this.roundTrip = new Delay(Math.max(2, 2 * travel))
    this.reflect = clamp(0.75 - damping * 0.55, 0.15, 0.75)
    // Empirical viscothermal loss proxy; diameter does not arbitrarily transpose the source.
    const cutoff = clamp(1800 + diameter * 65 - damping * 2000, 600, sampleRate * 0.4)
    this.loss = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate)
  }
  process(input: number): number {
    const echo = this.roundTrip.read()
    this.low += this.loss * (echo - this.low)
    const traveling = input - this.reflect * this.low
    this.roundTrip.push(traveling)
    return this.flight.process(traveling) * (1 - this.reflect * 0.5)
  }
}

class Resonator {
  private y1 = 0
  private y2 = 0
  private a1: number
  private a2: number
  private gain: number
  constructor(frequency: number, sampleRate: number) {
    const f = clamp(frequency, 30, sampleRate * 0.3)
    const radius = Math.exp(-Math.PI * f / (3 * sampleRate))
    this.a1 = 2 * radius * Math.cos(2 * Math.PI * f / sampleRate)
    this.a2 = radius * radius
    this.gain = 1 - radius
  }
  process(x: number) {
    const y = this.gain * x + this.a1 * this.y1 - this.a2 * this.y2
    const out = y - this.y2
    this.y2 = this.y1; this.y1 = y
    return out
  }
}

export interface SoundState { rpm: number; load: number; fuel: boolean }
export class EngineDSP {
  readonly config: EngineConfig
  private phase = 0
  private rpm = 850
  private load = 0.15
  private fuel = 1
  private offsets: number[]
  private primary: Pipe[]
  private tail: Pipe
  private intake: Resonator
  private lastLocal: Float64Array
  private jitter: Float64Array
  private seed: number
  private muffler = 0
  private airNoise = 0
  private dcX = 0
  private dcY = 0
  private smooth: number
  constructor(config: EngineConfig, readonly sampleRate: number, seed = 271828) {
    this.config = normalizeConfig(config)
    const c = this.config
    this.rpm = c.idle
    this.seed = seed || 1
    this.smooth = 1 - Math.exp(-1 / (sampleRate * 0.02))
    this.offsets = firingAngles(c).map(x => x / (c.strokes * 180))
    this.lastLocal = new Float64Array(c.cylinders).fill(1)
    this.jitter = new Float64Array(c.cylinders).fill(1)
    this.primary = this.offsets.map((_, i) => new Pipe(c.primaryLength * (1 + c.lengthSpread * i / Math.max(1, c.cylinders - 1)), c.primaryDiameter, c.temperature, 0.18, sampleRate))
    this.tail = new Pipe(c.exhaustLength, c.primaryDiameter * 1.5, c.temperature * 0.65, c.damping, sampleRate)
    this.intake = new Resonator(intakeResonance(c), sampleRate)
  }
  copyPhase(other: EngineDSP) { this.phase = other.phase; this.rpm = other.rpm; this.load = other.load; this.fuel = other.fuel }
  private random() {
    let x = this.seed
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    this.seed = x
    return (x >>> 0) / 2147483648 - 1
  }
  sample(state: SoundState): number {
    const c = this.config
    this.rpm += (clamp(state.rpm, 100, 18000) - this.rpm) * this.smooth
    this.load += (clamp(state.load, 0, 1) - this.load) * this.smooth
    this.fuel += ((state.fuel ? 1 : 0) - this.fuel) * this.smooth
    this.phase = (this.phase + this.rpm / (30 * c.strokes * this.sampleRate)) % 1
    const width = c.pulseWidth / (c.strokes * 180) * (1.1 - this.load * 0.22)
    const sourceGain = (0.15 + this.load * 0.85) * Math.sqrt(c.displacement / c.cylinders / 0.5)
    let exhaust = 0
    let intakePulse = 0
    let mechanical = 0
    for (let i = 0; i < c.cylinders; i++) {
      const local = (this.phase - this.offsets[i] + 1) % 1
      if (local < this.lastLocal[i]) this.jitter[i] = 1 + this.random() * c.roughness
      this.lastLocal[i] = local
      // Smooth compact pulse: bounded derivative, finite width. Not a Dirac click.
      const x = local / width
      const pulse = x < 1 ? Math.sin(Math.PI * x) ** 2 * Math.exp(-3 * x) * 5 : 0
      // Rotation still pumps gas during a limiter fuel cut: this source does not depend on combustion.
      const pumping = local < 0.4 ? Math.sin(local / 0.4 * 2 * Math.PI) * Math.sin(local / 0.4 * Math.PI) ** 2 : 0
      const pumpingGain = 0.06 * Math.sqrt(c.displacement / c.cylinders / 0.5) * Math.sqrt(this.rpm / c.redline)
      exhaust += this.primary[i].process(pulse * sourceGain * this.jitter[i] * this.fuel + pumping * pumpingGain)
      const intakePhase = (local + 0.5) % 1
      intakePulse += intakePhase < 0.28 ? Math.sin(intakePhase / 0.28 * Math.PI) ** 2 : 0
      mechanical += Math.sin(2 * Math.PI * local) * 0.035 + Math.sin(4 * Math.PI * local) * 0.025
    }
    const noise = this.random()
    this.airNoise += 0.18 * (noise - this.airNoise)
    const flow = this.airNoise * (0.015 + 0.15 * this.load ** 2) * Math.sqrt(this.rpm / 3000)
    exhaust = this.tail.process(exhaust / Math.sqrt(c.cylinders) + flow)
    const cutoff = 650 + (1 - c.damping) ** 2 * 10000
    this.muffler += (1 - Math.exp(-2 * Math.PI * cutoff / this.sampleRate)) * (exhaust - this.muffler)
    const intake = this.intake.process((intakePulse / Math.sqrt(c.cylinders) + this.airNoise * 0.3) * (0.08 + this.load * 0.5))
    const mixed = this.muffler * c.exhaustLevel + intake * c.intakeLevel + mechanical * c.mechanicalLevel
    // Remove DC before the output protection; absolute sound pressure is not calibrated.
    const dc = mixed - this.dcX + 0.995 * this.dcY
    this.dcX = mixed; this.dcY = dc
    return Math.tanh(dc * 1.7) * 0.7
  }
  render(output: Float32Array, state: SoundState) { for (let i = 0; i < output.length; i++) output[i] = this.sample(state) }
}
