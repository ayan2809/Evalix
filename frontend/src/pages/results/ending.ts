import type { RunDetail } from '../../api'
import { markWord, type MarkState } from '../../ui'
import { chipBadge } from './words'

/** How a run ended, as a mark and its plain word. A pass after we broke something is "Recovered". */
export function endingMark(run: Pick<RunDetail, 'ending' | 'fault_fired'>): { state: MarkState; word: string } {
  switch (chipBadge(run.ending, run.fault_fired)) {
    case 'Recovered':
      return { state: 'recovered', word: markWord('recovered') }
    case 'Pass':
      return { state: 'through', word: markWord('through') }
    case 'Fail':
      return run.ending === 'crashed' ? { state: 'crashed', word: markWord('crashed') } : { state: 'slipped', word: markWord('slipped') }
    case 'Setup problem':
      return { state: 'setup', word: markWord('setup') }
    default:
      return { state: 'running', word: markWord('running') }
  }
}
