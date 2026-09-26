import { useCallback } from 'react'
import { moveOpportunity } from '../mockApi'
import { useAnnouncerStore } from '../store/announcer.store'
import { useBoardStore } from '../store/board.store'
import { useToastStore } from '../store/toast.store'

/**
 * Looks up the destination stage's name once, here, so every call site
 * (drag-end, keyboard select, retry) just passes an id — nobody re-does
 * `stages.find(s => s.id === toStageId)` themselves.
 */
export function useOptimisticMove() {
  const pushToast = useToastStore((s) => s.push)
  const announce = useAnnouncerStore((s) => s.announce)

  return useCallback(
    (id: string, toStageId: string) => {
      const runMove = (isRetry: boolean) => {
        const store = useBoardStore.getState()
        const opp = store.opportunitiesById.get(id)
        const stage = store.stages.find((s) => s.id === toStageId)
        if (!opp || !stage || opp.stageId === toStageId) return
        const stageName = stage.name

        store.beginOptimisticMove(id, toStageId)
        announce(isRetry ? `Retrying move of ${opp.name} to ${stageName}.` : `Moving ${opp.name} to ${stageName}.`)

        moveOpportunity(id, toStageId)
          .then((updated) => {
            useBoardStore.getState().confirmMove(id, updated)
            announce(`${opp.name} moved to ${stageName}.`)
          })
          .catch(() => {
            useBoardStore.getState().rollbackMove(id)
            announce(`${opp.name} failed to move and was returned to its previous stage.`)
            pushToast(`"${opp.name}" didn't save — back where it was.`, () => runMove(true))
          })
      }

      runMove(false)
    },
    [announce, pushToast],
  )
}
