import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'

export function AccountPage() {
  const { user, profile, loading, refreshProfile, signOut } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)

  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
  }, [profile])

  if (loading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: '/account' }} />

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setProfileBusy(true)
    setProfileError(null)
    setProfileMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      })
      .eq('id', user!.id)
    setProfileBusy(false)
    if (error) {
      setProfileError(friendlyError(error.message, 'Could not update profile'))
      return
    }
    await refreshProfile()
    setProfileMsg('Profile saved.')
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordMsg(null)
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    setPasswordBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordBusy(false)
    if (error) {
      setPasswordError(friendlyError(error.message, 'Could not change password'))
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setPasswordMsg('Password updated.')
  }

  async function deleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.')
      return
    }
    if (!window.confirm('Permanently delete your account, listings, photos, messages, and bookings?')) {
      return
    }
    setDeleteBusy(true)
    setDeleteError(null)
    const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })
    if (error || (data as { error?: string } | null)?.error) {
      setDeleteBusy(false)
      setDeleteError(
        friendlyError(
          error?.message ?? (data as { error?: string })?.error,
          'Could not delete account. Try again or contact support.',
        ),
      )
      return
    }
    await signOut()
    window.location.assign('/')
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Seo title="Account" description="Update your Haven & Co. profile, password, or delete your account." path="/account" noIndex />

      <div className="glass-panel rounded-2xl px-5 py-5">
        <h1 className="font-display text-3xl font-bold text-ink">Account</h1>
        <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
      </div>

      <form className="glass-panel space-y-4 rounded-2xl p-5" onSubmit={saveProfile}>
        <h2 className="font-display text-xl font-semibold text-ink">Profile</h2>
        <div>
          <label htmlFor="account-name" className="block text-sm font-medium text-ink">
            Full name
          </label>
          <input
            id="account-name"
            className="form-control mt-1 w-full"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            maxLength={120}
          />
        </div>
        <div>
          <label htmlFor="account-phone" className="block text-sm font-medium text-ink">
            Phone
          </label>
          <input
            id="account-phone"
            type="tel"
            className="form-control mt-1 w-full"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            maxLength={40}
          />
        </div>
        {profileError ? <p className="text-sm text-red-700" role="alert">{profileError}</p> : null}
        {profileMsg ? <p className="text-sm text-emerald-800" role="status">{profileMsg}</p> : null}
        <button
          type="submit"
          disabled={profileBusy}
          className="btn-anim rounded-xl bg-ink px-5 py-2.5 font-semibold text-sand disabled:opacity-60"
        >
          {profileBusy ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form className="glass-panel space-y-4 rounded-2xl p-5" onSubmit={changePassword}>
        <h2 className="font-display text-xl font-semibold text-ink">Change password</h2>
        <div>
          <label htmlFor="account-password" className="block text-sm font-medium text-ink">
            New password
          </label>
          <input
            id="account-password"
            type="password"
            className="form-control mt-1 w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <div>
          <label htmlFor="account-password-confirm" className="block text-sm font-medium text-ink">
            Confirm new password
          </label>
          <input
            id="account-password-confirm"
            type="password"
            className="form-control mt-1 w-full"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        {passwordError ? <p className="text-sm text-red-700" role="alert">{passwordError}</p> : null}
        {passwordMsg ? <p className="text-sm text-emerald-800" role="status">{passwordMsg}</p> : null}
        <button
          type="submit"
          disabled={passwordBusy}
          className="btn-anim rounded-xl bg-ink px-5 py-2.5 font-semibold text-sand disabled:opacity-60"
        >
          {passwordBusy ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <div className="glass-panel space-y-3 rounded-2xl border border-red-200 bg-red-50/70 p-5">
        <h2 className="font-display text-xl font-semibold text-red-900">Delete account</h2>
        <p className="text-sm text-red-900/90">
          This permanently removes your listings, photos, messages, and bookings. Type <strong>DELETE</strong> to
          confirm.
        </p>
        <label htmlFor="account-delete-confirm" className="sr-only">
          Type DELETE to confirm account deletion
        </label>
        <input
          id="account-delete-confirm"
          className="form-control w-full"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
        />
        {deleteError ? <p className="text-sm text-red-800" role="alert">{deleteError}</p> : null}
        <button
          type="button"
          disabled={deleteBusy}
          onClick={() => void deleteAccount()}
          className="btn-anim rounded-xl border border-red-300 bg-white px-5 py-2.5 font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
        >
          {deleteBusy ? 'Deleting…' : 'Delete my account'}
        </button>
        <p className="text-xs text-ink-soft">
          Prefer to keep browsing? <Link to="/" className="underline">Return home</Link>.
        </p>
      </div>
    </div>
  )
}
