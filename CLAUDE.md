# Chess Game - Development Guidelines

## Communication Style

Always explain new technologies, patterns, and concepts in plain language. The developer is learning core software engineering, so:

- **Break down every new technology** — What it does, why we use it, and how it fits into this project
- **Use analogies** — Compare technical concepts to real-world things when possible
- **Explain the "why" not just the "what"** — Don't just say "use Redis", explain what problem it solves
- **No assumed knowledge** — If introducing something like pub/sub, event emitters, Lua scripts, circuit breakers, etc., explain what they are first
- **Connect to this project** — Always tie explanations back to the chess game specifically

---

## Technology Stack (What Everything Does)

| Technology | What It Is | Why We Use It Here |
|-----------|------------|-------------------|
| **Bun.js** | A fast JavaScript/TypeScript runtime (like Node.js but faster). Runs our server code. | Handles WebSocket connections and HTTP requests for the chess game server |
| **Next.js** | A React framework that handles routing, server-side rendering, and building the web app | Powers our web frontend (the UI players see) |
| **Electron** | Wraps a web app into a desktop application (like how Discord or VS Code work) | Lets players install the chess game as a desktop app |
| **Drizzle ORM** | A tool that lets you write database queries in TypeScript instead of raw SQL | Talks to our database to store users, games, bets, etc. |
| **SQLite** | A simple file-based database (one file = entire database). Good for development. | Stores all our data locally during development. Will switch to PostgreSQL for production |
| **PostgreSQL** | A production-grade database that handles many users reading/writing at the same time | What we'll use when real users are playing (handles concurrency better than SQLite) |
| **Redis** | An in-memory data store (like a super-fast dictionary that lives in RAM). Data is accessed in microseconds. | Will store active game state (board positions, clocks) so games survive server restarts and we can run multiple servers |
| **Zustand** | A lightweight state management library for React (simpler alternative to Redux) | Keeps the frontend in sync — stores game state, auth, spectator data in the browser |
| **WebSocket** | A persistent two-way connection between browser and server (unlike HTTP which is request/response) | Lets the server push moves, clock updates, and chat messages to players instantly |
| **Wagmi/RainbowKit** | Libraries for connecting crypto wallets (MetaMask, etc.) to a web app | Future on-chain betting and wallet integration |
| **chess.js** | A chess engine library that knows all the rules of chess | Validates moves, detects checkmate/stalemate/draw, generates legal moves |
| **ioredis** | A Node.js/Bun client library for talking to a Redis server | How our server code communicates with Redis (not installed yet, prepared for Phase 3) |

### Architecture Patterns Used

| Pattern | What It Is | Where We Use It |
|---------|------------|-----------------|
| **Event Emitter** | A pattern where code "emits" events (like "a move was made") and other code "listens" for those events and reacts. Like a radio station broadcasting — listeners tune in independently. | `apps/server/src/events/` — Decouples game logic from side effects (broadcasts, achievements, odds) |
| **Circuit Breaker** | A safety pattern that "breaks the circuit" (stops trying) after too many failures, then periodically retries. Like a fuse box in your house. | `apps/server/src/redis/circuitBreaker.ts` — Prevents the server from hanging if Redis goes down |
| **Coordinator/Orchestrator** | A thin "manager" that doesn't do work itself but tells other modules what to do in what order. Like a conductor in an orchestra. | `GameCoordinator.ts` — Validates moves, then tells the clock, state manager, and event system what happened |
| **Lua Scripts (Redis)** | Small programs that run directly inside Redis atomically (all-or-nothing, no interruption). Like a bank transaction that either fully completes or doesn't happen at all. | `apps/server/src/redis/scripts/` — Clock decrements need to be atomic so two ticks can't race each other |
| **Pub/Sub** | A messaging pattern where publishers send messages to a "channel" and subscribers receive them. Neither knows about the other. | Future use — will let multiple server instances broadcast to each other |
| **Monorepo** | Keeping all related projects (server, web, desktop, shared packages) in one Git repository with shared tooling. | Our Turborepo setup at the root — all packages build together |
| **Workspace Packages** | Packages within a monorepo that can depend on each other using `workspace:*` instead of version numbers. Changes are instant (no publishing needed). | `packages/chess-engine/` and `packages/shared/` — the server and web app import from these directly |

---

## Development Workflow

### Electron App
**Always rebuild the Electron app after making changes:**
```bash
pnpm build        # Build all packages
pnpm dev:desktop  # Run Electron app (needs web server on port 3000)
```

Or run everything together:
```bash
pnpm dev          # Starts web, server, and desktop concurrently
```

> **Important**: Hot reload doesn't work reliably for Electron. Always rebuild after UI changes.

### Git Branching (GitHub Flow)

All work happens on feature branches. `main` is protected — no direct pushes, PRs required.

**Branch naming:**

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New functionality | `feature/spectator-chat` |
| `fix/` | Bug fixes | `fix/clock-timeout-leak` |
| `refactor/` | Code restructuring | `refactor/extract-redis` |
| `docs/` | Documentation only | `docs/api-reference` |
| `chore/` | Deps, config, CI | `chore/add-github-actions` |

**Workflow:**
```bash
git checkout -b feature/my-thing    # Create branch
# ... work and commit ...
git push -u origin feature/my-thing # Push
gh pr create                         # Open PR
# After review: squash merge via gh pr merge --squash --delete-branch
```

---

## Session Logging

Always capture clear logs in the `log/` folder. Name files with format: `YYYY-MM-DD-description.md`

Include:
- Summary of changes made
- Files created/modified
- Known issues
- Next steps

### Error Logging

Whenever fixing errors (build failures, runtime errors, type errors, etc.), create or update an error log for the current day in `log/`.

**Format**: `log/YYYY-MM-DD-description.md`

Each error entry should include:
- **Error**: What the error message was
- **Root Cause**: Why it happened (beginner-friendly explanation)
- **Fix**: What was changed to resolve it
- **Files Modified**: Which files were touched

This helps track what broke, why, and how it was fixed — useful for learning and for debugging if similar issues appear later.

> The `log/` folder is in `.gitignore` — it's a local reference only, not committed to GitHub.

---

## Claude Skills

Custom slash commands (skills) are in `.claude/commands/`. These are auto-routable by intent — you don't always need the slash command, just describe what you want.

| Command | Purpose | Example Triggers |
|---------|---------|-----------------|
| `/pr [description]` | Commit, push, and open a PR with standard format | "commit and push", "open a PR", "submit this" |
| `/fetch-review` | Fetch Code Rabbit AI review from GitHub PR | "fetch code review", "what did Code Rabbit say" |
| `/crypto-review` | Crypto/betting mechanics security review | "review the betting logic", "check tokenomics" |
| `/technical-review [scope]` | Code quality, performance, architecture review | "review this code", "check performance" |
| `/security-audit [scope]` | Security vulnerability analysis | "security check", "audit for vulnerabilities" |
| `/architect [feature]` | Feature design and implementation planning | "design the matchmaking system" |
| `/code-review` | Independent PR review (fresh context, no bias) | "review this PR" |

### PR and Commit Workflow (IMPORTANT)

**Always use the `/pr` command** for any commit, push, or PR operations. Do NOT use built-in commit-push-pr skills — they don't follow our standards.

The `/pr` command ensures:
- **Detailed commit messages** — anyone reading the history should understand exactly what happened, why, and what was affected without reading the diff
- Commit messages follow our type prefix convention (`feat:`, `fix:`, `chore:`)
- PR titles use the same type prefix format
- PR body includes Feature, Changes, Bugs/Known Issues, and Testing sections
- Branch naming conventions are validated
- Base branch is always `main`
- Squash merge strategy is documented

---

## UI/UX Principles

### No Scrolling Lists
Avoid requiring users to scroll through lists of items. Use pagination with arrow navigation instead.

**Bad:**
```tsx
// Long scrolling list
<div className="space-y-2">
  {items.map((item) => <ItemCard key={item.id} item={item} />)}
</div>
```

**Good:**
```tsx
// Paginated with arrows
import { PaginatedList, PaginatedGrid } from '@/components/ui/PaginatedGrid';

<PaginatedList
  items={items}
  itemsPerPage={10}
  renderItem={(item) => <ItemCard key={item.id} item={item} />}
/>
```

### When to Use Each Component

| Component | Use Case | Items per Page |
|-----------|----------|----------------|
| `PaginatedGrid` | Cards, achievements, visual items | 6 (3 columns) |
| `PaginatedList` | Vertical lists, leaderboards, transactions | 10 |

### Exceptions (Scrolling Allowed)
- **In-depth data views**: Game statistics, financial data, match history (dedicated pages)
- **Game boards**: Chess board and move history during active games
- **Chat/messages**: Real-time communication

---

## Full-Screen IDE Layout

For immersive experiences (practice mode, game boards), use an IDE/trading-terminal style layout:

```
┌─────────────────────────────────────────────────────────┐
│ NAV BAR (64px)                                          │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│   SIDEBAR    │              MAIN AREA                   │
│   (256px)    │         (chess board, etc.)              │
│              │                                          │
│  - Stats     │                                          │
│  - History   │                                          │
│  - Actions   │                                          │
│              │                                          │
├──────────────┴──────────────────────────────────────────┤
│ STATUS BAR (32px) - session id, time, scores, FEN       │
└─────────────────────────────────────────────────────────┘
```

**Parent container (in Dashboard):**
```tsx
{activeTab === 'practice' ? (
  <main className="h-[calc(100vh-64px)]">
    <LocalGame />
  </main>
) : (
  <main className="container mx-auto px-6 py-8">
    {/* other tabs */}
  </main>
)}
```

**IDE component structure:**
```tsx
<div className="h-full bg-pure-black flex flex-col overflow-hidden">
  {/* Main Content */}
  <div className="flex-1 flex min-h-0">
    {/* Sidebar */}
    <div className="w-64 border-r border-mid/30 flex flex-col bg-off-black">
      {/* Header, Stats, Actions */}
    </div>

    {/* Main Area */}
    <div className="flex-1 flex flex-col min-h-0 bg-pure-black">
      {/* Top bar */}
      <div className="p-3 border-b border-mid/30">...</div>
      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        {/* Responsive square content */}
        <div className="aspect-square max-h-full max-w-full" style={{ height: 'min(100%, calc(100vw - 320px))' }}>
          {/* Chess board, etc. */}
        </div>
      </div>
      {/* Bottom bar */}
      <div className="p-3 border-t border-mid/30">...</div>
    </div>
  </div>

  {/* Status Bar */}
  <div className="h-8 border-t border-mid/30 bg-off-black flex items-center px-3">
    {/* Session info, stats */}
  </div>
</div>
```

---

## CSS Conventions

### Color System
```
pure-black: #000000    - Backgrounds, deepest layer
off-black: #0a0a0a     - Cards, elevated surfaces
mid: #666666           - Borders, muted elements
mid-light: #888888     - Secondary text, labels
light: #cccccc         - Tertiary text
pure-white: #ffffff    - Primary text, accents
```

### Component Patterns

**Card Container:**
```tsx
<div className="bg-off-black border border-mid/30">
  {/* Header */}
  <div className="p-4 border-b border-mid/30">
    <p className="text-xs font-mono text-mid-light">section_label</p>
  </div>
  {/* Content */}
  <div className="p-6">
    {/* ... */}
  </div>
</div>
```

**Button States:**
```tsx
// Selected
className="bg-pure-white text-pure-black border-pure-white"

// Unselected
className="bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white"

// Disabled
className="border-mid/20 text-mid/40 cursor-not-allowed"
```

**Data Cards:**
```tsx
<div className="p-3 bg-pure-black border border-mid/30 text-center">
  <p className="text-lg font-mono text-pure-white">{value}</p>
  <p className="text-xs font-mono text-mid-light">{label}</p>
</div>
```

---

## Reusable Components

### PaginatedGrid
For grid layouts with pagination.

```tsx
import { PaginatedGrid } from '@/components/ui/PaginatedGrid';

<PaginatedGrid
  items={achievements}
  itemsPerPage={6}
  renderItem={(achievement) => <AchievementCard achievement={achievement} />}
  columns={3}           // 1 | 2 | 3 | 4
  emptyMessage="No items"
  showCount             // Shows "X items" above grid
  countLabel="achievements"
/>
```

### PaginatedList
For vertical lists with pagination.

```tsx
import { PaginatedList } from '@/components/ui/PaginatedGrid';

<PaginatedList
  items={leaderboardEntries}
  itemsPerPage={10}
  renderItem={(entry, index) => <LeaderboardRow entry={entry} rank={index + 1} />}
  emptyMessage="No data available"
  gap="sm"              // "sm" | "md"
/>
```

---

## Server Architecture

The server uses an **event-driven architecture** where game actions (like making a move) trigger events, and independent handlers react to those events.

### How a Move Flows Through the System

```
Player sends "game:move" via WebSocket
    │
    ▼
handler.ts (receives message, routes to coordinator)
    │
    ▼
GameCoordinator.handleMove()
    ├── 1. Validates it's your turn (checks database)
    ├── 2. Validates the move is legal (GameStateManager + chess engine)
    ├── 3. Updates the clock (ClockManager)
    └── 4. Emits "game:move_made" event ──────────────────┐
                                                          │
                                              Event Handlers React:
                                              │
                                              ├── Priority 10: persistence.ts
                                              │   └── Saves move to database
                                              │
                                              ├── Priority 50: broadcast.ts
                                              │   └── Sends move to both players + spectators
                                              │
                                              └── Priority 100 (fire-and-forget):
                                                  ├── odds.ts → recalculates betting odds
                                                  └── (future: analytics, Discord, etc.)
```

### Server File Structure

```
apps/server/src/
├── events/                    # Event system (the "radio station")
│   ├── types.ts               # What events exist and their data shapes
│   ├── GameEventEmitter.ts    # The emitter class (broadcasts events)
│   └── handlers/              # Listeners that react to events
│       ├── index.ts           # Registers all handlers at startup
│       ├── broadcast.ts       # Sends WebSocket messages to clients
│       ├── persistence.ts     # Saves data to the database
│       ├── achievements.ts    # Checks if players unlocked achievements
│       ├── odds.ts            # Recalculates betting odds
│       └── predictions.ts     # Settles spectator bets when game ends
│
├── websocket/                 # WebSocket modules (the "game engine")
│   ├── handler.ts             # Entry point - receives WS messages, routes them
│   ├── ConnectionManager.ts   # Tracks who's connected (userId → WebSocket)
│   ├── RoomManager.ts         # Tracks who's in which game/spectating
│   ├── BroadcastService.ts    # Sends messages to users/rooms
│   ├── ClockManager.ts        # Game clocks (start, tick, timeout)
│   ├── GameStateManager.ts    # Chess board state (FEN, moves, draw offers)
│   ├── GameCoordinator.ts     # Orchestrates game flow (move, resign, draw)
│   └── ChallengeCoordinator.ts # Challenge accept/confirm flow
│
├── redis/                     # Redis integration (prepared, not active yet)
│   ├── client.ts              # Connection to Redis server
│   ├── circuitBreaker.ts      # Safety pattern for Redis failures
│   └── scripts/               # Lua scripts for atomic operations
│       ├── clock_tick.lua      # Decrement clock safely
│       └── clock_move.lua      # Add time increment on move
│
├── services/                  # Business logic (database operations)
│   ├── game.ts                # Create/update/end games in DB
│   ├── auth.ts                # Login, register, JWT tokens
│   ├── matchmaking.ts         # Find opponents by ELO/stake
│   ├── betting.ts             # Odds calculation, bet placement
│   ├── achievements.ts        # Unlock tracking
│   └── ...                    # wallet, challenge, spectator, etc.
│
├── routes/                    # HTTP API endpoints (REST)
│   ├── auth.ts                # POST /api/auth/login, etc.
│   ├── games.ts               # GET /api/games/active, etc.
│   └── ...                    # betting, wallet, leaderboard, etc.
│
├── drizzle/                   # Database schema and connection
│   ├── schema.ts              # Table definitions (users, games, bets, etc.)
│   └── index.ts               # Database connection
│
└── index.ts                   # Server entry point (starts HTTP + WebSocket)
```

### Package Structure

```
packages/
├── chess-engine/              # Pure chess rules (zero dependencies on anything else)
│   └── src/index.ts           # ChessEngine class: validates moves, detects checkmate
│
└── shared/                    # Shared types and constants used by ALL apps
    ├── src/types/             # TypeScript interfaces (Move, Game, User, etc.)
    ├── src/constants/         # Shared values (CLOCK_SYNC_INTERVAL, etc.)
    └── src/chess/index.ts     # Re-exports chess-engine for backward compatibility
```

---

## File Organization

```
apps/web/src/components/
├── ui/                 # Reusable primitives
│   └── PaginatedGrid.tsx
├── profile/            # Profile-related components
├── dashboard/          # Dashboard components
├── chess/              # Game board, moves
├── wallet/             # Balance, transactions
└── marketplace/        # Challenges, matchmaking
```

---

## Mock Data

All mock data is documented in `MOCK_DATA.md`.

When adding mock data:
1. Use clear constant names prefixed with `MOCK_`
2. Add comment block marking the mock data section
3. Update `MOCK_DATA.md` with location and structure
4. Plan the API endpoint that will replace it

```tsx
// ============================================================================
// MOCK DATA - See MOCK_DATA.md for all mock data locations
// ============================================================================
const MOCK_EXAMPLE = {
  // ...
};
// ============================================================================
```
