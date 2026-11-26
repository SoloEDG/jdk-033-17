import { angleDelta, clamp, mix } from '../../../shared/math'
import type { Sample, WindLeg, WindStory } from '../../../shared/race'
import type { MotionSlice } from '../../sail/lib/integrate'
import { sailProfile } from '../../sail/lib/performance'
import { phaseLabel, withWindPhase } from './classify'

const GAIN_KNOTS = 4

function seconds(value: number): string {
  return `${Math.max(0, value).toFixed(1)} s`
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10
}

function signature(phase: string, bandIds: string[], moving: boolean): string {
  return `${moving ? 'sailing' : 'stationary'}:${phase}:${[...bandIds].sort().join('+')}`
}

function legSignature(leg: WindLeg): string {
  return signature(leg.phase, leg.bandIds, leg.moving)
}

function milestonesForSlice(existing: WindLeg['milestones'], slice: MotionSlice): WindLeg['milestones'] {
  const milestones = [...existing]
  const known = new Set(milestones.map(item => item.knots))
  const firstThreshold = Math.floor(slice.from.knots) + 1
  for (let threshold = firstThreshold; threshold <= slice.to.knots + 1e-6; threshold += 1) {
    if (known.has(threshold)) continue
    let time = slice.end
    if (slice.to.knots > slice.from.knots) {
      const fraction = clamp((threshold - slice.from.knots) / (slice.to.knots - slice.from.knots), 0, 1)
      time = mix(slice.start, slice.end, fraction)
    }
    milestones.push({ knots: threshold, time })
    known.add(threshold)
  }
  return milestones.sort((a, b) => a.knots - b.knots)
}

export function timeForSpeed(leg: WindLeg, target: number): number | null {
  if (target <= leg.boatSpeedStart + 1e-6) return leg.start
  if (target > leg.boatSpeedMax + 1e-6) return null
  const points = [
    { knots: leg.boatSpeedStart, time: leg.start },
    ...leg.milestones,
    { knots: leg.boatSpeedEnd, time: leg.end },
  ].sort((a, b) => a.knots - b.knots)

  const rightIndex = points.findIndex(point => point.knots + 1e-6 >= target)
  if (rightIndex <= 0) return points[0]?.time ?? null
  const left = points[rightIndex - 1]
  const right = points[rightIndex]
  if (right.knots === left.knots) return right.time
  return mix(left.time, right.time, clamp((target - left.knots) / (right.knots - left.knots), 0, 1))
}

function createLeg(slice: MotionSlice, index: number, moving: boolean): WindLeg {
  const relativeWindAngle = Math.abs(angleDelta(slice.to.heading, slice.wind.bearing))
  const leg: WindLeg = {
    id: `wind-leg-${index}`,
    phase: slice.wind.phase ?? 'ambient',
    label: phaseLabel(slice.wind.phase, slice.wind.lowWind),
    start: slice.start,
    end: slice.end,
    startPosition: { ...slice.from.position },
    endPosition: { ...slice.to.position },
    bandIds: [...(slice.wind.bandIds ?? [])],
    moving,
    windBearing: slice.wind.bearing,
    windKnots: slice.wind.knots,
    componentKnots: slice.wind.components?.map(component => component.knots) ?? [],
    lowWind: Boolean(slice.wind.lowWind),
    boatSpeedStart: slice.from.knots,
    boatSpeedEnd: slice.to.knots,
    boatSpeedMax: Math.max(slice.from.knots, slice.to.knots),
    heading: slice.to.heading,
    sheet: slice.to.sheet,
    relativeWindAngle,
    sailLoadAverage: slice.load,
    sailLoadMaximum: slice.load,
    milestones: [],
  }
  leg.milestones = milestonesForSlice([], slice)
  const gainTime = timeForSpeed(leg, leg.boatSpeedStart + GAIN_KNOTS)
  if (gainTime !== null) {
    leg.gainKnots = GAIN_KNOTS
    leg.gainSeconds = gainTime - leg.start
  }
  return leg
}

function appendSlice(leg: WindLeg, slice: MotionSlice): WindLeg {
  const oldDuration = Math.max(1e-6, leg.end - leg.start)
  const sliceDuration = Math.max(0, slice.end - slice.start)
  const totalDuration = oldDuration + sliceDuration
  const sailLoadAverage = (leg.sailLoadAverage * oldDuration + slice.load * sliceDuration) / totalDuration
  const updated: WindLeg = {
    ...leg,
    end: slice.end,
    endPosition: { ...slice.to.position },
    windBearing: slice.wind.bearing,
    windKnots: slice.wind.knots,
    componentKnots: slice.wind.components?.map(component => component.knots) ?? leg.componentKnots,
    lowWind: leg.lowWind || Boolean(slice.wind.lowWind),
    boatSpeedEnd: slice.to.knots,
    boatSpeedMax: Math.max(leg.boatSpeedMax, slice.to.knots),
    heading: slice.to.heading,
    sheet: slice.to.sheet,
    relativeWindAngle: Math.abs(angleDelta(slice.to.heading, slice.wind.bearing)),
    sailLoadAverage,
    sailLoadMaximum: Math.max(leg.sailLoadMaximum, slice.load),
    milestones: [],
  }
  updated.milestones = milestonesForSlice(leg.milestones, slice)
  const gainTime = timeForSpeed(updated, updated.boatSpeedStart + GAIN_KNOTS)
  if (gainTime !== null) {
    updated.gainKnots = GAIN_KNOTS
    updated.gainSeconds = gainTime - updated.start
  }
  return updated
}

/** Merge physics slices into disjoint wind-exposure ranges. */
export function ingestSlices(legs: WindLeg[], slices: MotionSlice[], moving: boolean): WindLeg[] {
  let result = [...legs]
  for (const slice of slices) {
    const nextSignature = signature(slice.wind.phase ?? 'ambient', slice.wind.bandIds ?? [], moving)
    const last = result.at(-1)
    if (last && legSignature(last) === nextSignature) {
      result = [...result.slice(0, -1), appendSlice(last, slice)]
    } else {
      result = [...result, createLeg(slice, result.length + 1, moving)]
    }
  }
  return result
}

/** Reconstruct ranges for stored voyages that predate explicit windLegs. */
export function legsFromSamples(samples: Sample[]): WindLeg[] {
  let legs: WindLeg[] = []
  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1]
    const to = samples[index]
    if (to.time <= from.time) continue
    const wind = withWindPhase(to.wind, to.boat.heading)
    const load = to.boat.load ?? sailProfile(to.boat, to.wind).loadPercent
    const slice: MotionSlice = {
      start: from.time,
      end: to.time,
      from: from.boat,
      to: to.boat,
      wind,
      load,
    }
    legs = ingestSlices(legs, [slice], true)
  }
  return legs
}

export function findWindStory(legs: WindLeg[], releasedAt?: number | null): WindStory | null {
  const sailing = legs.filter(leg => leg.moving !== false)
  for (let crossIndex = 0; crossIndex < sailing.length; crossIndex += 1) {
    const cross = sailing[crossIndex]
    if (cross.phase !== 'cross') continue
    const overlap = sailing.slice(crossIndex + 1).find(leg => leg.phase === 'overlap' && leg.start >= cross.start)
    if (!overlap) continue
    const overlapIndex = sailing.findIndex(leg => leg.id === overlap.id)
    const tail = sailing.slice(overlapIndex + 1).find(leg => leg.phase === 'tail' && leg.start >= overlap.start)
    if (!tail) continue

    const recoveryKnots = Math.max(cross.boatSpeedMax, overlap.boatSpeedStart, overlap.boatSpeedMax)
    const recoveryTime = timeForSpeed(tail, recoveryKnots)
    const gainTime = timeForSpeed(tail, tail.boatSpeedStart + GAIN_KNOTS)
    const end = recoveryTime ?? tail.end
    const waitSeconds = releasedAt ?? 0
    const totalSeconds = end - cross.start
    const minComponent = overlap.componentKnots.length >= 2 ? Math.min(...overlap.componentKnots) : overlap.windKnots

    const summary =
      `${seconds(cross.start)} 先进${cross.label}，来风 ${cross.windKnots.toFixed(1)} kn；` +
      `${seconds(overlap.start)} 进入两带叠合区，向量合成 ${overlap.windKnots.toFixed(1)} kn` +
      `（单带最小 ${minComponent.toFixed(1)} kn），形成低风坑；` +
      `${seconds(tail.start)} 追上${tail.label}，风带稳定在 ${tail.windKnots.toFixed(1)} kn。`

    const sailExplanation =
      `横风段相对舷角 ${Math.round(cross.relativeWindAngle)}°、实际帆角 ${Math.round(cross.sheet)}°，` +
      `平均帆载 ${rounded(cross.sailLoadAverage)}%、峰值 ${rounded(cross.sailLoadMaximum)}%；` +
      `叠合低风使平均帆载降到 ${rounded(overlap.sailLoadAverage)}%，船速由 ${overlap.boatSpeedStart.toFixed(1)} kn ` +
      `跌至 ${overlap.boatSpeedEnd.toFixed(1)} kn；顺风段帆载回升至 ${rounded(tail.sailLoadAverage)}%，` +
      `峰值 ${rounded(tail.sailLoadMaximum)}%。`

    const timingExplanation =
      `暴露范围已按风带边界断开：横风 ${seconds(cross.end - cross.start)}、` +
      `叠合低风 ${seconds(overlap.end - overlap.start)}、顺风段至恢复点 ${seconds(end - tail.start)}。` +
      `出低风区后 ${GAIN_KNOTS} kn 实际提升用时 ${gainTime === null ? '尚未达到' : seconds(gainTime - tail.start)}；` +
      `恢复到叠合前峰值 ${recoveryKnots.toFixed(1)} kn 用时 ` +
      `${recoveryTime === null ? '本航段尚未恢复' : seconds(recoveryTime - tail.start)}。` +
      `横风起点到速度恢复的实航用时为 ${seconds(totalSeconds)}；起点等待 ${seconds(waitSeconds)} 虽计入赛时，但不属于风带暴露时长。` +
      `放行后到恢复的赛时为 ${releasedAt === null || releasedAt === undefined ? '—' : seconds(end - releasedAt)}。`

    return {
      id: `story-${cross.id}-${overlap.id}-${tail.id}`,
      kind: 'cross-overlap-tail',
      title: '横风 → 叠合低风 → 顺风',
      start: cross.start,
      end,
      position: { ...cross.startPosition },
      crossLegId: cross.id,
      overlapLegId: overlap.id,
      tailLegId: tail.id,
      crossSeconds: cross.end - cross.start,
      overlapSeconds: overlap.end - overlap.start,
      tailSeconds: end - tail.start,
      totalSeconds,
      releasedAt: releasedAt ?? null,
      sailingSecondsFromRelease: releasedAt === null || releasedAt === undefined ? null : end - releasedAt,
      waitSeconds,
      crossWindKnots: cross.windKnots,
      overlapWindKnots: overlap.windKnots,
      tailWindKnots: tail.windKnots,
      crossLoad: cross.sailLoadAverage,
      overlapLoad: overlap.sailLoadAverage,
      tailLoad: tail.sailLoadAverage,
      speedBeforeOverlap: cross.boatSpeedMax,
      overlapExitSpeed: overlap.boatSpeedEnd,
      tailEntrySpeed: tail.boatSpeedStart,
      tailGainKnots: gainTime === null ? Math.max(0, tail.boatSpeedMax - tail.boatSpeedStart) : GAIN_KNOTS,
      tailGainSeconds: gainTime === null ? undefined : gainTime - tail.start,
      recoveryKnots,
      recoverySeconds: recoveryTime === null ? undefined : recoveryTime - tail.start,
      summary,
      sailExplanation,
      timingExplanation,
    }
  }
  return null
}
