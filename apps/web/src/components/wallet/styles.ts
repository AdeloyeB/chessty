import { cn } from '@/lib/utils'

/**
 * Shared wallet button styles
 *
 * Following the design system from CLAUDE.md:
 * - off-black (#0a0a0a) for backgrounds
 * - mid (#666666) for borders
 * - pure-white (#ffffff) for text and hover states
 */

// Base button styles shared across wallet components
export const walletButtonBase = cn(
  'px-4 py-2 rounded-lg',
  'font-mono text-sm',
  'transition-colors'
)

// Primary wallet button (dark background with border)
export const walletButtonPrimary = cn(
  walletButtonBase,
  'bg-off-black border border-mid',
  'text-pure-white',
  'hover:border-pure-white'
)

// Wallet button with flex layout for icons/badges
export const walletButtonWithIcon = cn(
  walletButtonPrimary,
  'flex items-center gap-2'
)

// Error state button (wrong network, etc.)
export const walletButtonError = cn(
  walletButtonBase,
  'bg-red-500/20 border border-red-500/50',
  'text-red-400',
  'hover:border-red-400'
)

// Connected state button (shown in navbar)
export const walletButtonConnected = cn(
  'px-4 py-2 rounded-lg',
  'bg-mid-dark/80 backdrop-blur-sm border border-mid/50',
  'hover:bg-mid/80 hover:border-mid-light/60',
  'transition-colors',
  'flex items-center gap-3'
)

// Active/hovered connected button state
export const walletButtonConnectedActive = cn(
  walletButtonConnected,
  'bg-mid/80 border-mid-light/60'
)

// Dev mode badge styles
export const devModeBadge = cn(
  'px-1.5 py-0.5',
  'bg-red-500/20 text-red-400',
  'text-xs rounded'
)
