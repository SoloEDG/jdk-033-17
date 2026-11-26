<script setup lang="ts">
import { Wind as WindIcon, ArrowUp, Layers } from 'lucide-vue-next'
import { compass } from '../../../shared/format'
import type { SampleWind, WindMode } from '../../../shared/race'
import { phaseLabel } from '../lib/classify'
defineProps<{ wind: SampleWind; mode: WindMode; locked: boolean }>()
defineEmits<{ mode: [value: WindMode] }>()
</script>

<template>
  <section class="instrument" aria-label="风况">
    <h2><WindIcon :size="17"/> 风况</h2>
    <div class="instrument-line">
      <div class="wind-rose" aria-hidden="true"><ArrowUp :size="27" :style="{ transform: `rotate(${wind.bearing + 90}deg)` }"/></div>
      <div class="reading"><strong data-testid="wind-speed">{{ wind.knots.toFixed(1) }}</strong><span> kn</span><small data-testid="wind-bearing">来向 {{ compass(wind.bearing) }}</small></div>
      <div v-if="wind.phase" class="course-reading wind-phase" :data-phase="wind.phase" :data-low="wind.lowWind" data-testid="wind-phase">
        <strong>{{ phaseLabel(wind.phase, wind.lowWind) }}</strong>
        <small>{{ wind.components?.length ? `${wind.components.length} 带合成` : '环境风' }}</small>
      </div>
    </div>
    <div v-if="wind.components?.length" class="wind-component-list" data-testid="wind-components">
      <span v-for="component in wind.components" :key="component.bandId">
        <Layers :size="11" />{{ component.label }} {{ component.knots.toFixed(0) }} kn
      </span>
    </div>
    <p v-if="wind.lowWind" class="composed-low" data-testid="composed-wind">来风向量合成：{{ wind.knots.toFixed(1) }} kn，低于任一单带</p>
    <div class="segment"><button :disabled="locked" :aria-pressed="mode === 'shifting'" @click="$emit('mode', 'shifting')">变向风</button><button :disabled="locked" :aria-pressed="mode === 'steady'" @click="$emit('mode', 'steady')">稳定风</button></div>
  </section>
</template>
