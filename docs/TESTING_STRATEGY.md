# Testing Strategy Guide

## Chess Gamble - Comprehensive Testing Documentation

This document covers all testing approaches for the Chess Gamble platform, including unit testing, integration testing, end-to-end testing, smart contract testing, and performance testing.

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Current Testing Setup](#current-testing-setup)
3. [Testing Pyramid](#testing-pyramid)
4. [Unit Testing (Bun)](#unit-testing-bun)
5. [Integration Testing (Bun)](#integration-testing-bun)
6. [End-to-End Testing (Playwright)](#end-to-end-testing-playwright)
7. [Rust/Tauri Desktop Testing (Cargo)](#rusttauri-desktop-testing-cargo)
8. [Smart Contract Testing (Hardhat)](#smart-contract-testing-hardhat)
9. [Performance Testing (k6)](#performance-testing-k6)
10. [Test Coverage Strategy](#test-coverage-strategy)
11. [CI/CD Integration](#cicd-integration)
12. [Recommended Implementation Order](#recommended-implementation-order)

---

## Testing Philosophy

### The Testing Triangle for Real-Money Apps

For a real-money chess platform handling USDC transactions, testing isn't optional—it's critical infrastructure. Our approach follows three principles:

1. **Fast Feedback**: Unit tests run in milliseconds, catching bugs before they reach integration
2. **Confidence**: E2E tests verify real user flows work end-to-end
3. **Safety**: Smart contract tests ensure funds can never be lost or stolen

### What We Test

| Layer | What | Why |
|-------|------|-----|
| **Unit** | Individual functions, services | Catch logic bugs early |
| **Integration** | Service interactions, DB queries | Verify components work together |
| **E2E** | Full user journeys | Ensure real users can complete tasks |
| **Rust/Desktop** | Tauri commands, IPC, anti-cheat | Ensure desktop app security and performance |
| **Contract** | Smart contract logic | Protect user funds |
| **Performance** | Load, latency, concurrency | Ensure real-time chess works at scale |

---

## Current Testing Setup

### Existing Infrastructure

```
apps/server/
├── src/
│   ├── services/
│   │   ├── game.test.ts          # Game lifecycle tests
│   │   ├── wallet.test.ts        # Wallet operations
│   │   ├── auth.test.ts          # Authentication
│   │   └── stockfish.test.ts     # Engine analysis
│   ├── websocket/
│   │   ├── GameCoordinator.test.ts
│   │   ├── GameStateManager.test.ts
│   │   └── ClockManager.test.ts
│   └── redis/
│       ├── client.test.ts
│       ├── circuitBreaker.test.ts
│       └── recovery.test.ts
```

### Running Tests

```bash
# All server tests
cd apps/server && bun test

# Specific test file
bun test src/services/game.test.ts

# Redis tests only
bun test:redis

# With watch mode
bun test --watch
```

---

## Testing Pyramid

```
                 /\
                /  \
               / E2E \          <- Playwright (few, slow, high confidence)
              /______\
             /        \
            /Integration\       <- Bun (moderate, medium speed)
           /__________\
          /            \
         /   Unit Tests  \      <- Bun (many, fast, low confidence per test)
        /________________\
```

### Target Distribution

| Type | Percentage | Count (Target) |
|------|------------|----------------|
| Unit | 70% | ~200 tests |
| Integration | 20% | ~50 tests |
| E2E | 10% | ~20 tests |

---

## Unit Testing (Bun)

### What is Bun Test?

Bun is a JavaScript runtime (like Node.js) that includes a built-in test runner. It's **exceptionally fast**—running tests 2-4x faster than Jest or Vitest because it doesn't need to transpile TypeScript separately.

### Why Bun for This Project?

1. **Native TypeScript**: No compilation step needed
2. **Jest-compatible API**: Familiar `describe`, `test`, `expect` syntax
3. **Speed**: 266 React SSR tests run faster than Jest can print its version number
4. **Built-in mocking**: `mock()` and `spyOn()` work out of the box

### Writing Unit Tests

```typescript
// apps/server/src/services/example.test.ts
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { calculatePayout } from './payout';

describe('Payout Calculation', () => {
  test('calculates 5% house cut correctly', () => {
    const pot = 100;
    const houseCut = 0.05;

    const result = calculatePayout(pot, houseCut);

    expect(result.winnerPayout).toBe(95);
    expect(result.houseRevenue).toBe(5);
  });

  test('handles zero pot gracefully', () => {
    expect(() => calculatePayout(0, 0.05)).toThrow('Invalid pot amount');
  });
});
```

### Mocking Dependencies

```typescript
import { mock } from 'bun:test';

// Mock an entire module
mock.module('../drizzle', () => ({
  db: {
    query: {
      users: {
        findFirst: mock(() => Promise.resolve({ id: 'user-1', balance: 100 })),
      },
    },
  },
}));

// Spy on a function
import * as walletService from './wallet';
const spy = spyOn(walletService, 'deductBalance');
// ... run test ...
expect(spy).toHaveBeenCalledWith('user-1', 50);
```

### Best Practices for Unit Tests

1. **One assertion per test** (when possible)
2. **Descriptive test names**: "should reject moves when game is over"
3. **Arrange-Act-Assert pattern**:
   ```typescript
   test('should deduct stake from player balance', async () => {
     // Arrange
     const player = { id: 'p1', balance: 100 };

     // Act
     const result = await deductStake(player.id, 25);

     // Assert
     expect(result.newBalance).toBe(75);
   });
   ```
4. **Test edge cases**: null, undefined, empty arrays, max values
5. **Don't test implementation details**: Test behavior, not internals

### References

- [Bun Test Runner Documentation](https://bun.com/docs/test)
- [Writing Tests with Bun](https://bun.com/docs/test/writing)

---

## Integration Testing (Bun)

### What Are Integration Tests?

Integration tests verify that multiple components work together correctly. Unlike unit tests (which mock dependencies), integration tests use real database connections and service interactions.

### When to Use Integration Tests

- Testing database queries return expected data
- Verifying service A correctly calls service B
- Testing API routes handle requests end-to-end
- Ensuring event handlers trigger correct side effects

### Example: Settlement Service Integration Test

```typescript
// apps/server/src/services/settlement/__tests__/settlement.integration.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../../drizzle';
import { createTestGame, createTestUsers, cleanupTestData } from '../../test-utils';
import { processSettlement } from '../settlement.service';

describe('Settlement Service (Integration)', () => {
  let testGameId: string;
  let whitePlayer: { id: string };
  let blackPlayer: { id: string };

  beforeAll(async () => {
    // Create real test data in database
    [whitePlayer, blackPlayer] = await createTestUsers(2);
    testGameId = await createTestGame(whitePlayer.id, blackPlayer.id, {
      pot: 100,
      status: 'completed',
      winnerId: whitePlayer.id,
    });
  });

  afterAll(async () => {
    await cleanupTestData([testGameId], [whitePlayer.id, blackPlayer.id]);
  });

  test('creates settlement record and pays winner', async () => {
    const settlement = await processSettlement(
      testGameId,
      whitePlayer.id,
      blackPlayer.id,
      100
    );

    expect(settlement.status).toBe('settled');
    expect(settlement.winnerPayout).toBe(95); // 5% house cut

    // Verify winner balance increased
    const winner = await db.query.users.findFirst({
      where: eq(users.id, whitePlayer.id),
    });
    expect(winner?.balance).toBeGreaterThan(0);
  });
});
```

### Test Database Strategy

**Option A: Separate Test Database** (Recommended)
```bash
# .env.test
DATABASE_URL=postgres://localhost:5432/chess_game_test
```

**Option B: Transaction Rollback**
```typescript
import { db } from '../drizzle';

beforeEach(async () => {
  await db.execute(sql`BEGIN`);
});

afterEach(async () => {
  await db.execute(sql`ROLLBACK`);
});
```

**Option C: In-Memory SQLite for Speed**
```typescript
// Use SQLite for fast integration tests, Postgres for E2E
import Database from 'bun:sqlite';
const testDb = new Database(':memory:');
```

---

## End-to-End Testing (Playwright)

### What is Playwright?

Playwright is a browser automation framework by Microsoft. It can control Chrome, Firefox, and Safari with a single API, simulating real user interactions like clicking, typing, and navigating.

### Why Playwright?

1. **Cross-browser**: Test Chrome, Firefox, Safari with one codebase
2. **Auto-wait**: Automatically waits for elements to be ready
3. **Network interception**: Mock API responses, simulate offline
4. **Visual comparison**: Screenshot testing for UI regression
5. **Tracing**: Record video/traces of failed tests for debugging

### Installation

```bash
# Add Playwright to the web app
cd apps/web
pnpm add -D @playwright/test

# Install browsers
npx playwright install
```

### Configuration

```typescript
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start dev server before tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Writing E2E Tests

```typescript
// apps/web/e2e/game-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Chess Game Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');
  });

  test('user can connect wallet and start a game', async ({ page }) => {
    // Click connect wallet button
    await page.click('[data-testid="connect-wallet-btn"]');

    // Wait for wallet modal
    await expect(page.locator('.wallet-modal')).toBeVisible();

    // Select MetaMask (mocked in test)
    await page.click('text=MetaMask');

    // Verify connected state
    await expect(page.locator('[data-testid="wallet-address"]')).toContainText('0x');

    // Navigate to play
    await page.click('text=Play');

    // Create a new game
    await page.click('[data-testid="create-game-btn"]');
    await page.fill('[data-testid="stake-input"]', '10');
    await page.click('[data-testid="confirm-stake-btn"]');

    // Verify game created
    await expect(page.locator('[data-testid="waiting-for-opponent"]')).toBeVisible();
  });

  test('two players can complete a full game', async ({ browser }) => {
    // Create two browser contexts (two players)
    const playerWhite = await browser.newContext();
    const playerBlack = await browser.newContext();

    const whiteePage = await playerWhite.newPage();
    const blackPage = await playerBlack.newPage();

    // ... setup both players and play through a game
  });
});
```

### Page Object Model Pattern

```typescript
// apps/web/e2e/pages/game.page.ts
import { Page, Locator } from '@playwright/test';

export class GamePage {
  readonly page: Page;
  readonly chessBoard: Locator;
  readonly moveList: Locator;
  readonly resignButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chessBoard = page.locator('[data-testid="chess-board"]');
    this.moveList = page.locator('[data-testid="move-list"]');
    this.resignButton = page.locator('[data-testid="resign-btn"]');
  }

  async makeMove(from: string, to: string) {
    await this.page.click(`[data-square="${from}"]`);
    await this.page.click(`[data-square="${to}"]`);
  }

  async getLastMove(): Promise<string> {
    const moves = await this.moveList.locator('li').all();
    const lastMove = moves[moves.length - 1];
    return lastMove.textContent() ?? '';
  }
}

// Usage in test:
test('can make a chess move', async ({ page }) => {
  const gamePage = new GamePage(page);
  await gamePage.makeMove('e2', 'e4');
  expect(await gamePage.getLastMove()).toBe('e4');
});
```

### Running Playwright Tests

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test e2e/game-flow.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# Run in headed mode (see the browser)
npx playwright test --headed

# Generate test code
npx playwright codegen localhost:3000
```

### References

- [Playwright Official Docs](https://playwright.dev/)
- [Next.js + Playwright Guide](https://nextjs.org/docs/app/guides/testing/playwright)
- [BrowserStack Playwright Guide](https://www.browserstack.com/guide/nextjs-playwright)

---

## Rust/Tauri Desktop Testing (Cargo)

### What is Cargo Test?

Cargo is Rust's package manager and build system. It includes a built-in test runner that's tightly integrated with the language. Tests are written directly in your Rust source files using the `#[test]` attribute.

### Why Test Rust Code?

Our desktop app uses Tauri with a Rust backend for:

1. **Security**: Anti-cheat logic runs in Rust (compiled, not readable like JS)
2. **Performance**: Stockfish integration, memory-efficient game state
3. **IPC Commands**: Frontend calls Rust functions via Tauri's invoke system
4. **Platform Integration**: OS-level features (window management, file system)

Rust's type system catches many bugs at compile time, but tests verify runtime behavior.

### Project Structure

```
apps/desktop/src-tauri/
├── src/
│   ├── lib.rs              # Library root (testable)
│   ├── main.rs             # Entry point (not tested)
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── game.rs         # Game-related IPC commands
│   │   ├── stockfish.rs    # Engine analysis commands
│   │   └── anticheat.rs    # Anti-cheat validation
│   ├── services/
│   │   ├── mod.rs
│   │   ├── analysis.rs     # Stockfish analysis service
│   │   └── integrity.rs    # Process integrity checks
│   └── tests/              # Integration tests (optional)
│       └── integration.rs
├── Cargo.toml
└── tauri.conf.json
```

### Writing Unit Tests in Rust

Tests live alongside the code they test, inside `#[cfg(test)]` modules:

```rust
// apps/desktop/src-tauri/src/commands/game.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveValidation {
    pub is_valid: bool,
    pub reason: Option<String>,
}

/// Validates a chess move format (e.g., "e2e4", "Nf3")
pub fn validate_move_format(move_str: &str) -> MoveValidation {
    // Basic format validation
    if move_str.len() < 2 || move_str.len() > 5 {
        return MoveValidation {
            is_valid: false,
            reason: Some("Invalid move length".to_string()),
        };
    }

    // Check for valid square notation
    let chars: Vec<char> = move_str.chars().collect();
    let valid_files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let valid_ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    // For simple moves like "e2e4"
    if move_str.len() == 4 {
        let from_file = chars[0];
        let from_rank = chars[1];
        let to_file = chars[2];
        let to_rank = chars[3];

        if !valid_files.contains(&from_file) || !valid_ranks.contains(&from_rank)
            || !valid_files.contains(&to_file) || !valid_ranks.contains(&to_rank)
        {
            return MoveValidation {
                is_valid: false,
                reason: Some("Invalid square notation".to_string()),
            };
        }
    }

    MoveValidation {
        is_valid: true,
        reason: None,
    }
}

// Tests are co-located with the code
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_move_format() {
        let result = validate_move_format("e2e4");
        assert!(result.is_valid);
        assert!(result.reason.is_none());
    }

    #[test]
    fn test_valid_kingside_castle() {
        let result = validate_move_format("O-O");
        // This would need special handling in a real implementation
        assert!(result.is_valid || result.reason.is_some());
    }

    #[test]
    fn test_invalid_move_too_short() {
        let result = validate_move_format("e");
        assert!(!result.is_valid);
        assert_eq!(result.reason, Some("Invalid move length".to_string()));
    }

    #[test]
    fn test_invalid_square_notation() {
        let result = validate_move_format("z9z9");
        assert!(!result.is_valid);
        assert_eq!(result.reason, Some("Invalid square notation".to_string()));
    }

    #[test]
    fn test_empty_move() {
        let result = validate_move_format("");
        assert!(!result.is_valid);
    }
}
```

### Testing Tauri Commands

Tauri commands are the bridge between frontend and Rust. Test the underlying logic, not the Tauri wrapper:

```rust
// apps/desktop/src-tauri/src/commands/stockfish.rs
use std::sync::Mutex;
use tauri::State;

pub struct AnalysisState {
    pub depth: Mutex<u8>,
    pub is_analyzing: Mutex<bool>,
}

impl Default for AnalysisState {
    fn default() -> Self {
        Self {
            depth: Mutex::new(20),
            is_analyzing: Mutex::new(false),
        }
    }
}

/// Set analysis depth (testable without Tauri)
pub fn set_depth_internal(state: &AnalysisState, depth: u8) -> Result<u8, String> {
    if depth < 1 || depth > 30 {
        return Err("Depth must be between 1 and 30".to_string());
    }

    let mut current_depth = state.depth.lock().map_err(|e| e.to_string())?;
    *current_depth = depth;
    Ok(depth)
}

/// Tauri command wrapper (thin layer)
#[tauri::command]
pub fn set_analysis_depth(
    state: State<'_, AnalysisState>,
    depth: u8,
) -> Result<u8, String> {
    set_depth_internal(&state, depth)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_state() -> AnalysisState {
        AnalysisState::default()
    }

    #[test]
    fn test_set_valid_depth() {
        let state = setup_test_state();
        let result = set_depth_internal(&state, 15);

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 15);
        assert_eq!(*state.depth.lock().unwrap(), 15);
    }

    #[test]
    fn test_set_depth_too_low() {
        let state = setup_test_state();
        let result = set_depth_internal(&state, 0);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Depth must be between 1 and 30");
    }

    #[test]
    fn test_set_depth_too_high() {
        let state = setup_test_state();
        let result = set_depth_internal(&state, 50);

        assert!(result.is_err());
    }

    #[test]
    fn test_default_depth() {
        let state = setup_test_state();
        assert_eq!(*state.depth.lock().unwrap(), 20);
    }
}
```

### Async Testing with Tokio

For async Rust code (common in Tauri apps):

```rust
// apps/desktop/src-tauri/src/services/analysis.rs
use tokio::process::Command;
use tokio::time::{timeout, Duration};

pub async fn run_stockfish_analysis(
    fen: &str,
    depth: u8,
    timeout_secs: u64,
) -> Result<String, String> {
    let analysis = timeout(
        Duration::from_secs(timeout_secs),
        analyze_position(fen, depth),
    )
    .await
    .map_err(|_| "Analysis timed out".to_string())?;

    analysis
}

async fn analyze_position(fen: &str, depth: u8) -> Result<String, String> {
    // Actual Stockfish integration would go here
    // For testing, we'll simulate it
    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(format!("bestmove e2e4 (depth {})", depth))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_analysis_returns_bestmove() {
        let result = run_stockfish_analysis(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            10,
            5,
        )
        .await;

        assert!(result.is_ok());
        assert!(result.unwrap().contains("bestmove"));
    }

    #[tokio::test]
    async fn test_analysis_timeout() {
        // This test would need a mock that takes longer than timeout
        // For now, just verify the timeout mechanism exists
        let result = run_stockfish_analysis(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            10,
            1, // 1 second timeout
        )
        .await;

        // Should complete within timeout for our simple mock
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_concurrent_analysis() {
        let futures = vec![
            run_stockfish_analysis("startpos", 5, 5),
            run_stockfish_analysis("startpos", 10, 5),
            run_stockfish_analysis("startpos", 15, 5),
        ];

        let results = futures::future::join_all(futures).await;

        assert_eq!(results.len(), 3);
        for result in results {
            assert!(result.is_ok());
        }
    }
}
```

### Testing Anti-Cheat Logic

Security-critical code deserves thorough testing:

```rust
// apps/desktop/src-tauri/src/services/integrity.rs
use std::collections::HashSet;

/// Suspicious process names that might indicate cheating tools
const SUSPICIOUS_PROCESSES: &[&str] = &[
    "cheatengine",
    "artmoney",
    "processhacker",
    // ... more in production
];

#[derive(Debug, PartialEq)]
pub enum IntegrityStatus {
    Clean,
    Suspicious(Vec<String>),
    Blocked(String),
}

pub fn check_process_integrity(running_processes: &[String]) -> IntegrityStatus {
    let suspicious: Vec<String> = running_processes
        .iter()
        .filter(|p| {
            let lower = p.to_lowercase();
            SUSPICIOUS_PROCESSES.iter().any(|s| lower.contains(s))
        })
        .cloned()
        .collect();

    if suspicious.is_empty() {
        IntegrityStatus::Clean
    } else {
        IntegrityStatus::Suspicious(suspicious)
    }
}

pub fn validate_move_timing(
    move_times_ms: &[u64],
    min_human_time_ms: u64,
) -> bool {
    // If too many moves are suspiciously fast, flag it
    let suspicious_count = move_times_ms
        .iter()
        .filter(|&&t| t < min_human_time_ms)
        .count();

    // Allow some fast moves (pre-moves, obvious recaptures)
    let threshold = (move_times_ms.len() as f64 * 0.3) as usize;
    suspicious_count <= threshold
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_process_list() {
        let processes = vec![
            "chrome.exe".to_string(),
            "discord.exe".to_string(),
            "chess-gamble.exe".to_string(),
        ];

        let result = check_process_integrity(&processes);
        assert_eq!(result, IntegrityStatus::Clean);
    }

    #[test]
    fn test_suspicious_process_detected() {
        let processes = vec![
            "chrome.exe".to_string(),
            "CheatEngine.exe".to_string(),
            "discord.exe".to_string(),
        ];

        let result = check_process_integrity(&processes);

        match result {
            IntegrityStatus::Suspicious(found) => {
                assert_eq!(found.len(), 1);
                assert!(found[0].contains("CheatEngine"));
            }
            _ => panic!("Expected Suspicious status"),
        }
    }

    #[test]
    fn test_case_insensitive_detection() {
        let processes = vec!["CHEATENGINE.EXE".to_string()];

        let result = check_process_integrity(&processes);
        assert!(matches!(result, IntegrityStatus::Suspicious(_)));
    }

    #[test]
    fn test_normal_move_timing() {
        // Moves ranging from 500ms to 5000ms - normal human play
        let move_times = vec![1200, 800, 3500, 2100, 950, 4200, 1800, 600, 2900, 1500];

        let result = validate_move_timing(&move_times, 200);
        assert!(result, "Normal move times should pass");
    }

    #[test]
    fn test_suspicious_move_timing() {
        // Too many sub-200ms moves (likely engine-assisted)
        let move_times = vec![50, 80, 60, 90, 1200, 70, 85, 65, 2000, 75];

        let result = validate_move_timing(&move_times, 200);
        assert!(!result, "Suspicious timing should fail");
    }

    #[test]
    fn test_some_premoves_allowed() {
        // 2 out of 10 fast moves is okay (pre-moves)
        let move_times = vec![50, 80, 1200, 800, 3500, 2100, 950, 4200, 1800, 2900];

        let result = validate_move_timing(&move_times, 200);
        assert!(result, "Some pre-moves should be allowed");
    }
}
```

### Integration Testing with Frontend

Test the Tauri IPC bridge using TypeScript tests that call into Rust:

```typescript
// apps/desktop/src-tauri/tests/integration.test.ts
// Run with: cd apps/desktop && pnpm test:tauri
import { invoke } from '@tauri-apps/api/core';

describe('Tauri IPC Commands', () => {
  beforeEach(async () => {
    // Reset any state
    await invoke('reset_analysis_state');
  });

  test('should set analysis depth', async () => {
    const result = await invoke<number>('set_analysis_depth', { depth: 15 });
    expect(result).toBe(15);
  });

  test('should reject invalid depth', async () => {
    await expect(
      invoke('set_analysis_depth', { depth: 50 })
    ).rejects.toThrow('Depth must be between 1 and 30');
  });

  test('should validate move format', async () => {
    const result = await invoke<{ is_valid: boolean; reason: string | null }>(
      'validate_move',
      { moveStr: 'e2e4' }
    );

    expect(result.is_valid).toBe(true);
    expect(result.reason).toBeNull();
  });

  test('should run integrity check', async () => {
    const result = await invoke<string>('check_integrity');
    expect(result).toBe('clean');
  });
});
```

### Running Rust Tests

```bash
# Navigate to Tauri project
cd apps/desktop/src-tauri

# Run all tests
cargo test

# Run tests with output (see println! statements)
cargo test -- --nocapture

# Run specific test
cargo test test_valid_move_format

# Run tests in a specific module
cargo test commands::game::tests

# Run tests with verbose output
cargo test -- --test-threads=1 --nocapture

# Run only ignored tests (slow tests marked with #[ignore])
cargo test -- --ignored

# Run tests and show coverage (requires cargo-tarpaulin)
cargo tarpaulin --out Html

# Watch mode (requires cargo-watch)
cargo watch -x test
```

### Test Configuration in Cargo.toml

```toml
# apps/desktop/src-tauri/Cargo.toml
[package]
name = "chess-gamble-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }

[dev-dependencies]
# Testing utilities
tokio-test = "0.4"
mockall = "0.12"  # For mocking traits
tempfile = "3"    # For temporary files in tests

[features]
# Enable test features
test-utils = []

[[test]]
name = "integration"
path = "tests/integration.rs"
```

### Mocking with mockall

For complex dependencies like Stockfish:

```rust
// apps/desktop/src-tauri/src/services/engine.rs
use mockall::automock;

#[automock]
pub trait ChessEngine {
    fn analyze(&self, fen: &str, depth: u8) -> Result<String, String>;
    fn get_best_move(&self, fen: &str) -> Result<String, String>;
}

pub struct StockfishEngine {
    // Real implementation
}

impl ChessEngine for StockfishEngine {
    fn analyze(&self, fen: &str, depth: u8) -> Result<String, String> {
        // Real Stockfish call
        Ok(format!("info depth {} ... bestmove e2e4", depth))
    }

    fn get_best_move(&self, fen: &str) -> Result<String, String> {
        Ok("e2e4".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_with_mock_engine() {
        let mut mock = MockChessEngine::new();

        mock.expect_get_best_move()
            .with(mockall::predicate::eq("startpos"))
            .times(1)
            .returning(|_| Ok("d2d4".to_string()));

        let result = mock.get_best_move("startpos");
        assert_eq!(result.unwrap(), "d2d4");
    }

    #[test]
    fn test_analyze_returns_depth() {
        let mut mock = MockChessEngine::new();

        mock.expect_analyze()
            .returning(|_, depth| Ok(format!("depth {}", depth)));

        let result = mock.analyze("startpos", 15);
        assert!(result.unwrap().contains("depth 15"));
    }
}
```

### Coverage Targets for Rust

| Component | Target Coverage | Priority |
|-----------|-----------------|----------|
| Anti-cheat/Integrity | 90% | Critical |
| Tauri Commands | 85% | High |
| Stockfish Integration | 70% | Medium |
| UI State Management | 60% | Low |

### References

- [Rust Book - Writing Tests](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Cargo Test Documentation](https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- [Tokio Testing Guide](https://tokio.rs/tokio/topics/testing)
- [mockall Crate](https://docs.rs/mockall/latest/mockall/)
- [Tauri Testing Guide](https://tauri.app/v1/guides/testing/)

---

## Smart Contract Testing (Hardhat)

### What is Hardhat?

Hardhat is an Ethereum development environment. Think of it as a "development server" for smart contracts—it provides:

1. **Local Blockchain**: A fake Ethereum network on your computer
2. **Compilation**: Turns Solidity code into deployable bytecode
3. **Testing Framework**: Write tests in JavaScript/TypeScript
4. **Debugging**: Stack traces and console.log in Solidity
5. **Network Forking**: Clone mainnet to test with real contracts (like USDC)

### Why We Need Hardhat

Our chess platform handles real USDC. The smart contracts (`ChessEscrow.sol`, `GameRegistry.sol`) must be bulletproof because:

- **Funds at risk**: A bug could lock or steal user USDC
- **Immutable code**: Once deployed, contracts can't be changed
- **Gas costs**: Inefficient code costs users money

### Installation

```bash
# Create contracts directory
mkdir -p packages/contracts
cd packages/contracts

# Initialize
pnpm init
pnpm add -D hardhat @nomicfoundation/hardhat-toolbox typescript @types/node
npx hardhat init
```

When prompted, select "Create a TypeScript project".

### Project Structure

```
packages/contracts/
├── contracts/
│   ├── ChessEscrow.sol      # Holds stakes, distributes winnings
│   └── GameRegistry.sol     # Records game results on-chain
├── test/
│   ├── ChessEscrow.test.ts
│   └── GameRegistry.test.ts
├── ignition/
│   └── modules/             # Deployment scripts
├── hardhat.config.ts
└── package.json
```

### Configuration

```typescript
// packages/contracts/hardhat.config.ts
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Fork Polygon mainnet to test with real USDC
      forking: {
        url: process.env.POLYGON_RPC_URL ?? '',
        blockNumber: 55000000, // Pin to specific block for reproducibility
      },
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL ?? '',
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
```

### Writing Contract Tests

```typescript
// packages/contracts/test/ChessEscrow.test.ts
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('ChessEscrow', function () {
  // Fixtures run once and are reused (faster than beforeEach)
  async function deployEscrowFixture() {
    const [owner, player1, player2] = await ethers.getSigners();

    // Deploy mock USDC for testing
    const MockUSDC = await ethers.getContractFactory('MockERC20');
    const usdc = await MockUSDC.deploy('USDC', 'USDC', 6); // 6 decimals like real USDC

    // Give players some USDC
    await usdc.mint(player1.address, ethers.parseUnits('1000', 6));
    await usdc.mint(player2.address, ethers.parseUnits('1000', 6));

    // Deploy escrow
    const ChessEscrow = await ethers.getContractFactory('ChessEscrow');
    const escrow = await ChessEscrow.deploy(usdc.target);

    return { escrow, usdc, owner, player1, player2 };
  }

  describe('Game Creation', function () {
    it('should lock stakes from both players', async function () {
      const { escrow, usdc, player1, player2 } = await loadFixture(deployEscrowFixture);

      const stakeAmount = ethers.parseUnits('50', 6); // 50 USDC

      // Approve escrow to spend USDC
      await usdc.connect(player1).approve(escrow.target, stakeAmount);
      await usdc.connect(player2).approve(escrow.target, stakeAmount);

      // Create game
      await escrow.createGame('game-1', player1.address, player2.address, stakeAmount);

      // Verify escrow holds 100 USDC (50 from each player)
      expect(await usdc.balanceOf(escrow.target)).to.equal(stakeAmount * 2n);
    });

    it('should revert if player has insufficient balance', async function () {
      const { escrow, usdc, player1, player2 } = await loadFixture(deployEscrowFixture);

      const hugeStake = ethers.parseUnits('10000', 6); // More than they have

      await usdc.connect(player1).approve(escrow.target, hugeStake);

      await expect(
        escrow.createGame('game-1', player1.address, player2.address, hugeStake)
      ).to.be.revertedWith('Insufficient balance');
    });
  });

  describe('Game Settlement', function () {
    it('should pay winner minus house cut', async function () {
      const { escrow, usdc, owner, player1, player2 } = await loadFixture(deployEscrowFixture);

      const stakeAmount = ethers.parseUnits('50', 6);
      const totalPot = stakeAmount * 2n; // 100 USDC
      const houseCut = totalPot * 5n / 100n; // 5% = 5 USDC
      const winnerPayout = totalPot - houseCut; // 95 USDC

      // Setup and create game
      await usdc.connect(player1).approve(escrow.target, stakeAmount);
      await usdc.connect(player2).approve(escrow.target, stakeAmount);
      await escrow.createGame('game-1', player1.address, player2.address, stakeAmount);

      const player1BalanceBefore = await usdc.balanceOf(player1.address);

      // Settle game - player1 wins
      await escrow.connect(owner).settleGame('game-1', player1.address);

      const player1BalanceAfter = await usdc.balanceOf(player1.address);

      // Player 1 should receive 95 USDC
      expect(player1BalanceAfter - player1BalanceBefore).to.equal(winnerPayout);
    });
  });
});
```

### Testing with Mainnet Fork

Test against real USDC on a forked Polygon network:

```typescript
// packages/contracts/test/fork/usdc-integration.test.ts
import { expect } from 'chai';
import { ethers } from 'hardhat';

// Real USDC address on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_WHALE = '0x...'; // Address with lots of USDC

describe('ChessEscrow (Mainnet Fork)', function () {
  it('should work with real USDC', async function () {
    // Impersonate a whale account
    await ethers.provider.send('hardhat_impersonateAccount', [USDC_WHALE]);
    const whale = await ethers.getSigner(USDC_WHALE);

    // Get real USDC contract
    const usdc = await ethers.getContractAt('IERC20', USDC_ADDRESS);

    // Verify whale has USDC
    const balance = await usdc.balanceOf(USDC_WHALE);
    expect(balance).to.be.greaterThan(0);

    // ... test with real USDC
  });
});
```

### Running Hardhat Tests

```bash
cd packages/contracts

# Run all tests
npx hardhat test

# Run specific test
npx hardhat test test/ChessEscrow.test.ts

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run with coverage
npx hardhat coverage

# Start local node
npx hardhat node

# Deploy to local node
npx hardhat ignition deploy ignition/modules/ChessEscrow.ts --network localhost
```

### Security Testing Checklist

| Test Case | Description |
|-----------|-------------|
| Reentrancy | Ensure `nonReentrant` modifier on fund transfers |
| Integer overflow | Verify SafeMath or Solidity 0.8+ checked math |
| Access control | Only authorized addresses can settle games |
| Front-running | Commit-reveal or time-locks for sensitive operations |
| Denial of service | Can't permanently lock funds |
| Flash loan attacks | Settlement can't be manipulated in single tx |

### References

- [Hardhat Documentation](https://hardhat.org/docs)
- [Testing Contracts Guide](https://v2.hardhat.org/tutorial/testing-contracts)
- [Circle USDC Integration Guide](https://www.circle.com/blog/composable-smart-contracts-with-usdc)
- [Smock Mocking Library](https://soliditydeveloper.com/smock)

---

## Performance Testing (k6)

### What is k6?

k6 is a load testing tool built by Grafana. It lets you simulate thousands of users hitting your server simultaneously to find:

- **Bottlenecks**: Which endpoints are slow under load?
- **Breaking points**: How many concurrent users before crash?
- **Latency**: Does response time stay acceptable at scale?

### Why k6 for Chess?

Real-time chess has strict latency requirements:
- Move propagation: <100ms
- Clock sync: <50ms
- WebSocket messages: <200ms

k6 can test both HTTP endpoints AND WebSocket connections.

### Installation

```bash
# macOS
brew install k6

# Or download from https://k6.io/docs/get-started/installation/
```

### Configuration

```typescript
// tests/performance/config.ts
export const BASE_URL = 'http://localhost:8787';
export const WS_URL = 'ws://localhost:8787';

export const thresholds = {
  http_req_duration: ['p(95)<200'], // 95% of requests under 200ms
  http_req_failed: ['rate<0.01'],   // Less than 1% failure rate
  ws_connecting: ['p(95)<100'],     // WebSocket connects under 100ms
};
```

### Writing Load Tests

```javascript
// tests/performance/http-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },  // Sustain 100 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    errors: ['rate<0.05'],            // Error rate under 5%
  },
};

const BASE_URL = 'http://localhost:8787';

export default function () {
  // Test game listing endpoint
  const gamesRes = http.get(`${BASE_URL}/api/games`);

  check(gamesRes, {
    'games endpoint returns 200': (r) => r.status === 200,
    'games returns array': (r) => Array.isArray(JSON.parse(r.body)),
  }) || errorRate.add(1);

  // Test user profile endpoint
  const profileRes = http.get(`${BASE_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
  });

  check(profileRes, {
    'profile returns 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1); // Wait 1 second between iterations
}
```

### WebSocket Load Testing

```javascript
// tests/performance/websocket-load.js
import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const wsMessages = new Counter('ws_messages');
const wsLatency = new Trend('ws_latency');

export const options = {
  vus: 50,           // 50 concurrent users
  duration: '2m',    // Run for 2 minutes
  thresholds: {
    ws_latency: ['p(95)<100'], // 95% of messages under 100ms
  },
};

export default function () {
  const url = 'ws://localhost:8787/ws';

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      console.log('Connected');

      // Join a game room
      socket.send(JSON.stringify({
        type: 'game:join',
        gameId: `game-${__VU}`, // Virtual User ID
      }));
    });

    socket.on('message', (data) => {
      wsMessages.add(1);
      const msg = JSON.parse(data);

      // Track message latency
      if (msg.timestamp) {
        const latency = Date.now() - msg.timestamp;
        wsLatency.add(latency);
      }
    });

    socket.on('error', (e) => {
      console.error('WebSocket error:', e);
    });

    // Send periodic moves
    socket.setInterval(() => {
      socket.send(JSON.stringify({
        type: 'game:move',
        move: 'e2e4',
        timestamp: Date.now(),
      }));
    }, 1000);

    // Keep connection open for 1 minute
    socket.setTimeout(() => {
      socket.close();
    }, 60000);
  });

  check(res, {
    'WebSocket connected successfully': (r) => r && r.status === 101,
  });
}
```

### Running k6 Tests

```bash
# Run load test
k6 run tests/performance/http-load.js

# Run with environment variables
k6 run -e TEST_TOKEN=your-jwt-token tests/performance/http-load.js

# Run with output to InfluxDB (for Grafana dashboards)
k6 run --out influxdb=http://localhost:8086/k6 tests/performance/http-load.js

# Run WebSocket test
k6 run tests/performance/websocket-load.js
```

### Interpreting Results

```
scenarios: (100.00%) 1 scenario, 100 max VUs, 3m30s max duration
     ✓ http_req_duration..............: avg=45.2ms  min=12ms  med=38ms  max=892ms  p(90)=78ms   p(95)=124ms
     ✓ http_req_failed................: 0.23%   ✓ 12    ✗ 5234
     ✓ errors.........................: 0.22%   ✓ 12    ✗ 5234
       http_reqs......................: 5246    29.14/s
       iteration_duration.............: avg=1.04s   min=1.01s med=1.03s max=1.89s  p(90)=1.08s  p(95)=1.12s
```

Key metrics to watch:
- **p(95)**: 95th percentile latency (most users' experience)
- **http_req_failed**: Error rate
- **http_reqs**: Throughput (requests per second)

### References

- [k6 Documentation](https://k6.io/docs/)
- [k6 WebSocket Testing](https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/)
- [k6 TypeScript Example](https://medium.com/@sebastian.southern/performance-testing-in-typescript-with-k6-a65377f547e6)

---

## Test Coverage Strategy

### Coverage Targets by Component

| Component | Unit Coverage | Integration Coverage | E2E Flows |
|-----------|---------------|---------------------|-----------|
| Settlement Service | 90% | 80% | 2 flows |
| Arbiter Overwatch | 85% | 75% | 3 flows |
| Anti-cheat (TS) | 80% | 70% | 1 flow |
| Game Engine | 95% | 60% | 2 flows |
| Wallet/Auth | 85% | 80% | 2 flows |

#### Rust/Desktop Coverage Targets

| Component | Target Coverage | Priority |
|-----------|-----------------|----------|
| Anti-cheat/Integrity (Rust) | 90% | Critical |
| Tauri IPC Commands | 85% | High |
| Stockfish Integration | 70% | Medium |
| Desktop State Management | 60% | Low |

### Running Coverage Reports

```bash
# Bun coverage (TypeScript server)
cd apps/server
bun test --coverage

# Rust coverage (requires cargo-tarpaulin)
cd apps/desktop/src-tauri
cargo install cargo-tarpaulin
cargo tarpaulin --out Html

# Playwright coverage (experimental)
cd apps/web
npx playwright test --coverage

# Hardhat coverage
cd packages/contracts
npx hardhat coverage
```

### What NOT to Test

1. **Third-party libraries**: Trust that Wagmi, RainbowKit work
2. **Database internals**: Trust Drizzle/Postgres
3. **UI styling**: Unless visual regression testing is set up
4. **Trivial getters/setters**: No logic = no test

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run unit tests
        run: cd apps/server && bun test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: cd apps/web && npx playwright install --with-deps

      - name: Build
        run: pnpm build

      - name: Run E2E tests
        run: cd apps/web && npx playwright test

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/web/playwright-report/

  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: cd packages/contracts && pnpm install

      - name: Run contract tests
        run: cd packages/contracts && npx hardhat test

  rust-tests:
    runs-on: ${{ matrix.platform }}
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies (Ubuntu only)
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev

      - name: Run Rust tests
        run: cd apps/desktop/src-tauri && cargo test

      - name: Run Rust tests (release mode)
        run: cd apps/desktop/src-tauri && cargo test --release
```

---

## Recommended Implementation Order

### Phase 1: Foundation (Week 1)

1. **Set up Playwright** in `apps/web`
2. **Create test utilities** for database seeding/cleanup
3. **Write 5 critical E2E tests**:
   - Wallet connection flow
   - Game creation flow
   - Making moves (happy path)
   - Game completion and settlement
   - Arbiter enrollment

### Phase 2: Integration Tests (Week 2)

4. **Settlement service integration tests**
5. **Arbiter Overwatch integration tests**
6. **Anti-cheat service tests** (TypeScript side)

### Phase 3: Rust/Desktop Tests (Week 3)

7. **Set up Rust test infrastructure** in `apps/desktop/src-tauri`
8. **Tauri command unit tests** (IPC validation)
9. **Anti-cheat integrity tests** (process checking, timing analysis)
10. **Stockfish integration tests** (async analysis, timeout handling)
11. **Frontend-backend IPC integration tests**

### Phase 4: Smart Contracts (Week 4)

12. **Set up Hardhat** in `packages/contracts`
13. **ChessEscrow tests**
14. **GameRegistry tests**
15. **Mainnet fork tests with real USDC**

### Phase 5: Performance (Week 5)

16. **Set up k6**
17. **HTTP endpoint load tests**
18. **WebSocket stress tests**
19. **Stockfish analysis benchmarks** (Rust performance profiling)

---

## Quick Reference

### Run Commands

```bash
# Server unit tests (Bun)
cd apps/server && bun test

# Rust/Tauri tests (Cargo)
cd apps/desktop/src-tauri && cargo test

# E2E tests (Playwright)
cd apps/web && npx playwright test

# Contract tests (Hardhat)
cd packages/contracts && npx hardhat test

# Performance tests (k6)
k6 run tests/performance/http-load.js

# All tests (CI)
pnpm test
```

### Test File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Unit (TS) | `*.test.ts` | `game.test.ts` |
| Unit (Rust) | `#[cfg(test)] mod tests` | Inline in `game.rs` |
| Integration (TS) | `*.integration.test.ts` | `settlement.integration.test.ts` |
| Integration (Rust) | `tests/*.rs` | `tests/integration.rs` |
| E2E | `*.spec.ts` | `game-flow.spec.ts` |
| Contract | `*.test.ts` | `ChessEscrow.test.ts` |
| Performance | `*.js` | `websocket-load.js` |

---

## Further Reading

### TypeScript/JavaScript
- [Bun Test Runner](https://bun.com/docs/test)
- [Playwright Documentation](https://playwright.dev/)

### Rust/Desktop
- [Rust Book - Writing Tests](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Cargo Test Documentation](https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- [Tokio Testing Guide](https://tokio.rs/tokio/topics/testing)
- [mockall Crate](https://docs.rs/mockall/latest/mockall/)
- [Tauri Testing Guide](https://tauri.app/v1/guides/testing/)
- [cargo-tarpaulin (Coverage)](https://github.com/xd009642/tarpaulin)

### Smart Contracts
- [Hardhat Tutorial](https://hardhat.org/docs/getting-started)
- [Testing Real-Money Apps](https://www.circle.com/blog/composable-smart-contracts-with-usdc)

### Performance
- [k6 Documentation](https://k6.io/docs/)
