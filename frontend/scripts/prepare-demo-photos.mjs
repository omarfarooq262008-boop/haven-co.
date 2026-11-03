/**
 * Compress listing photos → frontend/public/demo/*.webp
 *
 * Usage:
 *   node scripts/prepare-demo-photos.mjs "C:\path\to\haven-photos"
 *   # or set DEMO_PHOTO_DIR
 *
 * If no folder is given, downloads curated Unsplash property stills (demo only).
 * Output: 1600px max width, WebP ~quality 78 (~250KB target).
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'demo')

/** Curated Unsplash property photos (stable image IDs) — used only when no local folder. */
const FALLBACK_URLS = [
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1582407947309-af98fe6da4c1?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1605146769289-440113cc3d00?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600607687644-c7171b42498b?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600585154363-67eb9e2e2099?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600573472550-8090b5e0745e?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1613977257592-4871e5fdf7c0?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600585154084-4e5fe7c39198?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1560448075-bb485b067938?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1556912173-46c336c7fd55?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600047508618-1bb8c5f350ba?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600047509782-20d39509f26d?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600047509358-9dc75507daeb?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1605276374154-ed52340339a9?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=75',
]

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)$/i

async function compressBuffer(buf, outPath) {
  let quality = 78
  let out = await sharp(buf)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
  while (out.length > 280_000 && quality > 55) {
    quality -= 6
    out = await sharp(buf)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  }
  await writeFile(outPath, out)
  return out.length
}

async function loadSources(dir) {
  if (!dir) return null
  const entries = await readdir(dir, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && IMAGE_EXT.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => a.localeCompare(b))
  if (files.length === 0) throw new Error(`No images found in ${dir}`)
  return files
}

function demoName(i) {
  const n = String(i + 1).padStart(2, '0')
  return `listing-${n}.webp`
}

async function main() {
  const dir = process.argv[2] || process.env.DEMO_PHOTO_DIR || ''
  await mkdir(outDir, { recursive: true })

  const local = await loadSources(dir || null)
  const countNeeded = 45
  const written = []

  if (local) {
    console.log(`[demo-photos] compressing ${local.length} files from ${dir}`)
    for (let i = 0; i < Math.min(local.length, 60); i++) {
      const buf = await sharp(local[i]).toBuffer()
      const name = demoName(i)
      const size = await compressBuffer(buf, path.join(outDir, name))
      written.push({ name, size })
      console.log(`  ${name} ${(size / 1024).toFixed(0)} KB`)
    }
  } else {
    console.warn(
      '[demo-photos] No photo folder given — downloading Unsplash property stills for the portfolio demo.',
    )
    console.warn(
      '  Re-run with your folder later: node scripts/prepare-demo-photos.mjs "C:\\path\\to\\haven-photos"',
    )
    let urlIndex = 0
    for (let i = 0; i < countNeeded; i++) {
      let buf = null
      for (let attempt = 0; attempt < FALLBACK_URLS.length; attempt++) {
        const url = FALLBACK_URLS[urlIndex % FALLBACK_URLS.length]
        urlIndex += 1
        const res = await fetch(url)
        if (!res.ok) {
          console.warn(`  skip ${res.status} ${url}`)
          continue
        }
        buf = Buffer.from(await res.arrayBuffer())
        break
      }
      if (!buf) throw new Error('Could not download enough fallback photos')
      const name = demoName(i)
      const size = await compressBuffer(buf, path.join(outDir, name))
      written.push({ name, size })
      console.log(`  ${name} ${(size / 1024).toFixed(0)} KB`)
    }
  }

  console.log(`[demo-photos] wrote ${written.length} files → public/demo/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
