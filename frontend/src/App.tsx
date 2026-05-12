import { useEffect, useRef, useState } from 'react'
import type { Api } from '@lichess-org/chessground/api'
import { Chessground } from './Chessground'

const API_URL = import.meta.env.VITE_API_URL
const SSE_URL = API_URL + '/sse/stream'

type StreamEvent =
  | {
      type: 'fen'
      fen: string
      ply: number
      white_name: string | null
      black_name: string | null
      moves: string[]
    }
  | { type: 'move'; uci: string; san: string; from: string; to: string; fen: string; ply: number }
  | { type: 'game_start'; white_name: string | null; black_name: string | null }
  | { type: 'game_end'; result: string }

type Engine = {
  id: string
  name: string
  command: string
  description: string
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const PIECE_NAMES: Record<string, string> = {
  q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn',
}

const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'] as const

type CapturedPiece = { type: string; color: 'white' | 'black' }

function captured(fen: string): { byWhite: CapturedPiece[]; byBlack: CapturedPiece[] } {
  const board = fen.split(' ')[0]
  const counts: Record<string, number> = {}
  for (const ch of board) {
    if (/[a-zA-Z]/.test(ch)) counts[ch] = (counts[ch] ?? 0) + 1
  }
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
  const byWhite: CapturedPiece[] = []
  const byBlack: CapturedPiece[] = []
  for (const p of PIECE_ORDER) {
    const whiteCaptured = Math.max(0, start[p] - (counts[p] ?? 0))
    const blackCaptured = Math.max(0, start[p] - (counts[p.toUpperCase()] ?? 0))
    const net = whiteCaptured - blackCaptured
    if (net > 0) {
      for (let i = 0; i < net; i++) byWhite.push({ type: PIECE_NAMES[p], color: 'black' })
    } else if (net < 0) {
      for (let i = 0; i < -net; i++) byBlack.push({ type: PIECE_NAMES[p], color: 'white' })
    }
  }
  return { byWhite, byBlack }
}

function CapturedPieces({ pieces }: { pieces: CapturedPiece[] }) {
  return (
    <span className="cg-wrap captured-pieces">
      {pieces.map((p, i) => (
        <piece key={i} className={`${p.type} ${p.color}`} />
      ))}
    </span>
  )
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
  const [whiteName, setWhiteName] = useState<string | null>(null)
  const [blackName, setBlackName] = useState<string | null>(null)
  const [moves, setMoves] = useState<string[]>([])
  const [fen, setFen] = useState<string>(START_FEN)
  const moveListRef = useRef<HTMLOListElement | null>(null)
  const { byWhite, byBlack } = captured(fen)

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
        setWhiteName(event.white_name)
        setBlackName(event.black_name)
        setMoves(event.moves ?? [])
        setFen(event.fen)
      } else if (event.type === 'move') {
        api.set({
          fen: event.fen,
          lastMove: [event.from as never, event.to as never],
        })
        setPly(event.ply)
        setMoves((prev) => [...prev, event.san])
        setFen(event.fen)
      } else if (event.type === 'game_start') {
        setResult(null)
        setWhiteName(event.white_name)
        setBlackName(event.black_name)
        setMoves([])
        setFen(START_FEN)
      } else if (event.type === 'game_end') {
        setResult(event.result)
      }
    }
    return () => es.close()
  }, [])

  useEffect(() => {
    const el = moveListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [moves])

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

      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[auto_auto] sm:gap-x-3">
        <div className="flex items-center gap-2 text-sm sm:col-start-1 sm:row-start-1">
          <span className="text-neutral-500 uppercase tracking-wide text-xs">black</span>
          <span className="text-neutral-100 font-medium">{blackName ?? '—'}</span>
          <CapturedPieces pieces={byBlack} />
        </div>
        <div className="sm:col-start-1 sm:row-start-2">
          <Chessground
            config={{ viewOnly: true, coordinates: true }}
            onReady={(api) => {
              apiRef.current = api
            }}
          />
        </div>
        <div className="flex items-center gap-2 text-sm sm:col-start-1 sm:row-start-3">
          <span className="text-neutral-500 uppercase tracking-wide text-xs">white</span>
          <span className="text-neutral-100 font-medium">{whiteName ?? '—'}</span>
          <CapturedPieces pieces={byWhite} />
        </div>
        <ol
          ref={moveListRef}
          className="bg-neutral-900 border border-neutral-800 rounded w-full h-32 sm:w-48 sm:h-[var(--board-size)] sm:col-start-2 sm:row-start-2 overflow-y-auto text-sm font-mono p-2 space-y-0.5"
        >
          {moves.length === 0 ? (
            <li className="text-neutral-600 italic">no moves yet</li>
          ) : (
            Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-neutral-500 w-6 shrink-0 text-right">{i + 1}.</span>
                <span className="text-neutral-100 w-14 shrink-0">{moves[i * 2]}</span>
                <span className="text-neutral-300">{moves[i * 2 + 1] ?? ''}</span>
              </li>
            ))
          )}
        </ol>
      </div>

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
        {ply !== null && <span>move {Math.ceil(ply / 2)}</span>}
        {result && <span className="text-neutral-300">result {result}</span>}
        {startError && <span className="text-red-400">{startError}</span>}
      </div>
    </main>
  )
}

export default App
