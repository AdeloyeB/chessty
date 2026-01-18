'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useWallet } from '@/hooks/useWallet'
import { USDCAmount } from './USDCAmount'

export function WalletModal() {
  const {
    isConnected,
    address,
    truncatedAddress,
    usdcBalance,
    isLoadingBalance,
    isConnecting,
    isWalletModalOpen,
    connectors,
    connectWallet,
    disconnectWallet,
    closeWalletModal,
  } = useWallet()

  const modalRef = useRef<HTMLDivElement>(null)
  const [showFullAddress, setShowFullAddress] = useState(false)

  // Mask the address for privacy
  const maskedAddress = address
    ? `${address.slice(0, 6)}${'•'.repeat(32)}${address.slice(-4)}`
    : ''

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeWalletModal()
      }
    }

    if (isWalletModalOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isWalletModalOpen, closeWalletModal])

  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeWalletModal()
    }
  }

  if (!isWalletModalOpen) return null

  // Get connector display info
  const getConnectorInfo = (connectorId: string) => {
    switch (connectorId) {
      case 'coinbaseWalletSDK':
        return { name: 'Coinbase Wallet', icon: '🔵' }
      case 'metaMaskSDK':
      case 'metaMask':
        return { name: 'MetaMask', icon: '🦊' }
      case 'injected':
        return { name: 'Browser Wallet', icon: '🌐' }
      default:
        return { name: connectorId, icon: '💳' }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md mx-4 bg-dark border border-mid rounded-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mid">
          <h2 className="text-lg font-semibold text-pure-white">
            {isConnected ? 'Wallet' : 'Connect Wallet'}
          </h2>
          <button
            onClick={closeWalletModal}
            className="p-1 text-light hover:text-pure-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isConnected ? (
            // Connected view
            <div className="space-y-4">
              {/* Balance */}
              <div className="p-4 bg-mid-dark rounded-lg">
                <p className="text-sm text-light mb-1">Balance</p>
                {isLoadingBalance ? (
                  <p className="text-xl text-pure-white">Loading...</p>
                ) : (
                  <USDCAmount amount={usdcBalance} size="lg" />
                )}
              </div>

              {/* Address */}
              <div className="p-4 bg-mid-dark rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-light">Connected Address</p>
                  <button
                    onClick={() => setShowFullAddress(!showFullAddress)}
                    className="text-xs text-mid-light hover:text-pure-white transition-colors"
                  >
                    {showFullAddress ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                <p className="text-sm font-mono text-pure-white break-all">
                  {showFullAddress ? address : maskedAddress}
                </p>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={cn(
                    'px-4 py-3 bg-usdc text-white font-medium rounded-lg',
                    'hover:bg-usdc-light transition-colors'
                  )}
                  onClick={() => {
                    // TODO: Implement deposit flow
                    alert('Deposit flow coming soon')
                  }}
                >
                  Deposit
                </button>
                <button
                  className={cn(
                    'px-4 py-3 bg-mid border border-mid-light text-pure-white font-medium rounded-lg',
                    'hover:bg-mid-light transition-colors'
                  )}
                  onClick={() => {
                    // TODO: Implement withdraw flow
                    alert('Withdraw flow coming soon')
                  }}
                >
                  Withdraw
                </button>
              </div>

              {/* Disconnect */}
              <button
                onClick={disconnectWallet}
                className={cn(
                  'w-full px-4 py-3 text-danger font-medium rounded-lg',
                  'hover:bg-mid-dark transition-colors'
                )}
              >
                Disconnect
              </button>
            </div>
          ) : (
            // Connect view
            <div className="space-y-3">
              {isConnecting && (
                <div className="p-4 bg-mid-dark rounded-lg text-center">
                  <p className="text-light">Connecting...</p>
                </div>
              )}

              {connectors
                .filter((connector) => connector.id !== 'injected' || connectors.length === 1)
                .map((connector) => {
                  const info = getConnectorInfo(connector.id)
                  return (
                    <button
                      key={connector.id}
                      onClick={() => connectWallet(connector.id)}
                      disabled={isConnecting}
                      className={cn(
                        'w-full flex items-center gap-3 p-4 bg-mid-dark border border-mid rounded-lg',
                        'hover:bg-mid hover:border-mid-light transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <span className="text-2xl">{info.icon}</span>
                      <span className="text-pure-white font-medium">{info.name}</span>
                    </button>
                  )
                })}

              <p className="text-xs text-light text-center mt-4">
                By connecting a wallet, you agree to our Terms of Service
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
