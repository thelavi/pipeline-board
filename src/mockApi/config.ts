import { create } from 'zustand'

export interface MockApiConfig {
  latencyMinMs: number
  latencyMaxMs: number
  failureRate: number
  changeStreamIntervalMs: number
  changeStreamBatchSize: number
  changeStreamEnabled: boolean
  bulkJobChunkSize: number
  bulkJobTickMs: number
}

const DEFAULTS: MockApiConfig = {
  latencyMinMs: 300,
  latencyMaxMs: 1500,
  failureRate: 0.1,
  changeStreamIntervalMs: 3000,
  changeStreamBatchSize: 5,
  changeStreamEnabled: true,
  bulkJobChunkSize: 500,
  bulkJobTickMs: 200,
}

const NUMERIC_PARAM_MAP: Record<string, keyof MockApiConfig> = {
  latencyMin: 'latencyMinMs',
  latencyMax: 'latencyMaxMs',
  failRate: 'failureRate',
  streamInterval: 'changeStreamIntervalMs',
  streamBatch: 'changeStreamBatchSize',
  jobChunk: 'bulkJobChunkSize',
  jobTick: 'bulkJobTickMs',
}

function readQueryOverrides(): Partial<MockApiConfig> {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const overrides: Partial<MockApiConfig> = {}

  for (const [param, key] of Object.entries(NUMERIC_PARAM_MAP)) {
    const raw = params.get(param)
    if (raw !== null && !Number.isNaN(Number(raw))) {
      ;(overrides as Record<string, number>)[key] = Number(raw)
    }
  }

  const streamFlag = params.get('streamEnabled')
  if (streamFlag !== null) overrides.changeStreamEnabled = streamFlag !== 'false'

  return overrides
}

interface MockApiConfigStore extends MockApiConfig {
  set: (patch: Partial<MockApiConfig>) => void
  reset: () => void
}

export const useMockApiConfig = create<MockApiConfigStore>((set) => ({
  ...DEFAULTS,
  ...readQueryOverrides(),
  set: (patch) => set(patch),
  reset: () => set({ ...DEFAULTS }),
}))

export function getMockApiConfig(): MockApiConfig {
  return useMockApiConfig.getState()
}
