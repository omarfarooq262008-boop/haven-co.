import { Bath, BedDouble, Ruler } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../lib/format'
import type { Listing } from '../lib/types'
import { HoldBadge } from './HoldBadge'
import { ListingImage } from './ListingImage'
import { ListingTypeBadge } from './ListingTypeBadge'

type Props = {
  listing: Listing
  index?: number
}

function formatArea(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

export function ListingCard({ listing, index = 0 }: Props) {
  const isRent = (listing.listing_type ?? 'sale') === 'rent'
  const price = formatPrice(Number(listing.price))
  const delayMs = Math.min(index, 8) * 55

  return (
    <Link
      to={`/listings/${listing.id}`}
      style={{ animationDelay: `${delayMs}ms` }}
      className="listing-card glass-card home-slide-in group relative block min-w-0 overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
      <div className="listing-card-layout">
        <div className="listing-card-media relative min-w-0 overflow-hidden bg-sand/60">
          {listing.image_urls?.[0] ? (
            <ListingImage
              src={listing.image_urls[0]}
              alt={`${listing.title} in ${listing.city}`}
              size="card"
              className="listing-card-photo h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-ink-soft">
              No photo
            </div>
          )}
          <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-1.5 sm:left-4 sm:top-4">
            <ListingTypeBadge listingType={listing.listing_type} />
            {listing.hold_status === 'on_hold' ? <HoldBadge /> : null}
          </div>
        </div>

        <div className="listing-card-details relative z-20 flex min-w-0 flex-col gap-2.5 bg-white/90 p-4 sm:gap-3 sm:p-5">
          <div className="min-w-0">
            <p className="listing-card-price font-display font-bold leading-[1.15] text-ink">
              <span className="break-words [overflow-wrap:anywhere]">{price}</span>
              {isRent && (
                <span className="ml-1 inline break-words text-[0.55em] font-semibold text-ink-soft">
                  / month
                </span>
              )}
            </p>
            <h2 className="listing-card-title mt-2 line-clamp-2 break-words font-medium leading-snug text-ink">
              {listing.title}
            </h2>
            <p className="mt-1.5 truncate text-sm text-ink-soft sm:text-[0.95rem]">{listing.city}</p>
          </div>

          <ul className="listing-card-meta mt-1 flex min-w-0 flex-row flex-wrap gap-x-4 gap-y-2 text-sm text-ink-soft sm:text-[0.95rem]">
            <li className="inline-flex min-w-0 items-center gap-2">
              <BedDouble className="h-4 w-4 shrink-0 text-ink" aria-hidden />
              <span className="min-w-0 break-words">{listing.bedrooms} beds</span>
            </li>
            <li className="inline-flex min-w-0 items-center gap-2">
              <Bath className="h-4 w-4 shrink-0 text-ink" aria-hidden />
              <span className="min-w-0 break-words">{listing.bathrooms} baths</span>
            </li>
            {listing.area_sqft != null && (
              <li className="inline-flex min-w-0 items-center gap-2">
                <Ruler className="h-4 w-4 shrink-0 text-ink" aria-hidden />
                <span className="min-w-0 break-words">
                  {formatArea(Number(listing.area_sqft))} sqft
                </span>
              </li>
            )}
          </ul>

          <span className="mt-auto pt-2 text-sm font-semibold text-gold-dark sm:pt-3 sm:text-[0.95rem]">
            View details →
          </span>
        </div>
      </div>
    </Link>
  )
}

export function ListingCardSkeleton({ index = 0 }: { index?: number }) {
  const delayMs = Math.min(index, 8) * 55
  return (
    <div
      className="listing-card glass-card home-slide-in block overflow-hidden rounded-2xl"
      style={{ animationDelay: `${delayMs}ms` }}
      aria-hidden
    >
      <div className="listing-card-layout animate-pulse">
        <div className="listing-card-media bg-sand/70" />
        <div className="listing-card-details flex min-w-0 flex-col gap-3 bg-white/90 p-5">
          <div className="h-8 w-3/4 rounded-md bg-ink/10" />
          <div className="h-5 w-full rounded-md bg-ink/10" />
          <div className="h-4 w-1/2 rounded-md bg-ink/10" />
          <div className="mt-2 space-y-2.5">
            <div className="h-4 w-2/3 rounded-md bg-ink/10" />
            <div className="h-4 w-1/2 rounded-md bg-ink/10" />
          </div>
          <div className="mt-auto h-4 w-28 rounded-md bg-ink/10" />
        </div>
      </div>
    </div>
  )
}
