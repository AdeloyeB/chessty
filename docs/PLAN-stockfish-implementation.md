# Implementation Plan: Standard Stockfish Integration

**Status**: Ready for implementation
**Estimated Effort**: 5 parallel workstreams
**Dependencies**: Tauri desktop app (already set up)

---

## Full Review Summary

### What We Have Now

| Component | Location | Purpose | Lines |
|-----------|----------|---------|-------|
| `ChessEngine` | `packages/chess-engine/` | Move validation, FEN, SAN generation | 867 |
| `games.moves` | PostgreSQL JSONB | Stores all moves per game | - |
| `opening` field | `games` table | Opening name string | - |

### What Stockfish Adds

| Capability | Current | With Stockfish |
|------------|---------|----------------|
| Move validation | ✅ ChessEngine | ✅ Keep ChessEngine (faster) |
| Position evaluation | ❌ None | ✅ Centipawn scores |
| Best move calculation | ❌ None | ✅ Engine recommendations |
| Move classification | ❌ None | ✅ Blunder/mistake/good/best |
| Accuracy percentage | ❌ None | ✅ Per-player accuracy |

### Critical Finding: Keep ChessEngine

**Stockfish CANNOT replace ChessEngine for real-time play.**

| Use Case | ChessEngine | Stockfish |
|----------|-------------|-----------|
| Move validation latency | ~1ms | ~100-500ms |
| WebSocket roundtrip budget | 40ms max | ❌ Too slow |
| FEN generation | ✅ Built-in | ❌ Not designed for this |
| SAN notation | ✅ Built-in | ❌ Returns UCI only |
| Stateful history | ✅ Yes | ❌ Stateless |

**Conclusion**:
- **ChessEngine** = Real-time gameplay (keep 100%)
- **Stockfish** = Post-game analysis only (new addition)

---

## What to Remove

**Nothing needs to be removed.** ChessEngine and Stockfish serve different purposes:

| Component | Action | Reason |
|-----------|--------|--------|
| `packages/chess-engine/` | **KEEP** | Required for real-time move validation |
| `packages/shared/src/chess/` | **KEEP** | Re-export layer, used everywhere |
| Any chess.js imports | N/A | None exist in codebase |

---

## What to Add

### 1. Stockfish Integration (Tauri/Rust)
New files for engine communication and analysis.

### 2. Database Schema Changes
New columns and table for storing analysis results.

### 3. React Hooks & Types
Frontend interface for triggering and displaying analysis.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TAURI APP                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  REAL-TIME GAMEPLAY (existing)          POST-GAME ANALYSIS (new)│
│  ┌─────────────────────────┐            ┌─────────────────────┐ │
│  │  ChessEngine (TS)       │            │  Stockfish (Rust)   │ │
│  │  - Move validation      │            │  - Position eval    │ │
│  │  - FEN generation       │            │  - Best move calc   │ │
│  │  - SAN notation         │            │  - Move classify    │ │
│  │  - Game state           │            │  - Accuracy calc    │ │
│  │  ~1ms per operation     │            │  ~1-3s per position │ │
│  └─────────────────────────┘            └─────────────────────┘ │
│           │                                       │             │
│           ▼                                       ▼             │
│  ┌─────────────────────────┐            ┌─────────────────────┐ │
│  │  WebSocket Server       │            │  Tauri Commands     │ │
│  │  (Bun.js)               │            │  (Rust IPC)         │ │
│  └─────────────────────────┘            └─────────────────────┘ │
│           │                                       │             │
│           ▼                                       ▼             │
│  ┌─────────────────────────┐            ┌─────────────────────┐ │
│  │  PostgreSQL             │            │  PostgreSQL         │ │
│  │  - games.moves (JSONB)  │            │  - move_analysis    │ │
│  │  - games.fen            │            │  - games.accuracy   │ │
│  └─────────────────────────┘            └─────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Changes Required

### Option A: Add to `games` table (aggregates only)

```sql
-- Migration: Add analysis columns to games table
ALTER TABLE games ADD COLUMN analysis_engine TEXT;
ALTER TABLE games ADD COLUMN analysis_depth INTEGER;
ALTER TABLE games ADD COLUMN analysis_completed_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN white_accuracy NUMERIC(5,2);
ALTER TABLE games ADD COLUMN black_accuracy NUMERIC(5,2);
ALTER TABLE games ADD COLUMN white_blunders INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN black_blunders INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN white_mistakes INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN black_mistakes INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN white_inaccuracies INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN black_inaccuracies INTEGER DEFAULT 0;
```

### Option B: Create `move_analysis` table (per-move details)

```sql
-- Migration: Create move_analysis table
CREATE TABLE move_analysis (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number INTEGER NOT NULL,
  player_color TEXT NOT NULL CHECK (player_color IN ('white', 'black')),

  -- Engine evaluation
  eval_before INTEGER,           -- Centipawns before move
  eval_after INTEGER,            -- Centipawns after move
  eval_mate_in INTEGER,          -- Mate in N (null if not mate)
  best_move TEXT,                -- Engine's recommended move (UCI)
  best_move_san TEXT,            -- Engine's recommended move (SAN)
  principal_variation JSONB,     -- Array of best continuation moves

  -- Classification
  classification TEXT NOT NULL CHECK (classification IN (
    'brilliant', 'great', 'best', 'excellent', 'good',
    'book', 'inaccuracy', 'mistake', 'blunder'
  )),
  centipawn_loss INTEGER,        -- How much worse than best move

  -- Metadata
  engine_depth INTEGER NOT NULL,
  engine_name TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(game_id, move_number)
);

CREATE INDEX idx_move_analysis_game ON move_analysis(game_id);
CREATE INDEX idx_move_analysis_classification ON move_analysis(classification);
```

### Drizzle Schema (TypeScript)

```typescript
// apps/server/src/drizzle/pg-schema.ts

// Add to games table
analysisEngine: text('analysis_engine'),
analysisDepth: integer('analysis_depth'),
analysisCompletedAt: timestamp('analysis_completed_at', { withTimezone: true }),
whiteAccuracy: numeric('white_accuracy', { precision: 5, scale: 2 }),
blackAccuracy: numeric('black_accuracy', { precision: 5, scale: 2 }),
whiteBlunders: integer('white_blunders').default(0),
blackBlunders: integer('black_blunders').default(0),
whiteMistakes: integer('white_mistakes').default(0),
blackMistakes: integer('black_mistakes').default(0),
whiteInaccuracies: integer('white_inaccuracies').default(0),
blackInaccuracies: integer('black_inaccuracies').default(0),

// New table
export const moveAnalysis = pgTable('move_analysis', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  moveNumber: integer('move_number').notNull(),
  playerColor: text('player_color').notNull(),

  evalBefore: integer('eval_before'),
  evalAfter: integer('eval_after'),
  evalMateIn: integer('eval_mate_in'),
  bestMove: text('best_move'),
  bestMoveSan: text('best_move_san'),
  principalVariation: jsonb('principal_variation').$type<string[]>(),

  classification: text('classification').notNull(),
  centipawnLoss: integer('centipawn_loss'),

  engineDepth: integer('engine_depth').notNull(),
  engineName: text('engine_name').notNull(),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  unique('move_analysis_game_move').on(table.gameId, table.moveNumber),
  index('move_analysis_game_idx').on(table.gameId),
]);
```

---

## Workstreams

### Workstream 1: Stockfish Binaries & Tauri Config

**Goal**: Bundle Stockfish binaries with the Tauri app

**Tasks**:
1. Download official Stockfish 17 binaries for all platforms
   - macOS ARM64: `stockfish-aarch64-apple-darwin`
   - macOS x64: `stockfish-x86_64-apple-darwin`
   - Windows x64: `stockfish-x86_64-pc-windows-msvc.exe`
   - Linux x64: `stockfish-x86_64-unknown-linux-gnu`

2. Create binaries directory:
   ```
   apps/desktop/src-tauri/binaries/
   ├── stockfish-aarch64-apple-darwin
   ├── stockfish-x86_64-apple-darwin
   ├── stockfish-x86_64-pc-windows-msvc.exe
   └── stockfish-x86_64-unknown-linux-gnu
   ```

3. Update `tauri.conf.json`:
   ```json
   {
     "bundle": {
       "externalBin": ["binaries/stockfish"]
     }
   }
   ```

**Files**:
- Create: `apps/desktop/src-tauri/binaries/*`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

---

### Workstream 2: Rust Engine Manager

**Goal**: Implement UCI protocol communication in Rust

**Tasks**:
1. Create `engine.rs` module with `StockfishEngine` struct
2. Implement process spawning using Tauri sidecar API
3. Implement UCI protocol: `uci`, `position fen`, `go depth`, `stop`, `quit`
4. Parse engine output: `info score cp`, `bestmove`
5. Thread-safe state with `tokio::sync::Mutex`

**Data Structures**:
```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EngineEvaluation {
    pub fen: String,
    pub best_move: String,
    pub best_move_san: Option<String>,
    pub score_cp: i32,
    pub score_mate: Option<i32>,
    pub depth: u8,
    pub pv: Vec<String>,
    pub nodes: u64,
    pub time_ms: u64,
}
```

**Files**:
- Create: `apps/desktop/src-tauri/src/engine.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

---

### Workstream 3: Tauri Commands

**Goal**: Expose engine functionality to frontend

**Tasks**:
1. Add engine state to Tauri app state
2. Implement commands:
   - `analyze_position(fen, depth)` → `EngineEvaluation`
   - `analyze_game(fens, depth)` → `Vec<EngineEvaluation>`
   - `stop_analysis()` → `()`
   - `get_engine_info()` → `EngineInfo`
3. Progress events for long-running analysis

**Files**:
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`

---

### Workstream 4: Database Migration

**Goal**: Add analysis storage to PostgreSQL

**Tasks**:
1. Create Drizzle migration for `games` table columns
2. Create Drizzle migration for `move_analysis` table
3. Update shared types to include analysis fields
4. Add database service functions for saving/loading analysis

**Files**:
- Create: `apps/server/src/drizzle/migrations/XXXX_add_analysis.sql`
- Modify: `apps/server/src/drizzle/pg-schema.ts`
- Create: `apps/server/src/services/analysis.ts`
- Modify: `packages/shared/src/types/index.ts`

---

### Workstream 5: React Hook & Types

**Goal**: Create frontend interface for engine analysis

**Tasks**:
1. Add shared types for engine evaluation
2. Create `useEngineAnalysis` hook:
   - `analyzePosition(fen, depth?)` → `EngineEvaluation`
   - `analyzeGame(gameId, depth?)` → `GameAnalysis`
   - `isAnalyzing`, `progress`, `error`
3. Create utility functions:
   - `classifyMove(evalBefore, evalAfter)` → `MoveClassification`
   - `formatEval(scoreCp, scoreMate)` → string
   - `calculateAccuracy(moves)` → `{ white, black }`
4. Create analysis display components (for later UI work)

**Types**:
```typescript
export type MoveClassification =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good'
  | 'book' | 'inaccuracy' | 'mistake' | 'blunder';

export interface AnalyzedMove {
  moveNumber: number;
  san: string;
  uci: string;
  fen: string;
  evaluation: EngineEvaluation;
  classification: MoveClassification;
  evalDelta: number;
  bestMove: string;
  bestMoveSan: string;
}

export interface GameAnalysis {
  gameId: string;
  moves: AnalyzedMove[];
  whiteAccuracy: number;
  blackAccuracy: number;
  summary: {
    whiteBrilliant: number;
    whiteGreat: number;
    whiteBest: number;
    whiteGood: number;
    whiteInaccuracy: number;
    whiteMistake: number;
    whiteBlunder: number;
    blackBrilliant: number;
    blackGreat: number;
    blackBest: number;
    blackGood: number;
    blackInaccuracy: number;
    blackMistake: number;
    blackBlunder: number;
  };
  engineName: string;
  engineDepth: number;
  analyzedAt: Date;
}
```

**Files**:
- Create: `packages/shared/src/types/analysis.ts`
- Modify: `packages/shared/src/types/index.ts`
- Create: `apps/web/src/hooks/useEngineAnalysis.ts`
- Create: `apps/web/src/lib/analysis/moveClassifier.ts`
- Create: `apps/web/src/lib/analysis/evalFormatter.ts`
- Create: `apps/web/src/lib/analysis/accuracyCalculator.ts`

---

## File Summary

### New Files (12)

| File | Workstream | Purpose |
|------|------------|---------|
| `apps/desktop/src-tauri/binaries/stockfish-*` | 1 | Stockfish binaries (4 platforms) |
| `apps/desktop/src-tauri/src/engine.rs` | 2 | Rust engine manager |
| `apps/server/src/drizzle/migrations/XXXX_add_analysis.sql` | 4 | Database migration |
| `apps/server/src/services/analysis.ts` | 4 | Analysis DB operations |
| `packages/shared/src/types/analysis.ts` | 5 | Shared TypeScript types |
| `apps/web/src/hooks/useEngineAnalysis.ts` | 5 | React hook for analysis |
| `apps/web/src/lib/analysis/moveClassifier.ts` | 5 | Move quality classification |
| `apps/web/src/lib/analysis/evalFormatter.ts` | 5 | Eval display formatting |
| `apps/web/src/lib/analysis/accuracyCalculator.ts` | 5 | Accuracy calculation |

### Modified Files (7)

| File | Workstream | Changes |
|------|------------|---------|
| `apps/desktop/src-tauri/tauri.conf.json` | 1 | Add externalBin config |
| `apps/desktop/src-tauri/Cargo.toml` | 2 | Add dependencies |
| `apps/desktop/src-tauri/src/main.rs` | 2, 3 | Register module, commands, state |
| `apps/desktop/src-tauri/src/commands.rs` | 3 | Add analysis commands |
| `apps/server/src/drizzle/pg-schema.ts` | 4 | Add analysis columns + table |
| `packages/shared/src/types/index.ts` | 5 | Export analysis types |

### Files NOT Changed (Kept As-Is)

| File | Reason |
|------|--------|
| `packages/chess-engine/*` | Required for real-time validation |
| `packages/shared/src/chess/*` | Re-export layer, no changes needed |
| `apps/server/src/websocket/GameStateManager.ts` | Uses ChessEngine, unchanged |
| `apps/web/src/hooks/useChessGame.ts` | Uses ChessEngine, unchanged |

---

## Parallel Execution

```
Workstream 1 (Binaries)     ████████░░░░░░░░░░░░
Workstream 4 (Database)     ████████████░░░░░░░░  ← Can run with 1
Workstream 5 (React/Types)  ████████████████████  ← Can run with 1, 4
Workstream 2 (Rust Engine)  ░░░░████████████░░░░  ← Needs 1 done
Workstream 3 (Commands)     ░░░░░░░░████████░░░░  ← Needs 2 done
```

**Parallel Groups**:
- **Group A** (Day 1): Workstream 1 + Workstream 4 + Workstream 5 (independent)
- **Group B** (Day 2): Workstream 2 (needs binaries from WS1)
- **Group C** (Day 2-3): Workstream 3 (needs engine from WS2)

---

## Move Classification Thresholds

```typescript
// Based on Chess.com / Lichess standards
function classifyMove(evalBefore: number, evalAfter: number, wasBestMove: boolean): MoveClassification {
  const delta = evalAfter - evalBefore;
  const isWhiteMove = /* determine from move number */;
  const adjustedDelta = isWhiteMove ? delta : -delta; // Normalize: positive = good for moving player

  if (wasBestMove && adjustedDelta >= 200) return 'brilliant';  // Best move in complex position
  if (wasBestMove && adjustedDelta >= 100) return 'great';      // Best move, strong swing
  if (wasBestMove) return 'best';                                // Engine's top choice
  if (adjustedDelta >= -10) return 'excellent';                  // Within 0.1 pawn of best
  if (adjustedDelta >= -25) return 'good';                       // Within 0.25 pawn
  if (adjustedDelta >= -50) return 'good';                       // Reasonable
  if (adjustedDelta >= -100) return 'inaccuracy';                // -0.5 to -1.0 pawn
  if (adjustedDelta >= -300) return 'mistake';                   // -1.0 to -3.0 pawns
  return 'blunder';                                               // > -3.0 pawns
}
```

---

## Success Criteria

- [ ] Stockfish bundled for Mac ARM, Mac Intel, Windows, Linux
- [ ] `analyze_position` returns eval within 5s at depth 20
- [ ] `analyze_game` processes 40-move game in under 60s
- [ ] Analysis results saved to PostgreSQL
- [ ] `move_analysis` table stores per-move evaluations
- [ ] `games` table stores accuracy summaries
- [ ] ChessEngine unchanged and still working for real-time play
- [ ] TypeScript types match Rust structs and DB schema

---

## Testing Strategy

1. **Unit Tests**
   - `engine.rs`: UCI parsing, output handling
   - `moveClassifier.ts`: Classification thresholds
   - `accuracyCalculator.ts`: Accuracy formula

2. **Integration Tests**
   - Spawn Stockfish, analyze known position, verify expected eval range
   - Save analysis to DB, retrieve and verify structure
   - Analyze full game, verify all moves classified

3. **Manual Testing**
   - Play a game in LocalGame, end it, verify it saves to history
   - Open game detail, trigger analysis, verify results display
   - Check DB has correct analysis data

---

## Future Enhancements (Out of Scope)

- Analysis caching in IndexedDB (for offline viewing)
- Background analysis job (analyze all unanalyzed games)
- Fair play detection (flag suspicious accuracy patterns)
- Analysis sharing (export PGN with evaluations)
- Opening book integration
- Tablebase integration (endgame databases)
