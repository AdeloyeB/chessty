import { http, createConfig } from 'wagmi'
import { mainnet, base } from 'wagmi/chains'
import { coinbaseWallet, metaMask, injected } from 'wagmi/connectors'

// USDC contract addresses
export const USDC_ADDRESSES = {
  [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
} as const

export type SupportedChainId = keyof typeof USDC_ADDRESSES

export const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    coinbaseWallet({ appName: 'Chessty', appLogoUrl: '/logo.png' }),
    metaMask(),
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
