import { supabase } from './supabase'

/** Hourly slots from 10:00 through 18:00 in the user's local timezone */
export const BOOKING_SLOT_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18] as const

export const BOOKING_LIMITS = {
  nameMin: 1,
  nameMax: 120,
  emailMax: 254,
  phoneMin: 3,
  phoneMax: 40,
  noteMax: 1000,
} as const

export type BookingFormValues = {
  visitor_name: string
  visitor_email: string
  visitor_phone: string
  date: string
  hour: string
  note: string
}

export type BookingFormErrors = Partial<Record<keyof BookingFormValues, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emptyBookingForm(prefill?: {
  name?: string | null
  email?: string | null
  phone?: string | null
}): BookingFormValues {
  return {
    visitor_name: prefill?.name?.trim() ?? '',
    visitor_email: prefill?.email?.trim() ?? '',
    visitor_phone: prefill?.phone?.trim() ?? '',
    date: '',
    hour: '',
    note: '',
  }
}

/** Local calendar date as YYYY-MM-DD */
export function toLocalDateInputValue(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function minBookableDateInput(): string {
  return toLocalDateInputValue(new Date())
}

export function formatSlotLabel(hour: number): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function localMeetingAt(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return new Date(NaN)
  return new Date(y, m - 1, d, hour, 0, 0, 0)
}

export function isSlotPast(dateStr: string, hour: number, now = new Date()): boolean {
  return localMeetingAt(dateStr, hour).getTime() <= now.getTime()
}

export function formatMeetingAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function localTimezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'local time'
  }
}

export function validateBookingForm(
  values: BookingFormValues,
  options?: { bookedHours?: Set<number> },
): BookingFormErrors {
  const errors: BookingFormErrors = {}
  const name = values.visitor_name.trim()
  const email = values.visitor_email.trim()
  const phone = values.visitor_phone.trim()
  const note = values.note.trim()
  const hour = Number(values.hour)

  if (!name) errors.visitor_name = 'Name is required'
  else if (name.length > BOOKING_LIMITS.nameMax) {
    errors.visitor_name = `Name must be at most ${BOOKING_LIMITS.nameMax} characters`
  }

  if (!email) errors.visitor_email = 'Email is required'
  else if (email.length > BOOKING_LIMITS.emailMax || !EMAIL_RE.test(email)) {
    errors.visitor_email = 'Enter a valid email'
  }

  if (!phone) errors.visitor_phone = 'Phone is required'
  else if (phone.length < BOOKING_LIMITS.phoneMin || phone.length > BOOKING_LIMITS.phoneMax) {
    errors.visitor_phone = `Phone must be ${BOOKING_LIMITS.phoneMin}–${BOOKING_LIMITS.phoneMax} characters`
  }

  if (!values.date) errors.date = 'Choose a date'
  else if (values.date < minBookableDateInput()) errors.date = 'Choose a future date'

  if (!values.hour || Number.isNaN(hour) || !(BOOKING_SLOT_HOURS as readonly number[]).includes(hour)) {
    errors.hour = 'Choose a time slot'
  } else if (values.date && isSlotPast(values.date, hour)) {
    errors.hour = 'That time has already passed'
  } else if (options?.bookedHours?.has(hour)) {
    errors.hour = 'That slot is already booked'
  }

  if (note.length > BOOKING_LIMITS.noteMax) {
    errors.note = `Note must be at most ${BOOKING_LIMITS.noteMax} characters`
  }

  return errors
}

/** Local day bounds as ISO for RPC (inclusive start, exclusive next day) */
export function localDayBoundsIso(dateStr: string): { from: string; to: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const from = new Date(y, m - 1, d, 0, 0, 0, 0)
  const to = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
  return { from: from.toISOString(), to: to.toISOString() }
}

export async function fetchBookedHoursForDate(
  listingId: string,
  dateStr: string,
): Promise<{ hours: Set<number>; error: string | null }> {
  const { from, to } = localDayBoundsIso(dateStr)
  const { data, error } = await supabase.rpc('get_listing_booked_slots', {
    p_listing_id: listingId,
    p_from: from,
    p_to: to,
  })

  if (error) return { hours: new Set(), error: error.message }

  const hours = new Set<number>()
  for (const row of data ?? []) {
    const meeting = new Date((row as { meeting_at: string }).meeting_at)
    if (Number.isNaN(meeting.getTime())) continue
    if (toLocalDateInputValue(meeting) === dateStr) {
      hours.add(meeting.getHours())
    }
  }
  return { hours, error: null }
}

export async function notifyBookingEmail(bookingId: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-booking-email', {
      body: { bookingId },
    })
    if (error) {
      console.error('[send-booking-email]', error.message ?? error)
    }
  } catch (err) {
    console.error('[send-booking-email]', err)
  }
}
