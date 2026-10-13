import { useEffect } from 'react'
import { applySeo, type SeoInput } from '../lib/seo'

/** Sets per-page title, description, Open Graph / Twitter, and optional JSON-LD. */
export function Seo(props: SeoInput) {
  useEffect(() => {
    applySeo(props)
  }, [
    props.title,
    props.description,
    props.path,
    props.image,
    props.type,
    props.noIndex,
    JSON.stringify(props.jsonLd ?? null),
  ])

  return null
}
