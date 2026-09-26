import { getMockApiConfig } from './config'

export class MockApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MockApiError'
  }
}

function jitteredDelay(min: number, max: number): number {
  if (max <= min) return Math.max(0, min)
  return min + Math.random() * (max - min)
}

export async function simulateLatency(): Promise<void> {
  const { latencyMinMs, latencyMaxMs } = getMockApiConfig()
  const delay = jitteredDelay(latencyMinMs, latencyMaxMs)
  await new Promise((resolve) => setTimeout(resolve, delay))
}

export function maybeFail(action: string): void {
  const { failureRate } = getMockApiConfig()
  if (Math.random() < failureRate) {
    throw new MockApiError(`${action} failed (simulated network failure)`)
  }
}

export async function simulateRead<T>(fn: () => T): Promise<T> {
  await simulateLatency()
  return fn()
}

export async function simulateWrite<T>(action: string, fn: () => T): Promise<T> {
  await simulateLatency()
  maybeFail(action)
  return fn()
}
