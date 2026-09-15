import { EngineDSP, type SoundState } from '../core/dsp'
import { DEFAULT_CONFIG, type EngineConfig } from '../core/config'

declare const sampleRate: number
declare class AudioWorkletProcessor { port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void

class EngineProcessor extends AudioWorkletProcessor {
  private engine = new EngineDSP(DEFAULT_CONFIG, sampleRate)
  private previous: EngineDSP | null = null
  private pending: EngineConfig | null = null
  private fade = 1
  private state: SoundState = { rpm: 850, load: 0.15, fuel: true }
  constructor() {
    super()
    this.port.onmessage = ({ data }) => {
      if (data.type === 'config') this.pending = data.config
      if (data.type === 'state') this.state = data.state
    }
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.pending && !this.previous) {
      const next = new EngineDSP(this.pending, sampleRate)
      next.copyPhase(this.engine)
      this.previous = this.engine
      this.engine = next
      this.pending = null
      this.fade = 0
    }
    const output = outputs[0]?.[0]
    if (!output) return true
    for (let i = 0; i < output.length; i++) {
      let value = this.engine.sample(this.state)
      if (this.previous) {
        const mix = this.fade * this.fade * (3 - 2 * this.fade)
        value = this.previous.sample(this.state) * (1 - mix) + value * mix
        this.fade = Math.min(1, this.fade + 1 / (sampleRate * 0.12))
        if (this.fade === 1) this.previous = null
      }
      output[i] = value
    }
    return true
  }
}
registerProcessor('engine-sound', EngineProcessor)
