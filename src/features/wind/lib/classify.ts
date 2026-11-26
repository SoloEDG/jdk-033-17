import { angleDelta } from '../../../shared/math'
import type { SampleWind, WindPhase } from '../../../shared/race'

export function relativeWindAngle(heading: number, bearing: number): number {
  return Math.abs(angleDelta(heading, bearing))
}

export function classifyWind(wind: Pick<SampleWind, 'bearing' | 'bandIds' | 'components'>, heading: number): WindPhase {
  const bandCount = wind.components?.length ?? wind.bandIds?.length ?? 0
  if (bandCount >= 2) return 'overlap'
  const angle = relativeWindAngle(heading, wind.bearing)
  if (angle >= 112) return 'tail'
  if (angle >= 48) return 'cross'
  if (angle <= 38) return 'head'
  return 'cross'
}

export function withWindPhase(wind: SampleWind, heading: number): SampleWind {
  if (wind.phase === 'ambient') return { ...wind, phase: 'ambient', lowWind: false }
  const phase = classifyWind(wind, heading)
  const componentKnots = wind.components?.map(component => component.knots) ?? []
  const lowWind = phase === 'overlap' && componentKnots.length >= 2 &&
    wind.knots + 1e-6 < Math.min(...componentKnots)
  return { ...wind, phase, lowWind }
}

export function phaseLabel(phase: WindPhase | undefined, lowWind?: boolean): string {
  if (phase === 'overlap') return lowWind ? '叠合低风区' : '风带叠合区'
  if (phase === 'cross') return '横风带'
  if (phase === 'tail') return '顺风带'
  if (phase === 'head') return '顶风区'
  return '阵风间隙'
}
