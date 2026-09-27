import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useBoardStore } from './board.store'
import type { Opportunity, Stage } from '../mockApi'

const STAGES: Stage[] = [
  { id: 's1', name: 'Stage 1', order: 0 },
  { id: 's2', name: 'Stage 2', order: 1 },
  { id: 's3', name: 'Stage 3', order: 2 },
]

function opp(id: string, stageId: string): Opportunity {
  return { id, name: id, value: 100, status: 'open', owner: 'x', updatedAt: 0, stageId, version: 1 }
}

beforeEach(() => {
  useBoardStore.getState().hydrate(STAGES, {
    s1: [opp('a', 's1'), opp('b', 's1')],
    s2: [],
    s3: [],
  })
})

afterEach(() => {
  // hydrate() only resets opportunity/order/agg/pending state, not draggingId — the real
  // app never calls hydrate a second time mid-drag, but a leftover draggingId across tests
  // in this file would silently protect the next test's target card from every stream event.
  useBoardStore.getState().setDraggingId(null)
})

describe('isProtectedFromStream guard', () => {
  it.each([
    ['a pending optimistic move', () => useBoardStore.getState().beginOptimisticMove('a', 's2')],
    ['an active drag', () => useBoardStore.getState().setDraggingId('a')],
  ])('drops a stream edit and a stream delete for a card under %s', (_label, makeProtected) => {
    makeProtected()
    const protectedOpp = useBoardStore.getState().opportunitiesById.get('a')!

    useBoardStore.getState().applyStreamEdit({ ...protectedOpp, value: 999, version: protectedOpp.version + 1 })
    expect(useBoardStore.getState().opportunitiesById.get('a')?.value).toBe(protectedOpp.value)

    useBoardStore.getState().applyStreamDelete('a', protectedOpp.stageId)
    expect(useBoardStore.getState().opportunitiesById.has('a')).toBe(true)
  })
})

describe('version gate', () => {
  it('drops a stale stream event and applies a strictly newer one', () => {
    const current = useBoardStore.getState().opportunitiesById.get('a')!

    useBoardStore.getState().applyStreamEdit({ ...current, value: 555, version: current.version })
    expect(useBoardStore.getState().opportunitiesById.get('a')?.value).toBe(100)

    useBoardStore.getState().applyStreamEdit({ ...current, value: 555, version: current.version + 1 })
    expect(useBoardStore.getState().opportunitiesById.get('a')?.value).toBe(555)
  })
})

describe('array reference isolation', () => {
  it('leaves an untouched stage\'s order array reference intact when a stream move only touches two other stages', () => {
    const s3Before = useBoardStore.getState().orderByStage.get('s3')
    const a = useBoardStore.getState().opportunitiesById.get('a')!

    useBoardStore.getState().applyStreamMove({ ...a, stageId: 's2', version: a.version + 1 }, 's1')

    expect(useBoardStore.getState().orderByStage.get('s3')).toBe(s3Before)
    expect(useBoardStore.getState().orderByStage.get('s1')).toEqual(['b'])
    expect(useBoardStore.getState().orderByStage.get('s2')).toEqual(['a'])
  })
})
