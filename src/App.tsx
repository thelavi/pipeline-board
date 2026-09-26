import { useEffect, useState } from 'react'
import { Board } from './components/Board/Board'
import './App.css'
import { DevPanel, fetchPipeline, startChangeStream } from './mockApi'
import { useBoardStore } from './store/board.store'

function App() {
  const hydrate = useBoardStore((s) => s.hydrate)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    let cancelled = false
    fetchPipeline().then(({ stages, opportunitiesByStage }) => {
      if (cancelled) return
      hydrate(stages, opportunitiesByStage)
      setStatus('ready')
      startChangeStream()
    })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  if (status === 'loading') {
    return <div className="board-loading">Loading pipeline…</div>
  }

  return (
    <>
      <Board />
      <DevPanel />
    </>
  )
}

export default App
