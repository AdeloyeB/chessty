'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useWalletStore } from '@/store/wallet'
import { USDCAmount } from './USDCAmount'
import { BalanceHistoryTooltip } from './BalanceHistoryTooltip'

interface BalanceDisplayProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function BalanceDisplay({ className, size = 'lg' }: BalanceDisplayProps) {
  const { isConnected, usdcBalance, isLoadingBalance, openWalletModal } = useWalletStore()
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isConnected) {
      openWalletModal()
      return
    }

    if (isPinned) {
      setIsPinned(false)
    } else if (isHovered) {
      e.stopPropagation()
      setIsPinned(true)
    }
  }, [isConnected, isPinned, isHovered, openWalletModal])

  const handleCloseTooltip = useCallback(() => {
    setIsPinned(false)
    setIsHovered(false)
  }, [])

  if (!isConnected) {
    return (
      <button
        onClick={openWalletModal}
        className={cn(
          'text-mid-light font-mono hover:text-usdc transition-colors cursor-pointer',
          size === 'lg' ? 'text-lg' : size === 'md' ? 'text-base' : 'text-sm'
        )}
      >
        connect wallet
      </button>
    )
  }

  return (
    <div
      className={cn('relative inline-block', className)}
      onMouseEnter={() => !isPinned && setIsHovered(true)}
      onMouseLeave={() => !isPinned && setIsHovered(false)}
    >
      <button
        onClick={handleClick}
        className={cn(
          'cursor-pointer transition-all',
          (isHovered || isPinned) && 'opacity-80'
        )}
      >
        {isLoadingBalance ? (
          <span className={cn(
            'text-mid-light font-mono',
            size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm'
          )}>
            ...
          </span>
        ) : (
          <USDCAmount amount={usdcBalance} size={size} />
        )}
      </button>

      <BalanceHistoryTooltip
        isVisible={isHovered || isPinned}
        isPinned={isPinned}
        onClose={handleCloseTooltip}
        variant="compact"
      />
    </div>
  )
}
