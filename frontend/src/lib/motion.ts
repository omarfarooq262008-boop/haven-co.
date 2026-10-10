import type { Transition, Variants } from 'framer-motion'

export const DURATION = {
  fast: 0.16,
  base: 0.24,
  slow: 0.3,
} as const

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

export function baseTransition(reduced: boolean | null): Transition {
  return {
    duration: reduced ? 0.01 : DURATION.base,
    ease: EASE_OUT,
  }
}

export function listContainerVariants(reduced: boolean | null): Variants {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduced ? 0 : 0.08,
        delayChildren: reduced ? 0 : 0.06,
      },
    },
    exit: {
      opacity: 0,
      y: reduced ? 0 : -8,
      transition: { duration: reduced ? 0.01 : DURATION.fast, ease: EASE_OUT },
    },
  }
}

export function listItemVariants(reduced: boolean | null): Variants {
  return {
    hidden: {
      opacity: 0,
      y: reduced ? 0 : 28,
    },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduced ? 0.01 : 0.38,
        ease: EASE_OUT,
      },
    },
  }
}

/** Homepage chrome (hero, toggle) — slide into place on load */
export function homeBlockVariants(reduced: boolean | null, delay = 0): Variants {
  return {
    hidden: {
      opacity: 0,
      y: reduced ? 0 : 24,
    },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduced ? 0.01 : 0.36,
        ease: EASE_OUT,
        delay: reduced ? 0 : delay,
      },
    },
  }
}

export function pageVariants(reduced: boolean | null): Variants {
  return {
    initial: { opacity: 0, y: reduced ? 0 : 8 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0.01 : DURATION.base, ease: EASE_OUT },
    },
    exit: {
      opacity: 0,
      y: reduced ? 0 : -6,
      transition: { duration: reduced ? 0.01 : DURATION.fast, ease: EASE_OUT },
    },
  }
}

export function bubbleVariants(reduced: boolean | null, mine: boolean): Variants {
  return {
    initial: {
      opacity: 0,
      y: reduced ? 0 : 10,
      x: reduced ? 0 : mine ? 8 : -8,
      scale: reduced ? 1 : 0.98,
    },
    animate: {
      opacity: 1,
      y: 0,
      x: 0,
      scale: 1,
      transition: { duration: reduced ? 0.01 : DURATION.base, ease: EASE_OUT },
    },
  }
}

/** True when the device supports fine pointer hover (mouse/trackpad). */
export function canUsePointerEffects() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}
