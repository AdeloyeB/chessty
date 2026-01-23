# Codebase Context Prompt

Use this to quickly onboard or remind about the codebase structure.

---

```
This is a real-time multiplayer chess platform with crypto (USDC) stakes.

## Monorepo Structure
- apps/web - Next.js 16 frontend (React 19)
- apps/server - Hono.js backend with WebSocket
- apps/desktop - Electron wrapper
- packages/shared - Shared types, constants, chess engine

## Key Technologies
- Frontend: Next.js, Tailwind, Zustand, RainbowKit/Wagmi
- Backend: Hono.js, Drizzle ORM, WebSocket
- Database: PostgreSQL (prod) / SQLite (dev)
- Crypto: USDC on Base, Polygon, Arbitrum, Ethereum

## Important Files
- packages/shared/src/chess/engine.ts - Custom chess engine
- apps/web/src/components/chess/ChessBoard.tsx - Custom board component
- apps/web/src/hooks/useWebSocket.ts - WebSocket client
- apps/server/src/websocket/GameManager.ts - Game state management
- apps/web/src/store/*.ts - Zustand stores

## UI Conventions (from CLAUDE.md)
- No scrolling lists - use PaginatedGrid/PaginatedList
- IDE-style layout for immersive views (practice mode, games)
- Color system: pure-black, off-black, mid, mid-light, light, pure-white
- Retro theme colors: retro-dark, retro-mid, retro-blue, retro-cyan, retro-glow

## Commands
- pnpm dev - Run all apps
- pnpm build - Build all packages
- pnpm dev:web - Web only
- pnpm dev:server - Server only

## Custom Slash Commands
- /technical-review [scope] - Code quality review
- /security-audit [scope] - Security analysis
- /architect [feature] - Architecture design

Read CLAUDE.md for full conventions.
```
