export const API_URL = import.meta.env.VITE_API_URL as string
export const SSE_URL = `${API_URL}/sse/stream`

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type Engine = {
  id: string
  name: string
  command: string
  description: string
}

export type GameStatus = 'playing' | 'ended'

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

export type StreamStatus = 'idle' | 'playing' | 'ended'

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
      from: string
      to: string
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
