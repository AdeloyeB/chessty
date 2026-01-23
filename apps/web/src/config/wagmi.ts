import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { polygon } from 'wagmi/chains'

// USDC contract address — Polygon (official Circle native USDC)
// Following the Polymarket model: USDC on Polygon for betting/prediction markets
export const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const

// Keep for backward compatibility with any code referencing the map format
export const USDC_ADDRESSES = {
  [polygon.id]: USDC_ADDRESS,
} as const

export type SupportedChainId = keyof typeof USDC_ADDRESSES

// Polygon-only — single chain simplifies UX for non-crypto users
export const chains = [polygon] as const

export const config = getDefaultConfig({
  appName: 'Chessty',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  chains,
  transports: {
    [polygon.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
