import { create } from 'zustand'
import type { Opportunity, Stage } from '../mockApi'

export interface StageAgg {
  count: number
  totalValue: number
}

interface PendingMove {
  fromStageId: string
  fromIndex: number
}

interface BoardState {
  stages: Stage[]
  opportunitiesById: Map<string, Opportunity>
  orderByStage: Map<string, string[]>
  stageAgg: Map<string, StageAgg>
  pendingMoves: Map<string, PendingMove>
  draggingId: string | null

  hydrate: (stages: Stage[], opportunitiesByStage: Record<string, Opportunity[]>) => void
  getStageAgg: (stageId: string) => StageAgg

  beginOptimisticMove: (id: string, toStageId: string) => void
  confirmMove: (id: string, opportunity: Opportunity) => void
  rollbackMove: (id: string) => void

  setDraggingId: (id: string | null) => void

  applyStreamMove: (opportunity: Opportunity, fromStageId: string) => void
  applyStreamEdit: (opportunity: Opportunity) => void
  applyStreamCreate: (opportunity: Opportunity) => void
  applyStreamDelete: (id: string, stageId: string) => void
}

function emptyAgg(): StageAgg {
  return { count: 0, totalValue: 0 }
}

/**
 * Every list mutation below returns a NEW array for the touched stage rather than
 * splicing in place. `orderByStage` is only shallow-copied (`new Map(orderByStage)`)
 * by callers, so the array objects are shared with the previous state until replaced
 * here — splicing in place would mutate that shared array and leave its reference
 * unchanged, which defeats Zustand's Object.is equality check for any component
 * subscribed to `orderByStage.get(stageId)` (the column would silently stop re-rendering
 * on reorder while its header's count/total, backed by a separately-replaced Map, kept
 * updating correctly — a real desync this store must never produce).
 */
function withRemoved(list: string[], id: string): { list: string[]; index: number } {
  const index = list.indexOf(id)
  if (index === -1) return { list, index: -1 }
  const next = list.slice()
  next.splice(index, 1)
  return { list: next, index }
}

function withInserted(list: string[], id: string, index: number): string[] {
  const next = list.slice()
  const clampedIndex = Math.max(0, Math.min(index, next.length))
  next.splice(clampedIndex, 0, id)
  return next
}

function removeFromOrder(orderByStage: Map<string, string[]>, stageId: string, id: string): number {
  const list = orderByStage.get(stageId)
  if (!list) return -1
  const { list: next, index } = withRemoved(list, id)
  if (index !== -1) orderByStage.set(stageId, next)
  return index
}

function insertIntoOrder(orderByStage: Map<string, string[]>, stageId: string, id: string, index: number): void {
  const list = orderByStage.get(stageId)
  if (!list) return
  orderByStage.set(stageId, withInserted(list, id, index))
}

function adjustAgg(stageAgg: Map<string, StageAgg>, stageId: string, deltaCount: number, deltaValue: number): void {
  const current = stageAgg.get(stageId) ?? emptyAgg()
  stageAgg.set(stageId, {
    count: current.count + deltaCount,
    totalValue: current.totalValue + deltaValue,
  })
}

export const useBoardStore = create<BoardState>((set, get) => ({
  stages: [],
  opportunitiesById: new Map(),
  orderByStage: new Map(),
  stageAgg: new Map(),
  pendingMoves: new Map(),
  draggingId: null,

  hydrate: (stages, opportunitiesByStage) => {
    const opportunitiesById = new Map<string, Opportunity>()
    const orderByStage = new Map<string, string[]>()
    const stageAgg = new Map<string, StageAgg>()

    for (const stage of stages) {
      const list = opportunitiesByStage[stage.id] ?? []
      const ids = list.map((opp) => opp.id)
      orderByStage.set(stage.id, ids)
      let totalValue = 0
      for (const opp of list) {
        opportunitiesById.set(opp.id, opp)
        totalValue += opp.value
      }
      stageAgg.set(stage.id, { count: ids.length, totalValue })
    }

    set({ stages, opportunitiesById, orderByStage, stageAgg, pendingMoves: new Map() })
  },

  getStageAgg: (stageId) => get().stageAgg.get(stageId) ?? emptyAgg(),

  beginOptimisticMove: (id, toStageId) => {
    const { opportunitiesById, orderByStage, stageAgg, pendingMoves } = get()
    const opp = opportunitiesById.get(id)
    if (!opp) return
    const fromStageId = opp.stageId
    if (fromStageId === toStageId) return

    const nextOrder = new Map(orderByStage)
    const nextAgg = new Map(stageAgg)
    const nextPending = new Map(pendingMoves)
    const nextOpps = new Map(opportunitiesById)

    const fromIndex = removeFromOrder(nextOrder, fromStageId, id)
    insertIntoOrder(nextOrder, toStageId, id, 0)
    adjustAgg(nextAgg, fromStageId, -1, -opp.value)
    adjustAgg(nextAgg, toStageId, 1, opp.value)

    nextOpps.set(id, { ...opp, stageId: toStageId })
    nextPending.set(id, { fromStageId, fromIndex: fromIndex === -1 ? 0 : fromIndex })

    set({ orderByStage: nextOrder, stageAgg: nextAgg, pendingMoves: nextPending, opportunitiesById: nextOpps })
  },

  confirmMove: (id, opportunity) => {
    const { opportunitiesById, pendingMoves } = get()
    const nextPending = new Map(pendingMoves)
    nextPending.delete(id)
    const nextOpps = new Map(opportunitiesById)
    nextOpps.set(id, opportunity)
    set({ pendingMoves: nextPending, opportunitiesById: nextOpps })
  },

  rollbackMove: (id) => {
    const { opportunitiesById, orderByStage, stageAgg, pendingMoves } = get()
    const pending = pendingMoves.get(id)
    const opp = opportunitiesById.get(id)
    if (!pending || !opp) return

    const nextOrder = new Map(orderByStage)
    const nextAgg = new Map(stageAgg)
    const nextPending = new Map(pendingMoves)
    const nextOpps = new Map(opportunitiesById)

    const currentStageId = opp.stageId
    removeFromOrder(nextOrder, currentStageId, id)
    insertIntoOrder(nextOrder, pending.fromStageId, id, pending.fromIndex)
    adjustAgg(nextAgg, currentStageId, -1, -opp.value)
    adjustAgg(nextAgg, pending.fromStageId, 1, opp.value)

    nextOpps.set(id, { ...opp, stageId: pending.fromStageId })
    nextPending.delete(id)

    set({ orderByStage: nextOrder, stageAgg: nextAgg, pendingMoves: nextPending, opportunitiesById: nextOpps })
  },

  setDraggingId: (id) => set({ draggingId: id }),

  applyStreamMove: (opportunity, fromStageId) => {
    const { opportunitiesById, orderByStage, stageAgg, pendingMoves, draggingId } = get()
    if (pendingMoves.has(opportunity.id) || draggingId === opportunity.id) return
    const existing = opportunitiesById.get(opportunity.id)
    if (existing && existing.version >= opportunity.version) return

    const nextOrder = new Map(orderByStage)
    const nextAgg = new Map(stageAgg)
    const nextOpps = new Map(opportunitiesById)

    removeFromOrder(nextOrder, fromStageId, opportunity.id)
    insertIntoOrder(nextOrder, opportunity.stageId, opportunity.id, 0)
    if (existing) {
      adjustAgg(nextAgg, fromStageId, -1, -existing.value)
    }
    adjustAgg(nextAgg, opportunity.stageId, 1, opportunity.value)
    nextOpps.set(opportunity.id, opportunity)

    set({ orderByStage: nextOrder, stageAgg: nextAgg, opportunitiesById: nextOpps })
  },

  applyStreamEdit: (opportunity) => {
    const { opportunitiesById, stageAgg, pendingMoves, draggingId } = get()
    if (pendingMoves.has(opportunity.id) || draggingId === opportunity.id) return
    const existing = opportunitiesById.get(opportunity.id)
    if (!existing || existing.version >= opportunity.version) return

    const nextAgg = new Map(stageAgg)
    adjustAgg(nextAgg, opportunity.stageId, 0, opportunity.value - existing.value)
    const nextOpps = new Map(opportunitiesById)
    nextOpps.set(opportunity.id, opportunity)

    set({ stageAgg: nextAgg, opportunitiesById: nextOpps })
  },

  applyStreamCreate: (opportunity) => {
    const { opportunitiesById, orderByStage, stageAgg } = get()
    if (opportunitiesById.has(opportunity.id)) return

    const nextOrder = new Map(orderByStage)
    insertIntoOrder(nextOrder, opportunity.stageId, opportunity.id, nextOrder.get(opportunity.stageId)?.length ?? 0)
    const nextAgg = new Map(stageAgg)
    adjustAgg(nextAgg, opportunity.stageId, 1, opportunity.value)
    const nextOpps = new Map(opportunitiesById)
    nextOpps.set(opportunity.id, opportunity)

    set({ orderByStage: nextOrder, stageAgg: nextAgg, opportunitiesById: nextOpps })
  },

  applyStreamDelete: (id, stageId) => {
    const { opportunitiesById, orderByStage, stageAgg, pendingMoves, draggingId } = get()
    if (pendingMoves.has(id) || draggingId === id) return
    const existing = opportunitiesById.get(id)
    if (!existing) return

    const nextOrder = new Map(orderByStage)
    removeFromOrder(nextOrder, stageId, id)
    const nextAgg = new Map(stageAgg)
    adjustAgg(nextAgg, stageId, -1, -existing.value)
    const nextOpps = new Map(opportunitiesById)
    nextOpps.delete(id)

    set({ orderByStage: nextOrder, stageAgg: nextAgg, opportunitiesById: nextOpps })
  },
}))
