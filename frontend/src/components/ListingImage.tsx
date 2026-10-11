import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import {
  listingImageDimensions,
  listingImageUrl,
  type ListingImageSize,
} from '../lib/listingImageUrl'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> & {
  src: string
  size?: ListingImageSize
  /** Override intrinsic size used for layout stability */
  width?: number
  height?: number
}

/**
 * Lazy-loaded listing photo with width/height to limit CLS.
 * Falls back to the original URL if a transform URL fails (e.g. Free plan).
 */
export function ListingImage({
  src,
  size = 'card',
  alt,
  className,
  width,
  height,
  loading = 'lazy',
  decoding = 'async',
  ...rest
}: Props) {
  const dims = listingImageDimensions(size)
  const w = width ?? dims.width
  const h = height ?? dims.height
  const preferred = listingImageUrl(src, size)
  const [current, setCurrent] = useState(preferred)

  useEffect(() => {
    setCurrent(listingImageUrl(src, size))
  }, [src, size])

  return (
    <img
      src={current}
      alt={alt ?? ''}
      width={w}
      height={h}
      loading={loading}
      decoding={decoding}
      className={className}
      onError={() => {
        if (current !== src) setCurrent(src)
      }}
      {...rest}
    />
  )
}
