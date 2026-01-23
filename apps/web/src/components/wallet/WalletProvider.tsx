'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import { config } from '@/config/wagmi'
import { chesstyTheme } from '@/config/rainbowkit-theme'
import { WalletModal } from './WalletModal'

// RainbowKit styles
import '@rainbow-me/rainbowkit/styles.css'

interface WalletProviderProps {
  children: React.ReactNode
}

export function WalletProvider({ children }: WalletProviderProps) {
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

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={chesstyTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
        <WalletModal />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
