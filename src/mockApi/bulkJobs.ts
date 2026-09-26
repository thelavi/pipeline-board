import { getMockApiConfig } from './config'
import { findMatchingIds, moveOpportunityInDb } from './db'
import type { BulkFilter, BulkJobStatus } from './types'

interface InternalJob extends BulkJobStatus {
  pendingIds: string[]
}

const STORAGE_KEY = 'pipeline-board:bulk-jobs'
const jobs = new Map<string, InternalJob>()
let timer: ReturnType<typeof setInterval> | null = null

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
      try {
        moveOpportunityInDb(id, job.toStageId)
        job.succeeded++
      } catch {
        job.failed++
      }
    }

    if (job.pendingIds.length === 0) {
      job.status = 'completed'
    }
  }

  persist()
  if (!anyActive && timer) {
    clearInterval(timer)
    timer = null
  }
}

export function startBulkJob(filter: BulkFilter, toStageId: string): { jobId: string; totalMatched: number } {
  const matchedIds = findMatchingIds(filter)
  const id = `job-${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const job: InternalJob = {
    id,
    status: matchedIds.length === 0 ? 'completed' : 'queued',
    total: matchedIds.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    toStageId,
    startedAt: Date.now(),
    pendingIds: matchedIds,
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
    ensureTicking()
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

restoreJobsFromStorage()
