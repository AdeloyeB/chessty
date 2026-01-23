'use client'

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit'
import { useWallet } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'
import {
  walletButtonPrimary,
  walletButtonWithIcon,
  walletButtonError,
  devModeBadge,
} from './styles'

interface ConnectButtonProps {
  className?: string
}

/**
 * Wallet connection button that handles both dev mode and production
 *
 * - Dev mode: Opens custom WalletModal for mock connection
 * - Production: Uses RainbowKit's polished connection modal
 */
export function ConnectButton({ className }: ConnectButtonProps) {
  const { isDevMode, openWalletModal } = useWallet()

  // Dev mode: Use custom modal for mock connection
  if (isDevMode) {
    return (
      <button
        onClick={openWalletModal}
        className={cn(walletButtonWithIcon, className)}
      >
        <span>Connect</span>
        <span className={devModeBadge}>DEV</span>
      </button>
    )
  }

  // Production: Use RainbowKit with custom styling
  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openConnectModal,
        openChainModal,
        openAccountModal,
        mounted,
        authenticationStatus,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading'
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated')

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              // Not connected - show connect button
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className={cn(walletButtonPrimary, className)}
                  >
                    Connect Wallet
                  </button>
                )
              }

              // Wrong chain - show switch button
              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className={cn(walletButtonError, className)}
                  >
                    Wrong Network
                  </button>
                )
              }

              // Connected - show account info
              return (
                <button
                  onClick={openAccountModal}
                  type="button"
                  className={cn(walletButtonWithIcon, className)}
                >
                  {chain.hasIcon && chain.iconUrl && (
                    <img
                      alt={chain.name ?? 'Chain icon'}
                      src={chain.iconUrl}
                      className="w-4 h-4 rounded-full"
                    />
                  )}
                  <span>{account.displayName}</span>
                </button>
              )
            })()}
          </div>
        )
      }}
    </RainbowConnectButton.Custom>
  )
}
