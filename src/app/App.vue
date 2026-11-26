<script setup lang="ts">
import { computed } from 'vue'
import { Anchor, CircleStop, Flag, Pause, Play, RotateCcw, Sailboat } from 'lucide-vue-next'
import { CourseChart } from '../features/chart'
import { WindPanel, WindReviewPanel } from '../features/wind'
import { legsFromSamples } from '../features/wind/lib/review'
import { SailPanel } from '../features/sail'
import { MarksPanel } from '../features/jury'
import { LogbookPanel } from '../features/logbook'
import { clock } from '../shared/format'
import type { Point } from '../shared/race'
import { useRace } from './useRace'

const { course, wind, sail, jury, logbook, status, focus, frame, trail, active, released, releasedAt, windLegs, start, release, togglePause, end, locate } = useRace()
const { voyages, selected, cursor, notice, seek, open } = logbook
const { mode } = wind
const { events } = jury
const labels = { ready: '待出发', running: '竞速中', paused: '已暂停', finished: '已完赛', abandoned: '未完赛' }
const stateLabel = computed(() => {
  if (selected.value) return '回看中'
  if (status.value === 'running' && !released.value) return '等待放行'
  return labels[status.value]
})
const reviewLegs = computed(() => {
  if (selected.value) return selected.value.windLegs?.length ? selected.value.windLegs : legsFromSamples(selected.value.samples)
  return windLegs.value
})
const reviewReleasedAt = computed(() => selected.value?.releasedAt ?? releasedAt.value)
function locateWind(target: { time: number; position: Point }) {
  focus.value = target.position
  if (selected.value) {
    seek(target.time)
  } else if (!active.value && voyages.value[0]) {
    open(voyages.value[0].id)
    seek(target.time)
  }
}
</script>

<template>
  <main class="shell">
    <header class="masthead">
      <div class="brand"><Anchor :size="30" :stroke-width="1.8"/><div><h1>绕标</h1><span>MARK REGATTA</span></div></div>
      <div class="mast-data"><Flag :size="16"/>{{ course.name }} <span class="divider"></span><span data-testid="race-state">{{ stateLabel }}</span></div>
    </header>
    <div class="workspace">
      <div class="main-column">
        <div class="race-bar">
          <div class="timer"><span>{{ selected ? '回看时间' : '赛时' }}</span><output data-testid="elapsed">{{ clock(frame.time) }}</output></div>
          <div class="timer final-time"><span>{{ selected ? '记录成绩' : '含罚时' }}</span><output data-testid="result">{{ clock(selected ? selected.duration + selected.penalty : frame.time + frame.penalty) }}</output></div>
          <span v-if="active && !released" class="hold-hint" data-testid="hold-hint">放行前停在起点等移动阵风带 · 船不移动，赛时继续</span>
          <div class="race-actions">
            <button v-if="!active" type="button" class="primary" @click="start"><component :is="status === 'ready' ? Play : RotateCcw" :size="15"/>{{ status === 'ready' ? '出发' : '再跑一场' }}</button>
            <template v-else>
              <button v-if="!released" type="button" class="primary release-button" data-testid="release-boat" :disabled="status !== 'running'" @click="release"><Sailboat :size="15"/>放行</button>
              <button type="button" class="primary" @click="togglePause"><component :is="status === 'running' ? Pause : Play" :size="15"/>{{ status === 'running' ? '暂停' : '继续' }}</button>
              <button class="icon-button" type="button" title="结束航次" aria-label="结束航次" @click="end('abandoned')"><CircleStop :size="18"/></button>
            </template>
          </div>
        </div>
        <CourseChart :course="course" :frame="frame" :trail="trail" :replay="Boolean(selected)" :focus="focus" :wind-mode="selected?.windMode ?? mode"/>
        <LogbookPanel :voyages="voyages" :selected="selected" :events="selected?.events ?? events" :cursor="cursor" :notice="notice" :locked="active"
          @open="id => { focus = null; open(id) }" @close="selected = null; focus = null" @seek="time => { focus = null; seek(time) }" @focus="locate"/>
        <WindReviewPanel :legs="reviewLegs" :released-at="reviewReleasedAt" :title="selected ? '本航次风带复盘' : '实时风带复盘'" @locate="locateWind"/>
      </div>
      <aside class="instruments" aria-label="比赛仪表">
        <WindPanel :wind="frame.wind" :mode="selected?.windMode ?? mode" :locked="active || Boolean(selected)" @mode="wind.set"/>
        <SailPanel :boat="frame.boat" :wind="frame.wind" :disabled="status !== 'running' || Boolean(selected)" @steer="sail.steer" @sheet="sail.sheet"/>
        <MarksPanel :gates="course.gates" :next-gate="frame.nextGate" :penalty="frame.penalty"/>
      </aside>
    </div>
  </main>
</template>
