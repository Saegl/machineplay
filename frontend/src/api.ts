export const API_URL = import.meta.env.VITE_API_URL as string
export const gameStreamUrl = (gameId: string): string =>
  `${API_URL}/stream/game/${gameId}`
export const liveStreamUrl = (): string => `${API_URL}/stream/live`

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type Engine = {
  id: string
  name: string
  command: string
  description: string
}

export type Runner = {
  runner_id: string
  name: string
}

export type GameStatus = 'playing' | 'ended' | 'aborted'

export type Game = {
  id: string
  white_id: string
  black_id: string
  white_name: string
  black_name: string
  status: GameStatus
  result: string | null
  moves: string[]
  fen: string
  pgn: string | null
  white_clock: number
  black_clock: number
  created_at: string
  ended_at: string | null
}

export type StreamStatus = 'idle' | 'playing' | 'ended' | 'aborted'

export type StreamEvent =
  | {
      type: 'fen'
      fen: string
      ply: number
      white_name: string | null
      black_name: string | null
      moves: string[]
      white_clock: number
      black_clock: number
      result: string | null
      status: StreamStatus
      game_id: string | null
    }
  | {
      type: 'move'
      uci: string
      san: string
      from_square: string
      to_square: string
      fen: string
      ply: number
      white_clock: number
      black_clock: number
    }
  | {
      type: 'game_start'
      white_name: string | null
      black_name: string | null
      game_id: string | null
    }
  | { type: 'game_end'; result: string }

export type LiveStreamEvent = {
  game_id: string
  event: StreamEvent
}
