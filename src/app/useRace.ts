import { computed, onMounted, onUnmounted, ref } from 'vue'
import { course } from '../features/chart'
import { useWind } from '../features/wind'
import { findWindStory, ingestSlices } from '../features/wind/lib/review'
import { useSail } from '../features/sail'
import { advanceBoatStep, advanceStationaryStep } from '../features/sail/lib/integrate'
import { useJury } from '../features/jury'
import { useLogbook } from '../features/logbook'
import type { Point, RaceEvent, RaceStatus, Sample, WindLeg } from '../shared/race'

const stepSize = .025
const maxDuration = 600

export function useRace() {
  const wind = useWind()
  const sail = useSail(course)
  const jury = useJury(course)
  const logbook = useLogbook()
  const status = ref<RaceStatus>('ready')
  const elapsed = ref(0)
  const released = ref(false)
  const releasedAt = ref<number | null>(null)
  const windLegs = ref<WindLeg[]>([])
  const focus = ref<Point | null>(null)
  let windStoryLogged = false
  const live = computed<Sample>(() => ({
    time: elapsed.value,
    boat: sail.boat.value,
    wind: wind.sample(elapsed.value, sail.boat.value.position, sail.boat.value.heading),
    nextGate: jury.nextGate.value,
    penalty: jury.penalty.value,
  }))
  const frame = computed(() => logbook.frame.value ?? live.value)
  const trail = computed(() => (logbook.selected.value?.samples ?? logbook.samples.value).map(sample => sample.boat.position))
  const active = computed(() => status.value === 'running' || status.value === 'paused')
  let animation = 0, last = 0, pending = 0
  function reset() {
    status.value = 'ready'
    elapsed.value = pending = 0
    released.value = false
    releasedAt.value = null
    windLegs.value = []
    windStoryLogged = false
    focus.value = null
    logbook.selected.value = null
    logbook.samples.value = []
    sail.reset()
    jury.reset()
  }
  function start() {
    const mode = wind.mode.value
    reset()
    wind.set(mode)
    status.value = 'running'
    jury.add('start', '出发', 0, sail.boat.value.position)
    logbook.record(live.value, true)
  }
  function release() {
    if (status.value !== 'running' || released.value) return
    released.value = true
    releasedAt.value = elapsed.value
    jury.add('start', '放行 · 开始移动', elapsed.value, sail.boat.value.position)
    logbook.record(live.value, true)
  }
  function togglePause() {
    if (status.value === 'running') { status.value = 'paused'; sail.steer(0) }
    else if (status.value === 'paused') status.value = 'running'
    pending = 0
  }
  function end(result: 'abandoned' | 'finished') {
    if (!active.value) return
    if (result === 'abandoned') jury.add('abandon', '结束航次', elapsed.value, sail.boat.value.position)
    logbook.record(live.value, true)
    logbook.archive({
      courseId: course.id, windMode: wind.mode.value, status: result,
      duration: elapsed.value, penalty: jury.penalty.value, events: [...jury.events.value],
      releasedAt: releasedAt.value,
      windLegs: windLegs.value.map(leg => ({ ...leg, milestones: leg.milestones.map(point => ({ ...point })) })),
    })
    status.value = result
  }
  function rememberWindStory() {
    if (windStoryLogged) return
    const story = findWindStory(windLegs.value, releasedAt.value)
    if (!story || story.recoverySeconds === undefined) return
    windStoryLogged = true
    jury.add('wind', '风带航段 · 横风→叠合低风→顺风', story.start, story.position)
  }
  function tick() {
    const time = elapsed.value

    // The start signal and release are separate: the clock and moving belts
    // continue before release, while the boat and its controls remain fixed in place.
    if (!released.value) {
      const result = advanceStationaryStep(sail.boat.value, time, stepSize, wind.mode.value)
      sail.boat.value = result.boat
      windLegs.value = ingestSlices(windLegs.value, result.slices, false)
      elapsed.value = time + stepSize
      logbook.record(live.value)
      if (elapsed.value >= maxDuration) end('abandoned')
      return
    }

    const from = sail.boat.value
    const previousEvent = jury.events.value.at(-1)
    const result = advanceBoatStep(from, time, stepSize, wind.mode.value)
    const verdict = jury.inspect(from.position, result.boat.position, time, stepSize)

    if (verdict.finish) {
      const finishDt = Math.max(0, verdict.finish.time - time)
      const finishStep = advanceBoatStep(from, time, finishDt, wind.mode.value)
      windLegs.value = ingestSlices(windLegs.value, finishStep.slices, true)
      sail.boat.value = { ...finishStep.boat, position: verdict.finish.position }
      elapsed.value = verdict.finish.time
      rememberWindStory()
      end('finished')
      return
    }

    if (verdict.blocked) {
      sail.boat.value = { ...result.boat, position: from.position, knots: 0 }
      const stationary = advanceStationaryStep(from, time, stepSize, wind.mode.value)
      windLegs.value = ingestSlices(windLegs.value, stationary.slices, false)
    } else {
      sail.boat.value = result.boat
      windLegs.value = ingestSlices(windLegs.value, result.slices, true)
    }

    elapsed.value = time + stepSize
    rememberWindStory()

    const event = jury.events.value.at(-1)
    if (event && event !== previousEvent && event.kind === 'mark' && event.time < elapsed.value) {
      logbook.record({ ...live.value, time: event.time, wind: wind.sample(event.time, event.position, sail.boat.value.heading),
        boat: { ...result.boat, position: event.position } }, true)
    }
    logbook.record(live.value, event?.time === elapsed.value)
    if (elapsed.value >= maxDuration) end('abandoned')
  }
  function loop(now: number) {
    if (last && status.value === 'running') {
      pending += Math.min(.2, (now - last) / 1000)
      while (pending >= stepSize && status.value === 'running') {
        pending -= stepSize
        tick()
      }
    }
    last = now
    animation = requestAnimationFrame(loop)
  }
  function keydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLElement && event.target.matches('input, select, button, textarea')) return
    if (status.value !== 'running') return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      sail.steer(event.key === 'ArrowLeft' ? -1 : 1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      sail.sheet(sail.boat.value.sheet + (event.key === 'ArrowUp' ? 2 : -2))
    }
  }
  function keyup(event: KeyboardEvent) {
    const releasedRudder = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (releasedRudder && sail.boat.value.rudder === releasedRudder) sail.steer(0)
  }
  function suspend() { if (status.value === 'running') togglePause() }
  function locate(event: RaceEvent) {
    focus.value = event.position
    if (logbook.selected.value) {
      logbook.seek(event.time)
    } else if (!active.value && logbook.voyages.value[0]) {
      logbook.open(logbook.voyages.value[0].id)
      logbook.seek(event.time)
    }
  }
  onMounted(() => {
    animation = requestAnimationFrame(loop)
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', suspend)
  })
  onUnmounted(() => {
    cancelAnimationFrame(animation)
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('keyup', keyup)
    window.removeEventListener('blur', suspend)
  })
  return { course, wind, sail, jury, logbook, status, elapsed, released, releasedAt, windLegs, focus, frame, trail, active, start, release, togglePause, end, locate }
}
