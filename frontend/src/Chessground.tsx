import { useEffect, useRef } from 'react'
import { Chessground as NativeChessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Config } from '@lichess-org/chessground/config'

type Props = {
  config?: Config
  onReady?: (api: Api) => void
  className?: string
}

export function Chessground({ config, onReady, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)

  useEffect(() => {
    if (!ref.current) return
    apiRef.current = NativeChessground(ref.current, config)
    onReady?.(apiRef.current)
    return () => apiRef.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apiRef.current?.set(config ?? {})
  }, [config])

  return (
    <div
      ref={ref}
      className={className ? `cg-wrap ${className}` : 'cg-wrap'}
    />
  )
}
