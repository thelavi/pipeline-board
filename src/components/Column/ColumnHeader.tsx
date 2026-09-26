import { useBoardStore } from '../../store/board.store'

interface ColumnHeaderProps {
  stageId: string
  stageName: string
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US')}`
}

export function ColumnHeader({ stageId, stageName }: ColumnHeaderProps) {
  const agg = useBoardStore((s) => s.stageAgg.get(stageId))

  return (
    <div className="column-head">
      <div className="column-head__name">{stageName}</div>
      <div className="column-head__stats">
        <span className="column-head__count">{agg?.count ?? 0} cards</span>
        <span className="column-head__value">{formatMoney(agg?.totalValue ?? 0)}</span>
      </div>
    </div>
  )
}
