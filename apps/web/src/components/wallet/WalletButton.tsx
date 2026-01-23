'use client'

import { useState, useCallback } from 'react'
import { cn, maskTruncatedAddress } from '@/lib/utils'
import { useWallet } from '@/hooks/useWallet'
import { USDCAmount } from './USDCAmount'
import { BalanceHistoryTooltip } from './BalanceHistoryTooltip'
import { ConnectButton } from './ConnectButton'
import { walletButtonConnected, walletButtonConnectedActive } from './styles'

interface WalletButtonProps {
  className?: string
}

export function WalletButton({ className }: WalletButtonProps) {
  const { isConnected, truncatedAddress, usdcBalance, isLoadingBalance, openWalletModal } = useWallet()
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [showAddress, setShowAddress] = useState(false)

  // Mask the address for privacy (show first 4 and last 2 chars)
  const maskedAddress = maskTruncatedAddress(truncatedAddress)

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

  // Not connected - use ConnectButton (handles dev mode vs RainbowKit)
  if (!isConnected) {
    return <ConnectButton className={className} />
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
          (isHovered || isPinned) ? walletButtonConnectedActive : walletButtonConnected,
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
