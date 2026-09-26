import { create } from 'zustand'

export interface ToastItem {
  id: string
  message: string
  retry?: () => void
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, retry?: () => void) => string
  dismiss: (id: string) => void
}

let seq = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, retry) => {
    const id = `toast-${++seq}`
    set((state) => ({ toasts: [...state.toasts, { id, message, retry }] }))
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
