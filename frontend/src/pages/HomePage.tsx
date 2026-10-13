import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BuyRentToggle } from '../components/BuyRentToggle'
import { DataState } from '../components/DataState'
import { ListingCard, ListingCardSkeleton } from '../components/ListingCard'
import { Seo } from '../components/Seo'
import { PROPERTY_TYPES } from '../lib/listingForm'
import {
  listingTypeForSection,
  sectionFromSearch,
  validatePriceFilters,
} from '../lib/marketFilters'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Listing, MarketSection, PropertyType } from '../lib/types'

type Filters = {
  city: string
  minPrice: string
  maxPrice: string
  propertyType: '' | PropertyType
}

const emptyFilters: Filters = {
  city: '',
  minPrice: '',
  maxPrice: '',
  propertyType: '',
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section = sectionFromSearch(searchParams.get('type'))
  const listingType = listingTypeForSection(section)

  const [listings, setListings] = useState<Listing[]>([])
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [applied, setApplied] = useState<Filters>(emptyFilters)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('Add your Supabase keys to frontend/.env (see .env.example).')
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .eq('listing_type', listingType)
        .order('created_at', { ascending: false })

      if (applied.city.trim()) query = query.ilike('city', `%${applied.city.trim()}%`)
      if (applied.propertyType) query = query.eq('property_type', applied.propertyType)
      if (applied.minPrice.trim()) query = query.gte('price', Number(applied.minPrice))
      if (applied.maxPrice.trim()) query = query.lte('price', Number(applied.maxPrice))

      const { data, error: qError } = await query
      if (cancelled) return
      if (qError) setError(qError.message)
      else setListings((data ?? []) as Listing[])
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [applied, listingType])

  function setSection(next: MarketSection) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('type', next)
    setSearchParams(nextParams, { replace: false })
  }

  function applyFilters(e: FormEvent) {
    e.preventDefault()
    const priceError = validatePriceFilters(filters)
    if (priceError) {
      setFilterError(priceError)
      return
    }

    setFilterError(null)
    setApplied({ ...filters })
  }

  const emptyMessage =
    section === 'rent' ? 'No rentals yet' : 'No properties for sale yet'
  const emptyWithFilters =
    section === 'rent'
      ? 'No rentals match these filters.'
      : 'No properties for sale match these filters.'
  const hasFilters =
    Boolean(applied.city.trim()) ||
    Boolean(applied.minPrice.trim()) ||
    Boolean(applied.maxPrice.trim()) ||
    Boolean(applied.propertyType)

  return (
    <div className="space-y-10 md:space-y-12">
      <Seo
        title={section === 'rent' ? 'Homes for rent' : 'Homes for sale'}
        description={
          section === 'rent'
            ? 'Browse rental homes listed by real owners on Haven & Co.'
            : 'Browse homes for sale listed by real owners on Haven & Co.'
        }
        path={section === 'rent' ? '/?type=rent' : '/'}
      />
      <section
        className="glass-panel home-slide-in rounded-2xl px-5 py-8 md:px-8 md:py-10"
        style={{ animationDelay: '0ms' }}
        aria-labelledby="home-heading"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">
          Find your next place
        </p>
        <h1 id="home-heading" className="mt-2 max-w-2xl font-display text-4xl font-bold text-ink md:text-5xl">
          Browse homes listed by real owners
        </h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Filter by city, price, and property type — then open a listing to message the owner.
        </p>

        <form className="mt-8 grid gap-3 md:grid-cols-5" onSubmit={applyFilters} aria-label="Listing filters">
          <div className="md:col-span-1">
            <label htmlFor="filter-city" className="sr-only">
              City
            </label>
            <input
              id="filter-city"
              value={filters.city}
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
              placeholder="City"
              className="w-full rounded-xl border border-line bg-white/90 px-4 py-3 text-ink outline-none ring-gold focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="filter-min-price" className="sr-only">
              Minimum price
            </label>
            <input
              id="filter-min-price"
              type="number"
              min="0"
              value={filters.minPrice}
              onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
              placeholder="Min price"
              className="w-full rounded-xl border border-line bg-white/90 px-4 py-3 text-ink outline-none ring-gold focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="filter-max-price" className="sr-only">
              Maximum price
            </label>
            <input
              id="filter-max-price"
              type="number"
              min="0"
              value={filters.maxPrice}
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
              placeholder="Max price"
              className="w-full rounded-xl border border-line bg-white/90 px-4 py-3 text-ink outline-none ring-gold focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="filter-property-type" className="sr-only">
              Property type
            </label>
            <select
              id="filter-property-type"
              value={filters.propertyType}
              onChange={(e) =>
                setFilters((f) => ({ ...f, propertyType: e.target.value as Filters['propertyType'] }))
              }
              className="w-full rounded-xl border border-line bg-white/90 px-4 py-3 text-ink outline-none ring-gold focus:ring-2"
            >
            <option value="">All types</option>
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn-anim flex-1 rounded-xl bg-gold px-4 py-3 font-semibold text-ink hover:bg-gold-dark"
            >
              Filter
            </button>
            <button
              type="button"
              className="btn-anim rounded-xl border border-line bg-white/50 px-4 py-3 text-sm font-semibold text-ink-soft hover:text-ink"
              onClick={() => {
                setFilters(emptyFilters)
                setApplied(emptyFilters)
                setFilterError(null)
              }}
            >
              Clear
            </button>
          </div>
        </form>
        {filterError && <p className="mt-3 text-sm text-red-700">{filterError}</p>}
      </section>

      <div className="home-slide-in" style={{ animationDelay: '80ms' }}>
        <BuyRentToggle value={section} onChange={setSection} />
      </div>

      {error ? (
        <DataState error={error} onRetry={() => setApplied({ ...applied })} />
      ) : null}

      <div className="listings-fullbleed">
        {loading ? (
          <div className="listings-grid" aria-busy="true" aria-label="Loading listings">
            {Array.from({ length: 4 }, (_, i) => (
              <ListingCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <p className="glass-panel home-slide-in rounded-2xl px-4 py-3 text-ink-soft">
            {hasFilters ? emptyWithFilters : emptyMessage}
          </p>
        ) : (
          <div className="listings-grid">
            {listings.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
