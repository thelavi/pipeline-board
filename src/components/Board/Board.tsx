import { Column } from '../Column/Column'
import { useChangeStreamSubscription } from '../../hooks/useChangeStreamSubscription'
import { useBoardStore } from '../../store/board.store'

export function Board() {
  const stages = useBoardStore((s) => s.stages)
  useChangeStreamSubscription()

  return (
    <div className="board">
      {stages.map((stage) => (
        <Column key={stage.id} stage={stage} allStages={stages} />
      ))}
    </div>
  )
}
