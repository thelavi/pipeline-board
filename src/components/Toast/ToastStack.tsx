import { useEffect } from 'react'
import { useToastStore } from '../../store/toast.store'

const AUTO_DISMISS_MS = 6000

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} id={toast.id} message={toast.message} retry={toast.retry} onDismiss={dismiss} />
      ))}
    </div>
  )
}

function ToastRow({
  id,
  message,
  retry,
  onDismiss,
}: {
  id: string
  message: string
  retry?: () => void
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [id, onDismiss])

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {retry && (
        <button
          type="button"
          onClick={() => {
            onDismiss(id)
            retry()
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}
