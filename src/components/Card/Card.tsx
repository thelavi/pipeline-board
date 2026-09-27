import { useDraggable } from '@dnd-kit/core'
import { memo } from 'react'
import { useBoardStore } from '../../store/board.store'

interface CardProps {
  opportunityId: string
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US')}`
}

function CardImpl({ opportunityId }: CardProps) {
  const opportunity = useBoardStore((s) => s.opportunitiesById.get(opportunityId))
  const isPending = useBoardStore((s) => s.pendingMoves.has(opportunityId))

  // The moving visual lives entirely in <DragOverlay> (rendered once, at board level) —
  // this element just marks its own origin slot as the source via `.card--dragging`.
  // Applying dnd-kit's transform here too, on top of DragOverlay, was the bug: this card
  // stays in its original row inside its original column's stacking context, so a CSS
  // transform offset can only ever move it within that same stacking context — it visually
  // overlapped neighboring rows instead of floating toward a column several slots away.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opportunityId,
  })

  if (!opportunity) return null

  return (
    <div
      id={`card-${opportunityId}`}
      ref={setNodeRef}
      className={`card${isPending ? ' card--pending' : ''}${isDragging ? ' card--dragging' : ''}`}
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
