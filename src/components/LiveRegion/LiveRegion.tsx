import { useAnnouncerStore } from '../../store/announcer.store'

export function LiveRegion() {
  const message = useAnnouncerStore((s) => s.message)

  return (
    <div className="live-region" role="status" aria-live="polite">
      {message}
    </div>
  )
}
