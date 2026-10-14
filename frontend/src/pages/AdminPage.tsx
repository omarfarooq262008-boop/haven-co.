import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { DataState } from '../components/DataState'
import { ListingImage } from '../components/ListingImage'
import { ListingStatusBadge } from '../components/ListingStatusBadge'
import { ListingTypeBadge } from '../components/ListingTypeBadge'
import { Seo } from '../components/Seo'
import { useAuth } from '../context/AuthContext'
import { logAppEvent } from '../lib/appEvents'
import { formatListingPrice } from '../lib/format'
import {
  cancelHold,
  formatHoldFee,
  holdStatusLabel,
  type HoldStatus,
} from '../lib/holds'
import { hasMoreRows, PAGE_SIZE, rangeForPage } from '../lib/pagination'
import { supabase } from '../lib/supabase'
import type { HoldRow, Listing } from '../lib/types'

type ReportRow = {
  id: string
  listing_id: string
  reporter_id: string | null
  reason: string
  status: 'open' | 'reviewed' | 'dismissed'
  admin_note: string
  created_at: string
  listings?: Pick<Listing, 'id' | 'title' | 'city' | 'image_urls'> | null
}

type AdminHoldRow = HoldRow & {
  listings?: Pick<Listing, 'id' | 'title' | 'city'> | null
}

const HOLD_FILTERS = [
  'all',
  'pending_payment',
  'active',
  'expired',
  'refunded',
  'cancelled',
  'failed',
] as const

type HoldFilter = (typeof HOLD_FILTERS)[number]

export function AdminPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<'listings' | 'reports' | 'holds'>('listings')
  const [listings, setListings] = useState<Listing[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [holds, setHolds] = useState<AdminHoldRow[]>([])
  const [holdFilter, setHoldFilter] = useState<HoldFilter>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listingsPage, setListingsPage] = useState(0)
  const [reportsPage, setReportsPage] = useState(0)
  const [holdsPage, setHoldsPage] = useState(0)
  const [hasMoreListings, setHasMoreListings] = useState(false)
  const [hasMoreReports, setHasMoreReports] = useState(false)
  const [hasMoreHolds, setHasMoreHolds] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({})

  const isAdmin = Boolean(profile?.is_admin)

  const loadHolds = useCallback(
    async (page: number, filter: HoldFilter, append: boolean) => {
      const { from, to } = rangeForPage(page, PAGE_SIZE.admin)
      let q = supabase
        .from('holds')
        .select('*, listings(id, title, city)')
        .order('created_at', { ascending: false })
        .range(from, to)
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, error: qError } = await q
      if (qError) {
        console.error('[admin] holds', qError.message)
        setError(qError.message)
        return
      }
      const rows = (data ?? []) as AdminHoldRow[]
      setHolds((prev) => (append ? [...prev, ...rows] : rows))
      setHasMoreHolds(hasMoreRows(rows.length, PAGE_SIZE.admin))
      setHoldsPage(page)
    },
    [],
  )

  const loadInitial = useCallback(async () => {
    if (!user || !isAdmin) return
    setLoading(true)
    setError(null)
    setListingsPage(0)
    setReportsPage(0)
    setHoldsPage(0)

    const lr = rangeForPage(0, PAGE_SIZE.admin)
    const rr = rangeForPage(0, PAGE_SIZE.admin)
    const [listingsRes, reportsRes] = await Promise.all([
      supabase
        .from('listings')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .range(lr.from, lr.to),
      supabase
        .from('listing_reports')
        .select('*, listings(id, title, city, image_urls)')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .range(rr.from, rr.to),
    ])

    if (listingsRes.error) setError(listingsRes.error.message)
    else {
      const rows = (listingsRes.data ?? []) as Listing[]
      setListings(rows)
      setHasMoreListings(hasMoreRows(rows.length, PAGE_SIZE.admin))
    }
    if (reportsRes.error) {
      console.error('[admin] reports', reportsRes.error.message)
    } else {
      const rows = (reportsRes.data ?? []) as ReportRow[]
      setReports(rows)
      setHasMoreReports(hasMoreRows(rows.length, PAGE_SIZE.admin))
    }

    await loadHolds(0, holdFilter, false)
    setLoading(false)
    // holdFilter intentionally omitted — filter changes reload holds only (see below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, loadHolds])

  async function loadMoreListings() {
    const next = listingsPage + 1
    setLoadingMore(true)
    const { from, to } = rangeForPage(next, PAGE_SIZE.admin)
    const { data, error: qError } = await supabase
      .from('listings')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(from, to)
    setLoadingMore(false)
    if (qError) {
      setError(qError.message)
      return
    }
    const rows = (data ?? []) as Listing[]
    setListings((prev) => [...prev, ...rows])
    setListingsPage(next)
    setHasMoreListings(hasMoreRows(rows.length, PAGE_SIZE.admin))
  }

  async function loadMoreReports() {
    const next = reportsPage + 1
    setLoadingMore(true)
    const { from, to } = rangeForPage(next, PAGE_SIZE.admin)
    const { data, error: qError } = await supabase
      .from('listing_reports')
      .select('*, listings(id, title, city, image_urls)')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .range(from, to)
    setLoadingMore(false)
    if (qError) {
      setError(qError.message)
      return
    }
    const rows = (data ?? []) as ReportRow[]
    setReports((prev) => [...prev, ...rows])
    setReportsPage(next)
    setHasMoreReports(hasMoreRows(rows.length, PAGE_SIZE.admin))
  }

  async function loadMoreHolds() {
    setLoadingMore(true)
    await loadHolds(holdsPage + 1, holdFilter, true)
    setLoadingMore(false)
  }

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!user || !isAdmin || tab !== 'holds') return
    void (async () => {
      setLoadingMore(true)
      await loadHolds(0, holdFilter, false)
      setLoadingMore(false)
    })()
  }, [holdFilter, tab, user, isAdmin, loadHolds])

  if (authLoading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) {
    return (
      <div className="space-y-3">
        <Seo title="Admin" noIndex />
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Admin access only.
        </p>
        <Link to="/" className="text-sm text-ink-soft hover:text-ink">
          ← Browse listings
        </Link>
      </div>
    )
  }

  async function setStatus(listing: Listing, status: 'approved' | 'rejected', reason?: string) {
    setBusyId(listing.id)
    setError(null)
    const { error: updateError } = await supabase
      .from('listings')
      .update({
        status,
        rejection_reason: status === 'rejected' ? (reason?.trim() || null) : null,
      })
      .eq('id', listing.id)

    if (updateError) {
      setError(updateError.message)
      setBusyId(null)
      return
    }
    void logAppEvent(status === 'approved' ? 'listing_approved' : 'listing_rejected', 'AdminPage', {
      listing_id: listing.id,
    })
    setListings((prev) => prev.filter((item) => item.id !== listing.id))
    setBusyId(null)
  }

  async function resolveReport(report: ReportRow, status: 'reviewed' | 'dismissed') {
    setBusyId(report.id)
    const { error: updateError } = await supabase
      .from('listing_reports')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', report.id)
    setBusyId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setReports((prev) => prev.filter((r) => r.id !== report.id))
  }

  async function adminCancelHold(hold: AdminHoldRow) {
    if (
      !window.confirm(
        hold.status === 'active'
          ? 'Cancel this hold and refund the visitor?'
          : 'Cancel this unpaid hold?',
      )
    ) {
      return
    }
    setBusyId(hold.id)
    setError(null)
    const result = await cancelHold(hold.id)
    setBusyId(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    void logAppEvent(
      hold.status === 'active' ? 'hold_refunded' : 'hold_cancelled',
      'AdminPage',
      { hold_id: hold.id, listing_id: hold.listing_id },
    )
    setHolds((prev) =>
      prev.map((h) =>
        h.id === hold.id
          ? { ...h, status: hold.status === 'active' ? 'refunded' : 'cancelled' }
          : h,
      ),
    )
  }

  return (
    <div className="space-y-6">
      <Seo title="Admin" description="Review pending listings and user reports." path="/admin" noIndex />
      <div className="glass-panel rounded-2xl px-5 py-4">
        <h1 className="font-display text-3xl font-bold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-ink-soft">Review pending listings, holds, and safety reports.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Admin sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'listings'}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              tab === 'listings' ? 'bg-ink text-sand' : 'border border-line bg-white/70 text-ink'
            }`}
            onClick={() => setTab('listings')}
          >
            Pending listings ({listings.length}
            {hasMoreListings ? '+' : ''})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'holds'}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              tab === 'holds' ? 'bg-ink text-sand' : 'border border-line bg-white/70 text-ink'
            }`}
            onClick={() => setTab('holds')}
          >
            Holds ({holds.length}
            {hasMoreHolds ? '+' : ''})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'reports'}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              tab === 'reports' ? 'bg-ink text-sand' : 'border border-line bg-white/70 text-ink'
            }`}
            onClick={() => setTab('reports')}
          >
            Reports ({reports.length}
            {hasMoreReports ? '+' : ''})
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <DataState loading={loading} onRetry={() => void loadInitial()} loadingMessage="Loading admin queue…">
        {tab === 'holds' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {HOLD_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHoldFilter(f)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    holdFilter === f ? 'bg-ink text-sand' : 'border border-line bg-white/70 text-ink'
                  }`}
                >
                  {f === 'all' ? 'All' : holdStatusLabel(f)}
                </button>
              ))}
            </div>
            {holds.length === 0 ? (
              <p className="text-ink-soft">No holds match this filter.</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {holds.map((hold) => (
                    <li key={hold.id} className="glass-card space-y-2 rounded-2xl p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950">
                          {holdStatusLabel(hold.status as HoldStatus)}
                        </span>
                        <span className="text-sm font-semibold text-ink">
                          {formatHoldFee(hold.amount, hold.currency)}
                        </span>
                        <span className="text-xs text-ink-soft">via {hold.provider}</span>
                      </div>
                      {hold.listings ? (
                        <Link
                          to={`/listings/${hold.listings.id}`}
                          className="font-semibold text-ink hover:text-gold-dark"
                        >
                          {hold.listings.title}
                        </Link>
                      ) : (
                        <p className="font-semibold text-ink">Listing {hold.listing_id}</p>
                      )}
                      <p className="text-xs text-ink-soft">
                        Created {new Date(hold.created_at).toLocaleString()} · Expires{' '}
                        {new Date(hold.expires_at).toLocaleString()}
                        {hold.provider_reference
                          ? ` · Ref ${hold.provider_reference.slice(0, 16)}…`
                          : ''}
                      </p>
                      {(hold.status === 'active' || hold.status === 'pending_payment') && (
                        <button
                          type="button"
                          disabled={busyId === hold.id}
                          onClick={() => void adminCancelHold(hold)}
                          className="btn-anim rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {busyId === hold.id ? 'Cancelling…' : 'Cancel hold'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {hasMoreHolds ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => void loadMoreHolds()}
                      className="btn-anim rounded-xl border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-sand disabled:opacity-60"
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : tab === 'listings' ? (
          listings.length === 0 ? (
            <p className="text-ink-soft">No listings waiting for review.</p>
          ) : (
            <>
              <ul className="space-y-4">
                {listings.map((listing) => (
                  <li key={listing.id} className="glass-card space-y-4 rounded-2xl p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-line">
                        {listing.image_urls?.[0] ? (
                          <ListingImage
                            src={listing.image_urls[0]}
                            alt={`${listing.title} thumbnail`}
                            size="thumb"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <ListingTypeBadge listingType={listing.listing_type} />
                          <ListingStatusBadge status={listing.status} />
                        </div>
                        <Link
                          to={`/listings/${listing.id}`}
                          className="font-semibold text-ink hover:text-gold-dark"
                        >
                          {listing.title}
                        </Link>
                        <p className="text-sm text-ink-soft">
                          {formatListingPrice(Number(listing.price), listing.listing_type ?? 'sale')} ·{' '}
                          {listing.city}
                        </p>
                        <p className="line-clamp-2 text-sm text-ink-soft">{listing.description}</p>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-line pt-3">
                      <label className="block text-sm font-medium text-ink" htmlFor={`reject-${listing.id}`}>
                        Rejection reason (optional)
                      </label>
                      <textarea
                        id={`reject-${listing.id}`}
                        rows={2}
                        maxLength={500}
                        value={rejectDrafts[listing.id] ?? ''}
                        onChange={(e) =>
                          setRejectDrafts((prev) => ({ ...prev, [listing.id]: e.target.value }))
                        }
                        placeholder="Shown to the owner if you reject…"
                        className="form-control w-full resize-y"
                        disabled={busyId === listing.id}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === listing.id}
                          onClick={() => void setStatus(listing, 'approved')}
                          className="btn-anim rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
                        >
                          {busyId === listing.id ? 'Saving…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === listing.id}
                          onClick={() => void setStatus(listing, 'rejected', rejectDrafts[listing.id])}
                          className="btn-anim rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {hasMoreListings ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMoreListings()}
                    className="btn-anim rounded-xl border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-sand disabled:opacity-60"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              ) : null}
            </>
          )
        ) : reports.length === 0 ? (
          <p className="text-ink-soft">No open reports.</p>
        ) : (
          <>
            <ul className="space-y-4">
              {reports.map((report) => (
                <li key={report.id} className="glass-card space-y-3 rounded-2xl p-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-line">
                      {report.listings?.image_urls?.[0] ? (
                        <ListingImage
                          src={report.listings.image_urls[0]}
                          alt={`${report.listings.title ?? 'Listing'} thumbnail`}
                          size="thumb"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {report.listings ? (
                        <Link
                          to={`/listings/${report.listings.id}`}
                          className="font-semibold text-ink hover:text-gold-dark"
                        >
                          {report.listings.title}
                        </Link>
                      ) : (
                        <p className="font-semibold text-ink">Listing unavailable</p>
                      )}
                      <p className="text-sm text-ink-soft">
                        Reported {new Date(report.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm text-ink">{report.reason}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <button
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => void resolveReport(report, 'reviewed')}
                      className="btn-anim rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-sand disabled:opacity-60"
                    >
                      Mark reviewed
                    </button>
                    <button
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => void resolveReport(report, 'dismissed')}
                      className="btn-anim rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {hasMoreReports ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMoreReports()}
                  className="btn-anim rounded-xl border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-sand disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </DataState>
    </div>
  )
}
