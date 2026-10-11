/**
 * Optional Supabase Image Transformations (Pro+).
 * Set VITE_SUPABASE_IMAGE_TRANSFORM=true when enabled in the dashboard.
 * Free plans keep the original public URL.
 */

export type ListingImageSize = 'card' | 'thumb' | 'detail' | 'detailThumb'

const SIZE_OPTS: Record<ListingImageSize, { width: number; height: number; quality: number }> = {
  card: { width: 800, height: 500, quality: 75 },
  thumb: { width: 160, height: 160, quality: 70 },
  detail: { width: 1280, height: 800, quality: 80 },
  detailThumb: { width: 200, height: 200, quality: 70 },
}

export function imageTransformsEnabled(): boolean {
  const flag = import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORM
  return flag === 'true' || flag === '1'
}

/** Intrinsic width/height for layout stability (matches common card / thumb ratios). */
export function listingImageDimensions(size: ListingImageSize): { width: number; height: number } {
  const opts = SIZE_OPTS[size]
  return { width: opts.width, height: opts.height }
}

/**
 * Convert a public object URL into a render/transform URL when transforms are enabled.
 * Non-Supabase URLs are returned unchanged.
 */
export function listingImageUrl(originalUrl: string, size: ListingImageSize = 'card'): string {
  if (!originalUrl || !imageTransformsEnabled()) return originalUrl

  try {
    const url = new URL(originalUrl)
    const marker = '/storage/v1/object/public/'
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return originalUrl

    const objectPath = url.pathname.slice(idx + marker.length)
    if (!objectPath) return originalUrl

    const { width, height, quality } = SIZE_OPTS[size]
    const renderPath = `/storage/v1/render/image/public/${objectPath}`
    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      resize: 'cover',
      quality: String(quality),
    })
    return `${url.origin}${renderPath}?${params.toString()}`
  } catch {
    return originalUrl
  }
}
