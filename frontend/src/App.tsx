import { useEffect, useRef, useState } from 'react'
import type { Api } from '@lichess-org/chessground/api'
import { Chessground } from './Chessground'

const API_URL = import.meta.env.VITE_API_URL
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws/stream'

type StreamEvent =
  | { type: 'fen'; fen: string; ply: number }
  | { type: 'move'; uci: string; from: string; to: string; fen: string; ply: number }
  | { type: 'game_start' }
  | { type: 'game_end'; result: string }

function App() {
  const apiRef = useRef<Api | null>(null)
  const [status, setStatus] = useState('connecting')
  const [ply, setPly] = useState<number | null>(null)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    ws.onopen = () => setStatus('connected')
    ws.onclose = () => setStatus('disconnected')
    ws.onerror = () => setStatus('error')
    ws.onmessage = (e) => {
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
      } else if (event.type === 'game_end') {
        setResult(event.result)
      }
    }
    return () => ws.close()
  }, [])

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 sm:gap-6 px-4 py-6 bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl sm:text-3xl font-semibold">machineplay</h1>

      <Chessground
        config={{ viewOnly: true, coordinates: true }}
        onReady={(api) => {
          apiRef.current = api
        }}
      />

      <div className="text-xs text-neutral-500 flex gap-4">
        <span>{status}</span>
        {ply !== null && <span>ply {ply}</span>}
        {result && <span className="text-neutral-300">result {result}</span>}
      </div>
    </main>
  )
}

export default App
