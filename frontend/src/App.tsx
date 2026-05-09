import { useEffect, useRef, useState } from 'react'
import type { Api } from '@lichess-org/chessground/api'
import { Chessground } from './Chessground'

const API_URL = import.meta.env.VITE_API_URL
const SSE_URL = API_URL + '/sse/stream'

type StreamEvent =
  | { type: 'fen'; fen: string; ply: number }
  | { type: 'move'; uci: string; from: string; to: string; fen: string; ply: number }
  | { type: 'game_start' }
  | { type: 'game_end'; result: string }

type Engine = {
  id: string
  name: string
  command: string
  description: string
}

function App() {
  const apiRef = useRef<Api | null>(null)
  const [status, setStatus] = useState('connecting')
  const [ply, setPly] = useState<number | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [engines, setEngines] = useState<Engine[]>([])
  const [whiteId, setWhiteId] = useState('')
  const [blackId, setBlackId] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    fetch(API_URL + '/engine')
      .then((r) => r.json())
      .then((data: Engine[]) => {
        setEngines(data)
        if (data.length > 0) {
          setWhiteId(data[0].id)
          setBlackId(data[Math.min(1, data.length - 1)].id)
        }
      })
      .catch(() => setStartError('failed to load engines'))
  }, [])

  useEffect(() => {
    const es = new EventSource(SSE_URL)
    es.onopen = () => setStatus('connected')
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'disconnected' : 'error')
    es.onmessage = (e) => {
      const event: StreamEvent = JSON.parse(e.data)
      const api = apiRef.current
      if (!api) return

      if (event.type === 'fen') {
        api.set({ fen: event.fen })
        setPly(event.ply)
        setResult(null)
      } else if (event.type === 'move') {
        api.set({
          fen: event.fen,
          lastMove: [event.from as never, event.to as never],
        })
        setPly(event.ply)
      } else if (event.type === 'game_start') {
        setResult(null)
      } else if (event.type === 'game_end') {
        setResult(event.result)
      }
    }
    return () => es.close()
  }, [])

  const startGame = async () => {
    if (!whiteId || !blackId) return
    setStarting(true)
    setStartError(null)
    try {
      const r = await fetch(API_URL + '/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ white_engine_id: whiteId, black_engine_id: blackId }),
      })
      if (!r.ok) {
        const t = await r.text()
        setStartError(t || `error ${r.status}`)
      }
    } catch (e) {
      setStartError(String(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 sm:gap-6 px-4 py-6 bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl sm:text-3xl font-semibold">machineplay</h1>

      <Chessground
        config={{ viewOnly: true, coordinates: true }}
        onReady={(api) => {
          apiRef.current = api
        }}
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-center text-sm">
        <label className="flex items-center gap-2">
          <span className="text-neutral-400">white</span>
          <select
            className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
            value={whiteId}
            onChange={(e) => setWhiteId(e.target.value)}
          >
            {engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-neutral-400">black</span>
          <select
            className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
            value={blackId}
            onChange={(e) => setBlackId(e.target.value)}
          >
            {engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={startGame}
          disabled={starting || engines.length === 0 || !whiteId || !blackId}
          className="bg-neutral-100 text-neutral-900 rounded px-3 py-1 disabled:opacity-40"
        >
          {starting ? 'starting…' : 'start game'}
        </button>
      </div>

      <div className="text-xs text-neutral-500 flex gap-4">
        <span>{status}</span>
        {ply !== null && <span>ply {ply}</span>}
        {result && <span className="text-neutral-300">result {result}</span>}
        {startError && <span className="text-red-400">{startError}</span>}
      </div>
    </main>
  )
}

export default App
