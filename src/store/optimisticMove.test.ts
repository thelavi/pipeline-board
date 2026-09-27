import { beforeEach, describe, expect, it } from 'vitest'
import { useBoardStore } from './board.store'
import type { Opportunity, Stage } from '../mockApi'

const STAGES: Stage[] = [
  { id: 's1', name: 'Stage 1', order: 0 },
  { id: 's2', name: 'Stage 2', order: 1 },
]

function opp(id: string, stageId: string): Opportunity {
  return { id, name: id, value: 100, status: 'open', owner: 'x', updatedAt: 0, stageId, version: 1 }
}

beforeEach(() => {
  useBoardStore.getState().hydrate(STAGES, {
    s1: [opp('a', 's1'), opp('b', 's1'), opp('c', 's1'), opp('d', 's1')],
    s2: [],
  })
})

describe('rollbackMove', () => {
  it('reinserts next to the recorded neighbor and reverses stageAgg deltas, even after a concurrent stream delete shifts the raw index', () => {
    const store = () => useBoardStore.getState()

    store().beginOptimisticMove('c', 's2') // neighbor of 'c' recorded as 'b'
    store().applyStreamDelete('a', 's1') // shifts what a raw index would now point to
    store().rollbackMove('c')

    expect(store().orderByStage.get('s1')).toEqual(['b', 'c', 'd'])
    expect(store().orderByStage.get('s2')).toEqual([])
    expect(store().getStageAgg('s1')).toEqual({ count: 3, totalValue: 300 })
    expect(store().getStageAgg('s2')).toEqual({ count: 0, totalValue: 0 })
  })

  it('falls back to a clamped index without crashing or losing the card when its neighbor is also removed', () => {
    const store = () => useBoardStore.getState()

    store().beginOptimisticMove('c', 's2') // neighbor of 'c' recorded as 'b'
    store().applyStreamDelete('b', 's1') // the neighbor itself disappears

    expect(() => store().rollbackMove('c')).not.toThrow()

    const s1 = store().orderByStage.get('s1') ?? []
    expect(s1).toContain('c')
    expect(s1).not.toContain('b')
  })
})
