export interface Point { x: number; y: number }

export interface Gate {
  id: string
  name: string
  center: Point
  bearing: number
  width: number
  buoySide: -1 | 1
  approach?: { center: Point; bearing: number; width: number }
}

export interface Course {
  id: string
  name: string
  size: Point
  start: Point
  heading: number
  gates: Gate[]
  hazards: { id: string; center: Point; radius: number }[]
}

export type WindMode = 'steady' | 'shifting'
export type WindPhase = 'ambient' | 'head' | 'cross' | 'overlap' | 'tail'
export interface Wind { bearing: number; knots: number }
export interface WindComponent extends Wind { bandId: string; label: string }
export interface SampleWind extends Wind {
  bandIds?: string[]
  components?: WindComponent[]
  phase?: WindPhase
  lowWind?: boolean
}
export interface Boat { position: Point; heading: number; knots: number; sheet: number; rudder: number; load?: number }
export type RaceStatus = 'ready' | 'running' | 'paused' | 'finished' | 'abandoned'
export type EventKind = 'start' | 'mark' | 'collision' | 'deviation' | 'finish' | 'abandon' | 'wind'
export interface RaceEvent {
  id: string
  time: number
  kind: EventKind
  position: Point
  label: string
  penalty: number
}
export interface Sample {
  time: number
  boat: Boat
  wind: SampleWind
  nextGate: number
  penalty: number
}
export interface SpeedMilestone { knots: number; time: number }
export interface WindLeg {
  id: string
  phase: WindPhase
  label: string
  start: number
  end: number
  startPosition: Point
  endPosition: Point
  bandIds: string[]
  moving: boolean
  windBearing: number
  windKnots: number
  componentKnots: number[]
  lowWind: boolean
  boatSpeedStart: number
  boatSpeedEnd: number
  boatSpeedMax: number
  heading: number
  sheet: number
  relativeWindAngle: number
  sailLoadAverage: number
  sailLoadMaximum: number
  gainKnots?: number
  gainSeconds?: number
  milestones: SpeedMilestone[]
}
export interface WindStory {
  id: string
  kind: 'cross-overlap-tail'
  title: string
  start: number
  end: number
  position: Point
  crossLegId: string
  overlapLegId: string
  tailLegId: string
  crossSeconds: number
  overlapSeconds: number
  tailSeconds: number
  totalSeconds: number
  releasedAt?: number | null
  sailingSecondsFromRelease?: number | null
  waitSeconds: number
  crossWindKnots: number
  overlapWindKnots: number
  tailWindKnots: number
  crossLoad: number
  overlapLoad: number
  tailLoad: number
  speedBeforeOverlap: number
  overlapExitSpeed: number
  tailEntrySpeed: number
  tailGainKnots: number
  tailGainSeconds?: number
  recoveryKnots: number
  recoverySeconds?: number
  summary: string
  sailExplanation: string
  timingExplanation: string
}
export interface Voyage {
  id: string
  date: string
  courseId: string
  windMode: WindMode
  status: 'finished' | 'abandoned'
  duration: number
  penalty: number
  samples: Sample[]
  events: RaceEvent[]
  releasedAt?: number | null
  windLegs?: WindLeg[]
}
