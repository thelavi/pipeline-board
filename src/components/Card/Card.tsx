import { memo } from 'react'
import { useBoardStore } from '../../store/board.store'
import type { Stage } from '../../mockApi'

interface CardProps {
  opportunityId: string
  stages: Stage[]
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US')}`
}

function CardImpl({ opportunityId }: CardProps) {
  const opportunity = useBoardStore((s) => s.opportunitiesById.get(opportunityId))
  if (!opportunity) return null

  return (
    <div className="card">
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
      </div>
    </div>
  )
}

export const Card = memo(CardImpl)
