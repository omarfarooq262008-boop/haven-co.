import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

export const MAX_LISTING_PHOTOS = 8
export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024 // 10 MB before compression
export const MAX_COMPRESSED_MB = 0.3 // 300 KB
export const MAX_IMAGE_EDGE = 1600

export type UploadProgress = {
  phase: 'validating' | 'compressing' | 'uploading' | 'done'
  current: number
  total: number
  /** Overall 0–100 */
  percent: number
  fileName?: string
}

function supportsWebP() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

/** Validate a file before it is accepted into the form. */
export function validateRawImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `"${file.name}" is not an image. Please choose JPG, PNG, WebP, or GIF.`
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    return `"${file.name}" is larger than 10 MB. Choose a smaller photo before upload.`
  }
  return null
}

export function validateImageSelection(existingCount: number, incoming: File[]) {
  if (existingCount + incoming.length > MAX_LISTING_PHOTOS) {
    return `You can add at most ${MAX_LISTING_PHOTOS} photos per listing.`
  }
  for (const file of incoming) {
    const err = validateRawImageFile(file)
    if (err) return err
  }
  return null
}

async function compressImage(file: File, onProgress?: (pct: number) => void) {
  const fileType = supportsWebP() ? 'image/webp' : 'image/jpeg'
  const compressed = await imageCompression(file, {
    maxSizeMB: MAX_COMPRESSED_MB,
    maxWidthOrHeight: MAX_IMAGE_EDGE,
    useWebWorker: true,
    fileType,
    initialQuality: 0.82,
    onProgress,
  })

  const ext = fileType === 'image/webp' ? 'webp' : 'jpg'
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo'
  return new File([compressed], `${base}.${ext}`, { type: fileType, lastModified: Date.now() })
}

export type OrderedListingImage =
  | { kind: 'existing'; url: string }
  | { kind: 'new'; file: File }

/**
 * Resolve an ordered gallery (existing + new) into public URLs, preserving cover order.
 * New files are compressed/uploaded; existing URLs are kept as-is.
 */
export async function resolveOrderedListingImages(
  userId: string,
  images: OrderedListingImage[],
  onProgress?: (progress: UploadProgress) => void,
) {
  const newFiles = images.filter((item): item is { kind: 'new'; file: File } => item.kind === 'new')
  const uploaded = newFiles.length
    ? await uploadListingImages(
        userId,
        newFiles.map((item) => item.file),
        onProgress,
      )
    : []

  let uploadIndex = 0
  return images.map((item) => {
    if (item.kind === 'existing') return item.url
    const url = uploaded[uploadIndex]
    uploadIndex += 1
    return url
  })
}

/** Compress then upload. Always uploads the compressed file, never the original. */
export async function uploadListingImages(
  userId: string,
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
) {
  const selected = files.slice(0, MAX_LISTING_PHOTOS)
  if (selected.length === 0) return [] as string[]

  const report = (partial: Omit<UploadProgress, 'percent'> & { percent?: number }) => {
    const base = ((partial.current - 1) / Math.max(partial.total, 1)) * 100
    const within = partial.percent ?? 0
    const overall = Math.min(100, Math.round(base + within / Math.max(partial.total, 1)))
    onProgress?.({ ...partial, percent: overall, fileName: partial.fileName })
  }

  onProgress?.({ phase: 'validating', current: 0, total: selected.length, percent: 0 })

  for (const file of selected) {
    const err = validateRawImageFile(file)
    if (err) throw new Error(err)
  }

  const urls: string[] = []

  for (let i = 0; i < selected.length; i++) {
    const file = selected[i]
    const current = i + 1

    report({
      phase: 'compressing',
      current,
      total: selected.length,
      percent: 0,
      fileName: file.name,
    })

    const compressed = await compressImage(file, (pct) => {
      report({
        phase: 'compressing',
        current,
        total: selected.length,
        percent: pct * 0.55,
        fileName: file.name,
      })
    })

    report({
      phase: 'uploading',
      current,
      total: selected.length,
      percent: 55,
      fileName: file.name,
    })

    const path = `${userId}/${crypto.randomUUID()}-${compressed.name}`
    const { error } = await supabase.storage.from('listing-images').upload(path, compressed, {
      cacheControl: '3600',
      upsert: false,
      contentType: compressed.type,
    })
    if (error) throw new Error(error.message)

    const { data } = supabase.storage.from('listing-images').getPublicUrl(path)
    urls.push(data.publicUrl)

    report({
      phase: 'uploading',
      current,
      total: selected.length,
      percent: 100,
      fileName: file.name,
    })
  }

  onProgress?.({ phase: 'done', current: selected.length, total: selected.length, percent: 100 })
  return urls
}

/** Extract storage object paths from public listing-images URLs. */
export function storagePathsFromPublicUrls(urls: string[]) {
  const marker = '/storage/v1/object/public/listing-images/'
  const paths: string[] = []
  for (const url of urls) {
    const idx = url.indexOf(marker)
    if (idx === -1) continue
    const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0] ?? '')
    if (path) paths.push(path)
  }
  return paths
}

/** Delete listing photos from the listing-images bucket. */
export async function deleteListingImages(urls: string[]) {
  const paths = storagePathsFromPublicUrls(urls)
  if (paths.length === 0) return
  const { error } = await supabase.storage.from('listing-images').remove(paths)
  if (error) throw new Error(error.message)
}
