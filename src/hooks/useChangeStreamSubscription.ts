import { useEffect } from 'react'
import { subscribeToChangeStream } from '../mockApi'
import { useBoardStore } from '../store/board.store'

export function useChangeStreamSubscription() {
  useEffect(() => {
    const unsubscribe = subscribeToChangeStream((event) => {
      const store = useBoardStore.getState()
      switch (event.type) {
        case 'move':
          store.applyStreamMove(event.opportunity, event.fromStageId)
          break
        case 'edit':
          store.applyStreamEdit(event.opportunity)
          break
        case 'create':
          store.applyStreamCreate(event.opportunity)
          break
        case 'delete':
          store.applyStreamDelete(event.id, event.stageId)
          break
      }
    })
    return unsubscribe
  }, [])
}
