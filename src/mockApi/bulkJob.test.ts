import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBulkJobStatus, startBulkJob } from './bulkJobs'
import { subscribeToChangeStream } from './changeStream'
import { resetDb } from './db'
import { useMockApiConfig } from './config'
import type { ChangeStreamEvent } from './types'

// 'closed-lost' is seeded with a fixed 50 rows (see STAGE_DEFS in db.ts) — a stable,
// deterministic match count to build assertions on without depending on the random seed.
const TOTAL = 50

beforeEach(() => {
  useMockApiConfig.getState().reset()
  resetDb() // db.ts is a singleton shared across every test in this file — reseed so a
  // prior test's actual moves out of 'closed-lost' can't shrink the next test's match count.
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('partial failure bookkeeping', () => {
  it('never lies about the total: succeeded + failed always equals total, even with forced failures', async () => {
    useMockApiConfig.getState().set({ failureRate: 0.5, bulkJobChunkSize: 100, bulkJobTickMs: 5 })

    vi.useFakeTimers()
    // startBulkJob generates its own job id via Math.random() — call it BEFORE installing
    // the deterministic spy below, so that internal call doesn't steal a slot from the
    // sequence meant for the 50 per-id failure rolls inside tick().
    const { jobId, totalMatched } = startBulkJob({ stageId: 'closed-lost' }, 'contacted')
    expect(totalMatched).toBe(TOTAL)

    const FAIL_COUNT = 10
    let calls = 0
    vi.spyOn(Math, 'random').mockImplementation(() => (calls++ < FAIL_COUNT ? 0 : 0.999))

    await vi.advanceTimersByTimeAsync(10) // one tick, chunk size covers all 50 in a single pass

    const status = getBulkJobStatus(jobId)!
    expect(status.status).toBe('completed')
    expect(status.succeeded + status.failed).toBe(status.total)
    expect(status.failed).toBe(FAIL_COUNT)
  })
})

describe('board reconciliation bridge', () => {
  it('emits a move event for every successfully moved card, so the board store can reconcile it — not just the db', async () => {
    useMockApiConfig.getState().set({ failureRate: 0, bulkJobChunkSize: 100, bulkJobTickMs: 5 })

    const events: ChangeStreamEvent[] = []
    const unsubscribe = subscribeToChangeStream((event) => events.push(event))

    vi.useFakeTimers()
    const { jobId, totalMatched } = startBulkJob({ stageId: 'closed-lost' }, 'contacted')
    expect(totalMatched).toBe(TOTAL)

    await vi.advanceTimersByTimeAsync(10)
    unsubscribe()

    const status = getBulkJobStatus(jobId)!
    expect(status.status).toBe('completed')
    expect(status.succeeded).toBe(TOTAL)

    const moveEvents = events.filter((e) => e.type === 'move')
    expect(moveEvents).toHaveLength(TOTAL)
    for (const event of moveEvents) {
      if (event.type !== 'move') continue
      expect(event.fromStageId).toBe('closed-lost')
      expect(event.opportunity.stageId).toBe('contacted')
    }
  })
})

describe('refresh survival', () => {
  it('resumes a job from persisted state after a simulated page refresh, and still finishes without lying about the total', async () => {
    useMockApiConfig.getState().set({ bulkJobChunkSize: 10, bulkJobTickMs: 5 })

    vi.useFakeTimers()
    const { jobId, totalMatched } = startBulkJob({ stageId: 'closed-lost' }, 'contacted')
    expect(totalMatched).toBe(TOTAL)

    await vi.advanceTimersByTimeAsync(5) // one partial tick: 10 of 50 processed
    const midway = getBulkJobStatus(jobId)!
    expect(midway.status).toBe('running')
    expect(midway.processed).toBeGreaterThan(0)
    expect(midway.processed).toBeLessThan(TOTAL)

    // Simulate a hard page refresh: drop every in-memory module (this job engine, its
    // timer, and the mock db all live in module scope) and reload — only localStorage
    // survives a real refresh, so only localStorage should carry the job forward.
    vi.resetModules()
    const resumedModule = await import('./bulkJobs')

    const resumed = resumedModule.getBulkJobStatus(jobId)
    expect(resumed).toBeDefined()
    expect(resumed!.processed).toBe(midway.processed) // resumed from persisted progress, not from zero

    await vi.advanceTimersByTimeAsync(250) // let the resumed (default-config) engine finish

    const final = resumedModule.getBulkJobStatus(jobId)!
    expect(['completed', 'failed']).toContain(final.status)
    expect(final.succeeded + final.failed).toBe(final.total)
  })
})
