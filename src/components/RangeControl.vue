<script setup lang="ts">
import { useId } from 'vue'
const id = useId()
defineProps<{ label: string; modelValue: number; min: number; max: number; step?: number; unit?: string; hint?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const input = (event: Event) => emit('update:modelValue', Number((event.target as HTMLInputElement).value))
</script>
<template>
  <div class="range-control">
    <div class="range-label"><label :for="id">{{ label }}</label><output :for="id">{{ Number(modelValue.toFixed(3)).toLocaleString('en-US') }} <span>{{ unit }}</span></output></div>
    <input :id="id" type="range" :min="min" :max="max" :step="step ?? 1" :value="modelValue" @input="input" :style="{ '--fill': `${(modelValue - min) / (max - min) * 100}%` }" :aria-describedby="hint ? `${id}-hint` : undefined" />
    <p v-if="hint" :id="`${id}-hint`" class="control-hint">{{ hint }}</p>
  </div>
</template>
