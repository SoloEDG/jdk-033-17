import { angleDelta, clamp, radians } from '../../../shared/math'
import type { Boat, Wind } from '../../../shared/race'

export interface SailProfile {
  relativeAngle: number
  preferredSheet: number
  trim: number
  lift: number
  targetKnots: number
  loadPercent: number
}

/**
 * Shared sail-response model.  The load index is proportional to dynamic
 * pressure (kn²), beam-wind incidence and how usable the sheet trim is.
 */
export function sailProfile(boat: Pick<Boat, 'heading' | 'sheet'>, wind: Wind): SailProfile {
  const relativeAngle = Math.abs(angleDelta(boat.heading, wind.bearing))
  const preferredSheet = clamp((relativeAngle - 37) * 0.55, 9, 78)
  const trim = Math.max(0.08, 1 - Math.abs(boat.sheet - preferredSheet) / 69)
  const lift = clamp((relativeAngle - 32) / 45, 0, 1) * (1 - Math.max(0, relativeAngle - 110) / 180)
  const targetKnots = 0.65 + wind.knots * 1.03 * lift * trim

  const pressure = clamp((wind.knots / 18) ** 2, 0.04, 1)
  const incidence = 0.45 + 0.55 * Math.sin(radians(relativeAngle))
  const trimLoad = 0.65 + 0.35 * trim
  const loadPercent = clamp(100 * pressure * incidence * trimLoad, 3, 100)

  return { relativeAngle, preferredSheet, trim, lift, targetKnots, loadPercent }
}
