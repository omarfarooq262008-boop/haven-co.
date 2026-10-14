import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import { pageVariants } from '../lib/motion'

/** Heavy form pages skip exit animation so typing stays responsive after navigation. */
function isHeavyPage(pathname: string) {
  return (
    pathname === '/listings/new' ||
    pathname.endsWith('/edit') ||
    pathname.startsWith('/messages')
  )
}

export function PageFade() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduced = useReducedMotion()
  const heavy = isHeavyPage(location.pathname)

  // Home owns its own slide-in; form/messages skip page fade for performance
  if (reduced || heavy || location.pathname === '/') {
    const fillChat = location.pathname.startsWith('/messages')
    return (
      <div key={location.pathname} className={fillChat ? 'flex min-h-0 flex-1 flex-col' : undefined}>
        {outlet}
      </div>
    )
  }

  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={location.pathname}
        variants={pageVariants(false)}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}
