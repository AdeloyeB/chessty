# Product Roadmap

> **Goal**: Production-ready chess prediction platform for crypto-native users, scaling from 10,000 to 1,000,000 users.

## Current State

### What's Built ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Chess Engine | ✅ Complete | Full move validation, checkmate/stalemate detection |
| WebSocket Gameplay | ✅ Complete | Real-time moves, clock sync, spectator updates |
| Authentication | ✅ Complete | Email/password + Google/GitHub OAuth |
| MFA (TOTP) | ✅ Complete | With backup codes |
| ELO System | ✅ Complete | Rating calculation, rank tiers |
| Matchmaking | ✅ Complete | By ELO range and stake amount |
| Challenge System | ✅ Complete | Direct player challenges with confirmation |
| Spectator Mode | ✅ Complete | Watch games, real-time updates |
| Betting System | ✅ Complete | Spectator bets (database-backed) |
| Wallet Balances | ✅ Complete | Atomic updates, race condition fixed |
| Game Clocks | ✅ Complete | Fischer increment support |
| Desktop App | ✅ Complete | Tauri desktop app |

### What's Missing for Production

| Gap | Risk Level | Effort |
|-----|------------|--------|
| Blockchain settlement | 🔴 Critical | Large |
| Redis game state | 🟡 High | Medium |
| Production monitoring | 🟡 High | Medium |
| Smart contract audit | 🔴 Critical | External |
| Anti-cheat measures | 🟡 High | Medium |
| Multi-sig setup | 🔴 Critical | Small |

---

## Phase 1: Production Foundation (4-6 weeks)

**Goal**: Get to a state where real money can flow safely.

### 1.1 Blockchain Integration (Critical Path)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Write ChessEscrow.sol | P0 | 1 week | None |
| Write GameRegistry.sol | P0 | 3 days | None |
| Unit tests (100% coverage) | P0 | 1 week | Contracts |
| Deploy to Mumbai testnet | P0 | 1 day | Tests passing |
| Server integration (ethers.js) | P0 | 1 week | Testnet deploy |
| Frontend deposit/withdraw UI | P0 | 1 week | Server integration |
| Testnet soak test (2 weeks) | P0 | 2 weeks | Full integration |

**Deliverable**: End-to-end flow working on testnet with test USDC.

### 1.2 Redis Integration

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Set up Upstash Redis | P1 | 1 day | None |
| Migrate game state to Redis | P1 | 3 days | Redis setup |
| Implement Lua scripts for clocks | P1 | 2 days | Game state migration |
| Test failover scenarios | P1 | 2 days | Lua scripts |
| Update ClockManager to use Redis | P1 | 2 days | Lua scripts |

**Deliverable**: Games survive server restarts. Clock operations are atomic.

### 1.3 Security Hardening

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Set up Doppler for secrets | P0 | 1 day | None |
| Migrate all secrets to Doppler | P0 | 1 day | Doppler setup |
| Create Gnosis Safe (2-of-3) | P0 | 1 day | None |
| Configure hardware wallets | P0 | 1 day | Gnosis Safe |
| Set up rate limiting (Redis) | P1 | 2 days | Redis |
| Input validation audit | P1 | 2 days | None |

**Deliverable**: No secrets in code, multi-sig ready, rate limiting operational.

### 1.4 Monitoring & Alerts

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Set up Datadog or Grafana | P1 | 1 day | None |
| Add application metrics | P1 | 2 days | Monitoring setup |
| Configure alerts (PagerDuty) | P1 | 1 day | Metrics |
| Add financial transaction logging | P0 | 2 days | None |
| Create runbooks for incidents | P1 | 2 days | Alerts |

**Deliverable**: Visibility into system health, alerts for anomalies.

---

## Phase 2: Smart Contract Audit & Mainnet (4-6 weeks)

**Goal**: Audited contracts deployed to mainnet with real USDC.

### 2.1 Pre-Audit Preparation

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Fuzz testing (Foundry) | P0 | 1 week | Contracts finalized |
| Documentation for auditors | P0 | 3 days | Contracts finalized |
| Fix any issues from fuzzing | P0 | Variable | Fuzz testing |

### 2.2 Security Audit

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Engage auditor (Trail of Bits, OZ, etc.) | P0 | 2-4 weeks | Pre-audit prep |
| Address audit findings | P0 | 1-2 weeks | Audit complete |
| Re-audit critical fixes | P0 | 1 week | Fixes complete |

**Budget**: $20,000 - $50,000 depending on auditor and scope.

### 2.3 Mainnet Deployment

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Deploy to Polygon mainnet | P0 | 1 day | Audit passed |
| Transfer ownership to multi-sig | P0 | 1 day | Mainnet deploy |
| Verify contracts on PolygonScan | P0 | 1 hour | Mainnet deploy |
| Staged rollout (invite-only) | P0 | 2 weeks | Verification |
| Bug bounty program (Immunefi) | P1 | 1 day | Mainnet deploy |

**Deliverable**: Audited, verified contracts on mainnet with real money flowing.

---

## Phase 3: Scale to 10,000 Users (4-6 weeks)

**Goal**: Handle 10,000 concurrent users reliably.

### 3.1 Infrastructure Scaling

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Load testing (k6 or Artillery) | P0 | 1 week | Phase 2 complete |
| Identify bottlenecks | P0 | 1 week | Load testing |
| Database query optimization | P1 | 1 week | Bottleneck analysis |
| Add read replicas if needed | P2 | 2 days | Query optimization |
| CDN for static assets | P1 | 1 day | None |

### 3.2 Anti-Cheat (Basic)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Move time analysis | P1 | 1 week | None |
| Statistical detection of engine use | P1 | 2 weeks | Move time analysis |
| Manual review queue | P1 | 1 week | Detection |
| Account flagging system | P1 | 3 days | Review queue |

### 3.3 User Experience Polish

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Onboarding flow improvements | P2 | 1 week | User feedback |
| Transaction history UI | P1 | 3 days | None |
| Game replay feature | P2 | 1 week | None |
| Mobile-responsive fixes | P2 | 1 week | None |

---

## Phase 4: Scale to 100,000 Users (8-12 weeks)

**Goal**: Multi-server architecture for 100k concurrent users.

### 4.1 Horizontal Scaling

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| WebSocket server clustering | P0 | 2 weeks | Phase 3 complete |
| Redis Pub/Sub for cross-server | P0 | 1 week | Clustering |
| Load balancer (AWS ALB) | P0 | 1 week | Clustering |
| Sticky sessions for WebSocket | P0 | 2 days | Load balancer |
| Session state in Redis | P0 | 1 week | Pub/Sub |

### 4.2 Database Scaling

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Read replica deployment | P1 | 1 week | Phase 3 analysis |
| Query routing (writes→primary, reads→replica) | P1 | 1 week | Replicas |
| Connection pooling optimization | P1 | 3 days | Routing |

### 4.3 Blockchain Reliability

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Multiple RPC providers | P0 | 3 days | None |
| Automatic failover | P0 | 1 week | Multiple RPCs |
| Settlement retry queue (BullMQ) | P0 | 1 week | None |
| Dead-letter handling | P0 | 3 days | Retry queue |

---

## Phase 5: Global Scale (Future)

**Goal**: 1,000,000+ users across multiple regions.

### High-Level Tasks

| Area | Approach |
|------|----------|
| Multi-region deployment | US-East, EU-West, Asia-Pacific |
| Database | CockroachDB or Neon multi-region |
| WebSocket | Regional clusters + global Pub/Sub |
| Latency optimization | Edge compute for matchmaking |
| Compliance | Region-specific legal requirements |

---

## Feature Backlog (Not Prioritized)

These are future ideas, not committed work:

### Gameplay
- [ ] Tournament system with brackets
- [ ] Blitz/bullet time controls
- [ ] Puzzle mode (tactics training)
- [ ] Opening explorer
- [ ] Analysis board (post-game)

### Social
- [ ] Friend lists
- [ ] Private messaging
- [ ] Clubs/teams
- [ ] Discord bot for analytics
- [ ] Twitch/YouTube streaming integration

### Monetization
- [ ] Premium subscriptions (ad-free, analytics)
- [ ] Cosmetics (board themes, piece sets)
- [ ] Tournament entry fees

### Mobile
- [ ] React Native app
- [ ] Push notifications
- [ ] Mobile wallet integration (WalletConnect v2)

---

## Key Metrics to Track

### Health
- Server uptime (target: 99.9%)
- WebSocket connection success rate
- API response times (p50, p95, p99)
- Error rate

### Financial
- Total value locked (TVL)
- Daily settlement volume
- Platform fee revenue
- Average stake size

### Growth
- Daily active users (DAU)
- Games played per day
- New user registrations
- User retention (D1, D7, D30)

### Security
- Failed login attempts
- Suspicious withdrawal patterns
- Contract pause events
- Audit findings resolved

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-26 | Desktop-first, mobile later | Target audience is on computers trading |
| 2025-01-26 | USDC on Polygon only | Traditional processors prohibit betting |
| 2025-01-26 | Doppler for secrets | Free tier, good DX, works with any hosting |
| 2025-01-26 | Gnosis Safe 2-of-3 | Balance security with operational efficiency |
| 2025-01-26 | 5% platform fee | Competitive with similar platforms |
