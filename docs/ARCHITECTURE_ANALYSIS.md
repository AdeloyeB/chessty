# Comprehensive Architecture Analysis

**Generated from source code analysis — January 2026**
**Branch:** `feature/test-suite-e2e`

---

## Executive Summary

This document provides a complete architectural analysis of the chess betting platform, based entirely on source code inspection (no outdated documentation referenced). The platform is a **real-money chess betting application** combining:

- **Desktop-first delivery** via Tauri (Rust + WebView)
- **Real-time multiplayer** via WebSocket
- **Crypto payments** via USDC on Polygon
- **Community-based moderation** via Arbiter Overwatch system
- **Multi-layer anti-cheat** detection
- **Comprehensive test suite** with E2E and unit tests

**Total codebase:** ~53,000 lines across TypeScript, Rust, and SQL
**Database tables:** 30 tables across 4 schema files
**Services:** 47 TypeScript service files + 4 Rust modules
**Test files:** 24 test files with ~190+ test cases

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TURBOREPO MONOREPO                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                           APPS LAYER                                        │ │
│  ├────────────────┬─────────────────────┬─────────────────────────────────────┤ │
│  │                │                     │                                      │ │
│  │  apps/server   │    apps/web         │    apps/desktop                      │ │
│  │  (Bun.js)      │    (Next.js 16)     │    (Tauri + Rust)                    │ │
│  │                │                     │                                      │ │
│  │  • HTTP API    │  • React 19 UI      │  • Native Window Chrome              │ │
│  │  • WebSocket   │  • Zustand Stores   │  • Stockfish Sidecar                 │ │
│  │  • Drizzle ORM │  • Custom Hooks     │  • Anti-Cheat (Rust)                 │ │
│  │  • Event Bus   │  • Tailwind CSS     │  • Secure Storage                    │ │
│  │                │                     │                                      │ │
│  └────────┬───────┴──────────┬──────────┴─────────────────────────────────────┘ │
│           │                  │                                                   │
│           │    ┌─────────────┴─────────────┐                                    │
│           │    │        IPC Bridge          │                                    │
│           │    │   (Tauri invoke())         │                                    │
│           │    └─────────────┬─────────────┘                                    │
│           │                  │                                                   │
│  ┌────────┴──────────────────┴─────────────────────────────────────────────────┐│
│  │                         PACKAGES LAYER                                       ││
│  ├─────────────────────────────────┬────────────────────────────────────────────┤│
│  │                                 │                                            ││
│  │  packages/shared                │  packages/chess-engine                     ││
│  │                                 │                                            ││
│  │  • Zod Schemas (50+ types)      │  • Pure TypeScript Engine                  ││
│  │  • WebSocket Message Types      │  • Zero Dependencies                       ││
│  │  • Constants & Enums            │  • FEN Parsing/Generation                  ││
│  │  • Type Exports                 │  • Legal Move Generation                   ││
│  │                                 │  • SAN Notation                            ││
│  │                                 │  • Checkmate/Draw Detection                ││
│  └─────────────────────────────────┴────────────────────────────────────────────┘│
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ PostgreSQL + Redis
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                           │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────────────┐     ┌─────────────────────────┐                     │
│  │      PostgreSQL         │     │         Redis           │                     │
│  │                         │     │                         │                     │
│  │  • 26 Tables            │     │  • Game State Cache     │                     │
│  │  • 4 Schema Domains     │     │  • Session Storage      │                     │
│  │  • Drizzle Migrations   │     │  • Rate Limiting        │                     │
│  │  • Row-Level Locking    │     │  • Pub/Sub Events       │                     │
│  │                         │     │                         │                     │
│  └─────────────────────────┘     └─────────────────────────┘                     │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
the-chess-game/
├── apps/
│   ├── server/                    # Bun.js backend (23,000+ lines)
│   │   └── src/
│   │       ├── drizzle/           # Database schemas (4 files)
│   │       │   ├── pg-schema.ts       # Core tables (users, games, bets, etc.)
│   │       │   ├── anticheat-schema.ts # Anti-cheat tables
│   │       │   ├── overwatch-schema.ts # Arbiter system tables
│   │       │   └── settlement-schema.ts # Settlement tables
│   │       ├── events/            # Event-driven architecture
│   │       │   ├── emitter.ts         # GameEventEmitter singleton
│   │       │   ├── types.ts           # 30+ typed events
│   │       │   └── handlers/          # Event handlers
│   │       ├── services/          # Business logic (47 files)
│   │       │   ├── anticheat/         # Engine & behavior analysis
│   │       │   ├── overwatch/         # Arbiter review system
│   │       │   ├── settlement/        # Game payouts & disputes
│   │       │   └── *.ts               # Individual services
│   │       ├── websocket/         # Real-time communication
│   │       │   ├── handler.ts         # Message routing
│   │       │   ├── coordinators/      # Game & challenge logic
│   │       │   └── managers/          # Connections & rooms
│   │       ├── routes/            # HTTP API endpoints
│   │       ├── middleware/        # Auth, rate limiting
│   │       └── utils/             # Helpers, transactions
│   │
│   ├── web/                       # Next.js frontend
│   │   └── src/
│   │       ├── app/               # App Router pages
│   │       ├── components/        # 15 feature directories
│   │       │   ├── analysis/          # Engine analysis UI
│   │       │   ├── chess/             # Board, clocks, moves
│   │       │   ├── dashboard/         # Home views
│   │       │   ├── desktop/           # Tauri-specific chrome
│   │       │   ├── history/           # Game history & stats
│   │       │   ├── marketplace/       # Challenge creation
│   │       │   ├── matchmaking/       # Queue panel
│   │       │   ├── predictions/       # Spectator betting
│   │       │   ├── profile/           # User settings
│   │       │   ├── spectator/         # Multi-game spectating
│   │       │   ├── ui/                # Reusable primitives
│   │       │   └── wallet/            # USDC integration
│   │       ├── store/             # 11 Zustand stores
│   │       ├── hooks/             # 15+ custom hooks
│   │       └── lib/               # Utilities
│   │
│   └── desktop/                   # Tauri desktop app
│       └── src-tauri/
│           └── src/
│               ├── main.rs            # App entry point
│               ├── engine.rs          # Stockfish UCI interface
│               ├── engine_lifecycle.rs # Engine state management
│               ├── anticheat/         # Client-side detection
│               │   ├── mod.rs             # Module coordination
│               │   ├── environment.rs     # Process scanning
│               │   ├── input.rs           # Mouse pattern analysis
│               │   └── network.rs         # Network monitoring
│               └── commands/          # IPC command handlers
│
├── packages/
│   ├── shared/                    # Cross-app types
│   │   └── src/types/index.ts     # 528 lines of Zod schemas
│   └── chess-engine/              # Pure chess logic
│       └── src/index.ts           # 867 lines, zero deps
│
└── docs/                          # Documentation
```

---

## Database Architecture

### Schema Domains

The database is organized into 4 logical domains:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE SCHEMA                                    │
├────────────────────┬───────────────────┬───────────────────┬───────────────────┤
│                    │                   │                   │                   │
│    pg-schema.ts    │ anticheat-schema  │ overwatch-schema  │ settlement-schema │
│    (Core Domain)   │ (Detection)       │ (Moderation)      │ (Payouts)         │
│                    │                   │                   │                   │
│  • users           │ • cheatFlags      │ • overwatchCases  │ • settlements     │
│  • games           │ • gameAnalyses    │ • overwatchArbiters│ • settlementHistory│
│  • bets            │ • playerBehavior  │ • overwatchVerdicts│                   │
│  • transactions    │   Profiles        │ • overwatchCase   │                   │
│  • challenges      │ • reviewTasks     │   Assignments     │                   │
│  • spectator       │ • playerSanctions │                   │                   │
│    Predictions     │ • gameNetwork     │                   │                   │
│  • spectatorChat   │   Activity        │                   │                   │
│  • matchmaking     │ • moveInput       │                   │                   │
│    Queue           │   Validations     │                   │                   │
│  • sessions        │ • detectedSkill   │                   │                   │
│  • userProfiles    │   Shifts          │                   │                   │
│  • userAchievements│                   │                   │                   │
│  • mfaEnrollments  │                   │                   │                   │
│  • mfaTotpUsage    │                   │                   │                   │
│  • moveAnalysis    │                   │                   │                   │
│  • securityAuditLog│                   │                   │                   │
│  • featureFlags    │                   │                   │                   │
│                    │                   │                   │                   │
│  (16 tables)       │  (8 tables)       │  (4 tables)       │  (2 tables)       │
│                    │                   │                   │                   │
└────────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

### Table Relationships

```
users ─────────────┬──────────────── games
  │                │                   │
  │                │                   │
  ├── bets         │                   ├── gameAnalyses
  ├── transactions │                   ├── cheatFlags
  ├── sessions     │                   ├── moveAnalysis
  ├── userProfiles │                   ├── settlementHistory
  ├── userAchievements                 └── overwatchCases
  ├── mfaEnrollments
  ├── spectatorPredictions
  ├── spectatorChat
  ├── matchmakingQueue
  ├── challenges (creator/acceptor)
  ├── playerBehaviorProfiles
  ├── playerSanctions
  └── overwatchArbiters
         │
         └── overwatchVerdicts
             overwatchCaseAssignments
```

### Key Database Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Numeric strings for money** | PostgreSQL `numeric(12,2)` stored as strings prevents JS floating point errors |
| **nanoid() for IDs** | URL-safe, collision-resistant, shorter than UUID |
| **Row-level locks** | `FOR UPDATE` on settlements prevents double-payment races |
| **Atomic balance updates** | SQL-level balance checks (`WHERE balance >= amount`) prevent TOCTOU |
| **JSONB for metadata** | Flexible storage for anti-cheat flags, game analysis details |
| **Indexed by status** | Fast work queue queries for pending cases, settlements |

---

## Event-Driven Architecture

The server uses a typed event emitter pattern for decoupled, extensible logic:

### Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVENT BUS ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────────┐
     │  WebSocket       │
     │  Message Arrives │
     └────────┬─────────┘
              │
              ▼
     ┌──────────────────┐
     │  GameCoordinator │  ─────► Validates move
     │  handleMove()    │  ─────► Updates clock
     └────────┬─────────┘  ─────► Checks game end
              │
              │ emit('game:move_made', payload)
              ▼
     ┌──────────────────┐
     │  GameEventEmitter│  ─────► Typed, singleton
     └────────┬─────────┘
              │
     ┌────────┼────────────────────────────────────┐
     │        │                                    │
     ▼        ▼                                    ▼
┌──────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐
│broadcast │ │persistence │ │anticheat   │ │odds         │
│.ts       │ │.ts         │ │.ts         │ │.ts          │
├──────────┤ ├────────────┤ ├────────────┤ ├─────────────┤
│Send to   │ │Save to DB  │ │Monitor     │ │Recalculate  │
│players & │ │            │ │move        │ │spectator    │
│spectators│ │            │ │patterns    │ │betting odds │
└──────────┘ └────────────┘ └────────────┘ └─────────────┘
```

### Event Types (30+ defined)

```typescript
// Game Lifecycle Events
'game:started'           // New game began
'game:move_made'         // Move executed
'game:ended'             // Game concluded
'game:timeout'           // Clock expired

// Draw Handling
'game:draw_offered'      // Draw proposal
'game:draw_declined'     // Draw rejected
'game:draw_accepted'     // Draw agreed

// Player Events
'player:connected'       // Player online
'player:disconnected'    // Player offline
'player:reconnected'     // Player back

// Spectator Events
'spectator:joined'       // New viewer
'spectator:left'         // Viewer left
'spectate:game_state'    // State sync

// Challenge Events
'challenge:created'      // New challenge
'challenge:accepted'     // Challenge taken
'challenge:cancelled'    // Challenge removed

// Clock Events
'clock:tick'             // Timer update
'clock:low'              // Under 30 seconds

// Achievement Events
'achievement:unlocked'   // New achievement

// Anti-Cheat Events
'anticheat:suspicion_flag'   // Suspicious behavior
'anticheat:game_flagged'     // Game marked suspicious
'anticheat:review_required'  // Needs manual review
```

---

## Anti-Cheat System Architecture

### Three-Layer Detection Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ANTI-CHEAT ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: CLIENT-SIDE (Rust/Tauri)                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  │ │
│  │  │  ENVIRONMENT      │  │  INPUT PHYSICS    │  │  NETWORK          │  │ │
│  │  │  (environment.rs) │  │  (input.rs)       │  │  (network.rs)     │  │ │
│  │  ├───────────────────┤  ├───────────────────┤  ├───────────────────┤  │ │
│  │  │ • Process scan    │  │ • Mouse path      │  │ • Request timing  │  │ │
│  │  │ • Chess engines   │  │   recording       │  │ • Chess API calls │  │ │
│  │  │ • Screen sharing  │  │ • Path linearity  │  │ • WebSocket       │  │ │
│  │  │ • Automation      │  │ • Micro-correct   │  │   connections     │  │ │
│  │  │ • Debuggers       │  │ • Hesitations     │  │ • Domain tracking │  │ │
│  │  │ • OCR tools       │  │ • Velocity curve  │  │                   │  │ │
│  │  │                   │  │                   │  │                   │  │ │
│  │  │ Risk: 0-100       │  │ Flags: array      │  │ Summary: stats    │  │ │
│  │  └───────────────────┘  └───────────────────┘  └───────────────────┘  │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      │ Per-move telemetry sent to server     │
│                                      ▼                                       │
│  LAYER 2: SERVER-SIDE ANALYSIS (TypeScript)                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  │ │
│  │  │  ENGINE ANALYSIS  │  │  BEHAVIOR ANALYSIS│  │  SKILL SHIFT      │  │ │
│  │  │  (engine-analysis)│  │  (behavior-analy.)│  │  (skill-shift.ts) │  │ │
│  │  ├───────────────────┤  ├───────────────────┤  ├───────────────────┤  │ │
│  │  │ • Stockfish eval  │  │ • Timing patterns │  │ • CPL over time   │  │ │
│  │  │ • Centipawn loss  │  │ • Player profile  │  │ • Sudden improve  │  │ │
│  │  │ • Top move rate   │  │ • Historical data │  │ • Inconsistency   │  │ │
│  │  │ • Critical moves  │  │ • Anomaly score   │  │                   │  │ │
│  │  │ • Game phases     │  │                   │  │                   │  │ │
│  │  └───────────────────┘  └───────────────────┘  └───────────────────┘  │ │
│  │                                                                        │ │
│  │  Output: Composite suspicion score (0-100)                             │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      │ Score > 95% triggers review           │
│                                      ▼                                       │
│  LAYER 3: HUMAN REVIEW (Arbiter Overwatch)                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  • 5-7 Arbiters assigned per case (diverse ELO ranges)                 │ │
│  │  • Vote on: Engine Assistance, Input Automation, External Assistance   │ │
│  │  • Weighted votes based on arbiter accuracy scores                     │ │
│  │  • 75% agreement threshold for guilty verdict                          │ │
│  │  • 20% calibration cases to measure accuracy                           │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Suspicion Score Thresholds

| Score | Action | Priority |
|-------|--------|----------|
| 0-94 | Auto-settle (clean) | N/A |
| 95-97 | Hold for review | Normal |
| 98-99 | Hold for review | High |
| 99+ | Hold + restrict player | Urgent |

### Input Pattern Analysis Metrics

```typescript
// Human vs Bot Detection
{
  pathLinearity: number,     // Humans: <0.8, Bots: >0.95
  microCorrections: number,  // Humans: 2+, Bots: 0
  hesitations: number,       // Humans: 1+, Bots: 0
  velocityCurve: string,     // Humans: bell curve, Bots: flat
  focusMaintained: boolean   // Did user alt-tab?
}
```

---

## Settlement System Architecture

### Settlement State Machine

```
                              ┌─────────────────┐
                              │     CREATED     │
                              │   (pending)     │
                              └────────┬────────┘
                                       │
                              evaluateGame()
                                       │
                                       ▼
                              ┌─────────────────┐
                              │   EVALUATED     │
                              │                 │
                              └────────┬────────┘
                                       │
                              decideSettlement()
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
           ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
           │  Score < 95   │  │ Score 95-98   │  │  Score > 98   │
           │  AUTO SETTLE  │  │ HIGH PRIORITY │  │    URGENT     │
           └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
                   │                  │                  │
           settleGame()        holdForReview()   holdForReview()
                   │                  │           + restrictPlayer()
                   ▼                  │                  │
           ┌───────────────┐          └─────────┬────────┘
           │   SETTLED     │                    │
           │  (terminal)   │                    ▼
           └───────────────┘          ┌─────────────────┐
                                      │    DISPUTED     │
                                      │ (awaiting review│
                                      └────────┬────────┘
                                               │
                    ┌──────────────────────────┼──────────────────┐
                    │                          │                  │
                    ▼                          ▼                  ▼
           ┌───────────────┐          ┌───────────────┐  ┌───────────────┐
           │ 48hr TIMEOUT  │          │    GUILTY     │  │   INNOCENT    │
           │  (no verdict) │          │   verdict     │  │    verdict    │
           └───────┬───────┘          └───────┬───────┘  └───────┬───────┘
                   │                          │                  │
           handleTimeout()           resolveDispute()   resolveDispute()
                   │                          │                  │
                   │                   ┌──────┴──────┐           │
                   │                   │             │           │
                   ▼                   ▼             ▼           ▼
           ┌───────────────┐  ┌───────────────┐ ┌─────────┐ ┌───────────┐
           │Pay original   │  │Pay victim     │ │Apply    │ │Pay winner │
           │winner (safety)│  │(compensation) │ │sanction │ │           │
           └───────┬───────┘  └───────────────┘ └─────────┘ └───────────┘
                   │                          │                  │
                   └──────────────────────────┼──────────────────┘
                                              │
                                              ▼
                                      ┌───────────────┐
                                      │   RESOLVED    │
                                      │  (terminal)   │
                                      └───────────────┘
```

### Double-Payment Prevention

```typescript
// Race condition protection via intermediate lock state
async function resolveDispute(settlementId: string, verdict: string) {
  await withTransaction(async (tx) => {
    // 1. Row-level lock
    const [settlement] = await tx.select()
      .from(settlements)
      .where(eq(settlements.id, settlementId))
      .for('update');  // PostgreSQL row lock

    // 2. Check not already resolving (concurrent process check)
    if (settlement.status === 'resolving') {
      return; // Silently skip (idempotent)
    }

    // 3. Lock before payout
    await tx.update(settlements)
      .set({ status: 'resolving' });

    // 4. Execute payout
    await walletService.awardWinnings(...);

    // 5. Mark complete
    await tx.update(settlements)
      .set({ status: 'resolved' });
  });
}
```

---

## Arbiter Overwatch System

### CS:GO Overwatch-Inspired Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARBITER OVERWATCH FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CASE CREATION                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Game flagged (suspicion > 95%)                                      │   │
│  │       ↓                                                              │   │
│  │  Create overwatchCases record                                        │   │
│  │  • gameId, suspectPlayerId, suspicionScore                           │   │
│  │  • priority: normal | high | urgent                                  │   │
│  │  • deadline: now + 48 hours                                          │   │
│  │  • Maybe insert test case (20% chance)                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      ↓                                       │
│  2. ARBITER ASSIGNMENT                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Target: 5-7 arbiters from diverse ELO ranges                        │   │
│  │                                                                      │   │
│  │  ELO Range    │ Target Arbiters │ Why                                │   │
│  │  ─────────────┼─────────────────┼───────────────────────────         │   │
│  │  1400-1599    │ 2               │ Catch obvious tells                │   │
│  │  1600-1799    │ 2               │ Intermediate perspective           │   │
│  │  1800-1999    │ 1               │ Advanced pattern recognition       │   │
│  │  2000+        │ 1               │ Expert-level subtlety detection    │   │
│  │                                                                      │   │
│  │  Exclusions: Players in game, under investigation, suspended         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      ↓                                       │
│  3. VERDICT SUBMISSION                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Each arbiter votes on 3 categories:                                 │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │   │
│  │  │ ENGINE          │  │ INPUT           │  │ EXTERNAL        │       │   │
│  │  │ ASSISTANCE      │  │ AUTOMATION      │  │ ASSISTANCE      │       │   │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤       │   │
│  │  │ Using Stockfish │  │ Bot/script      │  │ Help from       │       │   │
│  │  │ or similar      │  │ playing moves   │  │ another person  │       │   │
│  │  │                 │  │                 │  │                 │       │   │
│  │  │ ○ Insufficient  │  │ ○ Insufficient  │  │ ○ Insufficient  │       │   │
│  │  │ ○ Guilty        │  │ ○ Guilty        │  │ ○ Guilty        │       │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │   │
│  │                                                                      │   │
│  │  + Confidence (1-5) + Optional notes                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      ↓                                       │
│  4. WEIGHTED AGGREGATION                                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  weight = arbiter.scoreAtAssignment  (0.000 to 1.000)                │   │
│  │                                                                      │   │
│  │  For each category:                                                  │   │
│  │    guiltyVotes = sum(weights where verdict == 'guilty')              │   │
│  │    totalWeight = sum(all weights)                                    │   │
│  │    categoryScore = guiltyVotes / totalWeight                         │   │
│  │                                                                      │   │
│  │  overallGuiltyPercentage = max(engine%, automation%, external%)      │   │
│  │                                                                      │   │
│  │  Final Verdict:                                                      │   │
│  │    >= 75%  →  GUILTY                                                 │   │
│  │    <= 25%  →  INNOCENT                                               │   │
│  │    else    →  INCONCLUSIVE (escalate)                                │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      ↓                                       │
│  5. SCORE UPDATES & SANCTIONS                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Arbiter Score Updates:                                              │   │
│  │  • Agree with majority: +0.02 × consensusStrength                    │   │
│  │  • Disagree: -0.05 × consensusStrength (2.5x penalty!)               │   │
│  │  • Test case correct: +50% bonus                                     │   │
│  │  • Test case wrong: -100% penalty (double!)                          │   │
│  │                                                                      │   │
│  │  Player Sanctions (if guilty):                                       │   │
│  │  • 1st offense: 7-day temp ban                                       │   │
│  │  • 2nd offense: 30-day temp ban                                      │   │
│  │  • 3rd+ offense: Permanent ban                                       │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Test Case Calibration System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST CASE SYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PURPOSE: Objectively measure arbiter accuracy without them knowing          │
│                                                                              │
│  Target: 20% of all cases are test cases (1 in 5)                            │
│                                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐         │
│  │  KNOWN GUILTY SOURCE        │    │  KNOWN INNOCENT SOURCE      │         │
│  ├─────────────────────────────┤    ├─────────────────────────────┤         │
│  │ Previous overwatch guilty    │    │ Trusted players:            │         │
│  │ verdicts with sanctions      │    │ • ELO ≥ 2000                │         │
│  │                              │    │ • Games ≥ 200               │         │
│  │ Logic: If they were found    │    │ • Never sanctioned          │         │
│  │ guilty before, their games   │    │                             │         │
│  │ are valid test material      │    │ Logic: Expert-level players │         │
│  │                              │    │ with clean histories are    │         │
│  │                              │    │ extremely unlikely cheaters │         │
│  └─────────────────────────────┘    └─────────────────────────────┘         │
│                                                                              │
│  50% guilty / 50% innocent distribution                                      │
│                                                                              │
│  SCORING IMPACT:                                                             │
│  • Correct on test case: Score delta × 1.5 (50% bonus)                       │
│  • Wrong on test case: Score delta × 2.0 (100% penalty)                      │
│                                                                              │
│  EFFECT: Bad-faith arbiters who vote randomly will fail ~50% of test         │
│  cases, causing rapid score decline and suspension below 0.250               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Zustand Store Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZUSTAND STORES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          CORE STORES                                   │  │
│  ├─────────────────┬─────────────────┬─────────────────┬─────────────────┤  │
│  │   useGameStore  │   useAuthStore  │  useWalletStore │  useFlagsStore  │  │
│  ├─────────────────┼─────────────────┼─────────────────┼─────────────────┤  │
│  │ • Game state    │ • User data     │ • Connection    │ • Feature flags │  │
│  │ • FEN, moves    │ • JWT token     │ • USDC balance  │ • Persisted     │  │
│  │ • Clocks        │ • MFA state     │ • History       │ • Cached 5min   │  │
│  │ • Draw offers   │ • Loading       │ • Dev mode      │                 │  │
│  │ • Queue params  │                 │                 │                 │  │
│  └─────────────────┴─────────────────┴─────────────────┴─────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       FEATURE STORES                                   │  │
│  ├───────────────────┬───────────────────┬───────────────────────────────┤  │
│  │ useChallengeStore │ useSpectatorStore │ useMultiSpectatorStore        │  │
│  ├───────────────────┼───────────────────┼───────────────────────────────┤  │
│  │ • Marketplace UI  │ • Single game     │ • Up to 5 concurrent games    │  │
│  │ • Form data       │ • Legacy support  │ • Grid vs focused view        │  │
│  │ • Confirmation    │                   │ • focusedGameId               │  │
│  │ • Error state     │                   │ • gridGameIds[]               │  │
│  └───────────────────┴───────────────────┴───────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       UTILITY STORES                                   │  │
│  ├─────────────────────┬─────────────────────┬───────────────────────────┤  │
│  │ useSpectatorChat    │ useAnalysisStore    │ useNotificationStore      │  │
│  │ Store               │                     │                           │  │
│  ├─────────────────────┼─────────────────────┼───────────────────────────┤  │
│  │ • Chat messages     │ • Analysis cache    │ • Toast queue             │  │
│  │ • Predictions       │ • Progress tracking │ • Auto-cleanup 5-8s       │  │
│  │ • Input state       │ • Analysis state    │                           │  │
│  └─────────────────────┴─────────────────────┴───────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌─────────────────────────┐                           │
│                        │      COMPONENTS         │                           │
│                        │  (presentation layer)   │                           │
│                        └───────────┬─────────────┘                           │
│                                    │                                         │
│              ┌─────────────────────┼─────────────────────┐                   │
│              │                     │                     │                   │
│              ▼                     ▼                     ▼                   │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│   │   useChessGame   │  │    useWebSocket  │  │      useApi      │          │
│   │     (hook)       │  │      (hook)      │  │      (hook)      │          │
│   ├──────────────────┤  ├──────────────────┤  ├──────────────────┤          │
│   │ • Move validation│  │ • WS connection  │  │ • HTTP requests  │          │
│   │ • Piece selection│  │ • Message routing│  │ • Auth, games    │          │
│   │ • Legal moves    │  │ • Reconnection   │  │ • History, etc.  │          │
│   │ • Promotion UI   │  │ • Event handling │  │                  │          │
│   └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│            │                     │                     │                     │
│            │                     │ Updates stores      │                     │
│            └─────────────────────┼─────────────────────┘                     │
│                                  │                                           │
│                                  ▼                                           │
│                       ┌──────────────────────┐                               │
│                       │    ZUSTAND STORES    │                               │
│                       │   (state container)  │                               │
│                       └──────────────────────┘                               │
│                                  │                                           │
│                                  │ Components subscribe                      │
│                                  │ via useGameStore()                        │
│                                  │                                           │
│                                  ▼                                           │
│                       ┌──────────────────────┐                               │
│                       │     RE-RENDER        │                               │
│                       │  (only subscribed    │                               │
│                       │   values changed)    │                               │
│                       └──────────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## WebSocket Protocol

### Message Types (50+)

```typescript
// Outbound (Client → Server)
'join_queue'           // Enter matchmaking
'leave_queue'          // Exit matchmaking
'game:move'            // Make a move
'game:offer_draw'      // Propose draw
'game:respond_draw'    // Accept/decline draw
'game:resign'          // Forfeit game
'challenge:create'     // Create marketplace challenge
'challenge:accept'     // Take a challenge
'challenge:confirm'    // Confirm challenge start
'challenge:cancel'     // Cancel challenge
'spectate:join'        // Watch a game
'spectate:leave'       // Stop watching
'spectate:multi_add'   // Add game to multi-view
'spectate:multi_remove'// Remove from multi-view
'spectator:chat'       // Send chat message
'spectator:predict'    // Place prediction
'ping'                 // Keepalive

// Inbound (Server → Client)
'queue:joined'         // Confirmed in queue
'queue:left'           // Confirmed out of queue
'queue:match_found'    // Game starting
'game:started'         // Game began
'game:move_made'       // Move executed
'game:clock_update'    // Timer tick
'game:draw_offered'    // Draw proposed
'game:draw_declined'   // Draw rejected
'game:ended'           // Game over
'challenge:created'    // Challenge available
'challenge:accepted'   // Challenge taken
'challenge:confirmed'  // Challenge starting
'challenge:started'    // Challenge game began
'spectate:game_state'  // Current game state
'spectate:error'       // Spectate failed
'spectator:chat_message'// New chat message
'spectator:prediction_placed'// Prediction confirmed
'odds:updated'         // Betting odds changed
'achievement:unlocked' // New achievement
'pong'                 // Keepalive response
'error'                // Error message
```

---

## Tauri Desktop Integration

### IPC Command Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TAURI IPC COMMANDS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FRONTEND (TypeScript)                 BACKEND (Rust)                        │
│  ──────────────────────────           ──────────────────────────             │
│                                                                              │
│  // Dynamic import for SSR safety                                            │
│  const { invoke } = await import('@tauri-apps/api/core');                    │
│                                                                              │
│  // Engine Analysis                                                          │
│  invoke('start_analysis', {            → fn start_analysis(fen, options)     │
│    fen: '...',                             → EngineState::get_or_spawn()     │
│    depth: 20,                              → engine.send("position fen ...")  │
│    multipv: 3                              → engine.send("go depth 20")       │
│  })                                        → parse UCI output                 │
│                                            → Return AnalysisResult            │
│                                                                              │
│  invoke('stop_analysis')               → fn stop_analysis()                  │
│                                            → engine.send("stop")              │
│                                            → Clear pending analysis           │
│                                                                              │
│  // Anti-Cheat (Environment)                                                 │
│  invoke('scan_environment')            → fn scan_environment()               │
│                                            → EnvironmentChecker::scan()       │
│                                            → Check process list               │
│                                            → Return EnvironmentRisk           │
│                                                                              │
│  // Anti-Cheat (Input)                                                       │
│  invoke('start_move_recording', {      → fn start_move_recording(...)        │
│    gameId, moveNumber                      → MoveInputRecorder::start()       │
│  })                                                                          │
│                                                                              │
│  invoke('record_input_point', {        → fn record_input_point(...)          │
│    x, y, timestamp                         → recorder.add_point(...)          │
│  })                                                                          │
│                                                                              │
│  invoke('finish_move_recording', {     → fn finish_move_recording(...)       │
│    destX, destY                            → recorder.finish()                │
│  })                                        → calculate_path_linearity()       │
│                                            → has_micro_corrections()          │
│                                            → Return MoveSource + flags        │
│                                                                              │
│  // Window Controls                                                          │
│  invoke('minimize_window')             → fn minimize_window()                │
│  invoke('maximize_window')             → fn maximize_window()                │
│  invoke('close_window')                → fn close_window()                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Engine Lifecycle Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STOCKFISH ENGINE LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌─────────────────────┐                               │
│                        │   LazyEngineState   │                               │
│                        │   (Rust singleton)  │                               │
│                        └──────────┬──────────┘                               │
│                                   │                                          │
│            ┌──────────────────────┼──────────────────────┐                   │
│            │                      │                      │                   │
│            ▼                      ▼                      ▼                   │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐           │
│   │     IDLE        │   │    RUNNING      │   │   SHUTDOWN      │           │
│   │  (no process)   │   │  (Stockfish up) │   │  (cleanup)      │           │
│   └────────┬────────┘   └────────┬────────┘   └─────────────────┘           │
│            │                     │                                           │
│   get_or_spawn()           Analysis request                                  │
│            │                     │                                           │
│            ▼                     ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  app.shell().sidecar("stockfish")                                   │   │
│   │  ───────────────────────────────                                    │   │
│   │  • Binary at: binaries/stockfish-{target-triple}                    │   │
│   │  • Auto-detect thread count (num_cpus)                              │   │
│   │  • Auto-detect hash size (based on system RAM)                      │   │
│   │  • Send "uci", wait for "uciok"                                     │   │
│   │  • Send options (threads, hash, multipv)                            │   │
│   │  • Send "isready", wait for "readyok"                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   IDLE DETECTION:                                                            │
│   ─────────────────                                                          │
│   • No analysis requests for 5 minutes → Graceful shutdown                   │
│   • Frees ~100MB RAM when not in use                                         │
│   • Next analysis request → Auto-restart                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Testing Infrastructure

### Test Suite Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TESTING ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        E2E TESTS (Playwright)                           ││
│  │  apps/web/e2e/                                                          ││
│  │  ├── auth.spec.ts         (19 tests) - Login, dashboard, logout         ││
│  │  ├── game.spec.ts         (20 tests) - Lobby, practice, navigation      ││
│  │  ├── fixtures/auth.fixture.ts        - Auth helpers                     ││
│  │  └── pages/BasePage.ts               - Page object model                ││
│  │                                                                         ││
│  │  Features:                                                              ││
│  │  • Auto-starts dev server before tests                                  ││
│  │  • Screenshots/videos on failure                                        ││
│  │  • Trace collection for debugging                                       ││
│  │  • Responsive viewport testing (mobile/tablet/desktop)                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    SERVER UNIT TESTS (Bun)                              ││
│  │  apps/server/src/                                                       ││
│  │                                                                         ││
│  │  Services (12 test files):                                              ││
│  │  ├── services/game.test.ts           - Game lifecycle                   ││
│  │  ├── services/wallet.test.ts         - Balance operations               ││
│  │  ├── services/auth.test.ts           - JWT, sessions                    ││
│  │  ├── services/challenge.test.ts      - Challenge creation               ││
│  │  ├── services/settlement/settlement.test.ts (1092 lines!)               ││
│  │  │   └── createSettlement, evaluateGame, decideSettlement               ││
│  │  │   └── settleGame, holdForReview, resolveDispute                      ││
│  │  │   └── handleTimeout, findStuckSettlements, recoverStuck              ││
│  │  │   └── Edge cases & security (race conditions, double-payment)        ││
│  │  ├── services/anticheat/engine-analysis.test.ts                         ││
│  │  └── services/anticheat/behavior-analysis.test.ts                       ││
│  │                                                                         ││
│  │  WebSocket (3 test files):                                              ││
│  │  ├── websocket/GameCoordinator.test.ts                                  ││
│  │  ├── websocket/GameStateManager.test.ts                                 ││
│  │  └── websocket/ClockManager.test.ts                                     ││
│  │                                                                         ││
│  │  Event Handlers (5 test files):                                         ││
│  │  ├── events/handlers/broadcast.test.ts                                  ││
│  │  ├── events/handlers/persistence.test.ts                                ││
│  │  ├── events/handlers/predictions.test.ts                                ││
│  │  ├── events/handlers/anticheat.test.ts                                  ││
│  │  └── events/handlers/settlement.test.ts                                 ││
│  │                                                                         ││
│  │  Redis (4 test files):                                                  ││
│  │  ├── redis/client.test.ts                                               ││
│  │  ├── redis/circuitBreaker.test.ts                                       ││
│  │  ├── redis/recovery.test.ts                                             ││
│  │  └── redis/scripts/loader.test.ts                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    TEST UTILITIES                                       ││
│  │  apps/server/src/__tests__/utils/                                       ││
│  │  ├── fixtures.ts          - Test data factories                         ││
│  │  │   └── createTestUser, createTestGame, createTestChallenge            ││
│  │  │   └── createTestSettlement, createTestOverwatchCase                  ││
│  │  │   └── createTestVerdict, createTestInvestigator                      ││
│  │  │   └── createTestSanction, createTestMoveAnalysis                     ││
│  │  └── mocks.ts             - Service mocks                               ││
│  │      └── createMockRedis, createMockWebSocket                           ││
│  │      └── createMockWalletService, createMockAnticheatService            ││
│  │      └── createMockOverwatchService, createMockSettlementService        ││
│  │      └── createMockNotificationService, createMockEventEmitter          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Running Tests

```bash
# Server unit tests (Bun)
cd apps/server && bun test

# E2E tests (Playwright)
cd apps/web && pnpm test:e2e

# E2E with UI mode (interactive)
cd apps/web && npx playwright test --ui

# Rust tests (Cargo)
cd apps/desktop/src-tauri && cargo test
```

### Test Coverage by Domain

| Domain | Test Files | Coverage Status |
|--------|------------|-----------------|
| **Settlement** | settlement.test.ts (1092 lines) | ✅ Comprehensive |
| **Anti-Cheat (Server)** | engine-analysis, behavior-analysis, anticheat handler | ✅ Good |
| **WebSocket** | GameCoordinator, GameStateManager, ClockManager | ✅ Good |
| **Event Handlers** | broadcast, persistence, predictions, settlement, anticheat | ✅ Good |
| **Redis** | client, circuitBreaker, recovery, scripts | ✅ Good |
| **Auth/Wallet** | auth, wallet, walletAuth.service, walletAuth.routes | ✅ Good |
| **E2E Flows** | auth, game navigation | ✅ Good |
| **Overwatch** | Verdict aggregation, case assignment | ⚠️ Needs tests |
| **Rust Anti-Cheat** | environment, input modules | ⚠️ Partial |

---

## Gap Analysis & Recommendations

### Identified Gaps

| Area | Gap | Severity | Status |
|------|-----|----------|--------|
| **Settlement ↔ Overwatch** | `resolveCase()` doesn't call `settlement.resolveDispute()` | HIGH | ❌ Open |
| **Notifications** | All notification methods log to console only | MEDIUM | ❌ Open |
| **Network Anti-Cheat** | `network.rs` is stub (manual recording only) | LOW | ❌ Open |
| **Settlement Tests** | Needed comprehensive tests for double-payment prevention | HIGH | ✅ **RESOLVED** |
| **E2E Tests** | No Playwright tests existed | MEDIUM | ✅ **RESOLVED** |
| **Overwatch Tests** | Verdict aggregation, case assignment lack tests | HIGH | ❌ Open |
| **API Documentation** | No OpenAPI/Swagger spec | LOW | ❌ Open |
| **Blockchain Integration** | Smart contracts not deployed | HIGH | ❌ Open |
| **Rate Limiting** | WebSocket messages not rate-limited | MEDIUM | ❌ Open |
| **Rust Unit Tests** | Engine lifecycle, anti-cheat modules need more tests | MEDIUM | ⚠️ Partial |

### Recommended Development Priorities

```
CRITICAL (before launch):
───────────────────────
1. Settlement ↔ Overwatch integration (complete the loop)
2. Smart contract deployment (ChessEscrow, GameRegistry)
3. ✅ Settlement service tests — DONE (1092 lines of comprehensive tests)
4. Overwatch service tests (verdict aggregation, case assignment)

HIGH (launch-blocking):
───────────────────────
1. WebSocket rate limiting
2. Notification service (WebSocket push)
3. ✅ E2E test suite — DONE (auth.spec.ts + game.spec.ts)
4. Rust anti-cheat module tests (expand existing coverage)

MEDIUM (post-launch):
────────────────────
1. Network anti-cheat implementation
2. API documentation (OpenAPI)
3. Performance profiling (k6 load testing)
4. Mobile app consideration

LOW (future):
─────────────
1. Tournament system
2. Team/club features
3. Advanced analytics dashboard
4. Spectator leaderboards
```

---

## Security Posture Summary

### Implemented ✅

| Category | Implementation |
|----------|----------------|
| **Authentication** | JWT with refresh tokens, MFA support (TOTP), wallet-based auth (SIWE) |
| **Authorization** | Session validation, feature flags |
| **Money Safety** | Atomic balance updates, row-level locks, resolving lock state |
| **Anti-Cheat** | 3-layer detection, weighted human review, calibration tests |
| **Input Validation** | Zod schemas on all WS messages, HTML sanitization on user text |
| **Audit Trail** | Security audit log, settlement history, verdict records |

### Needs Attention ⚠️

| Category | Issue |
|----------|-------|
| **WebSocket** | No per-user rate limiting on message types |
| **Smart Contracts** | Not deployed (using off-chain balance tracking) |
| **Session** | No IP-based anomaly detection |
| **Withdrawal** | No time-lock for large amounts (>$500) |

---

## Codebase Statistics

### Lines of Code by Component

| Component | Lines | Files | Description |
|-----------|-------|-------|-------------|
| **Server (TypeScript)** | ~23,000 | 120+ | Backend services, WebSocket, events |
| **Web (TypeScript/TSX)** | ~15,000 | 100+ | React components, stores, hooks |
| **Desktop (Rust)** | ~5,000 | 15+ | Tauri commands, anti-cheat, engine |
| **Shared (TypeScript)** | ~1,500 | 5 | Zod schemas, types, constants |
| **Chess Engine (TypeScript)** | ~900 | 1 | Pure chess logic, zero deps |
| **Tests (TypeScript)** | ~5,000 | 22 | Unit tests, E2E tests |
| **Documentation** | ~3,000 | 5 | CLAUDE.md, TESTING_STRATEGY.md, etc. |
| **Total** | **~53,000** | **270+** | |

### Database Tables

| Schema | Tables | Purpose |
|--------|--------|---------|
| pg-schema | 16 | Core (users, games, bets, transactions, challenges) |
| anticheat-schema | 8 | Detection (cheatFlags, gameAnalyses, playerSanctions) |
| overwatch-schema | 4 | Moderation (cases, verdicts, arbiters, assignments) |
| settlement-schema | 2 | Payouts (settlements, settlementHistory) |
| **Total** | **30** | |

### Test Coverage

| Category | Test Files | Approximate Tests |
|----------|------------|-------------------|
| Server Unit Tests | 22 | ~150+ |
| E2E Tests | 2 | ~40 |
| **Total** | **24** | **~190+** |

---

## Conclusion

This codebase represents a **well-architected, production-ready foundation** for a real-money chess betting platform. Key strengths:

1. **Clean separation of concerns** — Event-driven server, domain-specific stores, typed everything
2. **Defense in depth** — Multi-layer anti-cheat with human review fallback
3. **Financial safety** — Atomic operations, lock states, audit trails
4. **Scalable moderation** — Arbiter Overwatch system with incentive alignment
5. **Desktop-first UX** — Native chrome, secure storage, offline engine analysis
6. **Comprehensive testing** — Settlement tests prevent double-payment bugs, E2E tests cover critical flows

### Recent Progress

The codebase has matured significantly with:
- **Settlement service tests** (1092 lines) covering all settlement operations, race conditions, and security edge cases
- **Playwright E2E tests** (565+ lines) covering auth flows, dashboard navigation, game interactions, and error handling
- **Test utilities** (fixtures + mocks) enabling rapid test development

### Remaining Work

Primary gaps center around:
- **Integration completeness** — Settlement ↔ Overwatch loop needs explicit connection
- **Overwatch tests** — Verdict aggregation and case assignment need test coverage
- **Smart contract deployment** — ChessEscrow and GameRegistry contracts
- **Production notifications** — Replace console logging with WebSocket push

With these addressed, the platform is ready for beta testing with real users and real funds.

---

*Generated by architectural analysis of source code. No external documentation referenced.*
*Last updated: January 2026 • Branch: `feature/test-suite-e2e`*
