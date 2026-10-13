import type { KeyboardEvent } from 'react'
import type { MarketSection } from '../lib/types'

type Props = {
  value: MarketSection
  onChange: (value: MarketSection) => void
}

export function BuyRentToggle({ value, onChange }: Props) {
  const isRent = value === 'rent'

  function setSection(next: MarketSection) {
    if (next !== value) onChange(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft' || e.key === 'Home') {
      e.preventDefault()
      setSection('buy')
    } else if (e.key === 'ArrowRight' || e.key === 'End') {
      e.preventDefault()
      setSection('rent')
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSection(isRent ? 'buy' : 'rent')
    }
  }

  return (
    <div className="w-full">
      <div
        role="radiogroup"
        aria-label="Filter listings by Buy or Rent"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="glass-panel relative mx-auto grid max-w-md grid-cols-2 rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-dark)] focus-visible:ring-offset-2 sm:max-w-lg"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-ink shadow-sm transition-transform duration-[250ms] ease-out"
          style={{ transform: isRent ? 'translateX(100%)' : 'translateX(0)' }}
        />

        <button
          type="button"
          role="radio"
          aria-checked={!isRent}
          aria-label="Show homes for sale"
          tabIndex={-1}
          className={`relative z-10 rounded-full py-2.5 text-center text-sm font-semibold transition-colors duration-[250ms] focus-visible:ring-2 focus-visible:ring-gold ${
            !isRent ? 'text-sand' : 'text-ink'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            setSection('buy')
          }}
        >
          Buy
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isRent}
          aria-label="Show homes for rent"
          tabIndex={-1}
          className={`relative z-10 rounded-full py-2.5 text-center text-sm font-semibold transition-colors duration-[250ms] focus-visible:ring-2 focus-visible:ring-gold ${
            isRent ? 'text-sand' : 'text-ink'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            setSection('rent')
          }}
        >
          Rent
        </button>
      </div>
    </div>
  )
}
