import { axis, normalize } from '../../../shared/math'
import type { Boat, Wind } from '../../../shared/race'
import { sailProfile } from './performance'

export function advanceBoat(boat: Boat, wind: Wind, dt: number): Boat {
  const turn = boat.rudder * (26 + Math.min(boat.knots, 18))
  const heading = normalize(boat.heading + turn * dt)
  const profiledBoat = { ...boat, heading }
  const profile = sailProfile(profiledBoat, wind)
  const knots = boat.knots + (profile.targetKnots - boat.knots) * (1 - Math.exp(-dt * 1.45))
  const velocity = axis(heading)
  const travel = knots * 3.65 * dt
  return {
    ...boat,
    heading,
    knots,
    load: profile.loadPercent,
    position: { x: boat.position.x + velocity.x * travel, y: boat.position.y + velocity.y * travel },
  }
}
