import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { MAX_LISTING_PHOTOS, validateImageSelection } from '../lib/listingImages'

export type GalleryPhoto =
  | { id: string; kind: 'existing'; url: string }
  | { id: string; kind: 'new'; file: File; previewUrl: string }

type Props = {
  photos: GalleryPhoto[]
  onChange: (photos: GalleryPhoto[]) => void
  disabled?: boolean
  error?: string
  onError?: (message: string | null) => void
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5.5-5.5L7 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  )
}

export function PhotoUploader({ photos, onChange, disabled, error, onError }: Props) {
  const inputId = useId()
  const cameraInputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const atLimit = photos.length >= MAX_LISTING_PHOTOS
  const canAdd = !disabled && !atLimit

  function revokeNew(photo: GalleryPhoto) {
    if (photo.kind === 'new') URL.revokeObjectURL(photo.previewUrl)
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list || disabled) return
    onError?.(null)

    const incoming = Array.from(list)
    if (incoming.length === 0) return

    const slotsLeft = Math.max(0, MAX_LISTING_PHOTOS - photos.length)
    if (slotsLeft <= 0) {
      onError?.(`You already have ${MAX_LISTING_PHOTOS} photos. Remove one to add another.`)
      return
    }

    const limited = incoming.slice(0, slotsLeft)
    const selectionError = validateImageSelection(photos.length, limited)
    if (selectionError) {
      onError?.(selectionError)
      return
    }

    if (incoming.length > slotsLeft) {
      onError?.(`Only ${slotsLeft} more photo(s) can be added (max ${MAX_LISTING_PHOTOS}).`)
    }

    const next: GalleryPhoto[] = limited.map((file) => ({
      id: crypto.randomUUID(),
      kind: 'new',
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    onChange([...photos, ...next])
  }

  function removePhoto(id: string) {
    const target = photos.find((p) => p.id === id)
    if (target) revokeNew(target)
    onChange(photos.filter((p) => p.id !== id))
    onError?.(null)
  }

  function setCover(id: string) {
    const index = photos.findIndex((p) => p.id === id)
    if (index <= 0) return
    const next = [...photos]
    const [picked] = next.splice(index, 1)
    next.unshift(picked)
    onChange(next)
  }

  function openPicker() {
    if (!canAdd) return
    fileRef.current?.click()
  }

  function openCamera() {
    if (!canAdd) return
    cameraRef.current?.click()
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!canAdd) return
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (canAdd) e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDragging(false)
    if (!canAdd) return
    addFiles(e.dataTransfer.files)
  }

  function onDropZoneKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openPicker()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Photos</p>
        <p className="text-sm font-medium text-ink-soft" aria-live="polite">
          {photos.length} / {MAX_LISTING_PHOTOS} photos
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canAdd}
          onClick={openPicker}
          className="btn-anim inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-sand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImageIcon className="h-4 w-4" />
          Add photos
        </button>

        <button
          type="button"
          disabled={!canAdd}
          onClick={openCamera}
          className="btn-anim inline-flex items-center gap-2 rounded-xl border border-line bg-white/70 px-4 py-2.5 text-sm font-semibold text-ink sm:hidden disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CameraIcon className="h-4 w-4" />
          Take photo
        </button>
      </div>

      <div
        role="button"
        tabIndex={canAdd ? 0 : -1}
        aria-disabled={!canAdd}
        aria-controls={inputId}
        aria-label="Drag photos here or click to browse"
        onClick={openPicker}
        onKeyDown={onDropZoneKey}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`photo-dropzone flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-gold ${
          !canAdd
            ? 'cursor-not-allowed border-line/60 bg-white/30 opacity-60'
            : dragging
              ? 'border-gold bg-gold/15 shadow-inner'
              : 'border-line bg-white/40 hover:border-gold hover:bg-gold/10'
        }`}
      >
        <ImageIcon className="h-8 w-8 text-ink-soft" />
        <p className="text-sm font-medium text-ink">
          {atLimit ? 'Photo limit reached' : 'Drag photos here or click to browse'}
        </p>
        <p className="text-xs text-ink-soft">
          Images only · max 10 MB each · auto-compressed to ~300KB
        </p>
      </div>

      <input
        id={inputId}
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        disabled={!canAdd}
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <label htmlFor={inputId} className="sr-only">
        Choose photos to upload
      </label>

      <input
        id={cameraInputId}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={!canAdd}
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <label htmlFor={cameraInputId} className="sr-only">
        Take a photo with the camera
      </label>

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, index) => {
            const src = photo.kind === 'existing' ? photo.url : photo.previewUrl
            const isCover = index === 0
            return (
              <li
                key={photo.id}
                className="group relative overflow-hidden rounded-2xl border border-line bg-white/50 shadow-sm"
              >
                <img src={src} alt="" className="aspect-square w-full object-cover" />

                {isCover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
                    Cover photo
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setCover(photo.id)}
                    className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sand transition hover:bg-ink disabled:opacity-50"
                  >
                    Set cover
                  </button>
                )}

                <button
                  type="button"
                  disabled={disabled}
                  aria-label="Remove photo"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink/85 text-sm font-bold text-sand transition hover:bg-ink disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

export function galleryFromUrls(urls: string[]): GalleryPhoto[] {
  return urls.map((url) => ({ id: crypto.randomUUID(), kind: 'existing' as const, url }))
}

export function revokeGalleryPreviews(photos: GalleryPhoto[]) {
  for (const photo of photos) {
    if (photo.kind === 'new') URL.revokeObjectURL(photo.previewUrl)
  }
}
