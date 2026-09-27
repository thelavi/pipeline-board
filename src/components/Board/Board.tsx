import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Column } from '../Column/Column'
import { CardDragPreview } from '../Card/CardDragPreview'
import { useChangeStreamSubscription } from '../../hooks/useChangeStreamSubscription'
import { useOptimisticMove } from '../../hooks/useOptimisticMove'
import { useBoardStore } from '../../store/board.store'

export function Board() {
  const stages = useBoardStore((s) => s.stages)
  const draggingId = useBoardStore((s) => s.draggingId)
  const setDraggingId = useBoardStore((s) => s.setDraggingId)
  const moveCard = useOptimisticMove()
  useChangeStreamSubscription()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const opportunityId = String(event.active.id)
    const toStageId = event.over ? String(event.over.id) : null
    setDraggingId(null)
    if (!toStageId) return
    moveCard(opportunityId, toStageId)
  }

  function handleDragCancel() {
    setDraggingId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="board">
        {stages.map((stage) => (
          <Column key={stage.id} stage={stage} />
        ))}
      </div>
      <DragOverlay>{draggingId ? <CardDragPreview opportunityId={draggingId} /> : null}</DragOverlay>
    </DndContext>
  )
}
