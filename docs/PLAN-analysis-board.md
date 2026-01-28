# Plan: Game Replay / Analysis Board

**Status**: Architecture designed, pending Stockfish integration research
**Dependencies**: Stockfish engine integration (see PLAN-stockfish.md when created)

---

## Overview

Add a full-featured game replay and analysis board that allows players to review completed games move-by-move with engine evaluation. This transforms the existing basic replay in `GameDetailDrawer` into a comprehensive analysis tool.

---

## Architecture

### Desktop-Only (Tauri + Native Stockfish)

```
┌─────────────────────────────────────────────────────────────┐
│                     TAURI DESKTOP APP                       │
├─────────────────────────────────────────────────────────────┤
│  React Frontend                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AnalysisBoard Component                             │   │
│  │  - Board display with eval bar                       │   │
│  │  - Move list with classifications                    │   │
│  │  - Navigation controls                               │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │ invoke('analyze_game', {moves})   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Rust Backend (src-tauri)                           │   │
│  │  - engine.rs: Stockfish process management          │   │
│  │  - UCI protocol communication                       │   │
│  │  - Batch analysis for entire game                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Bundled Stockfish Binary (~10MB)                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## UI Components

### AnalysisBoard Layout

```
┌────────────────────────────────────────────────────────────────┐
│  ← back to history                          [settings] [export]│
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────┐  ┌────────────────────────┐  ┌────────────────────┐ │
│  │      │  │                        │  │ MOVE LIST          │ │
│  │ EVAL │  │                        │  │                    │ │
│  │ BAR  │  │      CHESS BOARD       │  │ 1. e4    e5       │ │
│  │      │  │                        │  │ 2. Nf3 ⚠ Nc6      │ │
│  │ +1.2 │  │                        │  │ 3. Bb5   a6  ✓    │ │
│  │      │  │                        │  │ 4. Ba4   Nf6      │ │
│  │      │  └────────────────────────┘  │ 5. O-O ★ Be7      │ │
│  │      │                              │ ...                │ │
│  │      │  ┌────────────────────────┐  │                    │ │
│  │      │  │ ⏮ ◀ ▶ ⏭  ▶️ auto     │  │ ★ Best  ✓ Good    │ │
│  └──────┘  └────────────────────────┘  │ ⚠ Mistake ? Blunder│ │
│                                         └────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│  Engine: Stockfish 16 • Depth 20 • Best: Nf3 (+0.3)           │
└────────────────────────────────────────────────────────────────┘
```

### Move Classification

| Symbol | Class | Eval Delta | Color |
|--------|-------|------------|-------|
| ★ | Brilliant | Best move in sharp position | Cyan |
| ✓ | Best | Engine's top choice | Green |
| ● | Good | Within 0.3 of best | Light green |
| ?! | Inaccuracy | -0.5 to -1.0 | Yellow |
| ? | Mistake | -1.0 to -3.0 | Orange |
| ?? | Blunder | > -3.0 | Red |

### Eval Bar

- Vertical bar showing who's winning
- White advantage = bar fills from bottom (white)
- Black advantage = bar fills from top (black)
- Scale: -10 to +10 (capped)
- Mate shown as "M5" with full bar

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/desktop/src-tauri/src/engine.rs` | Stockfish process management |
| `apps/web/src/components/analysis/AnalysisBoard.tsx` | Main analysis page |
| `apps/web/src/components/analysis/EvalBar.tsx` | Evaluation indicator |
| `apps/web/src/components/analysis/MoveList.tsx` | Annotated move list |
| `apps/web/src/components/analysis/EngineInfo.tsx` | Engine status bar |
| `apps/web/src/hooks/useEngineAnalysis.ts` | Tauri IPC for engine |
| `apps/web/src/lib/analysis/moveClassifier.ts` | Classify move quality |
| `packages/shared/src/types/analysis.ts` | Analysis types |

## Files to Modify

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/src/main.rs` | Register engine commands |
| `apps/desktop/src-tauri/src/commands.rs` | Add analysis commands |
| `apps/desktop/src-tauri/tauri.conf.json` | Bundle Stockfish |
| `apps/web/src/components/dev/DevDebugPanel.tsx` | Add "Force End Game" |
| `apps/web/src/components/history/detail/GameDetailDrawer.tsx` | Add "Analyze" button |
| `packages/shared/src/types/flags.ts` | Add `analysis_board` flag |

---

## Data Types

```typescript
// packages/shared/src/types/analysis.ts

export interface EngineEvaluation {
  fen: string;
  bestMove: string;
  scoreCp: number;           // Centipawns (100 = 1 pawn)
  scoreMate: number | null;  // Mate in N (null if not mate)
  depth: number;
  pv: string[];              // Principal variation
}

export interface AnalyzedMove {
  moveIndex: number;
  move: string;              // SAN notation
  fen: string;               // Position after move
  evaluation: EngineEvaluation;
  classification: MoveClassification;
  evalDelta: number;         // Change from previous position
}

export type MoveClassification =
  | 'brilliant'
  | 'best'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface GameAnalysis {
  gameId: string;
  moves: AnalyzedMove[];
  accuracy: {
    white: number;  // 0-100%
    black: number;
  };
  summary: {
    whiteBrilliant: number;
    whiteMistakes: number;
    whiteBlunders: number;
    blackBrilliant: number;
    blackMistakes: number;
    blackBlunders: number;
  };
}
```

---

## Analysis Flow

1. User opens game from history
2. Clicks "Analyze" button in GameDetailDrawer
3. AnalysisBoard component mounts
4. Calls `invoke('analyze_game', { moves, depth: 20 })`
5. Rust backend:
   - Spawns Stockfish process (if not running)
   - Iterates through each position
   - Sends `position fen X` + `go depth 20`
   - Parses UCI output
   - Returns array of evaluations
6. Frontend receives evaluations
7. `moveClassifier.ts` classifies each move
8. UI updates with annotations

---

## Dev Tool: Force End Game

Add to `DevDebugPanel.tsx`:

```typescript
const handleForceEndGame = async (result: 'white' | 'black' | 'draw') => {
  // Send WebSocket message to server
  sendMessage({
    type: 'dev:force_end_game',
    payload: {
      gameId: game.gameId,
      result,
      reason: 'dev_forced'
    }
  });
};
```

Server handles `dev:force_end_game`:
- Validates dev mode enabled
- Ends game with specified result
- Saves to history (so it appears in replay)
- Broadcasts game end to all participants

---

## Implementation Phases

### Phase 1: Dev Tool (30 min)
- Add force-end-game to DevDebugPanel
- Server-side handler for dev:force_end_game
- Verify games appear in history after force-end

### Phase 2: Stockfish Integration (see PLAN-stockfish.md)
- Bundle Stockfish binary
- Rust engine manager
- UCI protocol implementation
- Tauri commands

### Phase 3: Analysis UI (2 hours)
- AnalysisBoard layout
- EvalBar component
- MoveList with classifications
- Navigation controls
- Engine status bar

### Phase 4: Polish (1 hour)
- Loading states during analysis
- Error handling
- Keyboard shortcuts
- Export analysis (PGN with annotations)

---

## Feature Flag

```typescript
// packages/shared/src/types/flags.ts
export type KnownFeatureFlag =
  | 'analysis_board'
  // ...existing flags
```

---

## Notes

- Desktop-only: No browser fallback needed
- Stockfish bundled with app (~10MB)
- Analysis cached per game (don't re-analyze on revisit)
- Depth 20 recommended (balance of speed and accuracy)
- ~5-10 seconds for full 40-move game analysis
