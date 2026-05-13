import { NavLink, Outlet } from 'react-router'

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [
    'px-2 py-1 rounded transition-colors',
    isActive
      ? 'text-neutral-100 bg-neutral-800'
      : 'text-neutral-400 hover:text-neutral-100',
  ].join(' ')
}

export default function Layout() {
  return (
    <div className="min-h-dvh flex flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4 text-sm">
          <NavLink to="/" className="font-semibold text-neutral-100">
            MachinePlay
          </NavLink>
          <NavLink to="/engine" className={navLinkClass}>
            engines
          </NavLink>
          <NavLink to="/tournament" className={navLinkClass}>
            tournaments
          </NavLink>
          <NavLink to="/about" className={navLinkClass}>
            about
          </NavLink>
          <div className="ml-auto text-neutral-500 text-xs">login soon</div>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
