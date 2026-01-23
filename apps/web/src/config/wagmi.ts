import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { mainnet, base, polygon, arbitrum } from 'wagmi/chains'

// USDC contract addresses (official Circle native USDC)
export const USDC_ADDRESSES = {
  [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [polygon.id]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
} as const

export type SupportedChainId = keyof typeof USDC_ADDRESSES

// Export chains for RainbowKitProvider
export const chains = [base, polygon, arbitrum, mainnet] as const

export const config = getDefaultConfig({
  appName: 'Chessty',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  chains,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
