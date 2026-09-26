import { useDraggable } from '@dnd-kit/core'
import { memo } from 'react'
import { useOptimisticMove } from '../../hooks/useOptimisticMove'
import { useBoardStore } from '../../store/board.store'
import type { Stage } from '../../mockApi'

interface CardProps {
  opportunityId: string
  stages: Stage[]
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US')}`
}

function CardImpl({ opportunityId, stages }: CardProps) {
  const opportunity = useBoardStore((s) => s.opportunitiesById.get(opportunityId))
  const isPending = useBoardStore((s) => s.pendingMoves.has(opportunityId))
  const moveCard = useOptimisticMove()

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: opportunityId,
  })

  if (!opportunity) return null

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      className={`card${isPending ? ' card--pending' : ''}${isDragging ? ' card--dragging' : ''}`}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="card__top">
        <span className="card__name">{opportunity.name}</span>
        <span className="card__value">{formatMoney(opportunity.value)}</span>
      </div>
      <div className="card__meta">
        <span className="card__owner">
          {opportunity.owner}
          {opportunity.status !== 'open' && (
            <span className={`badge badge--${opportunity.status}`}>{opportunity.status}</span>
          )}
        </span>
        <select
          className="card__move-to"
          aria-label={`Move ${opportunity.name} to stage`}
          value=""
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const toStageId = e.target.value
            const stage = stages.find((s) => s.id === toStageId)
            if (toStageId && stage) moveCard(opportunityId, toStageId, stage.name)
            e.target.value = ''
          }}
        >
          <option value="">Move to…</option>
          {stages
            .filter((s) => s.id !== opportunity.stageId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}

export const Card = memo(CardImpl)
