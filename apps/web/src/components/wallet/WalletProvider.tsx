'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { useState, useEffect } from 'react'
import { config } from '@/config/wagmi'
import { chesstyTheme } from '@/config/rainbowkit-theme'
import { WalletModal } from './WalletModal'

// RainbowKit styles
import '@rainbow-me/rainbowkit/styles.css'

interface WalletProviderProps {
  children: React.ReactNode
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [mounted, setMounted] = useState(false)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={chesstyTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
        {mounted && <WalletModal />}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
