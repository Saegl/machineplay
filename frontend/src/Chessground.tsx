import { useEffect, useRef } from 'react'
import { Chessground as NativeChessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Config } from '@lichess-org/chessground/config'

export function Chessground({ config }: { config?: Config }) {
  const ref = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)

  useEffect(() => {
    if (!ref.current) return
    apiRef.current = NativeChessground(ref.current, config)
    return () => apiRef.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apiRef.current?.set(config ?? {})
  }, [config])

  return <div ref={ref} className="cg-wrap" />
}
