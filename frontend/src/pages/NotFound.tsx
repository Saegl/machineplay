import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16 flex flex-col items-center gap-3 text-center">
      <p className="text-3xl font-semibold">404</p>
      <p className="text-neutral-400">that page doesn't exist.</p>
      <Link to="/" className="text-neutral-100 underline text-sm">
        back to home
      </Link>
    </div>
  )
}
