import { useDraggable } from '@dnd-kit/core'
import { memo } from 'react'
import { useBoardStore } from '../../store/board.store'

interface CardProps {
  opportunityId: string
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US')}`
}

function CardImpl({ opportunityId }: CardProps) {
  const opportunity = useBoardStore((s) => s.opportunitiesById.get(opportunityId))
  const isPending = useBoardStore((s) => s.pendingMoves.has(opportunityId))

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: opportunityId,
  })

  if (!opportunity) return null

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined

  return (
    <div
      id={`card-${opportunityId}`}
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
        <span className="card__owner">{opportunity.owner}</span>
      </div>
    </div>
  )
}

export const Card = memo(CardImpl)
