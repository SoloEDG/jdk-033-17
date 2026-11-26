import { normalize } from '../../../shared/math'
import type { Point, SampleWind, WindMode } from '../../../shared/race'
import { composeWindVectors, windComponentsFor } from './bands'
import { withWindPhase } from './classify'

export function steadyWindAt(): SampleWind {
  return { bearing: 265, knots: 15, bandIds: [], components: [] }
}

export function ambientWindAt(time: number): SampleWind {
  return {
    bearing: normalize(265 + 18 * Math.sin(time / 6.7) + 7 * Math.sin(time / 2.7)),
    knots: 8 + 1.4 * Math.sin(time / 4.8) + 0.6 * Math.sin(time / 1.9),
    bandIds: [],
    components: [],
    phase: 'ambient',
  }
}

/**
 * Back-compat one-argument sample.  Race and UI code should pass the boat
 * position because shifting wind is now carried by moving spatial belts.
 */
export function windAt(time: number, mode: WindMode): SampleWind
export function windAt(time: number, mode: WindMode, position: Point, heading?: number): SampleWind
export function windAt(time: number, mode: WindMode, position?: Point, heading?: number): SampleWind {
  if (mode === 'steady') {
    const wind = steadyWindAt()
    return heading === undefined ? wind : withWindPhase(wind, heading)
  }

  // Preserve the old global time-series for callers that do not provide a place.
  if (!position) {
    return {
      bearing: normalize(265 + 25 * Math.sin(time / 5.8) + 11 * Math.sin(time / 2.1)),
      knots: 15 + 3 * Math.sin(time / 4.8) + 1.2 * Math.sin(time / 1.7),
      bandIds: [],
      components: [],
    }
  }

  const components = windComponentsFor(position, time)
  const field = components.length
    ? { ...composeWindVectors(components), bandIds: components.map(component => component.bandId), components }
    : ambientWindAt(time)
  return heading === undefined ? field : withWindPhase(field, heading)
}
