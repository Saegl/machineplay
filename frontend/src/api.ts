import type {
  EngineOut,
  GameOut,
  RunnerOut,
  SseStreamResponse,
} from './api/generated'

export const API_URL = import.meta.env.VITE_API_URL as string
export const gameStreamUrl = (gameId: string): string =>
  `${API_URL}/stream/game/${gameId}`
export const liveStreamUrl = (): string => `${API_URL}/stream/live`

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type Engine = EngineOut
export type Runner = RunnerOut
export type Game = GameOut
export type StreamEvent = SseStreamResponse

export type { GameStatus, LiveStreamEvent } from './api/generated'
