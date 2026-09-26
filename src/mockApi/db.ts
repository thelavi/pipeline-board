import type { BulkFilter, Opportunity, Stage, Status } from './types'

const OWNERS = [
  'Amir Khan',
  'Priya Nair',
  'Diego Alvarez',
  'Sara Chen',
  'Tom Becker',
  'Fatima Yusuf',
  'Lena Kowalski',
  'Marcus Reed',
]

const STAGE_DEFS: { id: string; name: string; seedCount: number }[] = [
  { id: 'new-lead', name: 'New Lead', seedCount: 10000 },
  { id: 'contacted', name: 'Contacted', seedCount: 5000 },
  { id: 'qualified', name: 'Qualified', seedCount: 3000 },
  { id: 'discovery', name: 'Discovery', seedCount: 2000 },
  { id: 'needs-analysis', name: 'Needs Analysis', seedCount: 1500 },
  { id: 'proposal-sent', name: 'Proposal Sent', seedCount: 1200 },
  { id: 'negotiation', name: 'Negotiation', seedCount: 800 },
  { id: 'verbal-commit', name: 'Verbal Commit', seedCount: 500 },
  { id: 'contract-sent', name: 'Contract Sent', seedCount: 400 },
  { id: 'legal-review', name: 'Legal Review', seedCount: 300 },
  { id: 'closed-won', name: 'Closed Won', seedCount: 250 },
  { id: 'closed-lost', name: 'Closed Lost', seedCount: 50 },
]

let stages: Stage[] = []
let opportunities: Map<string, Opportunity> = new Map()
let orderByStage: Map<string, string[]> = new Map()
let nextId = 1

function randomStatus(stageId: string): Status {
  if (stageId === 'closed-won') return 'won'
  if (stageId === 'closed-lost') return Math.random() < 0.7 ? 'lost' : 'abandoned'
  return 'open'
}

function randomValue(): number {
  return Math.round((500 + Math.random() * 249500) / 50) * 50
}

function makeOpportunity(stageId: string): Opportunity {
  const id = `opp-${nextId++}`
  return {
    id,
    name: `Deal ${id.split('-')[1]}`,
    value: randomValue(),
    status: randomStatus(stageId),
    owner: OWNERS[Math.floor(Math.random() * OWNERS.length)],
    updatedAt: Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30),
    stageId,
    version: 1,
  }
}

export function resetDb(): void {
  stages = STAGE_DEFS.map((def, index) => ({ id: def.id, name: def.name, order: index }))
  opportunities = new Map()
  orderByStage = new Map(stages.map((stage) => [stage.id, []]))
  nextId = 1

  for (const def of STAGE_DEFS) {
    const ids: string[] = []
    for (let i = 0; i < def.seedCount; i++) {
      const opp = makeOpportunity(def.id)
      opportunities.set(opp.id, opp)
      ids.push(opp.id)
    }
    orderByStage.set(def.id, ids)
  }
}

resetDb()

export function getStages(): Stage[] {
  return stages
}

export function getSnapshot(): { stages: Stage[]; opportunitiesByStage: Record<string, Opportunity[]> } {
  const opportunitiesByStage: Record<string, Opportunity[]> = {}
  for (const stage of stages) {
    opportunitiesByStage[stage.id] = (orderByStage.get(stage.id) ?? [])
      .map((id) => opportunities.get(id))
      .filter((opp): opp is Opportunity => opp !== undefined)
  }
  return { stages, opportunitiesByStage }
}

export function getOpportunity(id: string): Opportunity | undefined {
  return opportunities.get(id)
}

export function moveOpportunityInDb(id: string, toStageId: string): Opportunity {
  const opp = opportunities.get(id)
  if (!opp) throw new Error(`opportunity ${id} not found`)
  if (!orderByStage.has(toStageId)) throw new Error(`stage ${toStageId} not found`)

  if (opp.stageId !== toStageId) {
    const fromList = orderByStage.get(opp.stageId)
    if (fromList) {
      const idx = fromList.indexOf(id)
      if (idx !== -1) fromList.splice(idx, 1)
    }
    orderByStage.get(toStageId)!.unshift(id)
  }

  const updated: Opportunity = { ...opp, stageId: toStageId, updatedAt: Date.now(), version: opp.version + 1 }
  opportunities.set(id, updated)
  return updated
}

export function editOpportunityInDb(
  id: string,
  patch: Partial<Pick<Opportunity, 'value' | 'owner' | 'status'>>,
): Opportunity | undefined {
  const opp = opportunities.get(id)
  if (!opp) return undefined
  const updated: Opportunity = { ...opp, ...patch, updatedAt: Date.now(), version: opp.version + 1 }
  opportunities.set(id, updated)
  return updated
}

export function createOpportunityInDb(stageId: string): Opportunity {
  const opp = makeOpportunity(stageId)
  opportunities.set(opp.id, opp)
  orderByStage.get(stageId)?.unshift(opp.id)
  return opp
}

export function deleteOpportunityInDb(id: string): boolean {
  const opp = opportunities.get(id)
  if (!opp) return false
  const list = orderByStage.get(opp.stageId)
  if (list) {
    const idx = list.indexOf(id)
    if (idx !== -1) list.splice(idx, 1)
  }
  opportunities.delete(id)
  return true
}

export function getAllOpportunityIds(): string[] {
  return Array.from(opportunities.keys())
}

export function findMatchingIds(filter: BulkFilter): string[] {
  const result: string[] = []
  for (const opp of opportunities.values()) {
    if (filter.stageId && opp.stageId !== filter.stageId) continue
    if (filter.owner && opp.owner !== filter.owner) continue
    if (filter.status && opp.status !== filter.status) continue
    if (filter.minValue !== undefined && opp.value < filter.minValue) continue
    if (filter.maxValue !== undefined && opp.value > filter.maxValue) continue
    result.push(opp.id)
  }
  return result
}
