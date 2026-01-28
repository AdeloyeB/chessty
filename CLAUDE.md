# Chess Game - Development Guidelines

## Communication Style

Always explain new technologies, patterns, and concepts in plain language. The developer is learning core software engineering, so:

- **Break down every new technology** — What it does, why we use it, and how it fits into this project
- **Use analogies** — Compare technical concepts to real-world things when possible
- **Explain the "why" not just the "what"** — Don't just say "use Redis", explain what problem it solves
- **No assumed knowledge** — If introducing something like pub/sub, event emitters, Lua scripts, circuit breakers, etc., explain what they are first
- **Connect to this project** — Always tie explanations back to the chess game specifically

### Working Dynamic

**Claude builds, the developer reviews.** The developer's goal is to become a strong code reviewer and technical decision-maker — not to write every line from scratch.

- **Claude writes the code** and **teaches while building** — explain every new function, syntax pattern, and concept inline. When writing Rust, TypeScript, or any code: annotate what each part does, why it's structured that way, and what the developer should go study to understand it deeper. Be a teacher building something, not just a builder.
- **Claude suggests learning topics** — "Go read about X while I build Y" so learning happens in parallel
- **The developer reviews PRs** — Reads the code, asks questions, requests changes when needed
- **The developer makes final calls** — Architecture decisions, product direction, what ships

---

## Technology Stack

| Technology | What It Is | Why We Use It Here |
|-----------|------------|-------------------|
| **Bun.js** | A fast JavaScript/TypeScript runtime (like Node.js but faster) | Handles WebSocket connections and HTTP requests for the server |
| **Next.js** | A React framework for routing, SSR, and building the web app | Powers our web frontend |
| **Tauri** | Wraps a web app into a desktop app using OS native webview + Rust backend | Desktop app — lightweight (~8MB) and secure (Rust backend). See `docs/ELECTRON_TO_TAURI_MIGRATION.md` |
| **Rust** | Systems programming language (compiled to machine code) | Tauri backend + anti-cheat (tamper-resistant, not readable like JS) |
| **Drizzle ORM** | Write database queries in TypeScript instead of raw SQL | Talks to our database |
| **PostgreSQL** | Production-grade database for concurrent read/writes | Stores users, games, bets |
| **Redis** | In-memory data store (microsecond access) | Game state persistence, multi-server support |
| **Zustand** | Lightweight React state management | Frontend state (game, auth, spectator) |
| **WebSocket** | Persistent two-way browser↔server connection | Real-time moves, clocks, chat |
| **Wagmi/RainbowKit** | Crypto wallet connection libraries | Future on-chain betting |
| **chess.js** | Chess engine library | Move validation, checkmate detection |

---

## Desktop Architecture (Tauri-Only)

**This is a Tauri desktop app. Not a web app with optional desktop support.**

The web code (Next.js/React) runs inside Tauri's webview. There is no separate browser mode for production. The architecture looks like this:

```
┌─────────────────────────────────────────────────────────┐
│                    TAURI DESKTOP APP                     │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │              WEBVIEW (Next.js/React)              │  │
│  │                                                   │  │
│  │   - UI components                                 │  │
│  │   - State management (Zustand)                    │  │
│  │   - Game logic (chess.js)                         │  │
│  │   - WebSocket connection to server                │  │
│  │                                                   │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │ IPC (invoke)                   │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │              RUST BACKEND                         │  │
│  │                                                   │  │
│  │   - Window controls (titlebar)                    │  │
│  │   - Secure storage (tauri-plugin-store)           │  │
│  │   - Stockfish engine (sidecar binary)             │  │
│  │   - Anti-cheat validation                         │  │
│  │   - Deep linking (chessgamble:// protocol)        │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Points

1. **No `isTauri()` checks** — Don't write conditional code that falls back to browser APIs. The app assumes Tauri is always available.

2. **Tauri APIs via IPC** — Call Rust functions from TypeScript using `invoke()`:
   ```typescript
   import { invoke } from '@tauri-apps/api/core';
   const result = await invoke<ReturnType>('rust_command_name', { arg1, arg2 });
   ```

3. **SSR compatibility** — Next.js does server-side rendering. Tauri APIs aren't available during SSR. Use:
   - Dynamic imports: `const { invoke } = await import('@tauri-apps/api/core');`
   - Client-only state: `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`

4. **Desktop chrome** — TitleBar and TickerBar are always rendered (after client mount). No conditional hiding.

### Sidecar Binaries (Stockfish)

Stockfish runs as a sidecar binary managed by Tauri:

- **Config**: `tauri.conf.json` → `bundle.externalBin: ["binaries/stockfish"]`
- **Rust API**: `app.shell().sidecar("stockfish")` (basename only, not full path)
- **Binary location**: `apps/desktop/src-tauri/binaries/stockfish-{target-triple}`

---

## Rust Development

### Cargo Commands
**Always use the `cargo-rust` skill** when running any Cargo commands (`cargo build`, `cargo check`, `cargo test`, etc.). The Claude Code shell doesn't have direct access to Cargo, so use the skill to execute Rust build commands properly.

### Rust Architecture
**Always use the `rust-desktop-applications` skill** when:
- Designing or architecting Rust code for the Tauri desktop app
- Reviewing Rust performance issues
- Planning new Rust features or IPC commands
- Working with async patterns, state management, or platform integration

This skill provides Tauri v2 best practices, async patterns with Tokio, and platform-specific optimizations (M1/M2/M3/M4 Mac, Windows x64, Linux x64).

---

## Development Workflow

### Running the App
```bash
pnpm dev          # Starts web, server, and desktop concurrently
pnpm build        # Build all packages
pnpm dev:desktop  # Run Tauri desktop app (needs web server on port 3000)
```

### Git Workflow

**Always use `/pr` for any git operations** — commits, pushes, pull requests, anything touching GitHub. Never run `git commit`, `git push`, or `gh pr create` manually. The `/pr` command handles everything and enforces standards.

### Error Logging

When fixing errors, log them in `log/YYYY-MM-DD-description.md` with:
- **Error**: The message
- **Root Cause**: Why it happened
- **Fix**: What was changed
- **Files Modified**: Which files

> The `log/` folder is gitignored — local reference only.

---

## Claude Skills

Skills live in `.claude/commands/` — invoke explicitly (`/skill-name`) or describe what you want.

| Skill | Purpose |
|-------|---------|
| `/pr` | Commit, push, and open a PR with standard format |
| `/architect [feature]` | Feature design and implementation planning |
| `/code-review` | Independent PR review |
| `/fetch-review [PR#]` | Fetch Code Rabbit AI review and offer fixes |
| `/technical-review [scope]` | Code quality, performance, architecture review |
| `/security-audit [scope]` | Security vulnerability analysis |
| `/crypto-review [scope]` | Betting mechanics, tokenomics, exploit analysis |
| `/run-tests` | Run the test suite |
| `/nb` | Voice-dictated note-taking via nb CLI |

---

## UI/UX Principles

### No Scrolling Lists
Use pagination instead of scrolling:

```tsx
import { PaginatedList, PaginatedGrid } from '@/components/ui/PaginatedGrid';

<PaginatedGrid items={items} itemsPerPage={6} columns={3}
  renderItem={(item) => <Card item={item} />} />

<PaginatedList items={items} itemsPerPage={10}
  renderItem={(item) => <Row item={item} />} />
```

**Exceptions**: Game boards, chat, dedicated data pages.

### Color System
```
pure-black: #000000    - Backgrounds
off-black: #0a0a0a     - Cards, elevated surfaces
mid: #666666           - Borders, muted elements
mid-light: #888888     - Secondary text
light: #cccccc         - Tertiary text
pure-white: #ffffff    - Primary text, accents
```

### Component Patterns

**Card Container:**
```tsx
<div className="bg-off-black border border-mid/30">
  <div className="p-4 border-b border-mid/30">
    <p className="text-xs font-mono text-mid-light">label</p>
  </div>
  <div className="p-6">{/* content */}</div>
</div>
```

**Button States:**
```tsx
// Selected
"bg-pure-white text-pure-black border-pure-white"
// Unselected
"bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white"
// Disabled
"border-mid/20 text-mid/40 cursor-not-allowed"
```

---

## Server Architecture

Event-driven architecture where game actions trigger events and handlers react independently.

### How a Move Flows

```
Player sends "game:move" via WebSocket
    ↓
handler.ts → GameCoordinator.handleMove()
    ├── Validates turn + move legality
    ├── Updates clock
    └── Emits "game:move_made" event
                ↓
        Event Handlers React:
        ├── persistence.ts → Saves to DB
        ├── broadcast.ts → Sends to players/spectators
        └── odds.ts → Recalculates betting odds
```

### Key Directories

```
apps/server/src/
├── events/           # Event emitter + handlers
├── websocket/        # WS modules (handler, coordinators, managers)
├── services/         # Business logic (DB operations)
├── routes/           # HTTP API endpoints
└── drizzle/          # Database schema

packages/
├── chess-engine/     # Pure chess rules
└── shared/           # Shared types and constants
```

---

## Mock Data

All mock data documented in `MOCK_DATA.md`. When adding:
1. Prefix with `MOCK_`
2. Mark with comment block
3. Update `MOCK_DATA.md`

---

## Product Context

**What**: Real-money chess prediction/betting platform for crypto-native users. Players wager USDC, spectators bet on outcomes. Think Polymarket meets Chess.com.

**Target**: Crypto-native chess enthusiasts active on Polymarket, comfortable with Web3 UX, typical stakes $5-$500.

**Platform**: Desktop-first (Tauri), crypto-only payments.

---

## Payment & Regulatory Context

### Traditional Processors Are NOT An Option

| Provider | Status |
|----------|--------|
| Stripe/PayPal/Square/Venmo | ❌ Betting prohibited in ToS |

**Crypto/USDC is required** — permissionless, global, instant settlement, no chargebacks, on-chain transparency.

### Approved Solutions
- **USDC (Polygon)** — Primary deposits/withdrawals
- **Coinbase Commerce / MoonPay / Transak** — Fiat on-ramps

---

## Security Requirements (MANDATORY)

Real-money platform. Security failures = users losing funds, legal liability.

### Database Operations (Money)

**NEVER read-then-write (race condition vulnerable):**
```typescript
// ❌ VULNERABLE
const balance = await getBalance(userId);
if (balance >= amount) await updateBalance(userId, balance - amount);
```

**ALWAYS atomic updates:**
```typescript
// ✅ SAFE
const result = await db.update(users)
  .set({ balance: sql`balance - ${amount}` })
  .where(and(eq(users.id, userId), sql`balance >= ${amount}`))
  .returning();
if (result.length === 0) throw new Error('Insufficient balance');
```

### Smart Contract Security

| Requirement | Implementation |
|-------------|----------------|
| Multi-signature | Gnosis Safe (2-of-3 minimum) |
| Time-locks | 48hr delay on admin functions |
| Withdrawal delays | 24hr for amounts > $500 |
| Rate limits | Daily settlement caps |
| Emergency pause | Guardian wallet freeze |
| Third-party audit | Required before mainnet |

### Secrets Management

- **Dev**: `.env.local` (gitignored)
- **Production**: Doppler or AWS Secrets Manager
- **NEVER** hardcode keys, commit `.env`, or log secrets

---

## Blockchain Architecture (Polygon)

**Why Polygon**: Low fees (~$0.01), fast finality (~2s), native USDC, EVM compatible.

### Contract Architecture

```
GNOSIS SAFE (2-of-3 multi-sig)
    ↓ owns
ChessEscrow.sol
    - Holds USDC deposits
    - Locks stakes, settles games
    - Rate limits, time-locks, emergency pause
    ↓ records
GameRegistry.sol
    - Immutable game results
    - Dispute verification
```

### Settlement Flow

1. Game ends → Server determines winner (off-chain)
2. `ChessEscrow.settleGame()` → Verifies, calculates payout, updates balance
3. `GameRegistry.recordResult()` → Stores immutable record
4. User withdraws → Instant (<$500) or 24hr time-lock (≥$500)
