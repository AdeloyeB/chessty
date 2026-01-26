# Security Audit Report: Chess Game Application

**Date:** January 26, 2026
**Scope:** Full codebase audit (`apps/server/`, `apps/web/`, `packages/shared/`)
**Auditor:** Claude Opus 4.5 Security Analysis

---

## Executive Summary

This security audit examines a real-money chess gambling application with USDC transactions, OAuth authentication, MFA (TOTP), and WebSocket-based multiplayer functionality. The codebase demonstrates **solid security fundamentals** with several enterprise-grade implementations (Argon2id hashing, AES-256-GCM encryption, CSRF protection, rate limiting), but contains **critical vulnerabilities** that could result in financial loss if exploited.

**Overall Assessment:** The application has a strong security foundation but requires remediation of race condition vulnerabilities in financial operations before production deployment with real money.

---

## Security Score: 6/10

| Category | Score | Notes |
|----------|-------|-------|
| Authentication | 8/10 | Strong JWT + MFA implementation, minor issues |
| Authorization | 7/10 | Good player/spectator separation, WebSocket auth solid |
| Input Validation | 6/10 | Zod used for HTTP, missing for WebSocket |
| Cryptography | 9/10 | Excellent - Argon2id, AES-256-GCM, timing-safe |
| Financial Security | 3/10 | Race conditions in wallet operations |
| Rate Limiting | 6/10 | Good coverage but in-memory only |
| Session Management | 7/10 | Sessions tracked in DB, missing revocation |
| OAuth Security | 7/10 | Google working well, in-memory state tokens |

---

## Vulnerabilities Found

### 🔴 CRITICAL

#### 1. Race Condition in Balance Operations (TOCTOU)
**Location:** `apps/server/src/services/wallet.ts`
**Lines:** 25-55

**Issue:** The `updateBalance` function has a Time-of-Check to Time-of-Use (TOCTOU) race condition. Balance is checked, then updated in separate operations without database-level locking or transactions.

```typescript
const currentBalance = parseFloat(user.balance);
const newBalance = currentBalance + amount;
if (newBalance < 0) {
  throw new Error('Insufficient balance');
}
// GAP: Another request could modify balance here
await db.update(users).set({balance: newBalance.toString(), ...})
```

**Impact:** An attacker could exploit this by sending concurrent requests (e.g., placing multiple bets simultaneously) to overdraw their balance, resulting in negative balances and financial loss for the platform.

**Remediation:**
- Use database transactions with `SELECT ... FOR UPDATE` locks
- Implement optimistic locking with version columns
- Use atomic database operations (`UPDATE users SET balance = balance - $amount WHERE balance >= $amount`)

---

### 🟠 HIGH

#### 2. In-Memory Rate Limiting Not Distributed
**Location:** `apps/server/src/services/rateLimit.ts`

**Issue:** Rate limiting uses an in-memory Map that is not shared across server instances. In a multi-instance deployment (load balanced), each server maintains separate rate limit counters.

**Impact:** Rate limits can be bypassed by distributing requests across multiple server instances. An attacker could make 5x the allowed login attempts if 5 servers exist.

**Remediation:**
- Implement Redis-backed rate limiting (as noted in the file's comments)
- Use `rate-limiter-flexible` with Redis store
- Critical for production with horizontal scaling

---

#### 3. Spectator Betting Lacks Concurrent Transaction Protection
**Location:** `apps/server/src/services/spectatorPrediction.ts`

**Issue:** Same TOCTOU pattern as wallet service. Balance check and deduction are separate operations:
```typescript
const userBalance = parseFloat(creator.balance as unknown as string);
if (userBalance < amount) {
  throw new Error('Insufficient balance');
}
await walletService.deductWager(creatorId, amount, `prediction-${gameId}`);
```

**Impact:** Users could create multiple predictions simultaneously exceeding their actual balance.

---

#### 4. WebSocket Message Validation Uses Unsafe Type Casting
**Location:** `apps/server/src/websocket/handler.ts`
**Lines:** 116-186

**Issue:** WebSocket message payloads are cast to `any` without schema validation:
```typescript
case 'game:join':
  await gameCoordinator.joinGame(userId, (payload as any).gameId);
```

**Impact:** Malformed payloads could cause runtime errors, type confusion, or unexpected behavior.

**Remediation:**
- Use Zod schemas (already used elsewhere) to validate all WebSocket payloads
- Reject messages that don't match expected schema

---

#### 5. OAuth State Tokens Stored In-Memory
**Location:** `apps/server/src/services/oauth.ts`

**Issue:** OAuth state tokens for CSRF protection are stored in a `Map<string, StateData>` in memory. These don't persist across server restarts and aren't shared across instances.

**Impact:**
- State tokens are lost on server restart (users mid-OAuth flow will fail)
- In multi-server deployments, state verification will fail if callback hits different server

---

### 🟡 MEDIUM

#### 6. Development Fallback for MFA Encryption Key
**Location:** `apps/server/src/services/mfa.ts`
**Lines:** 52-54

**Issue:** If `MFA_ENCRYPTION_KEY` is not set, the service falls back to 32 zero bytes.

**Mitigating Factor:** The code exits with error in production if not set.

---

#### 7. Development Fallback for JWT Secret
**Location:** `apps/server/src/services/auth.ts`
**Lines:** 35

**Issue:** Similar pattern - fallback to `'dev-only-secret-not-for-production'` if JWT_SECRET not set.

**Mitigating Factor:** Production mode exits if not set.

---

#### 8. Mock Data Mode Can Be Accidentally Enabled
**Location:** `apps/web/src/lib/mock/mockData.ts`

**Issue:** A boolean flag `USE_MOCK_DATA` enables mock authentication. If set to `true` in production, bypasses all authentication with a fake user.

---

#### 9. Token Stored in localStorage
**Location:** `apps/web/src/store/auth.ts`

**Issue:** JWT tokens are persisted to localStorage via Zustand's `persist` middleware. localStorage is vulnerable to XSS attacks.

**Remediation:** Consider httpOnly cookies for token storage.

---

#### 10. No Session Revocation on Password Change
**Location:** `apps/server/src/services/auth.ts`

**Issue:** There's no mechanism to invalidate all sessions when a user's password is changed or reset.

---

### 🟢 LOW

#### 11. Verbose Error Messages in Development
**Location:** Various route handlers

**Issue:** Error messages sometimes include internal details that could leak implementation details.

---

#### 12. No CAPTCHA on Registration
**Location:** `apps/server/src/routes/auth.ts`

**Issue:** Registration only has IP-based rate limiting (3 per hour). No CAPTCHA.

---

#### 13. Clock Drift Tolerance Could Allow Code Reuse
**Location:** `apps/server/src/services/mfa.ts`

**Issue:** TOTP window of +-1 period means codes are valid for ~90 seconds total.

---

## Immediate Actions Required

1. **FIX RACE CONDITIONS** - Implement database transactions with row locking for all wallet operations before handling any real money
2. **VALIDATE WEBSOCKET PAYLOADS** - Add Zod schema validation for all WebSocket message types
3. **REDIS RATE LIMITING** - Implement distributed rate limiting before multi-instance deployment

---

## Security Recommendations

### Short-Term (Before Production)
1. Migrate to Redis-backed rate limiting
2. Add database transactions to wallet service
3. Add Zod validation for WebSocket messages
4. Add session revocation on password change

### Medium-Term
1. Consider httpOnly cookies for token storage
2. Implement CAPTCHA for registration
3. Add TOTP code reuse prevention
4. Implement security event alerting
5. Add automated security scanning to CI/CD

### Long-Term
1. Conduct penetration testing
2. Implement hardware security module (HSM) for key management
3. Add fraud detection for betting patterns
4. Implement geographic restrictions for gambling compliance

---

## Files Reviewed

### Server Authentication & Security
- `apps/server/src/services/auth.ts` - Core authentication
- `apps/server/src/services/oauth.ts` - OAuth providers
- `apps/server/src/services/mfa.ts` - MFA/TOTP implementation
- `apps/server/src/services/rateLimit.ts` - Rate limiting
- `apps/server/src/services/security.ts` - Security headers & sanitization
- `apps/server/src/services/accountLockout.ts` - Account lockout
- `apps/server/src/routes/auth.ts` - Auth routes
- `apps/server/src/routes/mfa.ts` - MFA routes
- `apps/server/src/routes/oauth.ts` - OAuth routes

### Financial Operations
- `apps/server/src/services/wallet.ts` - Balance management
- `apps/server/src/services/betting.ts` - Betting logic
- `apps/server/src/services/spectatorPrediction.ts` - P2P betting

### WebSocket & Game
- `apps/server/src/websocket/handler.ts` - WS message handling
- `apps/server/src/websocket/GameCoordinator.ts` - Game orchestration
- `apps/server/src/websocket/ClockManager.ts` - Clock management
- `apps/server/src/index.ts` - Server entry point

### Database & Schema
- `apps/server/src/drizzle/pg-schema.ts` - Database schema

### Frontend
- `apps/web/src/store/auth.ts` - Auth state management
- `apps/web/src/lib/mock/mockData.ts` - Mock data config

### Game Engine
- `packages/chess-engine/src/index.ts` - Chess rules engine
