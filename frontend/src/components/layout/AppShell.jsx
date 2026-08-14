import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Bell, LogOut } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import CarePilotLogo from '../CarePilotLogo'
import logOut from '../../features/logOut'
import { setUserdata } from '../../redux/userSlice'

const NAV_ITEMS = [
  { to: '/', id: 'command', label: 'Dashboard', end: true },
  { to: '/intake', id: 'intake', label: 'New Case' },
  { to: '/queue', id: 'queue', label: 'Case Queue' },
  { to: '/staff', id: 'staff', label: 'Staff' },
  { to: '/reports', id: 'reports', label: 'Reports' },
  { to: '/analytics', id: 'analytics', label: 'Analytics' },
  { to: '/movement', id: 'movement', label: 'Patient Movement' },
]

function AppShell({ children }) {
  const location = useLocation()
  const dispatch = useDispatch()
  const userData = useSelector((state) => state.user.userData)
  const [signingOut, setSigningOut] = useState(false)
  const staffName =
    userData?.name || userData?.email || userData?.displayName || 'Staff'
  const initials = staffName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await logOut()
    } finally {
      dispatch(setUserdata(null))
      setSigningOut(false)
    }
  }

  const isNavActive = (item) => {
    if (item.id === 'command') return location.pathname === '/'
    if (item.id === 'queue') {
      return (
        location.pathname.startsWith('/queue') ||
        location.pathname.startsWith('/case/')
      )
    }
    return location.pathname.startsWith(item.to)
  }

  return (
    <div
      className="h-screen w-full flex flex-col overflow-hidden bg-[var(--cf-bg)]"
      style={{ fontFamily: 'var(--cf-font-ui)' }}
    >
      <header className="border-b border-[var(--cf-border)] bg-[var(--cf-surface)] shrink-0 no-print">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <CarePilotLogo size={32} className="shrink-0 rounded-md" />
            <div className="leading-tight">
              <p className="text-[14px] font-semibold text-[var(--cf-ink)]">CarePilot Ai</p>
              <p className="text-[11px] text-[var(--cf-ink-faint)]">Hospital Command</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item)
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  className={`text-[13.5px] px-3 py-2 rounded-md font-medium transition-colors no-underline ${
                    active
                      ? 'bg-[var(--cf-ink)] text-white'
                      : 'bg-transparent text-[var(--cf-ink-soft)] hover:bg-[var(--cf-surface-sunken)]'
                  }`}
                >
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              aria-label="Notifications"
              className="w-9 h-9 rounded-full border border-[var(--cf-border)] grid place-items-center text-[var(--cf-ink-soft)] hover:bg-[var(--cf-surface-sunken)] bg-white cursor-pointer"
            >
              <Bell size={16} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[var(--cf-brand-soft)] text-[var(--cf-brand)] grid place-items-center text-[12px] font-semibold">
                {initials || 'S'}
              </div>
              <div className="leading-tight hidden sm:block">
                <p className="text-[13px] font-medium text-[var(--cf-ink)]">{staffName}</p>
                <p className="text-[11px] text-[var(--cf-ink-faint)]">Clinical staff</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                aria-label="Sign out"
                title="Sign out"
                className="ml-1 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--cf-border)] bg-white text-[12.5px] font-medium text-[var(--cf-ink-soft)] hover:bg-[var(--cf-surface-sunken)] hover:text-[var(--cf-ink)] cursor-pointer disabled:opacity-60"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  )
}

export default AppShell
