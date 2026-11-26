<script setup lang="ts">
import { computed } from 'vue'
import { Crosshair, Wind } from 'lucide-vue-next'
import { clock } from '../../../shared/format'
import type { Point, WindLeg } from '../../../shared/race'
import { findWindStory } from '../lib/review'

const props = defineProps<{ legs: WindLeg[]; releasedAt?: number | null; title?: string }>()
const emit = defineEmits<{ locate: [target: { time: number; position: Point }] }>()

const story = computed(() => findWindStory(props.legs, props.releasedAt ?? null))
const visibleLegs = computed(() => props.legs.filter(leg => leg.phase !== 'ambient' || leg.sailLoadAverage > 0).slice(-12))

function locate(time: number, position: Point) {
  emit('locate', { time, position })
  document.querySelector('.chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <section class="instrument wind-review" aria-label="风带复盘" data-testid="wind-review">
    <h2><Wind :size="17" /> {{ title ?? '风带复盘' }}</h2>

    <div v-if="story" data-testid="wind-story">
      <button type="button" class="wind-story-button" data-testid="locate-wind-story" @click="locate(story.start, story.position)">
        <Crosshair :size="15" />
        <span>定位：{{ story.title }}</span>
        <b>{{ story.totalSeconds.toFixed(1) }} s</b>
      </button>
      <div class="wind-metrics" data-testid="wind-metrics">
        <span data-testid="actual-duration"><b>实航用时</b><output data-testid="actual-sailing-time">{{ story.totalSeconds.toFixed(1) }} s</output></span>
        <span data-testid="acceleration-time"><b>提速 {{ story.tailGainKnots.toFixed(0) }} kn</b><output data-testid="speed-gain-time">{{ story.tailGainSeconds === undefined ? '—' : `${story.tailGainSeconds.toFixed(2)} s` }}</output></span>
        <span data-testid="recovery-metric"><b>恢复 {{ story.recoveryKnots.toFixed(1) }} kn</b><output data-testid="recovery-time">{{ story.recoverySeconds === undefined ? '未达到' : `${story.recoverySeconds.toFixed(2)} s` }}</output></span>
      </div>
      <p class="wind-story-summary" data-testid="wind-story-summary">{{ story.summary }}</p>
      <p class="wind-story-sail" data-testid="sail-load-explanation">{{ story.sailExplanation }}</p>
      <p class="wind-story-timing" data-testid="actual-time-explanation">{{ story.timingExplanation }}</p>
    </div>
    <p v-else class="empty-note" data-testid="wind-story-empty">
      尚未形成「横风 → 叠合低风 → 顺风」的完整航段；出带后会自动复盘帆载与实航用时。
    </p>

    <div v-if="visibleLegs.length" class="wind-leg-list" data-testid="exposure-ranges">
      <button
        v-for="leg in visibleLegs"
        :key="leg.id"
        type="button"
        class="wind-leg"
        :data-phase="leg.phase"
        :data-moving="leg.moving"
        data-exposure-range="true"
        data-testid="locate-wind-leg"
        @click="locate(leg.start, leg.startPosition)"
      >
        <Crosshair :size="12" />
        <time>{{ clock(leg.start) }}</time>
        <span>{{ leg.label }}<small v-if="!leg.moving"> · 船未移动</small></span>
        <b>{{ (leg.end - leg.start).toFixed(1) }}s · {{ leg.windKnots.toFixed(1) }} kn</b>
      </button>
    </div>
  </section>
</template>
