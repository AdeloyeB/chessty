# Test Coverage Plan: 90% Target

## Goal
Achieve and maintain 90% test coverage across the entire codebase.

## Current State
- **Test files**: 3 (all in `apps/server/src/redis/`)
- **Estimated coverage**: ~5%
- **Test framework**: Bun's built-in test runner (`bun:test`)

---

## Coverage Targets by Module

| Module | Files | Target | Priority |
|--------|-------|--------|----------|
| **Services** | 8 files | 90% | P0 |
| **WebSocket** | 7 files | 90% | P0 |
| **Redis** | 5 files | 90% | P1 (partially done) |
| **Event Handlers** | 5 files | 85% | P1 |
| **Routes/API** | 6 files | 80% | P2 |
| **Drizzle/DB** | 2 files | 70% | P2 |
| **Shared Package** | 3 files | 90% | P1 |

---

## Test Structure

```
apps/server/src/
├── services/
│   ├── game.test.ts           # Game lifecycle, settlements
│   ├── challenge.test.ts      # Challenge flow, confirmations
│   ├── wallet.test.ts         # Balance operations, atomicity
│   ├── auth.test.ts           # Login, register, MFA
│   ├── betting.test.ts        # Odds, predictions
│   ├── matchmaking.test.ts    # Queue, pairing
│   ├── achievements.test.ts   # Unlock logic
│   └── spectator.test.ts      # Join/leave, permissions
│
├── websocket/
│   ├── ClockManager.test.ts   # Clock operations, Redis sync
│   ├── GameStateManager.test.ts # State CRUD, chess validation
│   ├── GameCoordinator.test.ts  # Move orchestration
│   ├── ConnectionManager.test.ts # Connection tracking
│   ├── RoomManager.test.ts    # Room membership
│   ├── BroadcastService.test.ts # Message delivery
│   └── handler.test.ts        # WebSocket routing
│
├── redis/
│   ├── client.test.ts         # EXISTS
│   ├── circuitBreaker.test.ts # EXISTS
│   ├── scripts/loader.test.ts # EXISTS
│   └── recovery.test.ts       # NEW - game recovery
│
├── events/handlers/
│   ├── broadcast.test.ts      # Event → WebSocket
│   ├── persistence.test.ts    # Event → Database
│   ├── achievements.test.ts   # Achievement checks
│   ├── odds.test.ts           # Odds recalculation
│   └── predictions.test.ts    # Bet settlement
│
├── routes/
│   ├── auth.test.ts           # Auth endpoints
│   ├── games.test.ts          # Game endpoints
│   ├── wallet.test.ts         # Wallet endpoints
│   ├── betting.test.ts        # Betting endpoints
│   ├── leaderboard.test.ts    # Leaderboard endpoints
│   └── profile.test.ts        # Profile endpoints
│
└── __tests__/
    ├── integration/
    │   ├── fullGame.test.ts   # E2E game flow
    │   ├── challengeFlow.test.ts # E2E challenge
    │   └── serverRestart.test.ts # Recovery E2E
    └── utils/
        ├── fixtures.ts        # Shared test data
        ├── mocks.ts           # Mock services
        └── setup.ts           # Test lifecycle

packages/shared/src/
├── types/
│   └── index.test.ts          # Zod schema validation
├── constants/
│   └── index.test.ts          # Constants verification
└── chess/
    └── index.test.ts          # Chess engine wrapper
```

---

## Test Categories

### 1. Unit Tests (70% of tests)
- Test individual functions in isolation
- Mock all external dependencies (DB, Redis, WebSocket)
- Fast execution (<100ms per test)
- Example: `wallet.deductBalance()` with mocked database

### 2. Integration Tests (25% of tests)
- Test module interactions
- Use test database (separate from dev)
- May use real Redis (or mock)
- Example: Full challenge flow from create → accept → confirm → game start

### 3. E2E Tests (5% of tests)
- Test complete user journeys
- Use real services where possible
- Slower but comprehensive
- Example: Two users play complete game via WebSocket

---

## Maintaining 90% Coverage

### 1. Pre-commit Hook
```bash
# .husky/pre-commit
#!/bin/sh
bun test --coverage --coverage-threshold 90
if [ $? -ne 0 ]; then
  echo "Coverage below 90%. Commit blocked."
  exit 1
fi
```

### 2. CI/CD Gate (GitHub Actions)
```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test --coverage
      - name: Check coverage threshold
        run: |
          COVERAGE=$(bun test --coverage 2>&1 | grep "All files" | awk '{print $4}' | tr -d '%')
          if [ "$COVERAGE" -lt 90 ]; then
            echo "Coverage is $COVERAGE%, below 90% threshold"
            exit 1
          fi
```

### 3. Coverage Badge in README
```markdown
![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)
```

### 4. PR Requirements
- All PRs must include tests for new code
- Coverage cannot decrease on any PR
- CodeRabbit will flag untested code paths

### 5. Weekly Coverage Report
- Generate HTML coverage report
- Review uncovered lines
- Prioritize critical paths (money operations, auth)

---

## Test Utilities

### Fixtures (`__tests__/utils/fixtures.ts`)
```typescript
export const TEST_USER = {
  id: 'test-user-1',
  username: 'testplayer',
  email: 'test@example.com',
  passwordHash: '$2b$10$...',
  balance: 1000,
  elo: 1200,
};

export const TEST_GAME = {
  id: 'test-game-1',
  whitePlayerId: 'test-user-1',
  blackPlayerId: 'test-user-2',
  status: 'active',
  currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  wagerAmount: 10,
};

export function createTestUser(overrides?: Partial<typeof TEST_USER>) {
  return { ...TEST_USER, id: `test-user-${Date.now()}`, ...overrides };
}

export function createTestGame(overrides?: Partial<typeof TEST_GAME>) {
  return { ...TEST_GAME, id: `test-game-${Date.now()}`, ...overrides };
}
```

### Mocks (`__tests__/utils/mocks.ts`)
```typescript
import { mock } from 'bun:test';

export function mockRedis() {
  return {
    get: mock(() => Promise.resolve(null)),
    set: mock(() => Promise.resolve('OK')),
    hget: mock(() => Promise.resolve(null)),
    hset: mock(() => Promise.resolve(1)),
    del: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
    evalsha: mock(() => Promise.resolve(['300', '300', '0'])),
  };
}

export function mockDatabase() {
  return {
    select: mock(() => ({ from: mock(() => ({ where: mock(() => []) })) })),
    insert: mock(() => ({ values: mock(() => ({ returning: mock(() => []) })) })),
    update: mock(() => ({ set: mock(() => ({ where: mock(() => ({ returning: mock(() => []) })) })) })),
    delete: mock(() => ({ where: mock(() => []) })),
    transaction: mock((fn) => fn(mockDatabase())),
  };
}

export function mockWebSocket() {
  return {
    send: mock(() => {}),
    close: mock(() => {}),
    readyState: 1, // OPEN
  };
}

export function mockBlockchainService() {
  return {
    settleGameOnChain: mock(() => Promise.resolve({
      txHash: '0x123...',
      blockNumber: 12345,
      gasUsed: '21000',
    })),
    recordGameResult: mock(() => Promise.resolve('0x456...')),
  };
}
```

### Setup (`__tests__/utils/setup.ts`)
```typescript
import { beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { initRedis, shutdownRedis } from '../../redis/client';

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

  // Initialize Redis (if available)
  try {
    await initRedis();
  } catch {
    console.log('Redis not available for tests - using mocks');
  }
});

afterAll(async () => {
  await shutdownRedis();
});

// Reset mocks between tests
beforeEach(() => {
  // Clear any global state
});

afterEach(() => {
  // Cleanup test data
});
```

---

## CodeRabbit Issues to Fix

These issues should be fixed as part of achieving test coverage:

### Critical (P0)
1. [ ] Add 'cancelled' to GameStatusSchema
2. [ ] Fix Lua script path resolution in ClockManager
3. [ ] Add TTL to clock keys in loader.ts
4. [ ] Create blockchain service stub

### Major (P1)
5. [ ] Implement row-level locking in challenge.ts
6. [ ] Use updated row data for bothConfirmed
7. [ ] Normalize unlockedAt in broadcast.ts

### Minor (P2)
8. [ ] Add retry limit to NOSCRIPT handlers
9. [ ] Add .catch() to fire-and-forget promises
10. [ ] Use HSETNX for atomic state initialization
11. [ ] Add cascade delete to mfaEnrollments FK
12. [ ] Document mock data in LoginScreen

---

## Timeline

| Week | Focus | Coverage Target |
|------|-------|-----------------|
| Week 1 | Critical fixes + Service tests | 40% |
| Week 2 | WebSocket tests + Major fixes | 65% |
| Week 3 | Event handler tests + Minor fixes | 80% |
| Week 4 | Route tests + Integration tests | 90% |

---

## Commands

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test src/services/game.test.ts

# Run tests matching pattern
bun test --filter "wallet"

# Watch mode
bun test --watch

# Generate HTML coverage report
bun test --coverage --coverage-reporter=html
```
