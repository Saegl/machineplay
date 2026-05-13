import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Api } from '@lichess-org/chessground/api'
import { Chessground } from '../Chessground'
import {
  API_URL,
  SSE_URL,
  START_FEN,
  type Game,
  type StreamEvent,
  type StreamStatus,
} from '../api'

type Clocks = { white: number; black: number; updatedAt: number }

function formatClock(s: number): string {
  if (s >= 60) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }
  return s.toFixed(1)
}

const PIECE_NAMES: Record<string, string> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}

const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'] as const

type CapturedPiece = { type: string; color: 'white' | 'black' }

function captured(fen: string): {
  byWhite: CapturedPiece[]
  byBlack: CapturedPiece[]
} {
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
      for (let i = 0; i < net; i++)
        byWhite.push({ type: PIECE_NAMES[p], color: 'black' })
    } else if (net < 0) {
      for (let i = 0; i < -net; i++)
        byBlack.push({ type: PIECE_NAMES[p], color: 'white' })
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

export default function GamePage() {
  const { id } = useParams<{ id: string }>()
  const apiRef = useRef<Api | null>(null)
  const liveGameIdRef = useRef<string | null>(null)
  const [connStatus, setConnStatus] = useState('connecting')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [whiteName, setWhiteName] = useState<string | null>(null)
  const [blackName, setBlackName] = useState<string | null>(null)
  const [moves, setMoves] = useState<string[]>([])
  const [fen, setFen] = useState<string>(START_FEN)
  const [result, setResult] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [clocks, setClocks] = useState<Clocks | null>(null)
  const [gameStatus, setGameStatus] = useState<StreamStatus>('idle')
  const [now, setNow] = useState(() => Date.now())
  const moveListRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`${API_URL}/game/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`error ${r.status}`)
        return (await r.json()) as Game
      })
      .then((g) => {
        if (cancelled) return
        setWhiteName(g.white_name)
        setBlackName(g.black_name)
        setMoves(g.moves)
        setFen(g.fen)
        setResult(g.result)
        setGameStatus(g.status)
        setClocks({
          white: g.white_clock,
          black: g.black_clock,
          updatedAt: Date.now(),
        })
        apiRef.current?.set({ fen: g.fen })
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const es = new EventSource(SSE_URL)
    es.onopen = () => setConnStatus('connected')
    es.onerror = () =>
      setConnStatus(
        es.readyState === EventSource.CLOSED ? 'disconnected' : 'error',
      )
    es.onmessage = (e) => {
      const event: StreamEvent = JSON.parse(e.data)
      const api = apiRef.current

      if (event.type === 'fen') {
        liveGameIdRef.current = event.game_id
        if (event.game_id !== id) return
        api?.set({ fen: event.fen })
        setWhiteName(event.white_name)
        setBlackName(event.black_name)
        setMoves(event.moves ?? [])
        setFen(event.fen)
        setResult(event.result)
        setClocks({
          white: event.white_clock,
          black: event.black_clock,
          updatedAt: Date.now(),
        })
        setGameStatus(event.status)
      } else if (event.type === 'game_start') {
        liveGameIdRef.current = event.game_id
        if (event.game_id !== id) return
        setResult(null)
        setWhiteName(event.white_name)
        setBlackName(event.black_name)
        setMoves([])
        setFen(START_FEN)
        setClocks(null)
        setGameStatus('playing')
      } else if (event.type === 'move') {
        if (liveGameIdRef.current !== id) return
        api?.set({
          fen: event.fen,
          lastMove: [event.from as never, event.to as never],
        })
        setMoves((prev) => [...prev, event.san])
        setFen(event.fen)
        setClocks({
          white: event.white_clock,
          black: event.black_clock,
          updatedAt: Date.now(),
        })
      } else if (event.type === 'game_end') {
        if (liveGameIdRef.current !== id) return
        setResult(event.result)
        setGameStatus('ended')
      }
    }
    return () => es.close()
  }, [id])

  useEffect(() => {
    apiRef.current?.set({ fen })
  }, [fen])

  useEffect(() => {
    const el = moveListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [moves])

  const isClockTicking = gameStatus === 'playing'

  useEffect(() => {
    if (!isClockTicking) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [isClockTicking])

  const { byWhite, byBlack } = captured(fen)
  const sideToMove: 'white' | 'black' =
    fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const showClocks = gameStatus !== 'idle' && clocks !== null
  const elapsedSinceUpdate = clocks
    ? Math.max(0, (now - clocks.updatedAt) / 1000)
    : 0
  const displayWhite = clocks
    ? sideToMove === 'white' && isClockTicking
      ? Math.max(0, clocks.white - elapsedSinceUpdate)
      : clocks.white
    : null
  const displayBlack = clocks
    ? sideToMove === 'black' && isClockTicking
      ? Math.max(0, clocks.black - elapsedSinceUpdate)
      : clocks.black
    : null
  const topIsBlack = orientation === 'white'
  const topName = topIsBlack ? blackName : whiteName
  const bottomName = topIsBlack ? whiteName : blackName
  const topCaptured = topIsBlack ? byBlack : byWhite
  const bottomCaptured = topIsBlack ? byWhite : byBlack
  const topClock = topIsBlack ? displayBlack : displayWhite
  const bottomClock = topIsBlack ? displayWhite : displayBlack
  const topActive =
    isClockTicking && sideToMove === (topIsBlack ? 'black' : 'white')
  const bottomActive =
    isClockTicking && sideToMove === (topIsBlack ? 'white' : 'black')

  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 text-center flex flex-col gap-3">
        <p className="text-red-400">{loadError}</p>
        <Link to="/" className="text-neutral-400 hover:text-neutral-100 text-sm">
          ← back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col items-center gap-4 sm:gap-6">
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[auto_auto] sm:gap-x-3">
        <div className="flex flex-wrap items-center gap-2 text-sm max-w-[var(--board-size)] sm:col-start-1 sm:row-start-1">
          <span className="text-neutral-500 uppercase tracking-wide text-xs">
            {topIsBlack ? 'black' : 'white'}
          </span>
          <span className="text-neutral-100 font-medium">{topName ?? '—'}</span>
          <CapturedPieces pieces={topCaptured} />
          {showClocks && topClock !== null && (
            <span
              className={`ml-auto font-mono tabular-nums px-1.5 py-0.5 rounded ${
                topActive
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
              }`}
            >
              {formatClock(topClock)}
            </span>
          )}
        </div>
        <div className="relative sm:col-start-1 sm:row-start-2">
          <Chessground
            config={{ viewOnly: true, coordinates: true, orientation }}
            onReady={(api) => {
              apiRef.current = api
              api.set({ fen })
            }}
          />
          <button
            type="button"
            onClick={() =>
              setOrientation((o) => (o === 'white' ? 'black' : 'white'))
            }
            aria-label="flip board"
            title="flip board"
            className="absolute -top-2 -right-2 bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 rounded-full p-1.5 leading-none shadow"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm max-w-[var(--board-size)] sm:col-start-1 sm:row-start-3">
          <span className="text-neutral-500 uppercase tracking-wide text-xs">
            {topIsBlack ? 'white' : 'black'}
          </span>
          <span className="text-neutral-100 font-medium">
            {bottomName ?? '—'}
          </span>
          <CapturedPieces pieces={bottomCaptured} />
          {showClocks && bottomClock !== null && (
            <span
              className={`ml-auto font-mono tabular-nums px-1.5 py-0.5 rounded ${
                bottomActive
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
              }`}
            >
              {formatClock(bottomClock)}
            </span>
          )}
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
                <span className="text-neutral-500 w-6 shrink-0 text-right">
                  {i + 1}.
                </span>
                <span className="text-neutral-100 w-14 shrink-0">
                  {moves[i * 2]}
                </span>
                <span className="text-neutral-300">{moves[i * 2 + 1] ?? ''}</span>
              </li>
            ))
          )}
        </ol>
        <div className="text-sm text-center sm:col-start-2 sm:row-start-3">
          {gameStatus === 'ended' && result ? (
            <span className="text-neutral-100 font-medium">{result}</span>
          ) : gameStatus === 'playing' ? (
            <span className="text-neutral-500 italic">playing</span>
          ) : null}
        </div>
      </div>

      <div className="text-xs text-neutral-500 flex items-center gap-4">
        <span
          aria-label={connStatus}
          title={connStatus}
          className={`inline-block w-2 h-2 rounded-full ${
            connStatus === 'connected'
              ? 'bg-green-500'
              : connStatus === 'connecting'
                ? 'bg-amber-400'
                : 'bg-red-500'
          }`}
        />
        <span>move {Math.ceil(moves.length / 2)}</span>
      </div>
    </div>
  )
}
