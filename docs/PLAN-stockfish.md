# Plan: Stockfish Chess Engine Integration

**Status**: Architecture research complete, pending implementation decision
**Related**: PLAN-analysis-board.md (depends on this)

---

## What is Stockfish?

Stockfish is the **world's strongest open-source chess engine** — software that can analyze any chess position and determine:
1. Who's winning (numerical score)
2. The best move to play
3. The sequence of optimal moves (principal variation)

Think of it as an AI "chess brain" that's been refined over 15+ years by a global community of programmers and chess experts.

---

## How Stockfish Works

### The Three Core Systems

```
┌─────────────────────────────────────────────────────────────┐
│                      STOCKFISH ENGINE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  MOVE GENERATOR │    │     SEARCH      │                │
│  │                 │    │                 │                │
│  │ "What moves are │───▶│ "Let me think   │                │
│  │  legal here?"   │    │  20 moves ahead"│                │
│  │                 │    │                 │                │
│  │ Uses bitboards  │    │ Alpha-beta      │                │
│  │ (64-bit math)   │    │ pruning         │                │
│  └─────────────────┘    └────────┬────────┘                │
│                                  │                          │
│                                  ▼                          │
│                    ┌─────────────────────────┐              │
│                    │      EVALUATION         │              │
│                    │                         │              │
│                    │  "This position is      │              │
│                    │   +1.5 for white"       │              │
│                    │                         │              │
│                    │  Uses NNUE neural       │              │
│                    │  network (50KB)         │              │
│                    └─────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Bitboards: Why Stockfish is Fast

A chessboard has **64 squares**. Modern CPUs have **64-bit registers**. Stockfish exploits this:

```
One 64-bit integer = entire board state for one piece type

Example: All white pawns
00000000
00000000
00000000
00000000
00000000
00000000
11111111  ← Pawns on rank 2
00000000

Moving a piece = simple bit shift
Checking attacks = bitwise AND/OR
All operations are O(1) — instant
```

Result: Stockfish analyzes **60+ million positions per second** on modern hardware.

### NNUE: The Neural Network Brain

**Before NNUE (2020):**
- Hand-coded rules: "A knight = 300 points, rook = 500 points"
- Chess masters manually tuned evaluation formulas
- Limited by human understanding

**After NNUE:**
- Tiny neural network (50KB) trained on millions of positions
- Learns piece values, positioning, tactics automatically
- **Efficiently Updatable**: After each move, only recalculates affected parts
- Self-improving: Train on more games → better evaluation

---

## UCI Protocol

UCI (Universal Chess Interface) is how programs talk to Stockfish — simple text over stdin/stdout:

```
You send:    position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
You send:    go depth 20
Engine says: info depth 15 score cp 25 pv e7e5 Nf3 Nc6
             info depth 20 score cp 32 pv e7e5 Nf3 Nc6
             bestmove e7e5

Translation:
- "position fen ..." = Here's the board
- "go depth 20" = Think 20 moves deep
- "score cp 32" = White ahead by 0.32 pawns (cp = centipawns, 100 = 1 pawn)
- "bestmove e7e5" = The best move is e7 to e5
```

---

## Stockfish vs Our Current Chess Engine

| Capability | Our `chess-engine` | Stockfish |
|------------|-------------------|-----------|
| Move validation | ✅ Yes | ✅ Yes |
| Checkmate detection | ✅ Yes | ✅ Yes |
| FEN parsing | ✅ Yes | ✅ Yes |
| Position evaluation | ❌ No | ✅ Yes (centipawn score) |
| Best move calculation | ❌ No | ✅ Yes |
| Move quality analysis | ❌ No | ✅ Yes (blunder/mistake/etc) |
| Multi-move lookahead | ❌ No | ✅ Yes (20+ moves) |
| Game analysis | ❌ No | ✅ Yes |
| Speed | Fast (rules only) | 60M positions/sec |

**Bottom line:** Our engine knows the **rules**. Stockfish understands **quality**.

### What Stockfish Enables

With Stockfish, we can:
1. **Analyze games** — Show users where they blundered
2. **Rate move quality** — Brilliant / Best / Good / Inaccuracy / Mistake / Blunder
3. **Calculate accuracy** — "You played 87% accuracy this game"
4. **Show best lines** — "You should have played Nf3 instead"
5. **Provide eval bars** — Visual indicator of who's winning

Without Stockfish, we can only:
1. Show the moves that were played
2. Detect checkmate/stalemate

---

## Regular Stockfish vs Fairy Stockfish

### Regular Stockfish
- **Focus**: Standard chess only
- **Strength**: Strongest available (~3600+ Elo)
- **Size**: ~10MB binary
- **Variants**: None

### Fairy Stockfish
- **Focus**: Any chess variant
- **Strength**: ~100 Elo weaker on standard chess
- **Size**: ~12MB binary
- **Variants**: 50+ supported (Chess960, Crazyhouse, Xiangqi, Shogi, etc.)

### How Fairy Stockfish Handles Variants

**Configuration-based** (easy, no recompilation):
```ini
# variants.ini
[atomic-chess]
startFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
explosion = true
explosionRadius = 1
```

**Code-based** (complex variants):
```cpp
// variant.cpp
struct Crazyhouse : Variant {
    bool canDrop = true;
    PieceSet dropPieces = ALL_PIECES;
    // Custom rules...
};
```

### Decision: Which to Use?

| Scenario | Recommendation |
|----------|----------------|
| Standard chess only, forever | Regular Stockfish |
| Might want variants later | Fairy Stockfish |
| Need absolute strongest analysis | Regular Stockfish |
| Building variant platform | Fairy Stockfish |

**For our platform**: Start with **Regular Stockfish**. If variants become a priority, switch to Fairy (same UCI interface).

---

## Can AI (Claude) Help Modify Stockfish?

### The Honest Answer: Limited

**What AI CAN help with:**
- Writing the Rust wrapper code (UCI communication)
- Parsing engine output
- Building the Tauri integration
- Writing `variants.ini` configuration for Fairy Stockfish
- Simple code changes to Fairy Stockfish's variant system

**What AI CANNOT realistically help with:**
- Core Stockfish C++ modifications (100k+ lines, highly optimized)
- NNUE neural network training (requires compute infrastructure)
- Performance-critical bitboard operations
- Search algorithm improvements

### Why Modifying Stockfish Is Hard

1. **Bitboard complexity**: All move generation uses 64-bit math with "magic numbers"
2. **NNUE training**: New pieces/rules need millions of analyzed positions
3. **Years of optimization**: Every line has been tuned for performance
4. **Domain expertise**: Chess + C++ + neural networks + parallel computing

### The Practical Path for Variants

```
Option 1: Use Fairy Stockfish (Recommended)
├── Write variants.ini configuration
├── No C++ modifications
├── Works for most custom rules
└── AI CAN help write the config

Option 2: Extend Fairy Stockfish code
├── Modify variant.cpp
├── Follow existing patterns
├── Still no NNUE retraining
└── AI CAN help with guidance

Option 3: Train custom NNUE (Advanced)
├── Requires GPU infrastructure
├── Needs millions of game positions
├── Uses fairy-stockfish/nnue-pytorch
└── AI can help with scripts, not training
```

---

## Tauri Integration Architecture

### Bundling Stockfish

```
apps/desktop/
├── src-tauri/
│   ├── binaries/
│   │   ├── stockfish-aarch64-apple-darwin    # Mac ARM
│   │   ├── stockfish-x86_64-apple-darwin     # Mac Intel
│   │   ├── stockfish-x86_64-pc-windows-msvc  # Windows
│   │   └── stockfish-x86_64-unknown-linux-gnu # Linux
│   ├── src/
│   │   ├── engine.rs    # Stockfish manager
│   │   └── commands.rs  # Tauri commands
│   └── tauri.conf.json  # Bundle config
```

### tauri.conf.json

```json
{
  "bundle": {
    "externalBin": [
      "binaries/stockfish"
    ]
  }
}
```

Tauri automatically selects the correct platform binary at runtime.

### Rust Engine Manager

```rust
// apps/desktop/src-tauri/src/engine.rs

use std::process::{Command, Stdio, Child, ChildStdin, ChildStdout};
use std::io::{Write, BufRead, BufReader};
use tauri::api::process::Command as TauriCommand;

pub struct StockfishEngine {
    process: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
}

impl StockfishEngine {
    pub fn new() -> Result<Self, String> {
        let (mut rx, mut child) = TauriCommand::new_sidecar("stockfish")
            .map_err(|e| e.to_string())?
            .spawn()
            .map_err(|e| e.to_string())?;

        // Initialize UCI
        self.send("uci")?;
        self.wait_for("uciok")?;

        Ok(Self { /* ... */ })
    }

    pub fn analyze(&mut self, fen: &str, depth: u8) -> Result<EngineEvaluation, String> {
        self.send(&format!("position fen {}", fen))?;
        self.send(&format!("go depth {}", depth))?;

        // Parse output until bestmove
        let mut eval = EngineEvaluation::default();
        loop {
            let line = self.read_line()?;
            if line.starts_with("bestmove") {
                eval.best_move = parse_bestmove(&line);
                break;
            }
            if line.starts_with("info") && line.contains("score") {
                eval.score_cp = parse_score(&line);
                eval.depth = parse_depth(&line);
            }
        }
        Ok(eval)
    }
}
```

### Tauri Commands

```rust
// apps/desktop/src-tauri/src/commands.rs

#[derive(serde::Serialize)]
pub struct EngineEvaluation {
    pub fen: String,
    pub best_move: String,
    pub score_cp: i32,
    pub score_mate: Option<i32>,
    pub depth: u8,
    pub pv: Vec<String>,
}

#[tauri::command]
pub async fn analyze_position(
    fen: String,
    depth: u8,
    state: tauri::State<'_, EngineState>,
) -> Result<EngineEvaluation, String> {
    let engine = state.engine.lock().await;
    engine.analyze(&fen, depth)
}

#[tauri::command]
pub async fn analyze_game(
    moves: Vec<String>,
    depth: u8,
    state: tauri::State<'_, EngineState>,
) -> Result<Vec<EngineEvaluation>, String> {
    // Analyze each position in the game
    let mut results = Vec::new();
    let mut fen = STARTING_FEN.to_string();

    for mv in moves {
        let eval = state.engine.lock().await.analyze(&fen, depth)?;
        results.push(eval);
        fen = apply_move(&fen, &mv);  // Update position
    }

    Ok(results)
}
```

### React Hook

```typescript
// apps/web/src/hooks/useEngineAnalysis.ts

import { invoke } from '@tauri-apps/api/tauri';

interface EngineEvaluation {
  fen: string;
  bestMove: string;
  scoreCp: number;
  scoreMate: number | null;
  depth: number;
  pv: string[];
}

export function useEngineAnalysis() {
  const analyzePosition = async (fen: string, depth = 20): Promise<EngineEvaluation> => {
    return invoke('analyze_position', { fen, depth });
  };

  const analyzeGame = async (moves: string[], depth = 20): Promise<EngineEvaluation[]> => {
    return invoke('analyze_game', { moves, depth });
  };

  return { analyzePosition, analyzeGame };
}
```

---

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Engine startup | ~500ms | One-time on app launch |
| Single position (depth 20) | ~1-3s | Depends on complexity |
| Full game (40 moves, depth 20) | ~40-60s | Batch analysis |
| Full game (40 moves, depth 15) | ~15-20s | Faster, slightly less accurate |

### Optimization Strategies

1. **Background analysis**: Start when user opens game detail, show progressively
2. **Cache results**: Store analysis in local DB, don't re-analyze
3. **Adjustable depth**: Let users choose speed vs accuracy
4. **Multi-threaded**: Stockfish uses all CPU cores

---

## Implementation Phases

### Phase 1: Basic Integration (1 week)
- [ ] Download Stockfish binaries for all platforms
- [ ] Configure Tauri sidecar bundling
- [ ] Implement `engine.rs` with UCI communication
- [ ] Add `analyze_position` Tauri command
- [ ] Create `useEngineAnalysis` hook
- [ ] Test single position analysis

### Phase 2: Game Analysis (1 week)
- [ ] Implement `analyze_game` command (batch)
- [ ] Add move classification logic
- [ ] Build analysis caching (IndexedDB)
- [ ] Create progress callback for long analyses

### Phase 3: UI Integration (see PLAN-analysis-board.md)
- [ ] Connect to AnalysisBoard component
- [ ] Display evaluations and classifications
- [ ] Handle loading states
- [ ] Add error handling

---

## Open Questions

1. **Depth setting**: Default to 18 or 20? (trade-off: speed vs accuracy)
2. **Caching strategy**: Cache per game? Per position? TTL?
3. **Multi-threading**: How many Stockfish threads? (CPU cores - 1?)
4. **Fairy Stockfish**: Start with it now for future variants, or switch later?

---

## Resources

- [Stockfish GitHub](https://github.com/official-stockfish/Stockfish)
- [Fairy Stockfish GitHub](https://github.com/fairy-stockfish/Fairy-Stockfish)
- [UCI Protocol Spec](https://www.wbec-ridderkerk.nl/html/UCIProtocol.html)
- [Tauri Sidecar Docs](https://v2.tauri.app/develop/sidecar/)
- [vampirc-uci Rust Crate](https://crates.io/crates/vampirc-uci)
