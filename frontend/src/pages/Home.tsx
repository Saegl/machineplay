import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { API_URL, type Engine, type Game } from '../api'

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

function GameRow({ game }: { game: Game }) {
  return (
    <Link
      to={`/game/${game.id}`}
      className="block border border-neutral-800 hover:border-neutral-600 rounded px-3 py-2 transition-colors"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{game.white_name}</span>
        <span className="text-neutral-500">vs</span>
        <span className="font-medium">{game.black_name}</span>
        <span className="ml-auto font-mono text-xs text-neutral-400">
          {game.status === 'ended'
            ? (game.result ?? '*')
            : `${Math.ceil(game.moves.length / 2)} moves`}
        </span>
      </div>
      <div className="text-xs text-neutral-500 mt-0.5">
        {game.status === 'ended' && game.ended_at
          ? relativeTime(game.ended_at)
          : relativeTime(game.created_at)}
      </div>
    </Link>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [engines, setEngines] = useState<Engine[]>([])
  const [whiteId, setWhiteId] = useState('')
  const [blackId, setBlackId] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [games, setGames] = useState<Game[] | null>(null)
  const [gamesError, setGamesError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/engine`)
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
    let cancelled = false
    fetch(`${API_URL}/game`)
      .then((r) => r.json())
      .then((data: Game[]) => {
        if (!cancelled) setGames(data)
      })
      .catch(() => {
        if (!cancelled) setGamesError('failed to load games')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const startGame = async () => {
    if (!whiteId || !blackId) return
    setStarting(true)
    setStartError(null)
    try {
      const r = await fetch(`${API_URL}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          white_engine_id: whiteId,
          black_engine_id: blackId,
        }),
      })
      if (!r.ok) {
        const t = await r.text()
        setStartError(t || `error ${r.status}`)
        return
      }
      const data: { id: string } = await r.json()
      navigate(`/game/${data.id}`)
    } catch (e) {
      setStartError(String(e))
    } finally {
      setStarting(false)
    }
  }

  const live = (games ?? []).filter((g) => g.status === 'playing')
  const recent = (games ?? []).filter((g) => g.status === 'ended').slice(0, 20)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wide text-neutral-500">
          new game
        </h2>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center text-sm">
          <label className="flex items-center gap-2">
            <span className="text-neutral-400 w-12">white</span>
            <select
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 flex-1"
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
            <span className="text-neutral-400 w-12">black</span>
            <select
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 flex-1"
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
          {startError && (
            <span className="text-red-400 text-xs self-center">{startError}</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wide text-neutral-500">
          live
          {live.length > 0 && (
            <span className="ml-2 text-neutral-400 normal-case">
              ({live.length})
            </span>
          )}
        </h2>
        {games === null ? (
          <p className="text-neutral-500 text-sm italic">loading…</p>
        ) : live.length === 0 ? (
          <p className="text-neutral-500 text-sm italic">no live games</p>
        ) : (
          <div className="flex flex-col gap-2">
            {live.map((g) => (
              <GameRow key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wide text-neutral-500">
          recent
        </h2>
        {gamesError ? (
          <p className="text-red-400 text-sm">{gamesError}</p>
        ) : games === null ? (
          <p className="text-neutral-500 text-sm italic">loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-neutral-500 text-sm italic">no games yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((g) => (
              <GameRow key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
