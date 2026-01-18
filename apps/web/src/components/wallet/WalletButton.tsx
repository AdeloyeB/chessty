'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useWallet } from '@/hooks/useWallet'
import { USDCAmount } from './USDCAmount'
import { BalanceHistoryTooltip } from './BalanceHistoryTooltip'

interface WalletButtonProps {
  className?: string
}

export function WalletButton({ className }: WalletButtonProps) {
  const { isConnected, truncatedAddress, usdcBalance, isLoadingBalance, openWalletModal } = useWallet()
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [showAddress, setShowAddress] = useState(false)

  // Mask the address: show first 2 and last 2 chars with dots
  const maskedAddress = truncatedAddress
    ? `${truncatedAddress.slice(0, 4)}••••${truncatedAddress.slice(-2)}`
    : ''

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isPinned) {
      // If already pinned, unpin and open wallet modal
      setIsPinned(false)
      openWalletModal()
    } else if (isHovered) {
      // If hovering, pin the tooltip
      e.stopPropagation()
      setIsPinned(true)
    } else {
      // Otherwise open wallet modal
      openWalletModal()
    }
  }, [isPinned, isHovered, openWalletModal])

  const handleCloseTooltip = useCallback(() => {
    setIsPinned(false)
    setIsHovered(false)
  }, [])

  if (!isConnected) {
    return (
      <button
        onClick={openWalletModal}
        className={cn(
          'px-4 py-2 bg-usdc text-white font-medium rounded-lg',
          'hover:bg-usdc-light transition-colors',
          'flex items-center gap-2',
          className
        )}
      >
        Connect Wallet
      </button>
    )
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => !isPinned && setIsHovered(true)}
      onMouseLeave={() => !isPinned && setIsHovered(false)}
    >
      <button
        onClick={handleClick}
        className={cn(
          'px-4 py-2 bg-mid-dark/80 backdrop-blur-sm border border-mid/50 rounded-lg',
          'hover:bg-mid/80 hover:border-mid-light/60 transition-colors',
          'flex items-center gap-3',
          (isHovered || isPinned) && 'bg-mid/80 border-mid-light/60',
          className
        )}
      >
        {isLoadingBalance ? (
          <span className="text-light">Loading...</span>
        ) : (
          <USDCAmount amount={usdcBalance} size="sm" />
        )}
        <span
          className="text-light text-sm font-mono cursor-pointer hover:text-pure-white transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setShowAddress(!showAddress)
          }}
          title={showAddress ? 'Click to hide address' : 'Click to reveal address'}
        >
          {showAddress ? truncatedAddress : maskedAddress}
        </span>
      </button>

      <BalanceHistoryTooltip
        isVisible={isHovered || isPinned}
        isPinned={isPinned}
        onClose={handleCloseTooltip}
        variant="navbar"
      />
    </div>
  )
}
