import type { CSSProperties } from 'react'
import { restartChangeStream, stopChangeStream } from './changeStream'
import { useMockApiConfig } from './config'

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  right: 12,
  background: '#161a1f',
  color: '#e9edf1',
  padding: 12,
  borderRadius: 8,
  fontSize: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 1000,
  width: 220,
  fontFamily: 'system-ui, sans-serif',
}

const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }

export function DevPanel() {
  const config = useMockApiConfig()

  return (
    <div style={panelStyle}>
      <strong>Mock API dev panel</strong>

      <label style={fieldStyle}>
        Latency min (ms)
        <input
          type="number"
          value={config.latencyMinMs}
          min={0}
          onChange={(e) => config.set({ latencyMinMs: Number(e.target.value) })}
        />
      </label>

      <label style={fieldStyle}>
        Latency max (ms)
        <input
          type="number"
          value={config.latencyMaxMs}
          min={0}
          onChange={(e) => config.set({ latencyMaxMs: Number(e.target.value) })}
        />
      </label>

      <label style={fieldStyle}>
        Failure rate (0-1)
        <input
          type="number"
          step={0.05}
          min={0}
          max={1}
          value={config.failureRate}
          onChange={(e) => config.set({ failureRate: Number(e.target.value) })}
        />
      </label>

      <label style={fieldStyle}>
        Stream interval (ms)
        <input
          type="number"
          min={100}
          value={config.changeStreamIntervalMs}
          onChange={(e) => {
            config.set({ changeStreamIntervalMs: Number(e.target.value) })
            restartChangeStream()
          }}
        />
      </label>

      <label style={fieldStyle}>
        Stream batch size
        <input
          type="number"
          min={0}
          value={config.changeStreamBatchSize}
          onChange={(e) => config.set({ changeStreamBatchSize: Number(e.target.value) })}
        />
      </label>

      <label style={rowStyle}>
        Change stream enabled
        <input
          type="checkbox"
          checked={config.changeStreamEnabled}
          onChange={(e) => {
            const enabled = e.target.checked
            config.set({ changeStreamEnabled: enabled })
            if (enabled) restartChangeStream()
            else stopChangeStream()
          }}
        />
      </label>

      <button type="button" onClick={() => config.reset()}>
        Reset defaults
      </button>
    </div>
  )
}
