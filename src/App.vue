<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import RangeControl from './components/RangeControl.vue'
import Tachometer from './components/Tachometer.vue'
import { DEFAULT_CONFIG, normalizeConfig, decodeConfig, encodeConfig, type EngineConfig } from './core/config'
import { Dynamics } from './core/dynamics'
import { AudioController } from './audio/controller'
import { CATEGORIES, MODELS, TEMPLATES, type SavedEngine, type VehicleModel } from './catalog/presets'

const STORAGE_KEY = 'engine-lab-v2'
const config = ref<EngineConfig>({ ...DEFAULT_CONFIG })
const customConfig = ref<EngineConfig>({ ...DEFAULT_CONFIG })
const modelId = ref<string | null>(null)
const templateId = ref('inline4')
const search = ref('')
const fixedRpm = ref(false)
const targetRpm = ref(3000)
const rpmDraft = ref('3000')
const volume = ref(35)
const running = ref(false)
const busy = ref(false)
const gas = ref(false)
const message = ref('')
const error = ref('')
const saveOpen = ref(false)
const saveName = ref('My engine')
const saved = ref<SavedEngine[]>([])
const stage = ref<HTMLElement>()
const audio = new AudioController()
const dynamics = new Dynamics()
const state = ref({ ...dynamics.state })
let frame = 0, last = 0, messageTimer: ReturnType<typeof setTimeout> | undefined
let restored = false

const current = computed(() => MODELS.find(model => model.id === modelId.value))
const isCustom = computed(() => !current.value)
const title = computed(() => current.value ? `${current.value.manufacturer} ${current.value.name}` : 'Custom')
const query = computed(() => search.value.trim().toLowerCase())
const catalog = computed(() => CATEGORIES.map(category => {
  const models = MODELS.filter(model => model.category === category.id && `${category.name} ${model.manufacturer} ${model.name}`.toLowerCase().includes(query.value))
  const brands = [...new Set(models.map(model => model.manufacturer))].sort().map(name => ({ name, models: models.filter(model => model.manufacturer === name) }))
  return { ...category, brands, count: models.length }
}).filter(category => !query.value || category.count > 0))
const savedMatches = computed(() => saved.value.filter(item => item.name.toLowerCase().includes(query.value)))
const firingText = computed(() => config.value.firing === 'crossplane' ? '270 / 180 / 90 / 180°' : config.value.firing === 'twin270' ? '270 / 450°' : `${(config.value.strokes * 180 / config.value.cylinders).toFixed(0)}° even`)
const modelSpecs = computed(() => [
  ['Cylinders', String(config.value.cylinders)],
  ['Displacement', `${config.value.displacement} L`],
  ['Cycle', `${config.value.strokes}-stroke`],
  ['Firing intervals', firingText.value],
  ['Idle speed', `${config.value.idle.toLocaleString('en-US')} rpm`],
  ['Redline', `${config.value.redline.toLocaleString('en-US')} rpm`],
])

function toast(text: string) { message.value = text; clearTimeout(messageTimer); messageTimer = setTimeout(() => message.value = '', 4500) }
function store() {
  if (!restored) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, custom: customConfig.value, modelId: modelId.value, templateId: templateId.value, saved: saved.value })) }
  catch { toast('Settings could not be saved on this device.') }
}
function release() { gas.value = false; dynamics.gas = 0 }
function setFixedTarget(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  targetRpm.value = Math.max(config.value.idle, Math.min(config.value.redline, Number.isFinite(value) ? value : config.value.idle))
  rpmDraft.value = String(targetRpm.value)
  input.value = rpmDraft.value
}
function press() { if (running.value && !fixedRpm.value && !busy.value) gas.value = true }
function focusEngine() { stage.value?.focus({ preventScroll: true }) }
function selectModel(model: VehicleModel) {
  release(); modelId.value = model.id; config.value = { ...model.config }
  dynamics.reset(model.config); state.value = { ...dynamics.state }
  store(); focusEngine()
}
function selectCustom() {
  release(); modelId.value = null; config.value = { ...customConfig.value }
  dynamics.reset(config.value); state.value = { ...dynamics.state }
  store(); focusEngine()
}
function editModel() {
  customConfig.value = { ...config.value }; modelId.value = null; templateId.value = ''
  store()
}
function applyTemplate() {
  const template = TEMPLATES.find(item => item.id === templateId.value)
  if (template) config.value = { ...template.config }
}
function selectSaved(item: SavedEngine) {
  modelId.value = null; templateId.value = ''; config.value = { ...item.config }
  customConfig.value = { ...item.config }; release(); dynamics.reset(item.config); state.value = { ...dynamics.state }
  store(); focusEngine()
}
function resetCustom() { templateId.value = 'inline4'; config.value = { ...DEFAULT_CONFIG } }
async function toggleAudio() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (running.value) { release(); await audio.stop(); running.value = false; dynamics.reset(config.value) }
    else {
      dynamics.fixedRpm = fixedRpm.value; dynamics.targetRpm = targetRpm.value
      state.value = { ...dynamics.tick(1 / 240, config.value) }
      await audio.start({ ...config.value }, { ...state.value })
      audio.updateConfig({ ...config.value }); running.value = true
    }
    focusEngine()
  } catch (e) { error.value = e instanceof Error ? e.message : 'Unable to start audio.'; running.value = false }
  finally { busy.value = false }
}
// Recover from a page becoming hidden while the asynchronous start was in progress.
watch(running, value => { if (value && document.hidden) { release(); void audio.stop().then(() => running.value = false) } })
audio.onFailure = text => { error.value = text; running.value = false; release() }
async function openSave() { saveOpen.value = !saveOpen.value; await nextTick(); document.getElementById('save-name')?.focus() }
function saveEngine() {
  const name = saveName.value.trim().slice(0, 60)
  if (!name) return
  saved.value = [{ id: `local-${Date.now()}`, name, config: { ...config.value } }, ...saved.value].slice(0, 30)
  saveOpen.value = false; store(); toast('Engine saved')
}
async function share() {
  const url = new URL(window.location.href); url.hash = encodeConfig(config.value)
  try { await navigator.clipboard.writeText(url.href); toast('Link copied') }
  catch { window.history.replaceState(null, '', url); toast('Settings added to the page URL. Copy it from the address bar.') }
}
function shiftGear(direction: -1 | 1) {
  if (!running.value || fixedRpm.value || busy.value) return
  if (dynamics.shift(direction, config.value)) state.value = { ...dynamics.state }
  focusEngine()
}
function keydown(event: KeyboardEvent) {
  if (!['Space', 'ArrowUp', 'ArrowDown'].includes(event.code) || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, button, a, summary, [contenteditable="true"]')) return
  event.preventDefault()
  if (event.code === 'Space') press()
  else if (!event.repeat) shiftGear(event.code === 'ArrowUp' ? 1 : -1)
}
function keyup(event: KeyboardEvent) { if (event.code === 'Space') release() }
function hidden() { release(); if (document.hidden && running.value && !busy.value) void toggleAudio() }
function animate(time: number) {
  const dt = last ? (time - last) / 1000 : 1 / 60; last = time
  dynamics.fixedRpm = fixedRpm.value; dynamics.targetRpm = targetRpm.value; dynamics.gas = gas.value && !fixedRpm.value ? 1 : 0
  if (running.value) {
    state.value = { ...dynamics.tick(dt, config.value) }; audio.updateState(state.value)
  } else state.value = { ...dynamics.state, rpm: fixedRpm.value ? targetRpm.value : config.value.idle }
  frame = requestAnimationFrame(animate)
}
watch(fixedRpm, () => { release(); dynamics.fixedRpm = fixedRpm.value })
watch(targetRpm, value => rpmDraft.value = String(value))
watch(config, value => {
  const normalized = normalizeConfig(value)
  if (JSON.stringify(value) !== JSON.stringify(normalized)) { config.value = normalized; return }
  targetRpm.value = Math.max(value.idle, Math.min(value.redline, targetRpm.value))
  if (isCustom.value) {
    customConfig.value = { ...value }
    const template = TEMPLATES.find(item => item.id === templateId.value)
    if (template && JSON.stringify(template.config) !== JSON.stringify(value)) templateId.value = ''
  }
  audio.updateConfig({ ...value }); store()
}, { deep: true })
watch(volume, value => audio.setVolume(value / 100))
onMounted(() => {
  try {
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    // Keep old custom configurations, but default the redesigned app to Custom.
    const legacy = persisted ? null : JSON.parse(localStorage.getItem('engine-lab-v1') ?? 'null')
    customConfig.value = normalizeConfig(persisted?.custom ?? legacy?.config ?? DEFAULT_CONFIG)
    const found = MODELS.find(model => model.id === persisted?.modelId)
    modelId.value = found?.id ?? null
    config.value = found ? { ...found.config } : { ...customConfig.value }
    templateId.value = TEMPLATES.find(template => JSON.stringify(template.config) === JSON.stringify(customConfig.value))?.id ?? ''
    const entries = persisted?.saved ?? legacy?.saved
    if (Array.isArray(entries)) saved.value = entries.slice(0, 30).filter((item: Partial<SavedEngine>) => typeof item?.name === 'string' && typeof item.id === 'string').map((item: SavedEngine) => ({ id: item.id, name: item.name.slice(0, 60), config: normalizeConfig(item.config) }))
  } catch { /* Corrupt local storage does not block startup. */ }
  if (location.hash) {
    const linked = decodeConfig(location.hash)
    if (linked) { config.value = linked; customConfig.value = { ...linked }; modelId.value = null; templateId.value = '' }
    else toast('The settings link could not be read.')
  }
  restored = true
  dynamics.reset(config.value); state.value = { ...dynamics.state }
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', hidden)
  frame = requestAnimationFrame(animate)
})
onUnmounted(() => {
  cancelAnimationFrame(frame); clearTimeout(messageTimer); audio.dispose()
  window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', hidden)
})
</script>

<template>
  <header class="topbar"><span class="brand">Engine Sound Lab</span><button class="plain-button" @click="share">Share</button></header>
  <main class="workspace">
    <aside class="catalog" aria-label="Engine catalog">
      <input class="search" v-model="search" aria-label="Search models" placeholder="Search models…" type="search" />
      <button class="catalog-row custom-row" :class="{ selected: isCustom }" :aria-pressed="isCustom" @click="selectCustom"><span>Custom</span><span class="custom-symbol" aria-hidden="true">＋</span></button>
      <nav aria-label="Vehicle models" class="catalog-tree">
        <details v-for="category in catalog" :key="category.id" :open="category.id === 'motorcycles' || !!query" class="category">
          <summary><span>{{ category.name }}</span><span class="count">{{ category.count }}</span></summary>
          <div class="tree-children">
            <p v-if="!category.count" class="empty-category">No models yet</p>
            <details v-for="brand in category.brands" :key="brand.name" open class="manufacturer"><summary>{{ brand.name }}</summary><div class="model-rows"><button v-for="model in brand.models" :key="model.id" class="catalog-row model-row" :class="{ selected: modelId === model.id }" :aria-pressed="modelId === model.id" @click="selectModel(model)">{{ model.name }}</button></div></details>
          </div>
        </details>
        <p v-if="query && !catalog.length" class="empty-category">No matching models</p>
      </nav>
      <details v-if="savedMatches.length" class="saved-engines" open><summary>Saved engines</summary><button v-for="item in savedMatches" :key="item.id" class="catalog-row" @click="selectSaved(item)">{{ item.name }}</button></details>
    </aside>

    <section class="engine-area" ref="stage" tabindex="-1" aria-label="Engine controls">
      <div class="engine-heading"><div><h1>{{ title }}</h1><p>{{ config.cylinders }} cylinders <span>·</span> {{ config.displacement.toLocaleString('en-US') }} L <span>·</span> {{ config.strokes }}-stroke</p></div><span class="status" :class="{ on: running }"><i></i>{{ busy ? 'Connecting…' : running ? 'Running' : 'Stopped' }}</span></div>
      <div class="engine-controls">
        <Tachometer :rpm="state.rpm" :redline="config.redline" :running="running" />
        <div class="gear-controls" aria-label="Transmission">
          <button class="plain-button" aria-label="Shift down" :disabled="!running || fixedRpm || busy || state.gear === 0" @click="shiftGear(-1)">− <kbd>↓</kbd></button>
          <span class="gear-readout">Gear <strong aria-label="Current gear">{{ state.gear === 0 ? 'N' : state.gear }}</strong></span>
          <button class="plain-button" aria-label="Shift up" :disabled="!running || fixedRpm || busy || state.gear === 6" @click="shiftGear(1)">＋ <kbd>↑</kbd></button>
        </div>
        <button class="start-button" @click="toggleAudio" :disabled="busy">{{ running ? 'Stop engine' : 'Start engine' }}</button>
        <button class="gas-pedal" :class="{ pressed: gas }" :disabled="!running || fixedRpm || busy" @pointerdown="event => { if (event.button === 0) { press(); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) } }" @pointerup="release" @pointercancel="release" @lostpointercapture="release" @keydown.space.prevent="press" @keyup.space.prevent="release" @keydown.enter.prevent="press" @keyup.enter.prevent="release" @blur="release"><span>{{ gas ? 'Throttle open' : 'Hold to rev' }}</span><kbd>Space</kbd></button>
        <div class="fixed-controls"><label class="checkbox-label"><input v-model="fixedRpm" type="checkbox" />Fixed RPM</label><div v-if="fixedRpm" class="fixed-input"><input aria-label="Fixed RPM value" type="number" v-model="rpmDraft" :min="config.idle" :max="config.redline" :step="50" @change="setFixedTarget" /><span>rpm</span></div></div>
        <RangeControl v-if="fixedRpm" label="Target RPM" v-model="targetRpm" :min="config.idle" :max="config.redline" :step="50" unit="rpm" />
        <div class="volume-control"><RangeControl label="Volume" v-model="volume" :min="0" :max="100" unit="%" /></div>
      </div>
    </section>

    <aside class="settings" aria-label="Engine settings">
      <div class="settings-heading"><h2>{{ isCustom ? 'Engine settings' : 'Specifications' }}</h2><button v-if="isCustom" class="text-button" @click="resetCustom">Reset</button></div>
      <template v-if="isCustom">
        <label class="field-label" for="template">Starting point</label><select id="template" v-model="templateId" @change="applyTemplate"><option value="" disabled>Modified</option><option v-for="item in TEMPLATES" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <div class="basic-settings"><div class="two-fields"><div><label class="field-label" for="cylinders">Cylinders</label><select id="cylinders" v-model.number="config.cylinders"><option v-for="n in 12" :key="n" :value="n">{{ n }}</option></select></div><div><label class="field-label" for="cycle">Cycle</label><select id="cycle" v-model.number="config.strokes"><option :value="4">4-stroke</option><option :value="2">2-stroke</option></select></div></div>
          <RangeControl label="Displacement" v-model="config.displacement" :min="0.05" :max="10" :step="0.05" unit="L" />
          <label class="field-label" for="firing">Firing intervals</label><select id="firing" v-model="config.firing"><option value="even">Even</option><option v-if="config.cylinders === 4 && config.strokes === 4" value="crossplane">Crossplane · 270 / 180 / 90 / 180°</option><option v-if="config.cylinders === 2 && config.strokes === 4" value="twin270">Twin · 270 / 450°</option></select>
        </div>
        <details class="settings-section"><summary>Exhaust</summary><div class="detail-content"><RangeControl label="Primary pipe length" v-model="config.primaryLength" :min="0.15" :max="1.8" :step="0.01" unit="m" /><RangeControl label="Primary pipe diameter" v-model="config.primaryDiameter" :min="20" :max="90" unit="mm" /><RangeControl label="Pipe length variation" v-model="config.lengthSpread" :min="0" :max="0.8" :step="0.01" unit="×" /><RangeControl label="Tailpipe length" v-model="config.exhaustLength" :min="0.25" :max="4" :step="0.05" unit="m" /><RangeControl label="Muffler absorption" v-model="config.damping" :min="0.05" :max="0.95" :step="0.01" unit="×" /></div></details>
        <details class="settings-section"><summary>Intake</summary><div class="detail-content"><RangeControl label="Runner length" v-model="config.intakeLength" :min="0.08" :max="0.8" :step="0.01" unit="m" /><RangeControl label="Runner diameter" v-model="config.intakeDiameter" :min="20" :max="90" unit="mm" /><RangeControl label="Plenum volume" v-model="config.plenumVolume" :min="0.2" :max="12" :step="0.1" unit="L" /></div></details>
        <details class="settings-section"><summary>Combustion & dynamics</summary><div class="detail-content"><RangeControl label="Exhaust pulse width" v-model="config.pulseWidth" :min="20" :max="140" unit="°" hint="Pulse shape, not fuel injection duration." /><RangeControl label="Cycle variation" v-model="config.roughness" :min="0" :max="0.4" :step="0.01" unit="×" /><RangeControl label="Exhaust temperature" v-model="config.temperature" :min="20" :max="850" :step="10" unit="°C" /><RangeControl label="Rotational inertia" v-model="config.inertia" :min="0.05" :max="0.8" :step="0.01" unit="kg·m²" /><RangeControl label="Idle speed" v-model="config.idle" :min="500" :max="2200" :step="50" unit="rpm" /><RangeControl label="Redline" v-model="config.redline" :min="3000" :max="16000" :step="100" unit="rpm" /></div></details>
        <details class="settings-section"><summary>Sound levels</summary><div class="detail-content"><RangeControl label="Exhaust level" v-model="config.exhaustLevel" :min="0" :max="1" :step="0.01" unit="×" /><RangeControl label="Intake level" v-model="config.intakeLevel" :min="0" :max="1" :step="0.01" unit="×" /><RangeControl label="Mechanical level" v-model="config.mechanicalLevel" :min="0" :max="1" :step="0.01" unit="×" /></div></details>
        <button class="plain-button save-button" @click="openSave">Save engine</button>
        <form v-if="saveOpen" class="save-form" @submit.prevent="saveEngine"><input id="save-name" v-model="saveName" aria-label="Engine name" maxlength="60" required /><div><button class="plain-button" type="submit">Save</button><button class="text-button" type="button" @click="saveOpen = false">Cancel</button></div></form>
      </template>
      <template v-else><dl class="specifications"><div v-for="[label, value] in modelSpecs" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl><button class="plain-button edit-custom" @click="editModel">Edit as Custom</button><a class="source-link" :href="current?.source" target="_blank" rel="noreferrer">Model data ↗</a></template>
    </aside>
  </main>
  <div v-if="message" class="toast" role="status">{{ message }}</div>
  <div v-if="error" class="error-toast" role="alert">{{ error }}<button @click="error = ''" aria-label="Dismiss error">×</button></div>
</template>
