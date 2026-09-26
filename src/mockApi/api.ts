import { getBulkJobStatus as getBulkJobStatusInternal, startBulkJob } from './bulkJobs'
import {
  restartChangeStream,
  startChangeStream,
  stopChangeStream,
  subscribeToChangeStream,
} from './changeStream'
import { getOwners, getSnapshot, moveOpportunityInDb } from './db'
import { simulateRead, simulateWrite } from './network'
import type { BulkFilter, BulkJobStatus, Opportunity, Stage } from './types'

export async function fetchPipeline(): Promise<{
  stages: Stage[]
  opportunitiesByStage: Record<string, Opportunity[]>
}> {
  return simulateRead(() => getSnapshot())
}

export async function moveOpportunity(id: string, toStageId: string): Promise<Opportunity> {
  return simulateWrite('move opportunity', () => moveOpportunityInDb(id, toStageId))
}

export async function startBulkMove(
  filter: BulkFilter,
  toStageId: string,
): Promise<{ jobId: string; totalMatched: number }> {
  return simulateWrite('start bulk move', () => startBulkJob(filter, toStageId))
}

export async function getBulkJobStatus(jobId: string): Promise<BulkJobStatus | undefined> {
  return simulateRead(() => getBulkJobStatusInternal(jobId))
}

export function getKnownOwners(): string[] {
  return getOwners()
}

export { restartChangeStream, startChangeStream, stopChangeStream, subscribeToChangeStream }
export type { BulkFilter, BulkJobStatus, ChangeStreamEvent, Opportunity, Stage, Status } from './types'
