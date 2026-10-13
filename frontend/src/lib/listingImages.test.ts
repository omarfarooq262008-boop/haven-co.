import { describe, expect, it } from 'vitest'
import {
  MAX_COMPRESSED_MB,
  MAX_IMAGE_EDGE,
  MAX_LISTING_PHOTOS,
  MAX_ORIGINAL_BYTES,
  validateImageSelection,
  validateRawImageFile,
} from './listingImages'

function fakeFile(name: string, type: string, size: number) {
  const blob = new Blob([new Uint8Array(Math.min(size, 64))], { type })
  const file = new File([blob], name, { type, lastModified: Date.now() })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('image compression limits', () => {
  it('exposes the documented compression caps', () => {
    expect(MAX_LISTING_PHOTOS).toBe(8)
    expect(MAX_ORIGINAL_BYTES).toBe(10 * 1024 * 1024)
    expect(MAX_COMPRESSED_MB).toBe(0.3)
    expect(MAX_IMAGE_EDGE).toBe(1600)
  })

  it('rejects non-images and files over 10 MB before upload', () => {
    expect(validateRawImageFile(fakeFile('notes.pdf', 'application/pdf', 100))).toMatch(
      /not an image/i,
    )
    expect(
      validateRawImageFile(fakeFile('huge.jpg', 'image/jpeg', MAX_ORIGINAL_BYTES + 1)),
    ).toMatch(/10 MB/i)
    expect(validateRawImageFile(fakeFile('ok.jpg', 'image/jpeg', 1024))).toBeNull()
  })

  it('enforces the max photo count per listing', () => {
    const incoming = [
      fakeFile('a.jpg', 'image/jpeg', 100),
      fakeFile('b.jpg', 'image/jpeg', 100),
    ]
    expect(validateImageSelection(7, incoming)).toMatch(/at most 8/i)
    expect(validateImageSelection(6, incoming)).toBeNull()
  })
})
