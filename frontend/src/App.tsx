import { useEffect, useState } from 'react'
import { Chessground } from './Chessground'

const API_URL = import.meta.env.VITE_API_URL

function App() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/`)
      .then((r) => r.json())
      .then(setMessage)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-neutral-950 text-neutral-100">
      <h1 className="text-3xl font-semibold">machineplay</h1>

      <Chessground
        config={{
          viewOnly: true,
          coordinates: true,
        }}
      />

      <div className="text-xs text-neutral-500 space-y-1 text-center">
        <p>API: <code className="text-neutral-300">{API_URL}</code></p>
        {error && <p className="text-red-400">Error: {error}</p>}
        {message && <p className="text-neutral-300">{message}</p>}
        {!message && !error && <p>Loading…</p>}
      </div>
    </main>
  )
}

export default App
