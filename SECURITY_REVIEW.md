# Security Review: Chessty

**Review Date:** 2026-01-18
**Reviewer:** Security Audit
**Codebase Version:** Initial commit (1bd818d)

---

## Executive Summary

This document identifies security vulnerabilities, concerns, and recommendations for the Chessty chess betting platform. The platform handles real money (USDC), making security critical. Several **high-severity** and **critical** issues must be addressed before production deployment.

---

## Remediation Summary

### Critical & High Priority Fixes

| # | Issue | Severity | File | Fix | Effort |
|---|-------|----------|------|-----|--------|
| 1 | **Default JWT Secret** | CRITICAL | `services/auth.ts:7` | Remove fallback, throw error if env var missing | 10 min |
| 2 | **No Rate Limiting** | CRITICAL | `index.ts` | Add `rate-limiter-flexible` with Redis backend | 2-4 hrs |
| 3 | **Wallet Race Conditions** | CRITICAL | `services/wallet.ts` | Use `db.transaction()` with `FOR UPDATE` locks | 2-3 hrs |
| 4 | **Matchmaking Race Conditions** | HIGH | `services/matchmaking.ts` | Lock funds at queue join, wrap in transaction | 3-4 hrs |
| 5 | **No WS Payload Validation** | HIGH | `websocket/handler.ts` | Add Zod schemas for all payload types | 2-3 hrs |
| 6 | **Clock State Not Persisted** | HIGH | `GameManager.ts` | Save clock to DB after each move | 1-2 hrs |
| 7 | **No Move Timing Validation** | HIGH | `GameManager.ts` | Track move times, flag <100ms on complex positions | 3-4 hrs |
| 8 | **No HTTPS Enforcement** | HIGH | Infrastructure | Deploy behind Cloudflare/nginx with TLS | 1-2 hrs |
| 9 | **No Account Lockout** | MEDIUM | `services/auth.ts` | Track failed attempts, lock after 10 failures | 2 hrs |
| 10 | **Weak Password Policy** | MEDIUM | `shared/types/index.ts` | Add regex validators for complexity | 30 min |

### Quick Wins (< 1 hour each)

| Issue | File | One-Line Fix |
|-------|------|--------------|
| Bet amount limits | `routes/betting.ts:9` | `amount: z.number().positive().min(MIN_BET).max(MAX_BET)` |
| Stake amount limits | `routes/matchmaking.ts` | `stakeAmount: z.number().min(MIN_STAKE).max(MAX_STAKE)` |
| Path param validation | `index.ts:112` | `if (!/^[a-zA-Z0-9_-]{21}$/.test(gameId)) return 400` |
| DB balance constraint | Migration | `ALTER TABLE users ADD CHECK (balance >= 0)` |
| Password min length | `shared/types/index.ts:260` | `.min(12)` instead of `.min(8)` |

### Implementation Priority Order

```
Week 1 (Pre-Alpha):
├── Day 1: JWT secret fix + Rate limiting setup
├── Day 2: Wallet transaction safety
├── Day 3: Matchmaking transaction safety
├── Day 4: WebSocket payload validation
└── Day 5: Input validation fixes (bet limits, etc.)

Week 2 (Alpha):
├── Clock persistence
├── Account lockout
├── HTTPS/TLS setup
└── Basic move timing tracking

Week 3+ (Beta):
├── Engine detection heuristics
├── 2FA for high-balance accounts
├── Audit logging
└── Device fingerprinting
```

---

## Detailed Code Fixes

### Fix #1: JWT Secret (CRITICAL)
```typescript
// services/auth.ts - BEFORE
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'default-secret-change-me');

// services/auth.ts - AFTER
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
if (JWT_SECRET_RAW.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters');
  process.exit(1);
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
```

### Fix #2: Rate Limiting (CRITICAL)
```typescript
// New file: services/rateLimit.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

export const loginLimiter = new RateLimiterMemory({
  points: 5,           // 5 attempts
  duration: 60 * 15,   // per 15 minutes
  blockDuration: 60 * 30, // block for 30 min if exceeded
});

export const registerLimiter = new RateLimiterMemory({
  points: 3,
  duration: 60 * 60,   // 3 per hour
});

export const betLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,        // 10 per minute
});

// In index.ts fetch handler:
const ip = req.headers.get('x-forwarded-for') || 'unknown';
try {
  await loginLimiter.consume(ip);
} catch {
  return Response.json({ error: 'Too many requests' }, { status: 429 });
}
```

### Fix #3: Wallet Race Conditions (CRITICAL)
```typescript
// services/wallet.ts - AFTER
export async function updateBalance(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ newBalance: number; transaction: typeof transactions.$inferSelect }> {
  return await db.transaction(async (tx) => {
    // Lock the row for update
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) throw new Error('User not found');

    const currentBalance = parseFloat(user.balance);
    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
      throw new Error('Insufficient balance');
    }

    await tx
      .update(users)
      .set({
        balance: newBalance.toString(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [transaction] = await tx
      .insert(transactions)
      .values({
        id: nanoid(),
        userId,
        type,
        amount: amount.toString(),
        balanceAfter: newBalance.toString(),
        referenceId,
        description,
      })
      .returning();

    return { newBalance, transaction };
  });
}
```

### Fix #4: Matchmaking Race Conditions (HIGH)
```typescript
// services/matchmaking.ts - Reserve funds at join time
export async function joinQueue(userId: string, stakeAmount: number, ...): Promise<QueueEntry> {
  return await db.transaction(async (tx) => {
    // Check and lock user balance
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) throw new Error('User not found');

    const balance = parseFloat(user.balance);
    if (balance < stakeAmount) {
      throw new Error('Insufficient balance for stake');
    }

    // Reserve the funds immediately
    await tx
      .update(users)
      .set({
        balance: (balance - stakeAmount).toString(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Add to queue with reserved amount
    await tx.insert(matchmakingQueue).values({
      userId,
      eloRating: user.eloRating,
      stakeAmount: stakeAmount.toString(),
      reservedAmount: stakeAmount.toString(), // NEW COLUMN
      // ...
    });

    return { /* ... */ };
  });
}

// Refund reserved amount when leaving queue
export async function leaveQueue(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const entry = await tx.query.matchmakingQueue.findFirst({
      where: eq(matchmakingQueue.userId, userId),
    });

    if (entry) {
      // Refund reserved amount
      await tx
        .update(users)
        .set({
          balance: sql`balance + ${entry.reservedAmount}`
        })
        .where(eq(users.id, userId));

      await tx.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, userId));
    }
  });
}
```

### Fix #5: WebSocket Payload Validation (HIGH)
```typescript
// websocket/schemas.ts - NEW FILE
import { z } from 'zod';

export const GameJoinPayload = z.object({
  gameId: z.string().length(21), // nanoid length
});

export const GameMovePayload = z.object({
  gameId: z.string().length(21),
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
});

export const QueueJoinPayload = z.object({
  stakeAmount: z.number().min(10).max(10000),
  timeControl: z.object({
    initial: z.number().min(60).max(3600),
    increment: z.number().min(0).max(60),
  }),
  minElo: z.number().optional(),
  maxElo: z.number().optional(),
});

// websocket/handler.ts - Usage
case 'game:move': {
  const parsed = GameMovePayload.safeParse(payload);
  if (!parsed.success) {
    gameManager.sendError(userId, 'INVALID_PAYLOAD', parsed.error.message);
    return;
  }
  await gameManager.handleMove(userId, parsed.data);
  break;
}
```

### Fix #6: Clock Persistence (HIGH)
```typescript
// GameManager.ts - Persist clock after each move
async handleMove(userId: string, payload: GameMovePayload): Promise<boolean> {
  // ... existing move validation ...

  // After successful move, persist clock state
  await gameService.updateClocks(
    gameId,
    Math.floor(clock.whiteTime),
    Math.floor(clock.blackTime)
  );

  // ... rest of method ...
}

// On game join, restore clock from database
async joinGame(userId: string, gameId: string): Promise<boolean> {
  const game = await gameService.getGame(gameId);

  // Initialize clock from persisted state
  if (!this.gameClocks.has(gameId)) {
    this.gameClocks.set(gameId, {
      whiteTime: game.whiteTimeRemaining,
      blackTime: game.blackTimeRemaining,
      lastUpdate: Date.now(),
      isWhiteTurn: game.currentFen.split(' ')[1] === 'w',
    });
  }
  // ...
}
```

### Fix #7: Move Timing Validation (HIGH)
```typescript
// services/antiCheat.ts - NEW FILE
interface MoveAnalysis {
  moveTimeMs: number;
  positionComplexity: number; // based on piece count, captures available
  isSuspicious: boolean;
  reason?: string;
}

export function analyzeMoveTime(
  moveTimeMs: number,
  fen: string,
  previousMoves: Move[]
): MoveAnalysis {
  const complexity = calculatePositionComplexity(fen);

  // Minimum think times based on complexity
  const minTimes: Record<string, number> = {
    simple: 50,    // Obvious recapture
    medium: 150,   // Normal position
    complex: 300,  // Tactical position
    critical: 500, // Critical moment
  };

  const expectedMin = minTimes[complexity] || 150;

  if (moveTimeMs < expectedMin && complexity !== 'simple') {
    return {
      moveTimeMs,
      positionComplexity: complexity,
      isSuspicious: true,
      reason: `Move made in ${moveTimeMs}ms on ${complexity} position (expected >=${expectedMin}ms)`,
    };
  }

  return { moveTimeMs, positionComplexity: complexity, isSuspicious: false };
}

// In GameManager.handleMove():
const lastMoveTime = this.lastMoveTimestamp.get(gameId) || Date.now();
const moveTimeMs = Date.now() - lastMoveTime;
const analysis = analyzeMoveTime(moveTimeMs, chess.fen(), currentMoves);

if (analysis.isSuspicious) {
  // Log for review, don't block yet
  await logSuspiciousActivity(userId, gameId, analysis);
}
this.lastMoveTimestamp.set(gameId, Date.now());
```

---

## Anti-Cheat Implementation Roadmap

### Phase 1: Basic Detection (Week 2-3)
```typescript
// Track per-game stats
interface PlayerGameStats {
  userId: string;
  gameId: string;
  moveTimes: number[];
  avgCentipawnLoss: number;
  perfectMoves: number;
  totalMoves: number;
  suspiciousFlags: string[];
}
```

### Phase 2: Engine Detection (Week 4+)
- Integrate Stockfish for position analysis
- Calculate centipawn loss per move
- Compare to top engine lines
- Flag accuracy >90% over 20+ moves

### Phase 3: Behavioral Analysis (Month 2+)
- Build player profiles over time
- Detect sudden improvement
- Cross-reference accounts by:
  - IP address
  - Device fingerprint
  - Playing style similarity
  - Login timing patterns

---

## Required Environment Variables

```bash
# .env.production (REQUIRED)
JWT_SECRET=<64-character-random-string>
DATABASE_URL=postgresql://...
CORS_ORIGIN=https://chessty.com

# Generate secure secret:
# openssl rand -base64 48
```

---

## Security Testing Checklist

Before each release:
- [ ] Run `npm audit` - no critical vulnerabilities
- [ ] Test rate limiting manually
- [ ] Attempt concurrent bet placement (should fail)
- [ ] Verify JWT with wrong secret is rejected
- [ ] Test WebSocket with malformed payloads
- [ ] Verify HTTPS redirect works
- [ ] Check all env vars are set (no defaults used)

---

## Critical Issues (Must Fix Before Launch)

### 1. Default JWT Secret in Production
**File:** `apps/server/src/services/auth.ts:7`
**Severity:** CRITICAL

```typescript
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'default-secret-change-me');
```

**Problem:** Falls back to a default secret if env var is missing. This is a catastrophic security flaw—anyone could forge authentication tokens.

**Recommendation:**
- Remove the fallback entirely
- Crash the server on startup if `JWT_SECRET` is not set
- Use a cryptographically secure random secret (256+ bits)

```typescript
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters');
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
```

---

### 2. No Rate Limiting
**Severity:** CRITICAL

The server has zero rate limiting on any endpoint:
- `/api/auth/login` - Allows unlimited brute force attempts
- `/api/auth/register` - Allows mass account creation
- `/api/betting/place` - Allows bet flooding
- `/api/matchmaking/join` - Allows queue manipulation
- WebSocket connections - No connection limits

**Recommendation:**
- Implement rate limiting per IP and per user
- Login: 5 attempts per 15 minutes
- Registration: 3 accounts per IP per hour
- Betting: 10 bets per minute per user
- WebSocket: Max 5 connections per user

```typescript
// Example using a simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
```

---

### 3. Race Conditions in Financial Operations
**File:** `apps/server/src/services/wallet.ts`
**Severity:** CRITICAL

Balance updates are not atomic. Two concurrent requests can read the same balance and both succeed:

```typescript
// wallet.ts - NOT ATOMIC
const currentBalance = parseFloat(user.balance);
const newBalance = currentBalance + amount;
// Another request could read the same currentBalance here
await db.update(users).set({ balance: newBalance.toString() })
```

**Attack Scenario:**
1. User has $100 balance
2. User sends two $100 bets simultaneously
3. Both requests read balance as $100
4. Both succeed, user bets $200 with only $100

**Recommendation:**
- Use database transactions with row-level locking
- Use optimistic locking with version numbers
- Or use atomic SQL operations:

```sql
UPDATE users SET balance = balance - $amount WHERE id = $userId AND balance >= $amount
```

---

### 4. Race Condition in Matchmaking
**File:** `apps/server/src/services/matchmaking.ts`
**Severity:** HIGH

The `findMatch` and `createGame` flow has TOCTOU (Time-of-check to time-of-use) vulnerabilities:

```typescript
// Check balance at queue join time
if (balance < stakeAmount) throw new Error('Insufficient balance');
// ... time passes ...
// Stakes deducted later during createGame - balance could have changed
await walletService.deductStake(whitePlayer.id, stakeAmount, 'pending');
```

**Attack Scenario:**
1. User A joins queue with $100 stake (has $100)
2. User A places a $50 bet elsewhere
3. Match is found, game created
4. deductStake fails or leaves negative balance

**Recommendation:**
- Reserve/lock funds at queue join time
- Use database transactions spanning the entire match creation

---

### 5. No WebSocket Message Validation
**File:** `apps/server/src/websocket/handler.ts`
**Severity:** HIGH

WebSocket payloads are cast with `as any` without validation:

```typescript
case 'game:move':
  await gameManager.handleMove(userId, payload as any);  // No validation!
```

**Problem:** Attackers can send malformed payloads that may crash the server or cause unexpected behavior.

**Recommendation:**
- Validate all WebSocket payloads with Zod schemas
- Add try/catch around all message handling
- Disconnect clients sending invalid messages

---

## High Severity Issues

### 6. Clock Manipulation Vulnerability
**File:** `apps/server/src/websocket/GameManager.ts:264-274`
**Severity:** HIGH

Clock is updated server-side, but time increment is added based on in-memory state:

```typescript
if (clock.isWhiteTurn) {
  clock.whiteTime += game.timeControlIncrement;
}
```

**Problem:** If server restarts mid-game, clock state is lost. Clients could potentially exploit reconnection timing.

**Recommendation:**
- Persist clock state to database after each move
- Validate clock state against database on reconnection
- Add server-authoritative timestamps to all moves

---

### 7. No Move Timestamp Validation
**File:** `apps/server/src/websocket/GameManager.ts`
**Severity:** HIGH

Moves are accepted without validating timing:

```typescript
const move: Move = {
  // ...
  timestamp: Date.now(),  // Server-generated, but no validation of move timing
};
```

**Anti-cheat concern:** No validation that moves are made within human-possible timeframes.

**Recommendation:**
- Track minimum time between moves
- Flag suspiciously fast moves (e.g., complex positions solved in <100ms)
- Implement move-time analytics for pattern detection

---

### 8. Session Not Cleaned Up on Password Change
**File:** `apps/server/src/services/auth.ts`
**Severity:** MEDIUM-HIGH

No password change functionality exists, but when added, sessions must be invalidated.

**Recommendation:**
- Invalidate all sessions when password changes
- Add `invalidateAllUserSessions(userId)` function

---

### 9. ELO Update Race Condition
**File:** `apps/server/src/services/elo.ts`
**Severity:** MEDIUM

ELO updates read then write without locks:

```typescript
const whiteUser = await db.query.users.findFirst({ where: eq(users.id, whitePlayerId) });
// ... another game could end here ...
await db.update(users).set({ eloRating: whiteNewElo, ...})
```

**Recommendation:**
- Use atomic increment/decrement operations
- Use database transactions

---

### 10. No HTTPS Enforcement
**File:** `apps/server/src/index.ts`
**Severity:** HIGH (in production)

Server doesn't enforce HTTPS. Tokens sent over HTTP can be intercepted.

**Recommendation:**
- Use HTTPS in production (handle at reverse proxy level)
- Set `Secure` flag on any cookies
- Add HSTS headers

---

## Medium Severity Issues

### 11. Insufficient Password Requirements
**File:** `packages/shared/src/types/index.ts:260`

```typescript
password: z.string().min(8),
```

**Problem:** Only minimum length requirement. Weak passwords allowed.

**Recommendation:**
```typescript
password: z.string()
  .min(12)
  .regex(/[A-Z]/, 'Must contain uppercase')
  .regex(/[a-z]/, 'Must contain lowercase')
  .regex(/[0-9]/, 'Must contain number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character')
```

---

### 12. Token Exposure in URL
**File:** `apps/web/src/hooks/useWebSocket.ts:133`

```typescript
const ws = new WebSocket(`${WS_URL}?token=${token}`);
```

**Problem:** Token appears in server logs, browser history, and referrer headers.

**Recommendation:**
- Send token in first WebSocket message after connection
- Or use a short-lived connection token

---

### 13. No Account Lockout
**Severity:** MEDIUM

No mechanism to lock accounts after failed login attempts.

**Recommendation:**
- Lock account after 10 failed attempts
- Require email verification to unlock
- Track failed attempts per IP and per account

---

### 14. Bet Amount Not Validated Against Limits
**File:** `apps/server/src/routes/betting.ts`

```typescript
const PlaceBetSchema = z.object({
  amount: z.number().positive(),  // No max limit!
});
```

**Problem:** Constants define `MAX_BET = 5000` but this isn't enforced.

**Recommendation:**
```typescript
amount: z.number().positive().max(MAX_BET).min(MIN_BET),
```

---

### 15. No Game History Integrity
**Severity:** MEDIUM

Move history stored in JSON without cryptographic integrity verification.

**Recommendation:**
- Hash each move with the previous hash (blockchain-style)
- Store move hashes for tamper detection
- Sign game results

---

## Anti-Cheat Considerations

### Current State
The codebase relies on chess.js for move validation, which is good for legal move enforcement but lacks anti-cheat mechanisms.

### Missing Anti-Cheat Measures

| Measure | Status | Priority |
|---------|--------|----------|
| Engine detection | Missing | HIGH |
| Move timing analysis | Missing | HIGH |
| Browser fingerprinting | Missing | MEDIUM |
| Account linking detection | Missing | MEDIUM |
| Rating manipulation detection | Missing | MEDIUM |
| Collusion detection | Missing | LOW |

### Recommendations for Polymarket-Level Security

#### 1. Server-Side Move Validation
```typescript
// Already using chess.js - GOOD
const moveResult = chess.move({ from, to, promotion });
```

#### 2. Move Timing Analysis
Implement statistical analysis of move times:
- Track average think time per complexity
- Flag moves faster than 100ms on complex positions
- Build player profiles for anomaly detection

#### 3. Engine Detection Heuristics
- Compare move choices to top engine lines
- Calculate "centipawn loss" per move
- Flag players with suspiciously accurate play

#### 4. Account Security
- Require email verification
- Implement 2FA for accounts over $500 balance
- Track device fingerprints
- Limit accounts per device/IP

#### 5. Betting Integrity
- Maximum bet amounts enforced
- Suspicious betting pattern detection
- No self-betting (already implemented)
- Delay bet settlement to allow for review

---

## Input Validation Audit

### Good Practices Found
- Zod schemas for API input validation
- SQL injection prevention via Drizzle ORM
- Type safety throughout

### Issues Found

| Location | Issue | Fix |
|----------|-------|-----|
| `handler.ts:51` | `payload as any` cast | Add Zod validation |
| `handler.ts:61` | `payload as any` cast | Add Zod validation |
| `betting.ts:9` | No max amount | Add `.max(MAX_BET)` |
| `games.ts:112` | Path param not validated | Validate gameId format |
| `users.ts:149` | Path param not validated | Validate userId format |

---

## Database Security

### Good Practices
- Using parameterized queries via Drizzle ORM
- Proper foreign key relationships
- Indexes on frequently queried fields

### Concerns
- No encryption at rest for sensitive data
- Balances stored as string decimals (potential precision issues)
- No audit logging for financial operations

### Recommendations
- Add audit logging table for all financial transactions
- Consider encrypting balance fields
- Add database-level constraints:

```sql
ALTER TABLE users ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
```

---

## Security Checklist Before Production

### Critical (Must Have)
- [ ] Remove default JWT secret fallback
- [ ] Implement rate limiting on all endpoints
- [ ] Add database transactions for financial operations
- [ ] Validate WebSocket message payloads
- [ ] Enforce HTTPS

### High Priority
- [ ] Add move timing validation
- [ ] Implement account lockout
- [ ] Add bet amount limits
- [ ] Add session management for password changes
- [ ] Persist game clock to database

### Medium Priority
- [ ] Stronger password requirements
- [ ] Move token from URL to message body
- [ ] Add engine detection basics
- [ ] Implement 2FA for high-balance accounts
- [ ] Add comprehensive audit logging

### Nice to Have
- [ ] Device fingerprinting
- [ ] Advanced collusion detection
- [ ] Move integrity hashing
- [ ] Real-time anomaly alerting

---

## Recommended Security Architecture

```
                     ┌─────────────────┐
                     │   Cloudflare    │
                     │   WAF + DDoS    │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │  Rate Limiter   │
                     │   (Redis)       │
                     └────────┬────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
   │  API Server │    │  WS Server  │    │ Anti-Cheat  │
   │  (Stateless)│    │ (Stateful)  │    │   Worker    │
   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                     ┌────────▼────────┐
                     │   PostgreSQL    │
                     │ (with audit log)│
                     └─────────────────┘
```

---

## Monitoring Recommendations

1. **Security Events to Log:**
   - Failed login attempts
   - Rate limit triggers
   - Suspicious bet patterns
   - Game result disputes
   - Large balance changes

2. **Alerts to Configure:**
   - 5+ failed logins from same IP
   - Balance change > $1000
   - User placing 10+ bets in 1 minute
   - Server error rate spike

---

## Conclusion

The codebase has a solid foundation with good practices like Zod validation and ORM usage. However, **several critical vulnerabilities** exist that would allow attackers to:
- Forge authentication tokens
- Exploit race conditions to steal funds
- Brute force accounts
- Manipulate games

**These issues must be resolved before handling real money.**

The anti-cheat system needs significant work to match platforms like Polymarket. At minimum, implement move timing analysis and basic engine detection before launch.

---

## Appendix: Quick Reference

### Files Requiring Immediate Attention
1. `apps/server/src/services/auth.ts` - JWT secret
2. `apps/server/src/services/wallet.ts` - Race conditions
3. `apps/server/src/services/matchmaking.ts` - Race conditions
4. `apps/server/src/index.ts` - Rate limiting
5. `apps/server/src/websocket/handler.ts` - Payload validation

### Useful Security Libraries
- `rate-limiter-flexible` - Rate limiting
- `helmet` - HTTP security headers
- `bcrypt` - Password hashing (already used)
- `jose` - JWT handling (already used)
- `zod` - Validation (already used)

---

## Additional Security Considerations (Updated 2026-01-18)

### Auth Provider Evaluation

**Current State:** Self-hosted email/password auth with bcrypt + JWT

**Recommendation:** For production with real money, consider a managed auth provider:

| Provider | Security Features | Cost |
|----------|-------------------|------|
| Clerk | SOC2, 2FA built-in, bot detection | Free to 10K MAU |
| Auth0 | SOC2, HIPAA, brute force protection | Free to 7K MAU |
| Supabase Auth | Row-level security, 2FA | Free to 50K MAU |

**When to Migrate:**
- Handling $10K+ in user funds
- 10K+ monthly active users
- Compliance requirements (SOC2, GDPR)
- Team lacks dedicated security engineer

See `docs/AUTH_REVIEW.md` for detailed analysis.

---

### Security Monitoring Requirements

**Must-Have Monitoring:**

```typescript
// Critical events to track
const securityEvents = {
  // Authentication
  'auth.login.failed': { threshold: 5, window: '15m', action: 'lock_account' },
  'auth.login.suspicious_ip': { action: 'alert' },
  'auth.session.hijack_attempt': { action: 'invalidate_all_sessions' },

  // Financial
  'wallet.large_withdrawal': { threshold: '$1000', action: 'require_2fa' },
  'wallet.rapid_transactions': { threshold: 10, window: '1m', action: 'flag' },
  'betting.unusual_pattern': { action: 'review' },

  // Game Integrity
  'game.engine_detection': { action: 'flag_for_review' },
  'game.suspicious_timing': { action: 'log' },
  'game.collusion_suspected': { action: 'alert' },
};
```

**Tools to Implement:**
- PostHog for product analytics + session replay
- Sentry for error tracking
- Custom audit logging for financial operations

See `docs/MONITORING.md` for implementation details.

---

### Scaling Security Considerations

**Phase 1: Single Server (Current)**
- All security controls in one place
- Simple to audit and secure

**Phase 2: Horizontal Scaling**
- Session store must move to Redis (distributed)
- Rate limiting must be centralized (Redis-based)
- JWT validation must be consistent across instances

**Phase 3: Multi-Region**
- Consider data residency requirements
- Ensure encryption in transit between regions
- Audit logging must be centralized

**Key Risks at Scale:**
1. Race conditions become more likely
2. Session hijacking across servers
3. Rate limit bypass via load balancer
4. Clock drift affecting JWT validation

See `docs/SCALING.md` for architecture details.

---

### Wallet/Crypto Security (If Enabled)

**Current State:** wagmi/viem configured but unused

**If Enabling Wallet Auth:**

1. **Implement SIWE (Sign-In with Ethereum)**
   - Nonce must be single-use and expire quickly (5 min)
   - Verify signature server-side, never trust client

2. **Wallet Connection Security**
   - Only support audited wallets (MetaMask, WalletConnect)
   - Display clear signing prompts
   - Never request transaction signatures for auth

3. **On-Chain Considerations (Future)**
   - Smart contract audits required before handling funds
   - Multi-sig for treasury wallets
   - Rate limit withdrawals
   - Implement withdrawal delays for large amounts

---

### Compliance Roadmap

**Current:** No formal compliance

**For Production with Real Money:**

| Requirement | Priority | Effort |
|-------------|----------|--------|
| HTTPS everywhere | Critical | 1 day |
| Privacy policy | Critical | 1 day |
| Terms of service | Critical | 1 day |
| Cookie consent | High | 1 day |
| Data retention policy | High | 2 days |
| GDPR data export | Medium | 3 days |
| SOC2 Type 1 | Medium | 3-6 months |
| Gambling license | Critical* | Varies |

*Gambling license requirements vary by jurisdiction. Consult legal counsel.

---

### Pre-Launch Security Checklist (Updated)

**Week 1: Critical Fixes**
- [ ] Remove default JWT secret
- [ ] Implement rate limiting (Redis-based)
- [ ] Fix wallet race conditions with transactions
- [ ] Validate all WebSocket payloads

**Week 2: Authentication**
- [ ] Email verification flow
- [ ] Password reset flow
- [ ] Account lockout after 10 failed attempts
- [ ] Stronger password requirements (12+ chars)

**Week 3: Monitoring**
- [ ] PostHog integration
- [ ] Sentry error tracking
- [ ] Audit logging for financial operations
- [ ] Alert webhooks (Slack/Discord)

**Week 4: Pre-Production**
- [ ] Security penetration test
- [ ] Load testing with concurrent users
- [ ] Backup and recovery test
- [ ] Incident response plan documented

**Before Real Money:**
- [ ] 2FA for accounts > $500
- [ ] Withdrawal delays > $1000
- [ ] Legal review of terms
- [ ] Gambling compliance check

---

## Related Documentation

- `docs/BACKEND_BUILD.md` - Steps to replace mock data with real backend
- `docs/MONITORING.md` - PostHog, Sentry, and infrastructure monitoring setup
- `docs/SCALING.md` - Horizontal scaling and database replication
- `docs/AUTH_REVIEW.md` - Authentication provider evaluation and recommendations
