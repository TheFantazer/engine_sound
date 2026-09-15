<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ rpm: number; redline: number; running: boolean }>()
const ratio = computed(() => Math.min(1, props.rpm / props.redline))
const ticks = computed(() => Array.from({ length: 41 }, (_, i) => {
  const angle = (135 + i / 40 * 270) * Math.PI / 180
  const major = i % 5 === 0
  return { x1: 160 + Math.cos(angle) * 121, y1: 160 + Math.sin(angle) * 121, x2: 160 + Math.cos(angle) * (major ? 108 : 115), y2: 160 + Math.sin(angle) * (major ? 108 : 115), red: i >= 34, major }
}))
</script>
<template>
  <div class="tachometer" :class="{ running }" role="img" :aria-label="`${Math.round(rpm)} rpm; redline ${redline} rpm`">
    <svg viewBox="0 0 320 300" aria-hidden="true">
      <circle class="dial-track" cx="160" cy="160" r="130" stroke-dasharray="612.6 817" transform="rotate(135 160 160)" />
      <circle class="dial-value" cx="160" cy="160" r="130" :stroke-dasharray="`${ratio * 612.6} 817`" transform="rotate(135 160 160)" :class="{ hot: ratio > 0.85 }" />
      <line v-for="(tick, i) in ticks" :key="i" v-bind="{ x1: tick.x1, x2: tick.x2, y1: tick.y1, y2: tick.y2 }" :stroke="tick.red ? '#c95045' : tick.major ? '#8c939e' : '#c5cad2'" stroke-width="1.5" />
      <text x="72" y="269" class="dial-end">0</text><text x="245" y="269" class="dial-end">{{ redline.toLocaleString('en-US') }}</text>
    </svg>
    <div class="dial-readout"><strong>{{ Math.round(rpm).toLocaleString('en-US') }}</strong><span>rpm</span></div>
  </div>
</template>
