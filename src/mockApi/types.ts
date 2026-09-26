export type Status = 'open' | 'won' | 'lost' | 'abandoned'

export interface Stage {
  id: string
  name: string
  order: number
}

export interface Opportunity {
  id: string
  name: string
  value: number
  status: Status
  owner: string
  updatedAt: number
  stageId: string
  version: number
}

export interface BulkFilter {
  stageId?: string
  owner?: string
  status?: Status
  minValue?: number
  maxValue?: number
}

export type ChangeStreamEvent =
  | { type: 'move'; opportunity: Opportunity; fromStageId: string }
  | { type: 'edit'; opportunity: Opportunity }
  | { type: 'create'; opportunity: Opportunity }
  | { type: 'delete'; id: string; stageId: string }

export type BulkJobState = 'queued' | 'running' | 'completed' | 'failed'

export interface BulkJobStatus {
  id: string
  status: BulkJobState
  total: number
  processed: number
  succeeded: number
  failed: number
  toStageId: string
  startedAt: number
}
