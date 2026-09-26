import { useCallback, useEffect, useRef, useState } from 'react'
import { getBulkJobStatus, startBulkMove } from '../mockApi'
import type { BulkFilter, BulkJobStatus } from '../mockApi'

const STORAGE_KEY = 'pipeline-board:active-bulk-job'
const POLL_MS = 400
const STALL_AFTER_MS = 3000

interface BulkJobUiState {
  status: BulkJobStatus | null
  isStalled: boolean
  error: string | null
}

export function useBulkJob() {
  const [state, setState] = useState<BulkJobUiState>({ status: null, isStalled: false, error: null })
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastProcessedRef = useRef(0)
  const lastProgressAtRef = useRef(0)

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const poll = useCallback(
    (jobId: string) => {
      stopPolling()
      pollTimer.current = setInterval(async () => {
        const status = await getBulkJobStatus(jobId)
        if (!status) return

        if (status.processed !== lastProcessedRef.current) {
          lastProcessedRef.current = status.processed
          lastProgressAtRef.current = Date.now()
        }
        const isStalled = status.status === 'running' && Date.now() - lastProgressAtRef.current > STALL_AFTER_MS
        setState({ status, isStalled, error: null })

        if (status.status === 'completed' || status.status === 'failed') {
          stopPolling()
          window.localStorage.removeItem(STORAGE_KEY)
        }
      }, POLL_MS)
    },
    [stopPolling],
  )

  // Resume tracking a job that was still running when the page was refreshed.
  useEffect(() => {
    const savedJobId = window.localStorage.getItem(STORAGE_KEY)
    if (savedJobId) {
      lastProgressAtRef.current = Date.now()
      poll(savedJobId)
    }
    return stopPolling
  }, [poll, stopPolling])

  const startJob = useCallback(
    async (filter: BulkFilter, toStageId: string) => {
      setState({ status: null, isStalled: false, error: null })
      try {
        const { jobId, totalMatched } = await startBulkMove(filter, toStageId)
        lastProcessedRef.current = 0
        lastProgressAtRef.current = Date.now()
        setState({
          status: {
            id: jobId,
            status: totalMatched === 0 ? 'completed' : 'queued',
            total: totalMatched,
            processed: 0,
            succeeded: 0,
            failed: 0,
            toStageId,
            startedAt: Date.now(),
          },
          isStalled: false,
          error: null,
        })
        if (totalMatched > 0) {
          window.localStorage.setItem(STORAGE_KEY, jobId)
          poll(jobId)
        }
      } catch {
        setState({ status: null, isStalled: false, error: 'Could not start the bulk move — try again.' })
      }
    },
    [poll],
  )

  const isRunning = state.status?.status === 'queued' || state.status?.status === 'running'

  return { ...state, isRunning, startJob }
}
