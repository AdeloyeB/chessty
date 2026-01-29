# Security & Code Quality Remediation Plan

## Overview

This plan addresses all issues identified in the code review and security audit of PR #29 (Arbiter Overwatch system, settlement service, and Tauri optimizations). The fixes are prioritized by severity and organized into implementation phases.

**PR Reference**: https://github.com/AdeloyeB/chessty/pull/29
**Total Issues**: 18 (3 critical, 5 high, 6 medium, 4 low/suggestions)

---

## Phase 1: Critical Security Fixes (P0 - Must Fix Before Merge)

### 1.1 Atomic Fund Operations (SEC-001)
**Source**: Code Review + Security Audit
**File**: `apps/server/src/services/settlement/settlement.service.ts:297-300, 406-428`

**Problem**: Settlement operations update status and award funds in separate non-transactional operations. Race condition allows double-payment.

**Solution**:
1. Create transaction utility: `apps/server/src/utils/transaction.ts`
2. Wrap `resolveDispute()`, `handleTimeout()`, `settleGame()` in atomic transactions
3. Add optimistic locking with `version` column on settlements table
4. Use `SELECT ... FOR UPDATE` to lock rows during processing

**Files to Create/Modify**:
- [ ] `apps/server/src/utils/transaction.ts` (NEW)
- [ ] `apps/server/src/services/settlement/settlement.service.ts`
- [ ] `apps/server/src/drizzle/settlement-schema.ts` (add version column)

**Migration Required**: Yes - add `version INTEGER DEFAULT 1` to settlements

---

### 1.2 Incomplete Sanction Query (SEC-002)
**Source**: Code Review + Security Audit
**File**: `apps/server/src/services/overwatch/eligibility.ts:112-118`

**Problem**: The `where` clause only filters by `playerId`, missing the check for active sanctions (`endsAt IS NULL OR endsAt > NOW()`). Banned players can become arbiters.

**Solution**:
```typescript
const activeSanction = await db.query.playerSanctions.findFirst({
  where: and(
    eq(playerSanctions.playerId, userId),
    or(
      isNull(playerSanctions.endsAt),        // Permanent ban
      gt(playerSanctions.endsAt, new Date()) // Temp ban still active
    )
  ),
});
```

**Additional Requirement**: Add 1-year cooling-off period after ban ends before arbiter eligibility.

**Files to Modify**:
- [ ] `apps/server/src/services/overwatch/eligibility.ts`

---

### 1.3 N+1 Query Performance (CR-001)
**Source**: Code Review
**File**: `apps/server/src/services/overwatch/case-assignment.ts:270-285`

**Problem**: `findEligibleArbitersInRange()` does individual DB queries for each arbiter to get user data. With 100+ arbiters, causes hundreds of queries.

**Solution**: Batch user queries with `IN` clause:
```typescript
// Step 1: Get all active arbiters (single query)
const activeArbiters = await db.query.overwatchArbiters.findMany({ ... });

// Step 2: Batch fetch users (single query)
const userIds = activeArbiters.map(j => j.userId);
const users = await db.query.users.findMany({
  where: inArray(users.id, userIds),
});

// Step 3: Join in memory
const userMap = new Map(users.map(u => [u.id, u]));
```

**Files to Modify**:
- [ ] `apps/server/src/services/overwatch/case-assignment.ts`

---

## Phase 2: High Security Fixes (P1 - Should Fix)

### 2.1 Missing Rate Limiting (SEC-003)
**Source**: Security Audit
**File**: `apps/server/src/routes/overwatch.ts`

**Problem**: No rate limiting on verdict submission. Rapid requests could overwhelm server or exploit timing windows.

**Solution**:
1. Create rate limiter: `apps/server/src/middleware/rate-limiter.ts`
2. Add to verdict, enroll, and case endpoints
3. Use in-memory LRU cache (upgrade to Redis for horizontal scaling later)

**Rate Limits**:
| Endpoint | Limit |
|----------|-------|
| `POST /verdict` | 10/minute |
| `POST /enroll` | 3/hour |
| `GET /cases` | 30/minute |
| `GET /cases/:id` | 20/minute |

**Files to Create/Modify**:
- [ ] `apps/server/src/middleware/rate-limiter.ts` (NEW)
- [ ] `apps/server/src/routes/overwatch.ts`

---

### 2.2 XSS in Verdict Notes (SEC-004)
**Source**: Security Audit
**File**: `apps/server/src/services/overwatch/verdict-aggregation.ts:151`

**Problem**: `notes` field accepts 2000 chars stored directly without sanitization. Stored XSS risk if rendered in admin UI.

**Solution**:
1. Create sanitizer: `apps/server/src/utils/sanitize.ts`
2. Sanitize notes before storage
3. Strip HTML tags, JS protocols, event handlers

**Files to Create/Modify**:
- [ ] `apps/server/src/utils/sanitize.ts` (NEW)
- [ ] `apps/server/src/services/overwatch/verdict-aggregation.ts`

---

### 2.3 Test Case Score Manipulation (SEC-005)
**Source**: Security Audit
**File**: `apps/server/src/services/overwatch/test-cases.ts:117`, `apps/server/src/routes/overwatch.ts:285`

**Problem**: `anticheatMetadata` containing `testCaseReason` is exposed to arbiters, allowing them to identify calibration cases and game their scores.

**Solution**:
1. Strip `testCaseReason` from metadata before sending to clients
2. Don't include `insertedAt` timestamp (timing correlation)

**Files to Modify**:
- [ ] `apps/server/src/services/overwatch/test-cases.ts`
- [ ] `apps/server/src/routes/overwatch.ts`

---

### 2.4 Unused Import (CR-002)
**Source**: Code Review
**File**: `apps/server/src/services/overwatch/verdict-aggregation.ts:462`

**Problem**: `nanoid` is imported but not used.

**Solution**: Remove unused import.

**Files to Modify**:
- [ ] `apps/server/src/services/overwatch/verdict-aggregation.ts`

---

## Phase 3: Medium Priority Fixes (P2)

### 3.1 Suspicion Score Scale Mismatch (CR-003)
**Source**: Code Review
**File**: `apps/server/src/services/settlement/settlement.service.ts:337`

**Problem**: Score divided by 100 here but comments say "Values are 0-100". Inconsistent handling.

**Solution**: Audit all suspicion score usages and standardize on 0-100 scale throughout.

**Files to Modify**:
- [ ] `apps/server/src/services/settlement/settlement.service.ts`
- [ ] Audit: `apps/server/src/services/overwatch/*.ts`

---

### 3.2 Weak Anonymization (SEC-007)
**Source**: Security Audit
**File**: `apps/server/src/services/overwatch/case-assignment.ts:401`

**Problem**: `Player_${caseId.slice(-6)}` is trivially reversible since caseId is visible.

**Solution**:
1. Create HMAC-based anonymizer: `apps/server/src/utils/anonymize.ts`
2. Use secret from env: `ANONYMIZATION_SECRET`
3. Generate irreversible but deterministic IDs

**Files to Create/Modify**:
- [ ] `apps/server/src/utils/anonymize.ts` (NEW)
- [ ] `apps/server/src/services/overwatch/case-assignment.ts`
- [ ] `.env.example` (add ANONYMIZATION_SECRET)

---

### 3.3 Overly Broad User Query (CR-004)
**Source**: Code Review
**File**: `apps/server/src/services/overwatch/test-cases.ts:229-235`

**Problem**: `findMany` with no filter could fetch entire user table.

**Solution**: Add reasonable limit (100) and proper filters.

**Files to Modify**:
- [ ] `apps/server/src/services/overwatch/test-cases.ts`

---

### 3.4 Inefficient String Sorting (CR-005)
**Source**: Code Review
**File**: `apps/server/src/services/overwatch/case-assignment.ts:288`

**Problem**: `parseFloat()` called on every comparison during sort.

**Solution**: Parse scores once into a map before sorting.

**Files to Modify**:
- [ ] `apps/server/src/services/overwatch/case-assignment.ts`

---

### 3.5 Missing Transaction in submitVerdict (CR-006)
**Source**: Code Review (Suggestion)
**File**: `apps/server/src/services/overwatch/verdict-aggregation.ts:104-194`

**Problem**: 4 sequential DB operations without transaction. Partial failure leaves inconsistent data.

**Solution**: Wrap in transaction using the utility from Phase 1.

**Files to Modify**:
- [ ] `apps/server/src/services/overwatch/verdict-aggregation.ts`

---

### 3.6 Information Disclosure in Errors (SEC-009)
**Source**: Security Audit
**File**: Multiple files

**Problem**: Error messages include internal state (`status: ${settlement.status}`).

**Solution**: Use generic error codes externally, log details internally.

**Files to Modify**:
- [ ] `apps/server/src/services/settlement/settlement.service.ts`
- [ ] `apps/server/src/services/overwatch/verdict-aggregation.ts`

---

## Phase 4: Low Priority / Suggestions (P3)

### 4.1 Add Database Index
**Source**: Code Review (Suggestion)

**Solution**: Add compound index for `getPendingAssignmentCount()`.

```sql
CREATE INDEX idx_assignments_investigator_status
  ON overwatch_case_assignments(investigator_id, status);
```

**Files to Modify**:
- [ ] Migration file (NEW)

---

### 4.2 Settlement Timeout Scheduler
**Source**: Code Review (Suggestion)

**Problem**: 48-hour safety valve defined but no visible scheduler.

**Solution**: Verify `handleTimeout()` is called by scheduler in `apps/server/src/services/settlement/scheduler.ts`.

**Files to Verify**:
- [ ] `apps/server/src/services/settlement/scheduler.ts`

---

### 4.3 Rust Drop Cleanup (CR-007)
**Source**: Code Review
**File**: `apps/desktop/src-tauri/src/engine_lifecycle.rs:689-703`

**Problem**: `Drop` impl uses `try_lock()` which may fail, leaving engine process running.

**Solution**: Document limitation OR use `block_in_place()` with timeout.

**Files to Modify**:
- [ ] `apps/desktop/src-tauri/src/engine_lifecycle.rs`

---

### 4.4 Structured Logging in Rust
**Source**: Code Review (Suggestion)

**Problem**: `println!` instead of structured logging.

**Solution**: Replace with `tracing::info!` etc. (Optional for now)

---

### 4.5 Console.log in Production (SEC-010)
**Source**: Security Audit

**Problem**: `console.log` statements throughout.

**Solution**: Replace with structured logger with appropriate levels. (Optional for now)

---

## Implementation Checklist

### New Files to Create
- [ ] `apps/server/src/utils/transaction.ts`
- [ ] `apps/server/src/utils/sanitize.ts`
- [ ] `apps/server/src/utils/anonymize.ts`
- [ ] `apps/server/src/middleware/rate-limiter.ts`

### Migrations Required
- [ ] Add `version` column to `settlements` table
- [ ] Add compound index on `overwatch_case_assignments(investigator_id, status)`
- [ ] Add index on `player_sanctions(player_id, ends_at)`

### Environment Variables to Add
- [ ] `ANONYMIZATION_SECRET` - HMAC secret for player anonymization

### Files to Modify
| File | Phase | Changes |
|------|-------|---------|
| `settlement.service.ts` | P0, P2 | Atomic transactions, error messages, scale fix |
| `eligibility.ts` | P0 | Fix sanction query, add 1-year cooldown |
| `case-assignment.ts` | P0, P2 | Batch queries, anonymization, sorting |
| `verdict-aggregation.ts` | P1, P2 | Sanitize notes, remove import, add transaction |
| `test-cases.ts` | P1, P2 | Strip test markers, limit query |
| `overwatch.ts` (routes) | P1 | Add rate limiting, strip metadata |
| `engine_lifecycle.rs` | P3 | Document Drop limitation |

---

## Testing Requirements

### Unit Tests
- [ ] Transaction retry on serialization failure
- [ ] Rate limiter blocks after max requests
- [ ] Sanction query blocks banned users
- [ ] Sanction query allows users after 1-year cooldown
- [ ] Anonymization produces consistent but irreversible IDs
- [ ] XSS payloads are stripped from notes

### Integration Tests
- [ ] Concurrent `resolveDispute()` calls don't double-pay
- [ ] Batch arbiter query returns same results as N+1 version
- [ ] Test cases are not identifiable to arbiters

---

## Estimated Effort

| Phase | Priority | Est. Time | Files |
|-------|----------|-----------|-------|
| Phase 1 | Critical | 3-4 hours | 5 |
| Phase 2 | High | 3-4 hours | 6 |
| Phase 3 | Medium | 2-3 hours | 5 |
| Phase 4 | Low | 1-2 hours | 3 |
| **Total** | | **9-13 hours** | **19** |

---

## Rollout Strategy

1. **Dev Branch**: Implement all Phase 1 + 2 fixes
2. **Code Review**: Get second review on financial operations
3. **Test Environment**: Run integration tests with concurrent load
4. **Staging**: Deploy with feature flag disabled
5. **Production**: Enable after 48h monitoring in staging

---

## Decision Log

| Question | Decision | Rationale |
|----------|----------|-----------|
| Redis vs In-Memory Rate Limiting | In-memory LRU | Single server for now; easy to migrate later |
| Anonymization Salt Rotation | Quarterly | Balance between security and consistency |
| Transaction Isolation Level | READ COMMITTED + optimistic locking | Better performance than SERIALIZABLE |
| Sanction Grace Period | 1 year cooldown | Per user requirement - prevents recently-unbanned from immediately influencing verdicts |
