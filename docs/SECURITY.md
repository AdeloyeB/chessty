# Security Requirements

> **CRITICAL**: This is a real-money betting platform. Security failures can result in user fund loss, platform insolvency, legal liability, and criminal prosecution. No shortcuts.

## Table of Contents

1. [Core Principles](#core-principles)
2. [Database Security](#database-security)
3. [Smart Contract Security](#smart-contract-security)
4. [Server & Infrastructure Security](#server--infrastructure-security)
5. [Secrets Management](#secrets-management)
6. [Monitoring & Incident Response](#monitoring--incident-response)
7. [Security Checklist](#security-checklist)

---

## Core Principles

### Defense in Depth
Never rely on a single security layer. If one control fails, others should catch the attack.

```
Attack → Firewall → Rate Limiting → Auth → Input Validation → Business Logic → Database
         ↓            ↓              ↓           ↓                ↓              ↓
       Blocked     Blocked        Blocked     Blocked          Blocked        Blocked
```

### Fail Secure
When something goes wrong, fail in a way that denies access rather than grants it.

```typescript
// ❌ WRONG: Fails open (attacker wins on error)
try {
  const isAllowed = await checkPermission(user);
  if (isAllowed) processTransaction();
} catch (e) {
  processTransaction(); // ERROR = ALLOW
}

// ✅ CORRECT: Fails closed (attacker loses on error)
try {
  const isAllowed = await checkPermission(user);
  if (isAllowed) processTransaction();
} catch (e) {
  logSecurityEvent(e);
  throw new Error('Transaction denied'); // ERROR = DENY
}
```

### Assume Breach
Design systems assuming attackers will get partial access. Limit blast radius.

| If Compromised... | Damage Should Be Limited To... |
|-------------------|-------------------------------|
| Single API key | That key's scope only |
| Database read access | Cannot modify balances |
| Server hot wallet | Max 24 hours of settlements |
| Single admin account | Cannot drain funds (requires multi-sig) |

### Audit Trail
Every money movement must be logged with enough detail to reconstruct what happened.

```typescript
// Required fields for financial transactions
interface AuditLog {
  timestamp: Date;
  userId: string;
  action: 'deposit' | 'withdrawal' | 'settlement' | 'bet_placed' | 'bet_won';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  transactionHash?: string;  // For on-chain operations
  gameId?: string;
  metadata: Record<string, unknown>;
}
```

---

## Database Security

### Race Condition Prevention (CRITICAL)

The most common vulnerability in betting systems is the **double-spend race condition**.

#### The Attack
```
Time 0ms:  Request A reads balance = $100
Time 1ms:  Request B reads balance = $100
Time 2ms:  Request A checks: $100 >= $50? Yes
Time 3ms:  Request B checks: $100 >= $50? Yes
Time 4ms:  Request A writes: balance = $50
Time 5ms:  Request B writes: balance = $50
Result:    User spent $100 but only paid $50
```

#### The Fix: Atomic Updates

```typescript
// ❌ VULNERABLE: Separate read and write
const user = await db.query.users.findFirst({ where: eq(users.id, id) });
const balance = parseFloat(user.balance);
if (balance >= amount) {
  await db.update(users).set({ balance: (balance - amount).toString() });
}

// ✅ SAFE: Atomic update with condition in WHERE
const result = await db
  .update(users)
  .set({ balance: sql`(${users.balance}::numeric - ${amount})::text` })
  .where(and(
    eq(users.id, userId),
    sql`${users.balance}::numeric >= ${amount}`  // Check happens atomically
  ))
  .returning();

if (result.length === 0) {
  throw new Error('Insufficient balance');
}
```

### SQL Injection Prevention

Always use parameterized queries. Never string-concatenate user input.

```typescript
// ❌ VULNERABLE
const query = `SELECT * FROM users WHERE id = '${userId}'`;

// ✅ SAFE: Drizzle ORM handles parameterization
const user = await db.query.users.findFirst({
  where: eq(users.id, userId)
});
```

### Data Encryption

| Data Type | At Rest | In Transit |
|-----------|---------|------------|
| Passwords | bcrypt hash (cost 12+) | HTTPS |
| TOTP secrets | AES-256 encrypted | HTTPS |
| Session tokens | N/A (short-lived) | HTTPS, HttpOnly cookies |
| Wallet addresses | Plain (public data) | HTTPS |
| Private keys | NEVER in database | N/A |

---

## Smart Contract Security

### Multi-Signature Requirements

All contracts MUST be owned by a Gnosis Safe multi-sig, not a single wallet.

```
Recommended Setup (2-of-3):

Signer 1: Founder's hardware wallet (Ledger/Trezor)
          └── Stored offline, used for major decisions

Signer 2: Technical co-founder / CTO hardware wallet
          └── Stored offline, backup for Signer 1

Signer 3: Operational wallet (software wallet on secure server)
          └── Used for routine settlements
          └── If compromised, cannot act alone
```

### Time-Lock Requirements

| Operation | Required Delay | Rationale |
|-----------|----------------|-----------|
| Contract upgrade | 48 hours | Time to detect malicious upgrades |
| Change fee structure | 24 hours | Users can exit before changes |
| Large withdrawal (>$500) | 24 hours | Limits hot wallet compromise damage |
| Emergency pause | Instant | Must respond to attacks immediately |
| Unpause | 24 hours | Prevents attacker from re-enabling |

### Rate Limiting in Contract

```solidity
// Contract-level rate limiting
uint256 public constant DAILY_SETTLEMENT_LIMIT = 50000 * 1e6; // $50,000 USDC
uint256 public settledToday;
uint256 public lastResetTimestamp;

function settleGame(bytes32 gameId, address winner) external onlyAuthorized {
    // Reset daily counter if new day
    if (block.timestamp / 1 days > lastResetTimestamp / 1 days) {
        settledToday = 0;
        lastResetTimestamp = block.timestamp;
    }

    uint256 payout = games[gameId].totalPot;
    require(settledToday + payout <= DAILY_SETTLEMENT_LIMIT, "Daily limit exceeded");
    settledToday += payout;

    // ... settlement logic
}
```

### Emergency Pause

```solidity
bool public paused;
address public guardian;  // Hardware wallet address

modifier whenNotPaused() {
    require(!paused, "Contract is paused");
    _;
}

// Guardian can pause instantly
function pause() external {
    require(msg.sender == guardian, "Only guardian");
    paused = true;
    emit Paused(msg.sender);
}

// Unpause requires multi-sig (time-locked)
function unpause() external onlyMultiSig {
    paused = false;
    emit Unpaused(msg.sender);
}
```

### Pre-Deployment Checklist

- [ ] Third-party audit completed (Trail of Bits, OpenZeppelin, Consensys Diligence)
- [ ] All tests passing with 100% coverage on critical paths
- [ ] Fuzz testing completed (Foundry or Echidna)
- [ ] Deployed to testnet for 2+ weeks without issues
- [ ] Bug bounty program set up (Immunefi)
- [ ] Multi-sig configured and tested
- [ ] Time-locks verified
- [ ] Emergency pause tested

---

## Server & Infrastructure Security

### Network Security

```
Internet
    │
    ▼
┌─────────────────┐
│   CloudFlare    │  ← DDoS protection, WAF
│   (CDN + WAF)   │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Load Balancer  │  ← SSL termination, rate limiting
│   (AWS ALB)     │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│   App Servers   │  ← No direct internet access
│  (Private VPC)  │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│    Database     │  ← Private subnet only
│   (Neon/RDS)    │
└─────────────────┘
```

### Rate Limiting

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Login attempts | 5 | 15 minutes |
| Registration | 3 | 1 hour |
| MFA verification | 5 | 15 minutes |
| API general | 100 | 1 minute |
| WebSocket messages | 50 | 10 seconds |
| Settlement requests | 10 | 1 minute |

### Input Validation

```typescript
// All user input must be validated
const moveSchema = z.object({
  gameId: z.string().length(21),  // nanoid format
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
});

// Validate before processing
const parsed = moveSchema.safeParse(input);
if (!parsed.success) {
  throw new ValidationError('Invalid move format');
}
```

---

## Secrets Management

### Environment Tiers

| Environment | Secret Storage | Who Has Access |
|-------------|----------------|----------------|
| Local dev | `.env.local` (gitignored) | Individual developer |
| Staging | Doppler | Engineering team |
| Production | Doppler + hardware wallet for signing keys | Ops team only |

### Required Secrets

| Secret | Format | Rotation |
|--------|--------|----------|
| `DATABASE_URL` | Connection string | On compromise |
| `JWT_SECRET` | 64+ random bytes | Quarterly |
| `TOTP_ENCRYPTION_KEY` | 32 bytes hex | On compromise |
| `SERVER_WALLET_PRIVATE_KEY` | Ethereum private key | On compromise |
| `ALCHEMY_API_KEY` | API key | Quarterly |

### Doppler Setup

```bash
# Install Doppler CLI
brew install dopplerhq/cli/doppler

# Login and setup
doppler login
doppler setup

# Run with secrets injected
doppler run -- bun run start

# In CI/CD (GitHub Actions)
- name: Install Doppler
  run: curl -Ls https://cli.doppler.com/install.sh | sh
- name: Run with secrets
  run: doppler run -- pnpm build
  env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

### Private Key Security

**NEVER:**
- Store private keys in source code
- Store private keys in plain text files
- Log private keys
- Transmit private keys over unencrypted channels
- Store production keys in development environments

**ALWAYS:**
- Use hardware wallets (Ledger/Trezor) for high-value keys
- Use AWS Secrets Manager or HSM for server signing keys
- Rotate keys on any suspected compromise
- Use separate keys for each environment

---

## Monitoring & Incident Response

### Required Alerts

Configure PagerDuty, Opsgenie, or similar for:

| Alert | Threshold | Severity |
|-------|-----------|----------|
| Single settlement > $1,000 | Any occurrence | Warning |
| Daily settlements > $10,000 | Any occurrence | Warning |
| Failed settlement | Any occurrence | Critical |
| Contract pause triggered | Any occurrence | Critical |
| Login failures > 10/min from single IP | Threshold | Warning |
| Database connection failures | Any occurrence | Critical |
| Hot wallet balance < $1,000 | Threshold | Warning |
| Hot wallet balance > $10,000 | Threshold | Warning |

### Incident Response Plan

```
1. DETECT
   └── Alert fires, on-call engineer notified

2. ASSESS (5 minutes max)
   ├── Is money at risk? → If yes, proceed to CONTAIN immediately
   └── What is the scope of the incident?

3. CONTAIN
   ├── Pause smart contracts if on-chain attack
   ├── Block suspicious IPs
   ├── Revoke compromised credentials
   └── Take affected systems offline if needed

4. INVESTIGATE
   ├── Review logs and audit trails
   ├── Identify root cause
   └── Document timeline of events

5. REMEDIATE
   ├── Fix vulnerability
   ├── Deploy patch
   └── Rotate any compromised secrets

6. RECOVER
   ├── Restore services
   ├── Verify integrity
   └── Monitor for recurrence

7. POST-MORTEM
   ├── Document what happened
   ├── Identify improvements
   └── Update procedures
```

---

## Security Checklist

### Before Every Deployment

- [ ] No secrets in source code (git-secrets scan)
- [ ] All dependencies updated (npm audit)
- [ ] Input validation on all endpoints
- [ ] Rate limiting configured
- [ ] HTTPS enforced
- [ ] CORS properly configured

### Before Mainnet Launch

- [ ] Smart contract audit completed
- [ ] Penetration test completed
- [ ] Multi-sig configured and tested
- [ ] Time-locks verified
- [ ] Bug bounty program active
- [ ] Monitoring and alerts configured
- [ ] Incident response plan documented
- [ ] Data backup and recovery tested
- [ ] Legal review completed

### Monthly Security Review

- [ ] Review access logs for anomalies
- [ ] Rotate non-critical secrets
- [ ] Update dependencies
- [ ] Review and update firewall rules
- [ ] Test backup restoration
- [ ] Review multi-sig signer availability
