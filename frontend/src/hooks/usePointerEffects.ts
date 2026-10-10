import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { canUsePointerEffects } from '../lib/motion'

/** Cursor spotlight / parallax only when motion is OK and pointer is fine (not touch). */
export function usePointerEffects() {
  const reduced = useReducedMotion()
  const [finePointer, setFinePointer] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setFinePointer(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return !reduced && finePointer && canUsePointerEffects()
}
