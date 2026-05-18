import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Api } from '@lichess-org/chessground/api'
import { Chess } from 'chess.js'
import { Chessground } from '../Chessground'
import {
  API_URL,
  gameStreamUrl,
  type Game,
  type GameStatus,
  type StreamEvent,
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

function replay(moves: string[], ply: number) {
  const chess = new Chess()
  let lastFrom: string | undefined
  let lastTo: string | undefined
  for (let i = 0; i < ply && i < moves.length; i++) {
    try {
      const m = chess.move(moves[i])
      lastFrom = m.from
      lastTo = m.to
    } catch {
      break
    }
  }
  return { fen: chess.fen(), lastFrom, lastTo }
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>()
  const apiRef = useRef<Api | null>(null)
  const [connStatus, setConnStatus] = useState('connecting')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [whiteName, setWhiteName] = useState<string | null>(null)
  const [blackName, setBlackName] = useState<string | null>(null)
  const [moves, setMoves] = useState<string[]>([])
  const [result, setResult] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [clocks, setClocks] = useState<Clocks | null>(null)
  const [gameStatus, setGameStatus] = useState<GameStatus | null>(null)
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const moveListRef = useRef<HTMLOListElement | null>(null)
  const activeRowRef = useRef<HTMLLIElement | null>(null)

  const effectiveViewPly = viewPly ?? moves.length
  const following = viewPly === null && gameStatus === 'playing'
  const isClockTicking = gameStatus === 'playing' && following

  const { fen: displayFen, lastFrom, lastTo } = useMemo(
    () => replay(moves, effectiveViewPly),
    [moves, effectiveViewPly],
  )

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
        setResult(g.result)
        setGameStatus(g.status)
        setClocks({
          white: g.white_clock,
          black: g.black_clock,
          updatedAt: Date.now(),
        })
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
    if (gameStatus !== 'playing') return
    const es = new EventSource(gameStreamUrl(id))
    es.onopen = () => setConnStatus('connected')
    es.onerror = () =>
      setConnStatus(
        es.readyState === EventSource.CLOSED ? 'disconnected' : 'error',
      )
    es.onmessage = (e) => {
      const event: StreamEvent = JSON.parse(e.data)

      if (event.type === 'fen') {
        setWhiteName(event.white_name)
        setBlackName(event.black_name)
        setMoves(event.moves ?? [])
        setResult(event.result)
        setClocks({
          white: event.white_clock,
          black: event.black_clock,
          updatedAt: Date.now(),
        })
        setGameStatus(event.status)
      } else if (event.type === 'game_start') {
        setResult(null)
        setWhiteName(event.white_name)
        setBlackName(event.black_name)
        setMoves([])
        setClocks(null)
        setGameStatus('playing')
        setViewPly(null)
      } else if (event.type === 'move') {
        setMoves((prev) => [...prev, event.san])
        setClocks({
          white: event.white_clock,
          black: event.black_clock,
          updatedAt: Date.now(),
        })
      } else if (event.type === 'game_end') {
        setResult(event.result)
        setGameStatus('ended')
        es.close()
        setConnStatus('disconnected')
      }
    }
    return () => es.close()
  }, [id, gameStatus])

  useEffect(() => {
    apiRef.current?.set({
      fen: displayFen,
      lastMove:
        lastFrom && lastTo ? ([lastFrom, lastTo] as never) : undefined,
    })
  }, [displayFen, lastFrom, lastTo])

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [effectiveViewPly, moves.length])

  useEffect(() => {
    if (!isClockTicking) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [isClockTicking])

  const jumpTo = (targetPly: number) => {
    const clamped = Math.max(0, Math.min(moves.length, targetPly))
    if (clamped === moves.length && gameStatus === 'playing') {
      setViewPly(null)
    } else {
      setViewPly(clamped)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        jumpTo(effectiveViewPly - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        jumpTo(effectiveViewPly + 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        jumpTo(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        jumpTo(moves.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveViewPly, moves.length, gameStatus])

  const { byWhite, byBlack } = captured(displayFen)
  const sideToMove: 'white' | 'black' =
    displayFen.split(' ')[1] === 'b' ? 'black' : 'white'
  const showClocks = clocks !== null
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

  const showBanner = gameStatus === 'playing'

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
              api.set({
                fen: displayFen,
                lastMove:
                  lastFrom && lastTo
                    ? ([lastFrom, lastTo] as never)
                    : undefined,
              })
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
        <div className="flex flex-col w-full h-32 sm:w-48 sm:h-[var(--board-size)] sm:col-start-2 sm:row-start-2 bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
          <ol
            ref={moveListRef}
            className="flex-1 min-h-0 overflow-y-auto text-sm font-mono p-2 space-y-0.5"
          >
            {moves.length === 0 ? (
              <li className="text-neutral-600 italic">no moves yet</li>
            ) : (
              Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => {
                const wPly = i * 2 + 1
                const bPly = i * 2 + 2
                const wActive = effectiveViewPly === wPly
                const bActive = effectiveViewPly === bPly
                const isActiveRow = wActive || bActive
                return (
                  <li
                    key={i}
                    ref={isActiveRow ? activeRowRef : null}
                    className="flex gap-2"
                  >
                    <span className="text-neutral-500 w-6 shrink-0 text-right">
                      {i + 1}.
                    </span>
                    <button
                      type="button"
                      onClick={() => jumpTo(wPly)}
                      className={`w-14 shrink-0 text-left px-1 rounded ${
                        wActive
                          ? 'bg-neutral-100 text-neutral-900'
                          : 'text-neutral-100 hover:bg-neutral-800'
                      }`}
                    >
                      {moves[i * 2]}
                    </button>
                    {moves[i * 2 + 1] !== undefined && (
                      <button
                        type="button"
                        onClick={() => jumpTo(bPly)}
                        className={`flex-1 text-left px-1 rounded ${
                          bActive
                            ? 'bg-neutral-100 text-neutral-900'
                            : 'text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        {moves[i * 2 + 1]}
                      </button>
                    )}
                  </li>
                )
              })
            )}
          </ol>
          {showBanner && (
            <button
              type="button"
              onClick={() => jumpTo(moves.length)}
              disabled={following}
              title={
                following
                  ? 'following live moves'
                  : 'click to follow the live game'
              }
              className={`mx-1 mb-1 px-2 py-1 text-xs rounded border flex items-center justify-center gap-1.5 transition-colors ${
                following
                  ? 'border-green-700 text-green-400 cursor-default'
                  : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800 cursor-pointer'
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  following ? 'bg-green-500 animate-pulse' : 'bg-neutral-500'
                }`}
              />
              {following ? 'following' : 'not following'}
            </button>
          )}
        </div>
        <div className="text-sm text-center sm:col-start-2 sm:row-start-3">
          {gameStatus === 'ended' && result ? (
            <span className="text-neutral-100 font-medium">{result}</span>
          ) : gameStatus === 'playing' ? (
            <span className="text-neutral-500 italic">playing</span>
          ) : null}
        </div>
      </div>

      <div className="text-xs text-neutral-500 flex items-center gap-4">
        {gameStatus === 'playing' && (
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
        )}
        <span>
          move {Math.max(1, Math.ceil(effectiveViewPly / 2))}
          {effectiveViewPly < moves.length ? ` / ${Math.ceil(moves.length / 2)}` : ''}
        </span>
      </div>
    </div>
  )
}
