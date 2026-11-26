import type { Boat, SampleWind, WindMode } from '../../../shared/race'
import { bandSignedDistance, gustBands } from '../../wind/lib/bands'
import { windAt } from '../../wind/lib/forecast'
import { advanceBoat } from './dynamics'
import { sailProfile } from './performance'

export interface MotionSlice {
  start: number
  end: number
  from: Boat
  to: Boat
  wind: SampleWind
  load: number
}

export interface FieldStep {
  boat: Boat
  slices: MotionSlice[]
}

interface BoundaryRoot {
  tau: number
  bandId: string
  edge: -1 | 1
}

function makeSlice(start: number, end: number, from: Boat, to: Boat, wind: SampleWind): MotionSlice {
  const load = sailProfile(to, wind).loadPercent
  return { start, end, from, to: { ...to, load }, wind, load }
}

/**
 * Find the first moving belt boundary crossed by the accelerated trajectory.
 * Every residual evaluation rebuilds the state from the current state, so a
 * changing speed is not collapsed into one straight constant-speed segment.
 */
function findNextBoundary(boat: Boat, wind: SampleWind, time: number, dt: number, mode: WindMode): BoundaryRoot | null {
  if (mode !== 'shifting' || dt <= 0) return null
  const sampleCount = Math.max(16, Math.ceil(dt / 0.004))
  let best: BoundaryRoot | null = null

  const residual = (bandId: string, edge: number, tau: number) => {
    const band = gustBands.find(item => item.id === bandId)!
    const predicted = advanceBoat(boat, wind, tau)
    return bandSignedDistance(band, predicted.position, time + tau) - edge
  }

  for (const band of gustBands) {
    for (const edgeSide of [-1, 1] as const) {
      const edge = edgeSide * band.halfWidth
      let previousTau = 0
      let previousResidual = residual(band.id, edge, 0)

      for (let index = 1; index <= sampleCount; index += 1) {
        const previous = index === 1 ? previousResidual : residual(band.id, edge, previousTau)
        const tau = (dt * index) / sampleCount
        const current = residual(band.id, edge, tau)
        const crosses = Number.isFinite(current) && Number.isFinite(previous) &&
          (previous === 0 || current === 0 || Math.sign(previous) !== Math.sign(current))
        if (crosses) {
          let lower = previousTau
          let upper = tau
          let lowerValue = previous
          if (lower !== 0 && previous !== 0) {
            for (let iteration = 0; iteration < 28; iteration += 1) {
              const middle = (lower + upper) / 2
              const middleValue = residual(band.id, edge, middle)
              if (lowerValue * middleValue <= 0) {
                upper = middle
              } else {
                lower = middle
                lowerValue = middleValue
              }
            }
          }
          const root = previous === 0 ? previousTau : current === 0 ? tau : (lower + upper) / 2
          if (root > 1e-7 && root < dt && (!best || root < best.tau)) {
            best = { tau: root, bandId: band.id, edge: edgeSide }
          }
        }
        previousTau = tau
        previousResidual = current
      }
    }
  }
  return best
}

/**
 * Integrate one fixed race tick, reopening the exposure interval after every
 * belt boundary.  This is the entry point used by the race loop.
 */
export function advanceBoatStep(boat: Boat, time: number, dt: number, mode: WindMode): FieldStep {
  let current = boat
  let start = time
  let remaining = dt
  const slices: MotionSlice[] = []
  let guard = 0

  while (remaining > 1e-6 && guard < 64) {
    guard += 1
    const wind = windAt(start, mode, current.position, current.heading)
    const boundary = findNextBoundary(current, wind, start, remaining, mode)
    let duration = boundary ? boundary.tau : remaining

    if (!Number.isFinite(duration) || duration <= 1e-7) {
      duration = Math.min(1e-4, remaining)
    }

    const end = start + duration
    const next = advanceBoat(current, wind, duration)
    slices.push(makeSlice(start, end, current, next, wind))
    current = next
    start = end
    remaining -= duration

    if (!boundary) break
  }

  if (remaining > 1e-6) {
    const wind = windAt(start, mode, current.position, current.heading)
    const end = start + remaining
    const next = advanceBoat(current, wind, remaining)
    slices.push(makeSlice(start, end, current, next, wind))
    current = next
  }

  return { boat: current, slices }
}

/** Exact moving-boundary splits while the boat is held at the start or blocked. */
export function advanceStationaryStep(boat: Boat, time: number, dt: number, mode: WindMode): FieldStep {
  const roots: number[] = []
  if (mode === 'shifting') {
    for (const band of gustBands) {
      const distance = bandSignedDistance(band, boat.position, time)
      for (const edge of [-band.halfWidth, band.halfWidth]) {
        if (band.drift === 0) continue
        const tau = (distance - edge) / band.drift
        if (tau > 1e-7 && tau < dt - 1e-7) roots.push(tau)
      }
    }
  }
  roots.sort((a, b) => a - b)
  const uniqueRoots = roots.filter((root, index) => index === 0 || Math.abs(root - roots[index - 1]) > 1e-6)
  const cuts = [0, ...uniqueRoots, dt]
  const slices: MotionSlice[] = []
  let current = boat

  for (let index = 0; index < cuts.length - 1; index += 1) {
    const start = time + cuts[index]
    const end = time + cuts[index + 1]
    const duration = end - start
    if (duration <= 1e-7) continue
    const wind = windAt(start + duration / 2, mode, boat.position, boat.heading)
    const held: Boat = { ...boat, knots: 0, load: sailProfile(boat, wind).loadPercent }
    slices.push(makeSlice(start, end, current, held, wind))
    current = held
  }

  const finalBoat = slices.at(-1)?.to ?? { ...boat, knots: 0 }
  return { boat: finalBoat, slices }
}
