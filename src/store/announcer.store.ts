import { create } from 'zustand'

interface AnnouncerState {
  message: string
  seq: number
  announce: (message: string) => void
}

export const useAnnouncerStore = create<AnnouncerState>((set, get) => ({
  message: '',
  seq: 0,
  announce: (message) => set({ message, seq: get().seq + 1 }),
}))
