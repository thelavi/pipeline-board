import { useVirtualizer } from '@tanstack/react-virtual'
import type { RefObject } from 'react'

const ROW_HEIGHT_PX = 72
const OVERSCAN = 8

export function useVirtualizedColumn(scrollElementRef: RefObject<HTMLDivElement | null>, count: number) {
  return useVirtualizer({
    count,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN,
  })
}
