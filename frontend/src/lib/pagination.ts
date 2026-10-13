/** Default page sizes for list UIs — keep modest for free-tier egress. */
export const PAGE_SIZE = {
  listings: 12,
  myListings: 10,
  bookings: 10,
  admin: 10,
  conversations: 20,
  messages: 40,
} as const

export function rangeForPage(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(0, page)
  const from = safePage * pageSize
  const to = from + pageSize - 1
  return { from, to }
}

/** True when the last fetch returned a full page (there may be more rows). */
export function hasMoreRows(fetchedCount: number, pageSize: number): boolean {
  return fetchedCount >= pageSize
}
