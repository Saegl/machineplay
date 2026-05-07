import { useEffect, useState } from 'react'

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
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="max-w-xl w-full px-6 space-y-4">
        <h1 className="text-3xl font-semibold">machineplay</h1>
        <p className="text-sm text-neutral-400">
          API: <code className="text-neutral-200">{API_URL}</code>
        </p>
        {error && <p className="text-red-400">Error: {error}</p>}
        {message && (
          <p className="rounded border border-neutral-800 bg-neutral-900 p-4">
            {message}
          </p>
        )}
        {!message && !error && <p className="text-neutral-500">Loading…</p>}
      </div>
    </main>
  )
}

export default App
