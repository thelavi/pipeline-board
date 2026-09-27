import { useDroppable } from '@dnd-kit/core'
import { useRef } from 'react'
import { Card } from '../Card/Card'
import { useVirtualizedColumn } from '../../hooks/useVirtualizedColumn'
import { useBoardStore } from '../../store/board.store'
import { ColumnHeader } from './ColumnHeader'
import type { Stage } from '../../mockApi'

const EMPTY_IDS: string[] = []

interface ColumnProps {
  stage: Stage
}

export function Column({ stage }: ColumnProps) {
  const ids = useBoardStore((s) => s.orderByStage.get(stage.id) ?? EMPTY_IDS)
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizedColumn(scrollRef, ids.length)
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className={`column${isOver ? ' column--over' : ''}`} ref={setNodeRef}>
      <ColumnHeader stageId={stage.id} stageName={stage.name} />
      <div ref={scrollRef} className="column__scroll">
        <div className="column__spacer" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const opportunityId = ids[virtualRow.index]
            return (
              <div
                key={opportunityId}
                className="column__row"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <Card opportunityId={opportunityId} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
