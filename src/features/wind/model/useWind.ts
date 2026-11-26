import { ref } from 'vue'
import type { Point, WindMode } from '../../../shared/race'
import { windAt } from '../lib/forecast'

export function useWind() {
  const mode = ref<WindMode>('shifting')
  const sample = (time: number, position?: Point, heading?: number) =>
    position ? windAt(time, mode.value, position, heading) : windAt(time, mode.value)
  const set = (next: WindMode) => { mode.value = next }
  return { mode, sample, set }
}
