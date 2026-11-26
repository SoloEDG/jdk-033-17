import { axis, dot, normalize, subtract } from '../../../shared/math'
import type { Point, Wind, WindComponent } from '../../../shared/race'

export interface GustBand {
  id: string
  name: string
  role: 'cross' | 'tail'
  bearing: number
  knots: number
  /** Bearing of the strip normal; signed exposure is measured along this axis. */
  normalBearing: number
  origin: Point
  offset: number
  halfWidth: number
  /** Signed centre-line speed along the normal, px / race second. */
  drift: number
  color: string
}

const START: Point = { x: 125, y: 469 }
const COURSE_BEARING = -32

interface AlongBandConfig {
  id: string
  name: string
  role: 'cross' | 'tail'
  bearing: number
  knots: number
  normalBearing?: number
  converge?: Point
  /** Centre and half-width measured as distance along the initial course line. */
  centerDistance: number
  halfDistance: number
  driftDistance: number
  color: string
}

function normalTowardConvergence(centerDistance: number, converge: Point): number {
  const routePoint = {
    x: START.x + axis(COURSE_BEARING).x * centerDistance,
    y: START.y + axis(COURSE_BEARING).y * centerDistance,
  }
  const alongBearing = normalize(Math.atan2(converge.y - routePoint.y, converge.x - routePoint.x) * 180 / Math.PI)
  let normalBearing = alongBearing - 90
  if (dot(axis(COURSE_BEARING), axis(normalBearing)) < 0) normalBearing += 180
  return normalize(normalBearing)
}

function alongCourseBand(config: AlongBandConfig): GustBand {
  const normalBearing = config.normalBearing ?? normalTowardConvergence(config.centerDistance, config.converge!)
  const projection = dot(axis(COURSE_BEARING), axis(normalBearing))
  return {
    id: config.id,
    name: config.name,
    role: config.role,
    bearing: config.bearing,
    knots: config.knots,
    normalBearing,
    origin: { ...START },
    offset: projection * config.centerDistance,
    halfWidth: projection * config.halfDistance,
    drift: projection * config.driftDistance,
    color: config.color,
  }
}

const overlapFocus: Point = { x: 360, y: 390 }

/**
 * Deterministic moving belts for the Needle Bay opening reach.
 *
 * The first belt is a beam wind.  The second is a broad/favourable belt.
 * Their source vectors are 160° apart, so their overlap can cancel to a wind
 * lighter than either belt.  The normals are deliberately not parallel: the
 * belts visibly cross instead of being nested parallel rectangles.
 */
export const gustBands: GustBand[] = [
  alongCourseBand({
    id: 'beam',
    name: '横风带',
    role: 'cross',
    bearing: 248,
    knots: 16,
    converge: overlapFocus,
    centerDistance: 130,
    halfDistance: 111,
    driftDistance: -3,
    color: '#65d3ff',
  }),
  alongCourseBand({
    id: 'reach',
    name: '顺风带',
    role: 'tail',
    bearing: 88,
    knots: 22,
    converge: overlapFocus,
    centerDistance: 300,
    halfDistance: 160,
    driftDistance: 1,
    color: '#8de58c',
  }),
]

export function bandNormal(band: GustBand): Point {
  return axis(band.normalBearing)
}

export function bandCenter(band: GustBand, time: number): Point {
  const normal = bandNormal(band)
  const signed = band.offset + band.drift * time
  return {
    x: band.origin.x + normal.x * signed,
    y: band.origin.y + normal.y * signed,
  }
}

/** Anchor the name on the original course-line intersection with the belt centre. */
export function bandLabelPosition(band: GustBand, time: number): Point {
  const courseAxis = axis(COURSE_BEARING)
  const projection = dot(courseAxis, bandNormal(band))
  const distance = projection === 0 ? 0 : (band.offset + band.drift * time) / projection
  return { x: START.x + courseAxis.x * distance, y: START.y + courseAxis.y * distance }
}

export function bandSignedDistance(band: GustBand, position: Point, time: number): number {
  const normal = bandNormal(band)
  return dot(subtract(position, band.origin), normal) - band.offset - band.drift * time
}

export function isInsideBand(band: GustBand, position: Point, time: number): boolean {
  return Math.abs(bandSignedDistance(band, position, time)) <= band.halfWidth
}

export function bandPolygonPoints(band: GustBand, time: number, length = 1800): Point[] {
  const normal = bandNormal(band)
  const along = axis(band.normalBearing + 90)
  const center = bandCenter(band, time)
  const halfLength = length / 2
  return [
    { x: center.x + normal.x * band.halfWidth + along.x * halfLength, y: center.y + normal.y * band.halfWidth + along.y * halfLength },
    { x: center.x - normal.x * band.halfWidth + along.x * halfLength, y: center.y - normal.y * band.halfWidth + along.y * halfLength },
    { x: center.x - normal.x * band.halfWidth - along.x * halfLength, y: center.y - normal.y * band.halfWidth - along.y * halfLength },
    { x: center.x + normal.x * band.halfWidth - along.x * halfLength, y: center.y + normal.y * band.halfWidth - along.y * halfLength },
  ]
}

export function polygonString(points: Point[]): string {
  return points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
}

/** Intersection of the two moving centre lines; also the overlap centre. */
export function bandIntersection(a: GustBand, b: GustBand, time: number): Point | null {
  const na = bandNormal(a)
  const nb = bandNormal(b)
  const rhsA = dot(a.origin, na) + a.offset + a.drift * time
  const rhsB = dot(b.origin, nb) + b.offset + b.drift * time
  const determinant = na.x * nb.y - na.y * nb.x
  if (Math.abs(determinant) < 1e-8) return null
  return {
    x: (rhsA * nb.y - na.y * rhsB) / determinant,
    y: (na.x * rhsB - rhsA * nb.x) / determinant,
  }
}

/** Add incoming-wind vectors.  Using source vectors or velocity vectors gives the same magnitude. */
export function composeWindVectors(parts: Wind[]): Wind {
  let x = 0
  let y = 0
  for (const part of parts) {
    const vector = axis(part.bearing)
    x += vector.x * part.knots
    y += vector.y * part.knots
  }
  const knots = Math.hypot(x, y)
  if (knots < 1e-6) return { bearing: 0, knots: 0 }
  return { bearing: normalize(Math.atan2(y, x) * 180 / Math.PI), knots }
}

export function activeBands(position: Point, time: number): GustBand[] {
  return gustBands.filter(band => isInsideBand(band, position, time))
}

export function windComponentsFor(position: Point, time: number): WindComponent[] {
  return activeBands(position, time).map(band => ({
    bandId: band.id,
    label: band.name,
    bearing: band.bearing,
    knots: band.knots,
  }))
}
