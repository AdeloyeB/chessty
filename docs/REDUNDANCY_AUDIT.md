# Codebase Redundancy Audit

> Generated: 2026-01-23
> Purpose: Reference for cleaning up dead code, unused dependencies, and overlapping technologies.

---

## Quick Summary

| Issue | Severity | Action Needed |
|-------|----------|---------------|
| `postgres` package unused | Low | Remove from package.json |
| `chess.js` package unused | Low | Remove from package.json |
| PostgreSQL schema (472 lines dead code) | High | Delete file, fix profile/achievements imports |
| Achievements/Profile importing dead schema | **Critical** | These features are broken — fix or remove |
| Redis directory (placeholder) | Low | Keep for future, or remove if not planning Redis |
| Unused feature flag exports | Low | Remove `FeatureFlagChecker` and `FEATURE_FLAG_ROUTES` |
| `REMOVABLE_DEPENDENCIES.md` is outdated | Low | Update or merge into this file |

---

## 1. Unused Dependencies

### `postgres` (apps/server/package.json)

**What it is**: A PostgreSQL database driver — it lets Node.js talk to a PostgreSQL database.

**Problem**: Your server uses SQLite (via `bun:sqlite`), not PostgreSQL. This package is installed but never imported in any source file.

**Where it's referenced** (docs only, not code):
- `docs/SCALING.md` (future plans)
- `docs/BACKEND_BUILD.md` (design docs)

**Fix**: Remove from `apps/server/package.json`

---

### `chess.js` (apps/server/package.json)

**What it is**: A popular open-source chess library that handles move validation, check/checkmate detection, etc.

**Problem**: Your app uses a custom chess engine at `packages/chess-engine/` instead. The `chess.js` package is installed but never imported in server code.

**Where it's referenced** (docs only):
- `docs/DISCORD_INTEGRATION_RESEARCH.md` (example code)

**Fix**: Remove from `apps/server/package.json`

---

## 2. Dead Code: PostgreSQL Schema

**File**: `apps/server/src/drizzle/schema.ts` (472 lines)

**What it is**: A complete PostgreSQL database schema using Drizzle ORM's `pgTable` function. It defines users, games, bets, transactions, achievements, profiles, and more — all for PostgreSQL.

**Why it's dead**: Your actual database connection (`apps/server/src/drizzle/index.ts`) imports from `./sqlite-schema`, not this file:

```typescript
// What's actually used:
import { Database } from 'bun:sqlite';
import * as schema from './sqlite-schema';

// What's dead:
// schema.ts uses pgTable, pgEnum — PostgreSQL-specific, never connected
```

### Critical Bug: Broken Imports

Two service files still import from the PostgreSQL schema:

| File | Imports | Problem |
|------|---------|---------|
| `apps/server/src/services/achievements.ts` | `userAchievements`, `userProfiles`, `users`, `games` | `userAchievements` and `userProfiles` don't exist in SQLite schema |
| `apps/server/src/routes/profile.ts` | `users`, `userProfiles` | `userProfiles` doesn't exist in SQLite schema |

**Impact**: These features likely throw runtime errors or silently fail because the tables they reference don't exist in the actual database.

**Fix Options**:
1. Add `userAchievements` and `userProfiles` tables to the SQLite schema, then update imports
2. Remove the features entirely if not needed yet
3. Migrate to PostgreSQL (future work, out of scope)

---

## 3. Redis Directory (Placeholder)

**Location**: `apps/server/src/redis/`

**Files**:
- `client.ts` — Redis connection code, entirely commented out
- `circuitBreaker.ts` — Circuit breaker pattern implementation, never imported
- `scripts/clock_tick.lua` — Atomic clock decrement, never used
- `scripts/clock_move.lua` — Atomic increment + turn switch, never used

**What it is**: This was scaffolded during architecture planning (Phase 3 of the GameManager refactor plan). It's meant for when you add Redis for game state persistence and horizontal scaling.

**Current state**: None of these files are imported or connected to the application. They're pure placeholder code.

**Decision**: Keep if you plan to implement Redis. Remove if you want a cleaner codebase now.

---

## 4. Feature Flags Redundancy

The feature flags system is spread across 4 files. This is mostly intentional (separation of concerns), but has some unused exports.

### Architecture (How it works)

```
packages/shared/src/constants/flags.ts  ← Default values + categories
packages/shared/src/types/flags.ts      ← TypeScript types + Zod schemas
         ↓                                        ↓
apps/server/src/services/featureFlags.ts  ← Server reads/writes DB
apps/web/src/store/flags.ts              ← Client fetches from server
```

### Unused Exports

| Export | File | Problem |
|--------|------|---------|
| `FeatureFlagChecker` | `packages/shared/src/types/flags.ts:80` | Interface never implemented anywhere |
| `FEATURE_FLAG_ROUTES` | `packages/shared/src/constants/flags.ts:101` | Routes are hardcoded in index.ts, this constant is never imported |

**Fix**: Remove these two exports. They add no value.

---

## 5. Overlapping Technologies

### Database: SQLite vs PostgreSQL

| Technology | Status | Where |
|-----------|--------|-------|
| **SQLite** (via `bun:sqlite`) | **Active** — this is your real database | `apps/server/src/drizzle/index.ts` |
| **PostgreSQL** (via `drizzle-orm/pg-core`) | **Dead code** — schema exists but isn't connected | `apps/server/src/drizzle/schema.ts` |
| **`postgres`** npm package | **Unused** — installed, never imported | `apps/server/package.json` |

**Explanation**: You currently use SQLite, which stores everything in a single file (`chess_game.db`). PostgreSQL is a separate database server — more powerful for production but more complex to set up. The PostgreSQL schema was likely written first as a design document, then SQLite was used for faster development.

**Decision**: For production with many users, you'll eventually want PostgreSQL. For now, delete the dead PostgreSQL schema and keep SQLite.

### Chess Engine: chess.js vs packages/chess-engine

| Technology | Status | Where |
|-----------|--------|-------|
| **`packages/chess-engine/`** | **Active** — custom engine used by server | `packages/chess-engine/src/` |
| **`packages/shared/src/chess/`** | **Active** — re-exports from chess-engine | Single `index.ts` file |
| **`chess.js`** npm package | **Unused** — installed, never imported | `apps/server/package.json` |

**Explanation**: `chess.js` is a third-party library. Your custom `packages/chess-engine/` replaces it entirely with your own implementation. The shared package re-exports from chess-engine for backward compatibility.

---

## 6. Outdated Documentation

### `docs/REMOVABLE_DEPENDENCIES.md`

This file claims:
- ✅ `postgres` — "REMOVED" → **Still in package.json**
- ✅ `chess.js` — "CONSOLIDATED" → **Still in server package.json**

**Fix**: Delete this file (this audit replaces it) or update it to reflect reality.

---

## Recommended Cleanup Order

### Quick Wins (safe, no behavior change)

1. Remove `postgres` from `apps/server/package.json`
2. Remove `chess.js` from `apps/server/package.json`
3. Remove `FeatureFlagChecker` interface from `packages/shared/src/types/flags.ts`
4. Remove `FEATURE_FLAG_ROUTES` constant from `packages/shared/src/constants/flags.ts`
5. Delete or update `docs/REMOVABLE_DEPENDENCIES.md`

### Requires Careful Work

6. Fix achievements/profile imports (move them to SQLite schema or remove features)
7. Delete `apps/server/src/drizzle/schema.ts` (PostgreSQL dead code)

### Future Decision

8. Redis directory — keep for Phase 3 implementation or remove for now

---

## Technology Stack (What You're Actually Using)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Bun | JavaScript runtime (like Node.js but faster) |
| **Web Framework** | Bun.serve | HTTP server built into Bun |
| **WebSockets** | Bun built-in | Real-time game communication |
| **Database** | SQLite (bun:sqlite) | Store users, games, bets, transactions |
| **ORM** | Drizzle ORM | Type-safe database queries |
| **Frontend** | Next.js + React | Web UI framework |
| **State Management** | Zustand | Client-side state stores |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Chess Engine** | Custom (packages/chess-engine) | Move validation, game rules |
| **Auth** | JWT (jose) + bcrypt | Token-based authentication |
| **Desktop** | Electron | Wrap web app as desktop app |
| **Monorepo** | pnpm workspaces | Manage multiple packages together |
| **Validation** | Zod | Runtime type checking for API inputs |

---

*This file should be updated whenever major cleanup is performed.*
