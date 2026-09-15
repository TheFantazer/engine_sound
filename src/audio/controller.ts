import workletUrl from './engine.worklet?worker&url'
import type { EngineConfig } from '../core/config'
import type { SoundState } from '../core/dsp'

export class AudioController {
  context: AudioContext | null = null
  analyser: AnalyserNode | null = null
  private node: AudioWorkletNode | null = null
  private gain: GainNode | null = null
  private volume = 0.35
  private timer: ReturnType<typeof setTimeout> | undefined
  onFailure: (message: string) => void = () => {}
  async start(config: EngineConfig, state: SoundState) {
    if (!this.context) {
      if (!window.isSecureContext || !window.AudioContext) throw new Error('Audio requires a modern browser and HTTPS or localhost.')
      const context = new AudioContext({ latencyHint: 'interactive' })
      this.context = context
      try {
        await context.audioWorklet.addModule(workletUrl)
        this.node = new AudioWorkletNode(context, 'engine-sound', { outputChannelCount: [1] })
        this.node.onprocessorerror = () => this.onFailure('The audio engine stopped. Please reload the page.')
        this.gain = context.createGain()
        this.gain.gain.value = 0
        this.analyser = context.createAnalyser()
        this.analyser.fftSize = 2048
        this.analyser.smoothingTimeConstant = 0.75
        const compressor = context.createDynamicsCompressor()
        compressor.threshold.value = -6
        compressor.knee.value = 6
        compressor.ratio.value = 12
        compressor.attack.value = 0.003
        compressor.release.value = 0.15
        this.node.connect(this.gain).connect(compressor).connect(this.analyser).connect(context.destination)
      } catch (error) {
        await context.close()
        this.context = null
        throw error
      }
    }
    clearTimeout(this.timer)
    this.node?.port.postMessage({ type: 'config', config })
    this.updateState(state)
    await this.context.resume()
    this.gain?.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.04)
  }
  async stop() {
    if (!this.context || !this.gain) return
    this.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.025)
    await new Promise(resolve => setTimeout(resolve, 160))
    await this.context.suspend()
  }
  updateConfig(config: EngineConfig) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.node?.port.postMessage({ type: 'config', config }), 80)
  }
  updateState(state: SoundState) { this.node?.port.postMessage({ type: 'state', state: { rpm: state.rpm, load: state.load, fuel: state.fuel } }) }
  setVolume(value: number) {
    this.volume = value
    if (this.context?.state === 'running') this.gain?.gain.setTargetAtTime(value, this.context.currentTime, 0.025)
  }
  dispose() { clearTimeout(this.timer); this.node?.disconnect(); void this.context?.close() }
}
