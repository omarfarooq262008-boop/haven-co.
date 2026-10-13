const SITE_NAME = 'Haven & Co.'
const DEFAULT_DESCRIPTION =
  'Browse homes listed by real owners. Filter by buy or rent, message sellers, and book viewings on Haven & Co.'

export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  const fromEnv = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '')
  return fromEnv || 'https://havenandco.example'
}

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${siteOrigin()}${path}`
}

export function pageTitle(title?: string): string {
  if (!title?.trim()) return `${SITE_NAME} — Real Estate`
  if (title.includes(SITE_NAME)) return title
  return `${title.trim()} · ${SITE_NAME}`
}

export function defaultDescription(): string {
  return DEFAULT_DESCRIPTION
}

export { SITE_NAME, DEFAULT_DESCRIPTION }

export type SeoInput = {
  title?: string
  description?: string
  path?: string
  image?: string | null
  type?: 'website' | 'article' | 'product'
  noIndex?: boolean
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

function upsertJsonLd(data: Record<string, unknown> | Record<string, unknown>[] | null | undefined) {
  const id = 'haven-jsonld'
  const existing = document.getElementById(id)
  if (!data) {
    existing?.remove()
    return
  }
  const el = existing ?? document.createElement('script')
  el.id = id
  el.setAttribute('type', 'application/ld+json')
  el.textContent = JSON.stringify(data)
  if (!existing) document.head.appendChild(el)
}

/** Apply document title + meta tags (SPA best-effort). */
export function applySeo(input: SeoInput): void {
  const title = pageTitle(input.title)
  const description = (input.description?.trim() || DEFAULT_DESCRIPTION).slice(0, 300)
  const url = absoluteUrl(input.path || (typeof window !== 'undefined' ? window.location.pathname : '/'))
  const image = input.image ? absoluteUrl(input.image) : absoluteUrl('/bg.png')
  const type = input.type ?? 'website'

  document.title = title
  upsertMeta('name', 'description', description)
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', title)
  upsertMeta('name', 'twitter:description', description)
  upsertMeta('name', 'twitter:image', image)
  upsertMeta('property', 'og:site_name', SITE_NAME)
  upsertMeta('property', 'og:type', type)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:url', url)
  upsertMeta('property', 'og:image', image)
  upsertMeta('name', 'robots', input.noIndex ? 'noindex, nofollow' : 'index, follow')
  upsertLink('canonical', url)
  upsertJsonLd(input.jsonLd)
}

export function realEstateListingJsonLd(opts: {
  id: string
  title: string
  description: string
  price: number
  listingType: 'sale' | 'rent'
  city: string
  address?: string | null
  image?: string | null
  bedrooms?: number
  bathrooms?: number
  areaSqft?: number | null
}): Record<string, unknown> {
  const url = absoluteUrl(`/listings/${opts.id}`)
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: opts.title,
    description: opts.description.slice(0, 5000),
    url,
    datePosted: undefined,
    image: opts.image ? [absoluteUrl(opts.image)] : undefined,
    offers: {
      '@type': 'Offer',
      price: opts.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      businessFunction:
        opts.listingType === 'rent'
          ? 'https://schema.org/LeaseOut'
          : 'https://schema.org/Sell',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: opts.city,
      streetAddress: opts.address || undefined,
    },
    numberOfRooms: opts.bedrooms,
    numberOfBathroomsTotal: opts.bathrooms,
    floorSize: opts.areaSqft
      ? { '@type': 'QuantitativeValue', value: opts.areaSqft, unitCode: 'FTK' }
      : undefined,
  }
}
