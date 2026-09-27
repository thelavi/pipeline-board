import { useBoardStore } from '../../store/board.store'
import { formatMoney } from './Card'

interface CardDragPreviewProps {
  opportunityId: string
}

export function CardDragPreview({ opportunityId }: CardDragPreviewProps) {
  const opportunity = useBoardStore((s) => s.opportunitiesById.get(opportunityId))
  if (!opportunity) return null

  return (
    <div className="card card--overlay">
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
