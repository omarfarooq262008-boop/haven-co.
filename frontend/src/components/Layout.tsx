import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageFade } from './PageFade'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors duration-200 ${
    isActive ? 'text-gold-dark' : 'text-ink-soft hover:text-ink'
  }`

export function Layout() {
  const { user, profile, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const isForm =
    pathname.startsWith('/listings/new') ||
    pathname.includes('/edit') ||
    pathname.endsWith('/book')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  return (
    <div className={`app-shell ${isForm ? 'app-shell--form' : 'app-shell--home'}`}>
      <div className="app-bg" aria-hidden="true" />

      <header className={`app-header sticky top-0 z-20 ${scrolled ? 'app-header--scrolled' : ''}`}>
        <div
          className={`page-container flex items-center justify-between gap-4 ${
            scrolled ? 'py-2.5' : 'py-4'
          }`}
        >
          <Link to="/" className={`font-display font-bold text-ink ${scrolled ? 'text-lg' : 'text-xl'}`}>
            Haven <span className="text-gold">&</span> Co.
          </Link>

          <nav className="flex flex-wrap items-center gap-3 sm:gap-4">
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
                {profile?.is_admin ? (
                  <NavLink to="/admin" className={linkClass}>
                    Admin
                  </NavLink>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="btn-anim rounded-xl bg-ink px-3 py-1.5 text-sm font-semibold text-sand"
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
                  className="btn-anim rounded-xl bg-gold px-3 py-1.5 text-sm font-semibold text-ink hover:bg-gold-dark"
                >
                  Sign up
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="relative z-10 py-10 md:py-12">
        <div className="page-container">
          <PageFade />
        </div>
      </main>
    </div>
  )
}
