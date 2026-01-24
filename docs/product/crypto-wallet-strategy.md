# Crypto & Wallet Integration Strategy

Research document for implementing crypto payments in the chess betting platform.

---

## Executive Summary

Following the [Polymarket model](https://docs.polymarket.com/polymarket-learn/get-started/how-to-deposit), we recommend:

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Stablecoin** | USDC | Industry standard, 1:1 USD peg, regulatory clarity |
| **Network** | Polygon (only) | Polymarket-proven for betting, mature ecosystem, deep USDC liquidity |
| **Wallet Connection** | Wagmi + RainbowKit | Already using Wagmi, RainbowKit adds polished UI |
| **Fiat Onramp** | MoonPay (primary) | Broad international coverage, defaults to `usdc_polygon` |

> **Decision (Jan 2026):** Committed to Polygon-only after crypto strategist review.
> Single-chain approach simplifies UX for non-crypto chess players and follows
> the Polymarket playbook (the largest prediction market runs exclusively on Polygon).

---

## Part 1: Polymarket Analysis

### How Polymarket Works

Polymarket is the dominant prediction market platform and serves as our primary reference:

- **Currency**: Exclusively USDC (USD Coin) - a stablecoin pegged 1:1 to USD
- **Network**: Polygon (Layer 2) for low fees and fast transactions
- **Fees**: 0% trading fees on most markets (3% on 15-min crypto markets to combat bots)
- **Deposits**: Multiple methods including card, bank transfer, and crypto wallets

Source: [Polymarket Documentation](https://docs.polymarket.com/polymarket-learn/get-started/how-to-deposit)

### Polymarket Deposit Methods

| Method | Provider | Min Amount | Fees | Best For |
|--------|----------|------------|------|----------|
| Card/Bank | MoonPay, Stripe | $20-30 | 1-4.5% | New users |
| Coinbase Pay | Coinbase | Variable | ~1% | US users with Coinbase |
| Exchange Transfer | Any exchange | Varies | Network only | Crypto-native users |
| Private Wallet | MetaMask, etc. | None | Gas fees | Existing crypto users |

Source: [Polymarket Deposits & Withdrawals](https://polymarket.medium.com/deposits-withdrawals-on-polymarket-4e467c04fb6b)

### Supported Wallets (Polymarket)

- MetaMask
- Coinbase Wallet
- Phantom
- Any WalletConnect-compatible wallet

Source: [Polymarket Sign-Up Guide](https://docs.polymarket.com/polymarket-learn/get-started/how-to-signup)

---

## Part 2: Recommended Stablecoin

### Why USDC?

| Factor | USDC | USDT | DAI |
|--------|------|------|-----|
| **Issuer** | Circle (regulated US company) | Tether (offshore) | MakerDAO (decentralized) |
| **Market Cap** | $77B | $187B | $5B |
| **Regulatory Clarity** | High (US compliant) | Low (ongoing scrutiny) | Medium |
| **Polymarket Uses** | Yes | No | No |
| **Coinbase Native** | Yes | No | No |
| **Network Support** | Ethereum, Base, Polygon, Arbitrum | All major | Ethereum, some L2s |

**Recommendation**: Use **USDC exclusively**, matching Polymarket's approach.

Source: [What is USDC](https://www.usdc.com/learn/what-is-usdc)

### USDC Contract Address (Polygon)

```typescript
// Official Circle native USDC on Polygon
export const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const
```

Chain ID: `137` (Polygon PoS)

---

## Part 3: Network Comparison

### Transaction Fee Comparison (2026)

| Network | Avg Fee | Speed | Ecosystem | Best For |
|---------|---------|-------|-----------|----------|
| **Base** | ~$0.001 | 2 sec | Coinbase native | US users, Coinbase integration |
| **Polygon PoS** | ~$0.002-0.007 | 2 sec | Largest L2, Polymarket | International, established apps |
| **Arbitrum** | ~$0.009-0.30 | 2 sec | Highest TVL ($4.6B) | DeFi power users |
| **Ethereum** | $1-50 | 12 sec | Most secure | High-value settlements only |

Source: [Blockchain Fee Comparison](https://www.bleap.finance/blog/which-blockchain-has-the-lowest-fees)

### Network Decision: Polygon Only

```
Primary (and only): Polygon → Polymarket-proven, mature, deep USDC liquidity
```

### Why Polygon?

1. **Polymarket Precedent**: The largest prediction/betting market runs exclusively on Polygon — proven at scale
2. **Mature Ecosystem**: Live since 2020, battle-tested infrastructure, established liquidity
3. **Low Fees**: ~$0.002-0.007 per transaction — negligible for betting amounts
4. **MoonPay Alignment**: MoonPay defaults to `usdc_polygon`, matching our onramp strategy
5. **Developer Simplicity**: One chain = one RPC, one block explorer, one set of gas estimations

### What We Traded Off

- **Coinbase 0% on-ramp** (Base-only feature) — users pay MoonPay's 1-4.5% instead
- **Circle Paymaster** (works best on Base) — users need a tiny amount of MATIC for gas (~$1 covers thousands of transactions)

### Gas Token Note

Polygon uses MATIC (POL) for gas fees. Non-crypto users can purchase a small amount ($1) via MoonPay alongside their USDC deposit. At $0.003 per transaction, $1 of MATIC lasts months of betting activity.

Source: [Blockchain Fee Comparison](https://www.bleap.finance/blog/which-blockchain-has-the-lowest-fees)

---

## Part 4: Wallet Connection

### Current Setup

We're already using Wagmi with basic connectors:

```typescript
// apps/web/src/config/wagmi.ts
connectors: [
  coinbaseWallet({ appName: 'Chessty' }),
  metaMask(),
  injected(),
]
```

### Recommended: Add RainbowKit

[RainbowKit](https://rainbowkit.com/docs/introduction) provides a polished wallet connection UI that works with Wagmi:

**Benefits:**
- Beautiful, customizable modal UI
- Supports 50+ wallets out of the box
- Mobile-responsive
- Dark/light mode
- Built on Wagmi (no migration needed)
- EIP-6963 support for multi-wallet browsers

**Installation:**
```bash
pnpm add @rainbow-me/rainbowkit
```

**Integration:**
```tsx
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, ConnectButton } from '@rainbow-me/rainbowkit';

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <ConnectButton />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

Source: [RainbowKit Documentation](https://rainbowkit.com/docs/introduction)

### Supported Wallets Priority

| Wallet | Priority | Why |
|--------|----------|-----|
| Coinbase Wallet | 1 | Best UX for new users, Onramp integration |
| MetaMask | 2 | Most popular, 30M+ users |
| WalletConnect | 3 | Supports 300+ wallets |
| Rainbow | 4 | Mobile-first experience |
| Phantom | 5 | Popular with Solana users moving to EVM |

---

## Part 5: Fiat Onramp Options

### Option 1: Coinbase Onramp (Recommended for US)

**Pros:**
- **Zero fees** for USDC on Base
- Handles KYC, fraud, and support
- React component available (`<FundCard />`)
- Trusted brand

**Cons:**
- US-focused (limited international)
- Requires Coinbase account for best experience

**Integration:**
```tsx
import { FundCard } from '@coinbase/onchainkit/fund';

<FundCard
  assetSymbol="USDC"
  country="US"
/>
```

Source: [Coinbase Onramp Docs](https://www.coinbase.com/developer-platform/products/onramp)

### Option 2: MoonPay (Recommended for International)

**Pros:**
- Global coverage (160+ countries)
- Multiple payment methods (card, bank, Apple Pay, PayPal)
- White-label widget
- Web, iOS, Android, React Native SDKs

**Cons:**
- 1-4.5% fees
- $20-30 minimum

**Integration:**
```html
<script src="https://static.moonpay.com/web-sdk/v1/moonpay-web-sdk.min.js"></script>
```

```javascript
const moonpaySdk = window.MoonPayWebSdk.init({
  flow: 'buy',
  environment: 'production',
  params: {
    apiKey: 'pk_live_xxx',
    defaultCurrencyCode: 'usdc_polygon',
    walletAddress: userWalletAddress,
  }
});
moonpaySdk.show();
```

Source: [MoonPay On-Ramp Overview](https://dev.moonpay.com/docs/on-ramp-overview)

### Option 3: Stripe Crypto Onramp

**Pros:**
- Trusted payment processor
- Native mobile SDK (iOS, Android, React Native)
- Embedded components

**Cons:**
- Only US and EU (excluding Hawaii)
- Still in public preview

Source: [Stripe Crypto Docs](https://docs.stripe.com/crypto)

### Recommended Onramp Strategy

```
All Users:       MoonPay (broad coverage, defaults to usdc_polygon)
Fallback:        Direct wallet transfer (crypto-native users send USDC on Polygon)
Future:          Coinbase Onramp (if we add Base as a secondary chain later)
```

---

## Part 6: Legal & Compliance Considerations

### KYC Requirements

For a betting/wagering platform, consider these compliance tiers:

| Tier | Threshold | Requirements |
|------|-----------|--------------|
| **Light** | < $1,000 lifetime | Email verification only |
| **Standard** | $1,000 - $10,000 | ID verification, address |
| **Enhanced** | > $10,000 or high-risk | Source of funds, enhanced due diligence |

Source: [Casino Compliance Guide](https://sumsub.com/blog/a-complete-guide-to-casino-compliance-aml-responsible-gambling-and-data-protection/)

### Licensing Considerations

| Jurisdiction | Strictness | Crypto-Friendly | Notes |
|--------------|------------|-----------------|-------|
| Curaçao | Low | Yes | Most crypto casinos use this |
| Malta MGA | High | Limited | Gold standard, no crypto yet |
| UK GC | High | No | May change in 2026 |
| US (varies) | High | State-dependent | Complex patchwork |

**Recommendation**: Consult with a gaming lawyer before launch. Consider:
- Curaçao license for initial launch
- Geo-blocking restricted jurisdictions
- Using a compliant fiat onramp (Coinbase/MoonPay handle KYC)

Source: [Licensed Crypto Betting Sites 2026](https://www.mexc.com/news/291242)

### Feature Flag Integration

Use feature flags to control crypto features by jurisdiction:

```typescript
// Example flags for crypto features
const CRYPTO_FLAGS = {
  wallet_deposits: false,      // Enable when ready
  wallet_withdrawals: false,   // Enable when ready
  polygon_network: true,       // Only supported network
  moonpay_onramp: true,        // Primary onramp (all users)
  kyc_required: true,          // Compliance
};
```

---

## Part 7: Implementation Roadmap

### Phase 1: Wallet Connection (Complete)
- [x] Wagmi configuration
- [x] RainbowKit for polished wallet connection UI
- [x] Polygon network (committed as sole chain)
- [x] USDC balance reading via ERC-20 balanceOf()
- [x] Dev mode with mock wallet data

### Phase 2: Read-Only Integration (Complete)
- [x] Display USDC balance
- [x] Show transaction history (with balance change tracking)
- [x] Network detection (wrong network prompts)

### Phase 3: Deposits (Behind Feature Flag)
- [ ] MoonPay integration (usdc_polygon + small MATIC purchase)
- [ ] Direct wallet deposits (USDC on Polygon)
- [ ] Deposit confirmation flow
- [ ] Balance sync between on-chain and platform balance

### Phase 4: Withdrawals (Behind Feature Flag)
- [ ] Withdrawal request UI
- [ ] Admin approval flow (if needed)
- [ ] Multi-sig treasury (security)

### Phase 5: Full Integration
- [ ] Betting with USDC on Polygon
- [ ] Real-time balance updates
- [ ] Gas estimation and optimization
- [ ] Gasless transactions via relayer/paymaster (optional — gas is already ~$0.003)

---

## Part 8: Technical Architecture

### Recommended Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
├─────────────────────────────────────────────────────────────┤
│  Wagmi          - Wallet state management                    │
│  RainbowKit     - Wallet connection UI                       │
│  Viem           - Blockchain interactions                    │
│  OnchainKit     - Coinbase components (optional)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      ONRAMP LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  MoonPay          - Primary onramp, defaults to usdc_polygon │
│  Direct Transfer  - Crypto-native users send USDC directly   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      BLOCKCHAIN LAYER                        │
├─────────────────────────────────────────────────────────────┤
│  Polygon (Only)   - Polymarket-proven, ~$0.003 fees         │
│                     Chain ID: 137                            │
│                     Gas token: MATIC/POL                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SMART CONTRACTS                         │
├─────────────────────────────────────────────────────────────┤
│  USDC (Circle)   - 0x3c499c...3359 (native, not bridged)   │
│  Treasury        - Multi-sig for platform funds             │
│  Escrow          - Hold stakes during games (optional)      │
└─────────────────────────────────────────────────────────────┘
```

### Current Wagmi Config (Polygon-Only)

```typescript
// apps/web/src/config/wagmi.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { polygon } from 'wagmi/chains'

export const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const

export const config = getDefaultConfig({
  appName: 'Chessty',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  chains: [polygon],
  transports: {
    [polygon.id]: http(),
  },
})
```

---

## Part 9: Security Considerations

### Wallet Security
- Never store private keys server-side
- Use hardware wallet support for admin functions
- Implement transaction signing on client only

### Smart Contract Security
- Use audited USDC contract (Circle's official)
- Multi-sig for treasury operations
- Time-locks for large withdrawals

### Frontend Security
- Validate all amounts client and server side
- Rate limit transactions
- Implement withdrawal limits
- Monitor for unusual patterns

### User Protection
- Clear network selection UI (prevent wrong-network sends)
- Transaction confirmation modals
- Minimum withdrawal amounts
- Cooling-off periods for large withdrawals

---

## Resources & Sources

### Official Documentation
- [Polymarket Documentation](https://docs.polymarket.com/polymarket-learn/get-started/how-to-deposit)
- [Polymarket Deposits & Withdrawals](https://polymarket.medium.com/deposits-withdrawals-on-polymarket-4e467c04fb6b)
- [Wagmi Documentation](https://wagmi.sh/react/getting-started)
- [RainbowKit Documentation](https://rainbowkit.com/docs/introduction)
- [Coinbase Onramp](https://www.coinbase.com/developer-platform/products/onramp)
- [MoonPay Developer Docs](https://dev.moonpay.com/docs/on-ramp-overview)
- [Stripe Crypto](https://docs.stripe.com/crypto)
- [Circle USDC](https://www.usdc.com/learn/what-is-usdc)

### Guides & Tutorials
- [Building Multi-Wallet Connection with Wagmi v2](https://medium.com/@mirbasit01/building-multi-wallet-connection-with-wagmi-v2-viem-a-complete-developer-guide-a7bcf358ec2b)
- [How to Build a React Frontend with Wagmi](https://www.quicknode.com/guides/ethereum-development/dapps/building-dapps-with-wagmi)
- [Blockchain Fee Comparison 2026](https://www.bleap.finance/blog/which-blockchain-has-the-lowest-fees)

### Market Research
- [DappRadar Prediction Markets Guide](https://dappradar.com/blog/prediction-markets-crypto-guide)
- [Top Crypto Prediction Marketplaces 2026](https://www.blockchainx.tech/top-crypto-prediction-marketplaces/)
- [Crypto Market Predictions 2026](https://coinpedia.org/research-report/exclusive-report-crypto-market-predictions-2026/)

### Compliance
- [Casino Compliance AML Guide](https://sumsub.com/blog/a-complete-guide-to-casino-compliance-aml-responsible-gambling-and-data-protection/)
- [Licensed Crypto Betting Sites 2026](https://www.mexc.com/news/291242)
- [2026 Gambling Regulation Predictions](https://igamingbusiness.com/legal-compliance/compliance/2026-gambling-predictions-the-year-ahead-for-regulation-and-compliance/)
