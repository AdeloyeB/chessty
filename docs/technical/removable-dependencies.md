# Removable Dependencies

Analysis of dependencies that can potentially be removed from the project.

---

## Completed Removals

### `postgres` - REMOVED ✅

| Package | Version | Reason |
|---------|---------|--------|
| `postgres` | ^3.4.4 | **Not used.** Server uses SQLite via `bun:sqlite`, not PostgreSQL. |

**Removed from:** `apps/server/package.json`

---

### `chess.js` - CONSOLIDATED ✅

Previously duplicated in both `apps/web` and `apps/server`.

**Changes made:**
1. Added `chess.js` to `packages/shared/package.json`
2. Created `packages/shared/src/chess/index.ts` with re-exports
3. Updated exports in `packages/shared/package.json` to include `./chess`
4. Updated imports in:
   - `apps/web/src/hooks/useChessGame.ts`
   - `apps/web/src/components/chess/LocalGame.tsx`
   - `apps/server/src/websocket/GameManager.ts`
5. Removed `chess.js` from both `apps/web` and `apps/server`

**Usage:**
```typescript
import { Chess, type Square } from '@chess-game/shared/chess';
```

---

## Keep (Verified In Use)

### `apps/web/package.json`

| Package | Used In |
|---------|---------|
| `@rainbow-me/rainbowkit` | `WalletProvider.tsx`, `ConnectButton.tsx` |
| `@tanstack/react-query` | `WalletProvider.tsx`, hooks, dashboard components |
| `chess.js` | `LocalGame.tsx`, `useChessGame.ts` |
| `clsx` | `utils.ts` (cn function) |
| `next` | Framework |
| `react` / `react-dom` | Framework |
| `react-chessboard` | `LocalGame.tsx`, `GameBoard.tsx`, `SpectatorView.tsx` |
| `recharts` | `HistoryCharts.tsx` |
| `tailwind-merge` | `utils.ts` (cn function) |
| `viem` | `useWallet.ts` |
| `wagmi` | `wagmi.ts`, `WalletProvider.tsx`, `useWallet.ts` |
| `zustand` | 7 stores (auth, wallet, game, challenge, etc.) |

### `apps/server/package.json`

| Package | Used In |
|---------|---------|
| `@chess-game/shared` | 30+ files |
| `drizzle-orm` | 18 files (schema, services, routes) |
| `bcrypt` | `services/auth.ts` |
| `jose` | `services/auth.ts` |
| `nanoid` | 6 services (auth, achievements, wallet, etc.) |
| `zod` | Routes (profile, matchmaking, betting) |

### `apps/desktop/package.json`

| Package | Used In |
|---------|---------|
| `@chess-game/web` | Workspace dependency |
| `electron-store` | `electron/main.ts` |

### `packages/shared/package.json`

| Package | Used In |
|---------|---------|
| `zod` | `types/index.ts`, `types/flags.ts`, `types/history.ts` |

---

## Future Considerations

### If migrating to PostgreSQL

The `postgres` package was likely added for future PostgreSQL support. The `drizzle.config.ts` references PostgreSQL:

```typescript
dialect: 'postgresql',
url: process.env.DATABASE_URL || 'postgresql://localhost:5432/chess_game',
```

If you plan to migrate to PostgreSQL in production, keep the package. Otherwise, remove it and update `drizzle.config.ts` to reflect SQLite-only usage.

---

## Summary

| Action | Package | Status |
|--------|---------|--------|
| ~~Remove~~ | `postgres` | ✅ Removed |
| ~~Consolidate~~ | `chess.js` | ✅ Moved to shared |

**All identified removable dependencies have been addressed.**

---

*Generated: 2026-01-19*
*Updated: 2026-01-19 - Completed removals*
