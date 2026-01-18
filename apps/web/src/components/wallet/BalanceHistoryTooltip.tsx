'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useWalletStore, type BalanceChange, type BalanceChangeType } from '@/store/wallet'
import { formatUSDC } from '@/lib/utils'

interface BalanceHistoryTooltipProps {
  isVisible: boolean
  isPinned: boolean
  onClose: () => void
  variant?: 'navbar' | 'compact'
  className?: string
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  return `${diffDays}d`
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getTypeLabel(type: BalanceChangeType): string {
  switch (type) {
    case 'game_win':
      return 'Game W'
    case 'game_loss':
      return 'Game L'
    case 'prediction_win':
      return 'Pred W'
    case 'prediction_loss':
      return 'Pred L'
    case 'deposit':
      return 'Deposit'
    case 'withdrawal':
      return 'Withdraw'
    default:
      return 'Other'
  }
}

function getTypeColor(type: BalanceChangeType): string {
  switch (type) {
    case 'game_win':
    case 'prediction_win':
    case 'deposit':
      return 'text-green-500'
    case 'game_loss':
    case 'prediction_loss':
    case 'withdrawal':
      return 'text-red-500'
    default:
      return 'text-mid-light'
  }
}

function BalanceChangeRow({ change, compact }: { change: BalanceChange; compact?: boolean }) {
  const isPositive = change.amount > 0
  const detail = change.opponent || change.prediction || change.txHash || '—'

  return (
    <div
      className={cn(
        'grid gap-2 font-mono',
        compact ? 'grid-cols-4 py-0.5 text-[10px]' : 'grid-cols-5 py-1 text-[11px]'
      )}
    >
      {/* Type */}
      <div className={cn('truncate', getTypeColor(change.type))}>
        {getTypeLabel(change.type)}
      </div>

      {/* Detail (opponent/prediction/tx) */}
      <div className={cn('truncate text-light', compact ? 'col-span-1' : 'col-span-2')}>
        {detail}
      </div>

      {/* Amount */}
      <div className={cn(
        'text-right font-medium',
        isPositive ? 'text-green-500' : 'text-red-500'
      )}>
        {isPositive ? '+' : ''}{formatUSDC(change.amount)}
      </div>

      {/* Time */}
      <div className="text-right text-mid">
        {compact ? formatRelativeTime(change.timestamp) : formatTimestamp(change.timestamp)}
      </div>
    </div>
  )
}

export function BalanceHistoryTooltip({
  isVisible,
  isPinned,
  onClose,
  variant = 'navbar',
  className,
}: BalanceHistoryTooltipProps) {
  const { balanceHistory } = useWalletStore()
  const tooltipRef = useRef<HTMLDivElement>(null)

  const isCompact = variant === 'compact'
  const displayHistory = balanceHistory.slice(0, isCompact ? 5 : 8)

  // Handle click outside to close pinned tooltip
  useEffect(() => {
    if (!isPinned) return

    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // Delay adding listener to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isPinned, onClose])

  if (!isVisible || displayHistory.length === 0) return null

  // Calculate totals
  const totalGains = balanceHistory
    .filter((c) => c.amount > 0)
    .reduce((sum, c) => sum + c.amount, 0)
  const totalLosses = balanceHistory
    .filter((c) => c.amount < 0)
    .reduce((sum, c) => sum + c.amount, 0)
  const netChange = totalGains + totalLosses

  return (
    <div
      ref={tooltipRef}
      className={cn(
        'absolute z-50 bg-pure-black/80 backdrop-blur-md border border-mid/30 rounded-sm shadow-2xl',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        isCompact ? 'w-80 p-2' : 'w-[420px] p-2.5',
        // Position based on variant
        variant === 'navbar' ? 'top-full mt-2 right-0' : 'bottom-full mb-2 left-0',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-mid/30 pb-1.5 mb-1.5">
        <span className="font-mono text-mid-light text-[10px]">
          balance_history
        </span>
        {isPinned && (
          <button
            onClick={onClose}
            className="text-mid hover:text-pure-white transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3 border-b border-mid/30 pb-1.5 mb-1.5">
        <div className="text-center">
          <p className="font-mono text-green-500 text-xs">+{formatUSDC(totalGains)}</p>
          <p className="font-mono text-mid text-[10px]">gains</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-red-500 text-xs">{formatUSDC(totalLosses)}</p>
          <p className="font-mono text-mid text-[10px]">losses</p>
        </div>
        <div className="text-center">
          <p className={cn(
            'font-mono text-xs',
            netChange >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {netChange >= 0 ? '+' : ''}{formatUSDC(netChange)}
          </p>
          <p className="font-mono text-mid text-[10px]">net</p>
        </div>
      </div>

      {/* Table Header */}
      <div className={cn(
        'grid gap-2 font-mono text-mid border-b border-mid/30 pb-1 mb-1',
        isCompact ? 'grid-cols-4 text-[9px]' : 'grid-cols-5 text-[10px]'
      )}>
        <div>type</div>
        <div className={isCompact ? 'col-span-1' : 'col-span-2'}>detail</div>
        <div className="text-right">amount</div>
        <div className="text-right">time</div>
      </div>

      {/* History List */}
      <div className={cn(
        'divide-y divide-mid/15',
        isCompact ? 'max-h-24' : 'max-h-32',
        'overflow-y-auto'
      )}>
        {displayHistory.map((change) => (
          <BalanceChangeRow key={change.id} change={change} compact={isCompact} />
        ))}
      </div>

      {balanceHistory.length > displayHistory.length && (
        <p className="text-center font-mono text-mid text-[10px] pt-1.5 border-t border-mid/30 mt-1.5">
          +{balanceHistory.length - displayHistory.length} more transactions
        </p>
      )}
    </div>
  )
}
