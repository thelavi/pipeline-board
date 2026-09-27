import { getMockApiConfig } from './config'
import {
  createOpportunityInDb,
  deleteOpportunityInDb,
  editOpportunityInDb,
  getAllOpportunityIds,
  getOpportunity,
  getStages,
  moveOpportunityInDb,
} from './db'
import type { ChangeStreamEvent } from './types'

type Listener = (event: ChangeStreamEvent) => void

const listeners = new Set<Listener>()
let timer: ReturnType<typeof setInterval> | null = null

function emit(event: ChangeStreamEvent): void {
  for (const listener of listeners) listener(event)
}

/**
 * Lets a write that happened OUTSIDE this file's own tick() loop (namely, the bulk-move
 * job engine) notify the same subscribers a background stream tick would. Without this,
 * a bulk job's moves are only visible in the mock db — the client board store, which only
 * ever learns about changes through subscribeToChangeStream, would never hear about them
 * and the moved cards would appear stuck in their old column until the next full refetch.
 */
export function emitChangeStreamEvent(event: ChangeStreamEvent): void {
  emit(event)
}

function randomPick<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

function tick(): void {
  const { changeStreamBatchSize } = getMockApiConfig()
  const ids = getAllOpportunityIds()
  if (ids.length === 0) return
  const stages = getStages()

  for (let i = 0; i < changeStreamBatchSize; i++) {
    const targetId = randomPick(ids)
    if (!targetId) continue
    const current = getOpportunity(targetId)
    if (!current) continue

    const roll = Math.random()
    if (roll < 0.4) {
      const stage = randomPick(stages.filter((s) => s.id !== current.stageId))
      if (!stage) continue
      const fromStageId = current.stageId
      const updated = moveOpportunityInDb(targetId, stage.id)
      emit({ type: 'move', opportunity: updated, fromStageId })
    } else if (roll < 0.7) {
      const updated = editOpportunityInDb(targetId, {
        value: Math.round((current.value * (0.85 + Math.random() * 0.3)) / 50) * 50,
      })
      if (updated) emit({ type: 'edit', opportunity: updated })
    } else if (roll < 0.85) {
      const stage = randomPick(stages)
      if (!stage) continue
      const created = createOpportunityInDb(stage.id)
      emit({ type: 'create', opportunity: created })
    } else {
      const stageId = current.stageId
      if (deleteOpportunityInDb(targetId)) {
        emit({ type: 'delete', id: targetId, stageId })
      }
    }
  }
}

export function startChangeStream(): void {
  if (timer) return
  const { changeStreamEnabled, changeStreamIntervalMs } = getMockApiConfig()
  if (!changeStreamEnabled) return
  timer = setInterval(tick, changeStreamIntervalMs)
}

export function stopChangeStream(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function restartChangeStream(): void {
  stopChangeStream()
  startChangeStream()
}

export function subscribeToChangeStream(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
