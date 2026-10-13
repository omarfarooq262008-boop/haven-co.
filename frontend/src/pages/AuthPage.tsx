import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../lib/errors'

type Mode = 'login' | 'signup'

export function AuthPage({ mode: modeProp }: { mode?: Mode }) {
  const { user, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const mode: Mode =
    modeProp ?? (location.pathname.includes('signup') ? 'signup' : 'login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rawFrom = (location.state as { from?: string } | null)?.from
  const from =
    typeof rawFrom === 'string' && rawFrom.startsWith('/') && !rawFrom.startsWith('//')
      ? rawFrom
      : '/'

  if (user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    if (mode === 'login') {
      const { error: signError } = await signIn(email, password)
      setBusy(false)
      if (signError) {
        setError(friendlyError(signError, 'Could not log in. Please try again.'))
        return
      }
      navigate(from)
      return
    }

    const { error: signError, needsEmailConfirm } = await signUp(email, password, fullName)
    setBusy(false)
    if (signError) {
      setError(friendlyError(signError, 'Could not create your account. Please try again.'))
      return
    }
    if (needsEmailConfirm) {
      setInfo('Check your email to confirm your account, then log in.')
      return
    }
    navigate(from)
  }

  return (
    <div className="glass-panel soft-enter mx-auto max-w-md rounded-2xl p-6 md:p-8">
      <Seo
        title={mode === 'login' ? 'Log in' : 'Sign up'}
        description={
          mode === 'login'
            ? 'Sign in to Haven & Co. to message owners and book viewings.'
            : 'Create a Haven & Co. account to list homes and message owners.'
        }
        path={mode === 'login' ? '/login' : '/signup'}
        noIndex
      />
      <h1 className="font-display text-3xl font-bold">
        {mode === 'login' ? 'Log in' : 'Create account'}
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        {mode === 'login'
          ? 'Sign in with your email and password.'
          : 'Sign up with email and password to list homes and message owners.'}
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        {mode === 'signup' && (
          <div className="space-y-1 text-sm">
            <label htmlFor="auth-full-name" className="font-medium text-ink">
              Full name
            </label>
            <input
              id="auth-full-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="form-control w-full"
              autoComplete="name"
            />
          </div>
        )}
        <div className="space-y-1 text-sm">
          <label htmlFor="auth-email" className="font-medium text-ink">
            Email
          </label>
          <input
            id="auth-email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="form-control w-full"
          />
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="auth-password" className="font-medium text-ink">
            Password
          </label>
          <input
            id="auth-password"
            required
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="form-control w-full"
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {info && <p className="text-sm text-ink-soft">{info}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn-anim w-full rounded-xl bg-ink py-2.5 font-semibold text-sand disabled:opacity-60"
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink-soft">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <Link to="/signup" className="font-semibold text-gold-dark">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-gold-dark">
              Log in
            </Link>
          </>
        )}
      </p>
      <p className="mt-3 text-sm">
        <Link to="/" className="text-ink-soft hover:text-ink">
          ← Back to listings
        </Link>
      </p>
    </div>
  )
}
