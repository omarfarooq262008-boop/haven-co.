import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    if (mode === 'login') {
      const { error: signError } = await signIn(email, password)
      setBusy(false)
      if (signError) {
        setError(signError)
        return
      }
      navigate('/')
      return
    }

    const { error: signError, needsEmailConfirm } = await signUp(email, password, fullName)
    setBusy(false)
    if (signError) {
      setError(signError)
      return
    }
    if (needsEmailConfirm) {
      setInfo('Check your email to confirm your account, then log in.')
      return
    }
    navigate('/')
  }

  return (
    <div className="glass-panel soft-enter mx-auto max-w-md rounded-2xl p-6 md:p-8">
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
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Full name</span>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded border border-line px-3 py-2 outline-none focus:border-gold"
            />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-line px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Password</span>
          <input
            required
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-line px-3 py-2 outline-none focus:border-gold"
          />
        </label>

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
