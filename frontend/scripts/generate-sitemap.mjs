/**
 * Build-time sitemap for Haven & Co.
 * Uses VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY when present to include
 * approved listings. Falls back to static marketing routes only.
 *
 * Env:
 *   VITE_SITE_URL — public site origin (required for absolute URLs; default https://havenandco.example)
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(root, '..', 'public')
const site = (process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://havenandco.example').replace(
  /\/$/,
  '',
)
const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

const staticPaths = ['/', '/privacy', '/terms', '/contact', '/status']

function urlEntry(loc, changefreq = 'weekly', priority = '0.7') {
  return `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

async function approvedListingPaths() {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[sitemap] Supabase env missing — writing static routes only')
    return []
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data, error } = await supabase
      .from('listings')
      .select('id, updated_at, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) {
      console.warn('[sitemap] listings query failed:', error.message)
      return []
    }
    return (data ?? []).map((row) => `/listings/${row.id}`)
  } catch (err) {
    console.warn('[sitemap] unexpected', err)
    return []
  }
}

const listingPaths = await approvedListingPaths()
const urls = [
  ...staticPaths.map((p) => urlEntry(`${site}${p === '/' ? '/' : p}`, p === '/' ? 'daily' : 'monthly', p === '/' ? '1.0' : '0.5')),
  ...listingPaths.map((p) => urlEntry(`${site}${p}`, 'daily', '0.8')),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`

await mkdir(publicDir, { recursive: true })
await writeFile(path.join(publicDir, 'sitemap.xml'), xml, 'utf8')

const robots = `User-agent: *
Allow: /

Disallow: /admin
Disallow: /account
Disallow: /messages
Disallow: /my-listings
Disallow: /my-bookings
Disallow: /login
Disallow: /signup
Disallow: /payment/

Sitemap: ${site}/sitemap.xml
`
await writeFile(path.join(publicDir, 'robots.txt'), robots, 'utf8')

console.log(`[sitemap] wrote ${urls.length} URLs → public/sitemap.xml`)
