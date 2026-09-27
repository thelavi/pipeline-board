import { getMockApiConfig } from './config'
import { emitChangeStreamEvent } from './changeStream'
import { findMatchingIds, getOpportunity, moveOpportunityInDb } from './db'
import type { BulkFilter, BulkJobStatus } from './types'

interface InternalJob extends BulkJobStatus {
  pendingIds: string[]
  terminalAt: number | null
}

const STORAGE_KEY = 'pipeline-board:bulk-jobs'
// A finished job is never read again once useBulkJob's poll has seen its terminal status and
// stopped watching it (no job-history view exists anywhere in this app). Without pruning, `jobs`
// grows by one entry for every bulk move ever started in a session and stays there forever —
// this grace window just guarantees the client's poll (every 400ms) has had a chance to observe
// the terminal state at least once before the record is dropped.
const TERMINAL_JOB_GRACE_MS = 5000
const jobs = new Map<string, InternalJob>()
let timer: ReturnType<typeof setInterval> | null = null

function pruneOldTerminalJobs(): void {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.terminalAt !== null && now - job.terminalAt > TERMINAL_JOB_GRACE_MS) {
      jobs.delete(id)
    }
  }
}

function persist(): void {
  if (typeof window === 'undefined') return
  const serializable = Array.from(jobs.values()).map((job) => ({
    ...job,
    pendingIds: job.status === 'completed' || job.status === 'failed' ? [] : job.pendingIds,
  }))
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
}

function ensureTicking(): void {
  if (timer) return
  const { bulkJobTickMs } = getMockApiConfig()
  timer = setInterval(tick, bulkJobTickMs)
}

function tick(): void {
  const { bulkJobChunkSize, failureRate } = getMockApiConfig()
  let anyActive = false

  for (const job of jobs.values()) {
    if (job.status !== 'queued' && job.status !== 'running') continue
    anyActive = true
    job.status = 'running'

    const chunk = job.pendingIds.splice(0, bulkJobChunkSize)
    for (const id of chunk) {
      job.processed++
      if (Math.random() < failureRate) {
        job.failed++
        continue
      }
      const fromStageId = getOpportunity(id)?.stageId
      try {
        const updated = moveOpportunityInDb(id, job.toStageId)
        job.succeeded++
        // The db write alone is invisible to the client — it only ever learns about
        // changes through the change-stream subscription, so a bulk move must go
        // through the same channel or the board's own copy of these cards never updates.
        if (fromStageId) emitChangeStreamEvent({ type: 'move', opportunity: updated, fromStageId })
      } catch {
        job.failed++
      }
    }

    if (job.pendingIds.length === 0) {
      job.status = 'completed'
      job.terminalAt = Date.now()
    }
  }

  persist()
  if (!anyActive && timer) {
    clearInterval(timer)
    timer = null
  }
}

export function startBulkJob(filter: BulkFilter, toStageId: string): { jobId: string; totalMatched: number } {
  pruneOldTerminalJobs()
  const matchedIds = findMatchingIds(filter)
  const id = `job-${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const isImmediatelyDone = matchedIds.length === 0
  const job: InternalJob = {
    id,
    status: isImmediatelyDone ? 'completed' : 'queued',
    total: matchedIds.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    toStageId,
    startedAt: Date.now(),
    pendingIds: matchedIds,
    terminalAt: isImmediatelyDone ? Date.now() : null,
  }
  jobs.set(id, job)
  persist()
  ensureTicking()
  return { jobId: id, totalMatched: matchedIds.length }
}

export function getBulkJobStatus(jobId: string): BulkJobStatus | undefined {
  const job = jobs.get(jobId)
  if (!job) return undefined
  const { pendingIds: _pendingIds, ...status } = job
  return status
}

export function restoreJobsFromStorage(): void {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const parsed: InternalJob[] = JSON.parse(raw)
    for (const job of parsed) jobs.set(job.id, job)
    pruneOldTerminalJobs()
    ensureTicking()
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

restoreJobsFromStorage()
