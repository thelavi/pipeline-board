import { useState, type FormEvent } from 'react'
import { getKnownOwners } from '../../mockApi'
import type { Status } from '../../mockApi'
import { useBulkJob } from '../../hooks/useBulkJob'
import { useBoardStore } from '../../store/board.store'

const STATUSES: Status[] = ['open', 'won', 'lost', 'abandoned']
const OWNERS = getKnownOwners()

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

export function BulkMoveBar() {
  const stages = useBoardStore((s) => s.stages)
  const { status, isStalled, isRunning, error, startJob } = useBulkJob()

  const [stageId, setStageId] = useState('')
  const [owner, setOwner] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | ''>('')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [toStageId, setToStageId] = useState('')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!toStageId || isRunning) return
    startJob(
      {
        stageId: stageId || undefined,
        owner: owner || undefined,
        status: statusFilter || undefined,
        minValue: minValue ? Number(minValue) : undefined,
        maxValue: maxValue ? Number(maxValue) : undefined,
      },
      toStageId,
    )
  }

  const isTerminal = status?.status === 'completed' || status?.status === 'failed'
  const progressPct = status && status.total > 0 ? (status.processed / status.total) * 100 : 0

  return (
    <form className="bulk-bar" onSubmit={handleSubmit}>
      <div className="bulk-bar__filters">
        <select value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Filter by stage" disabled={isRunning}>
          <option value="">Any stage</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Filter by owner" disabled={isRunning}>
          <option value="">Any owner</option>
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | '')}
          aria-label="Filter by status"
          disabled={isRunning}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Min value"
          value={minValue}
          onChange={(e) => setMinValue(e.target.value)}
          aria-label="Minimum value"
          disabled={isRunning}
        />
        <input
          type="number"
          placeholder="Max value"
          value={maxValue}
          onChange={(e) => setMaxValue(e.target.value)}
          aria-label="Maximum value"
          disabled={isRunning}
        />

        <span aria-hidden="true">→</span>

        <select
          value={toStageId}
          onChange={(e) => setToStageId(e.target.value)}
          aria-label="Move matching cards to stage"
          disabled={isRunning}
        >
          <option value="">Move to…</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button type="submit" disabled={!toStageId || isRunning}>
          {isRunning ? 'Running…' : 'Move matching'}
        </button>
      </div>

      {error && (
        <div className="bulk-bar__error" role="alert">
          {error}
        </div>
      )}

      {status && (
        <div className="bulk-bar__progress" role="status">
          {isTerminal ? (
            <span>
              {status.status === 'completed' ? 'Done' : 'Stopped'} — {formatCount(status.succeeded)} moved
              {status.failed > 0 && `, ${formatCount(status.failed)} failed`} of {formatCount(status.total)}.
            </span>
          ) : (
            <>
              <div className="bulk-bar__bar">
                <div className="bulk-bar__bar-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span>
                {isStalled ? 'Stalled — ' : status.status === 'queued' ? 'Queued — ' : 'Running — '}
                {formatCount(status.processed)}/{formatCount(status.total)}
                {status.failed > 0 && ` (${formatCount(status.failed)} failed)`}
              </span>
            </>
          )}
        </div>
      )}
    </form>
  )
}
