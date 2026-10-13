import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageFade } from './PageFade'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-sm text-sm font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)] ${
    isActive ? 'text-gold-dark' : 'text-ink hover:text-ink'
  }`

export function Layout() {
  const { user, profile, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const isForm =
    pathname.startsWith('/listings/new') ||
    pathname.includes('/edit') ||
    pathname.endsWith('/book') ||
    pathname === '/account'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  return (
    <div className={`app-shell ${isForm ? 'app-shell--form' : 'app-shell--home'}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="app-bg" aria-hidden="true" />

      {offline ? (
        <div className="relative z-30 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950" role="status">
          You are offline. Some actions may not work until you reconnect.
        </div>
      ) : null}

      <header className={`app-header sticky top-0 z-20 ${scrolled ? 'app-header--scrolled' : ''}`}>
        <div
          className={`page-container flex items-center justify-between gap-4 ${
            scrolled ? 'py-2.5' : 'py-4'
          }`}
        >
          <Link
            to="/"
            className={`font-display font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)] ${scrolled ? 'text-lg' : 'text-xl'}`}
          >
            Haven <span className="text-gold-dark">&</span> Co.
          </Link>

          <nav className="flex flex-wrap items-center gap-3 sm:gap-4" aria-label="Primary">
            <NavLink to="/" end className={linkClass}>
              Browse
            </NavLink>

            {!loading && user && (
              <>
                <NavLink to="/listings/new" className={linkClass}>
                  Add listing
                </NavLink>
                <NavLink to="/my-listings" className={linkClass}>
                  My listings
                </NavLink>
                <NavLink to="/my-bookings" className={linkClass}>
                  My bookings
                </NavLink>
                <NavLink to="/messages" className={linkClass}>
                  Messages
                </NavLink>
                <NavLink to="/account" className={linkClass}>
                  Account
                </NavLink>
                {profile?.is_admin ? (
                  <NavLink to="/admin" className={linkClass}>
                    Admin
                  </NavLink>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="btn-anim rounded-xl bg-ink px-3 py-1.5 text-sm font-semibold text-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
                >
                  Logout
                </button>
              </>
            )}

            {!loading && !user && (
              <>
                <NavLink to="/login" className={linkClass}>
                  Login
                </NavLink>
                <NavLink
                  to="/signup"
                  className="btn-anim rounded-xl bg-gold px-3 py-1.5 text-sm font-semibold text-ink hover:bg-gold-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
                >
                  Sign up
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content" className="relative z-10 py-10 md:py-12" tabIndex={-1}>
        <div className="page-container">
          <PageFade />
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/40 bg-white/90">
        <div className="page-container flex flex-col gap-3 py-6 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display font-semibold text-ink">
            Haven <span className="text-gold-dark">&</span> Co.
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer">
            <Link to="/privacy" className="font-medium text-ink underline-offset-2 hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="font-medium text-ink underline-offset-2 hover:underline">
              Terms
            </Link>
            <Link to="/contact" className="font-medium text-ink underline-offset-2 hover:underline">
              Contact
            </Link>
            <Link to="/status" className="font-medium text-ink underline-offset-2 hover:underline">
              Status
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
