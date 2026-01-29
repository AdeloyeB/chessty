# Architecture: Anti-Cheat, Settlement & Community Review System

> **Document Status**: Pre-Release Planning
> **Last Updated**: January 2025
> **Estimated Read Time**: 15 minutes

This document covers the complete architecture for cheat detection, game settlement, fund escrow, and the community-driven review system inspired by [CS:GO's Overwatch](https://blog.counter-strike.net/index.php/overwatch/).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Performance Architecture](#3-performance-architecture)
4. [Anti-Cheat Detection Layers](#4-anti-cheat-detection-layers)
5. [Settlement & Escrow Flow](#5-settlement--escrow-flow)
6. [Community Review System (Jury)](#6-community-review-system-jury)
7. [Technical Implementation](#7-technical-implementation)
8. [Pre-Release Must-Haves](#8-pre-release-must-haves)
9. [Future Considerations](#9-future-considerations)

---

## 1. Executive Summary

### The Challenge

We're building a real-money chess platform where:
- Players wager USDC on games
- Cheating directly steals money from honest players
- False accusations damage trust and may have legal consequences
- The app runs as a "background activity" alongside trading platforms

### Our Solution

A **multi-layered defense system** combining:
1. **Client-side detection** (environment scanning, input tracking)
2. **Server-side statistical analysis** (engine correlation, timing patterns)
3. **Smart contract escrow** (funds locked until resolution)
4. **Community-driven review** (trusted players judge flagged games)

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Never interrupt games** | Collect data silently, resolve after game ends |
| **Assume innocence** | High burden of proof before adverse action |
| **Transparent rules** | Escrow logic on-chain, reviewable by anyone |
| **Community ownership** | Players police their own community |
| **Lightweight client** | App runs invisibly alongside other work |

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              COMPLETE SYSTEM ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                           DESKTOP CLIENT (Tauri)                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │   WebView   │  │  Stockfish  │  │  Anti-Cheat │  │    WebSocket        │ │   │
│  │  │   (UI)      │  │  (Lazy)     │  │  Module     │  │    Connection       │ │   │
│  │  │             │  │             │  │             │  │                     │ │   │
│  │  │  Chess UI   │  │  Analysis   │  │ Environment │  │  Real-time moves    │ │   │
│  │  │  Settings   │  │  on-demand  │  │ Input track │  │  Clock sync         │ │   │
│  │  │  Wallet     │  │  auto-stop  │  │ Network mon │  │  Game events        │ │   │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘  └──────────┬──────────┘ │   │
│  │                                           │                    │            │   │
│  └───────────────────────────────────────────┼────────────────────┼────────────┘   │
│                                              │                    │                │
│                              ┌───────────────┴────────────────────┘                │
│                              │                                                     │
│                              ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                              GAME SERVER (Hono.js)                          │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │    Game     │  │  Anti-Cheat │  │  Settlement │  │      Jury           │ │   │
│  │  │  Coordinator│  │   Engine    │  │   Service   │  │    Coordinator      │ │   │
│  │  │             │  │             │  │             │  │                     │ │   │
│  │  │ Move valid  │  │ Statistical │  │ Suspicion   │  │  Case assignment    │ │   │
│  │  │ Clock mgmt  │  │ analysis    │  │ scoring     │  │  Verdict collection │ │   │
│  │  │ Game state  │  │ Stockfish   │  │ Hold/release│  │  Investigator score │ │   │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘  └──────────┬──────────┘ │   │
│  │                                           │                    │            │   │
│  └───────────────────────────────────────────┼────────────────────┼────────────┘   │
│                                              │                    │                │
│                              ┌───────────────┴────────────────────┘                │
│                              │                                                     │
│                              ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                           BLOCKCHAIN (Polygon)                              │   │
│  │                                                                             │   │
│  │  ┌───────────────────────────────────────────────────────────────────────┐ │   │
│  │  │                         ChessEscrow.sol                               │ │   │
│  │  │                                                                       │ │   │
│  │  │   createGame() ──▶ lockStakes() ──▶ submitResult() ──▶ settle()      │ │   │
│  │  │                                           │                           │ │   │
│  │  │                                     [if flagged]                      │ │   │
│  │  │                                           │                           │ │   │
│  │  │                                           ▼                           │ │   │
│  │  │                              ┌─────────────────────┐                  │ │   │
│  │  │                              │   DISPUTED STATE    │                  │ │   │
│  │  │                              │   (funds locked)    │                  │ │   │
│  │  │                              └──────────┬──────────┘                  │ │   │
│  │  │                                         │                             │ │   │
│  │  │                    ┌────────────────────┴────────────────────┐        │ │   │
│  │  │                    ▼                                         ▼        │ │   │
│  │  │          resolveDispute()                          claimAfterTimeout()│ │   │
│  │  │          (jury verdict)                            (48h safety valve) │ │   │
│  │  │                                                                       │ │   │
│  │  └───────────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Performance Architecture

### Design Goal: Invisible Background App

The app must run alongside trading platforms, browsers with 50+ tabs, and Discord without causing:
- Fan noise
- UI lag in other apps
- Thermal throttling

### Resource Targets

| State | CPU | Memory | Stockfish |
|-------|-----|--------|-----------|
| App idle (no game) | < 1% | ~40MB | Not running |
| Game active (playing) | 3-8% | ~60MB | Not running |
| Analysis mode (reviewing) | 15-30% | ~150MB | Running (capped) |
| App minimized | ~0% | ~40MB | Auto-shutdown |

### Stockfish Configuration

Based on [Lichess's recommendation](https://lichess.org/forum/lichess-feedback/how-do-i-change-the-amount-of-cores-used-on-my-computer-in-analysis): "Use one less than available cores for smooth UI."

```rust
pub fn auto_detect() -> EngineConfig {
    let physical_cores = num_cpus::get_physical() as u32;

    // N-1 threads for UI headroom, capped for background use
    let threads = (physical_cores.saturating_sub(1))
        .max(2)   // Minimum 2 threads
        .min(4);  // Maximum 4 threads

    let hash_mb = (threads * 64).clamp(128, 256);

    EngineConfig { threads, hash_mb }
}
```

| System | Physical Cores | Threads Used | Hash | Free for User |
|--------|----------------|--------------|------|---------------|
| M1 MacBook Air | 8 | 4 | 256MB | 4 cores |
| M3 MacBook Pro | 12 | 4 | 256MB | 8 cores |
| Intel i5 Laptop | 4 | 3 | 192MB | 1 core |
| Desktop i9 | 16 | 4 | 256MB | 12 cores |

### Lazy Loading Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    STOCKFISH LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App Launch ─────────────────────────────────────────────────── │
│       │                                                         │
│       │  Stockfish: NOT SPAWNED                                │
│       │  Memory: 0MB for engine                                │
│       │                                                         │
│       ▼                                                         │
│  User opens Analysis ────────────────────────────────────────── │
│       │                                                         │
│       │  spawn_engine() called                                 │
│       │  Stockfish: RUNNING (4 threads, 256MB)                 │
│       │                                                         │
│       ▼                                                         │
│  User views analysis ────────────────────────────────────────── │
│       │                                                         │
│       │  last_used = now()                                     │
│       │  Analysis runs, results returned                       │
│       │                                                         │
│       ▼                                                         │
│  User closes analysis tab ───────────────────────────────────── │
│       │                                                         │
│       │  Idle timer starts (60 seconds)                        │
│       │                                                         │
│       ▼                                                         │
│  60 seconds pass, no analysis requests ──────────────────────── │
│       │                                                         │
│       │  send(EngineCommand::Quit)                             │
│       │  Stockfish: TERMINATED                                 │
│       │  Memory: 0MB for engine                                │
│       │                                                         │
│       ▼                                                         │
│  User requests analysis again ───────────────────────────────── │
│       │                                                         │
│       │  spawn_engine() (fresh start)                          │
│       │                                                         │
└───────┴─────────────────────────────────────────────────────────┘
```

---

## 4. Anti-Cheat Detection Layers

### Layer Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           ANTI-CHEAT DETECTION LAYERS                               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  LAYER 1: ENVIRONMENT DETECTION (Client)                                           │
│  ────────────────────────────────────────                                          │
│  When: Once at game start                                                          │
│  What: Scan running processes for chess engines, screen sharing, automation        │
│  Cost: ~100ms, one-time                                                            │
│                                                                                     │
│      Detected: Stockfish, Komodo, Leela, Discord (screen share),                   │
│                OBS, AutoHotKey, scrcpy (mobile mirroring), OCR tools               │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Risk Scoring:                                                              │   │
│  │  • Chess engine detected:     +60 points                                    │   │
│  │  • OCR tool detected:         +45 points                                    │   │
│  │  • Mobile mirroring:          +40 points                                    │   │
│  │  • Debugger attached:         +40 points                                    │   │
│  │  • Automation tool:           +30 points                                    │   │
│  │  • Screen sharing:            +20 points                                    │   │
│  │  • Virtual machine:           +10 points                                    │   │
│  │                                               Max: 100 points               │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  LAYER 2: INPUT PATTERN ANALYSIS (Client)                                          │
│  ────────────────────────────────────────                                          │
│  When: During each move                                                            │
│  What: Track mouse path, timing, selection method                                  │
│  Cost: Negligible (Vec push per mouse event)                                       │
│                                                                                     │
│      Human patterns:     Curved paths, hesitations, micro-corrections              │
│      Bot patterns:       Linear interpolation, constant velocity, perfect aim      │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Metrics Collected:                                                         │   │
│  │  • Path linearity (0.0 = curved, 1.0 = straight)                           │   │
│  │  • Micro-corrections count                                                  │   │
│  │  • Hesitation count (velocity drops)                                        │   │
│  │  • Selection method (click, drag, keyboard, PROGRAMMATIC)                   │   │
│  │  • Focus maintained (did user alt-tab?)                                     │   │
│  │  • Selection duration (thinking time)                                       │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  LAYER 3: STATISTICAL MOVE ANALYSIS (Server)                                       │
│  ───────────────────────────────────────────                                       │
│  When: After each move + end of game                                               │
│  What: Compare moves to engine recommendations                                      │
│  Cost: Stockfish analysis (server-side, async)                                     │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Key Metrics:                                                               │   │
│  │                                                                             │   │
│  │  Centipawn Loss (CPL)                                                       │   │
│  │  ─────────────────────                                                      │   │
│  │  How much worse is the player's move vs engine's best move?                 │   │
│  │                                                                             │   │
│  │  Rating Band    │ Expected CPL │ Suspicious │ Highly Suspicious             │   │
│  │  ───────────────┼──────────────┼────────────┼─────────────────              │   │
│  │  800-1200       │ 80-120       │ < 40       │ < 20                          │   │
│  │  1200-1600      │ 50-80        │ < 30       │ < 15                          │   │
│  │  1600-2000      │ 30-50        │ < 20       │ < 10                          │   │
│  │  2000+          │ 15-30        │ < 10       │ < 5                           │   │
│  │                                                                             │   │
│  │  Engine Correlation (Top-N Match Rate)                                      │   │
│  │  ─────────────────────────────────────                                      │   │
│  │  How often does player's move match engine's top choices?                   │   │
│  │                                                                             │   │
│  │  Rating Band    │ Expected Top-3 │ Suspicious │ Highly Suspicious           │   │
│  │  ───────────────┼────────────────┼────────────┼─────────────────            │   │
│  │  800-1200       │ 55-65%         │ > 80%      │ > 90%                       │   │
│  │  1200-1600      │ 60-70%         │ > 85%      │ > 92%                       │   │
│  │  1600-2000      │ 65-75%         │ > 88%      │ > 95%                       │   │
│  │  2000+          │ 70-80%         │ > 90%      │ > 97%                       │   │
│  │                                                                             │   │
│  │  Critical Position Accuracy                                                 │   │
│  │  ──────────────────────────────                                             │   │
│  │  In complex positions where one move is clearly best, did they find it?     │   │
│  │  Humans: 40-60%     Engines: 95-100%                                        │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  LAYER 4: BEHAVIORAL TIMING ANALYSIS (Server)                                      │
│  ────────────────────────────────────────────                                      │
│  When: Real-time during game + post-game                                           │
│  What: Analyze time-per-move patterns                                              │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Suspicious Patterns:                                                       │   │
│  │                                                                             │   │
│  │  • Instant moves on complex positions (human would think 15-30s)            │   │
│  │  • Consistent move timing regardless of position complexity                 │   │
│  │  • Correlation: alt-tab before move + perfect move after                    │   │
│  │  • Mid-game skill shift (playing 1400 level, suddenly 2500 level)           │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  LAYER 5: ACCOUNT PATTERN ANALYSIS (Server)                                        │
│  ──────────────────────────────────────────                                        │
│  When: Background, continuous                                                       │
│  What: Look at player's overall account history                                    │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Red Flags:                                                                 │   │
│  │                                                                             │   │
│  │  • New account + high stakes + perfect play                                 │   │
│  │  • Sudden improvement (1200 → 2000 overnight)                               │   │
│  │  • Only plays for money (never casual games)                                │   │
│  │  • Multiple flagged games (even if each cleared individually)               │   │
│  │  • Plays at unusual hours with unusual patterns                             │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Suspicion Score Calculation

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         FINAL SUSPICION SCORE CALCULATION                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Each layer contributes a weighted score:                                          │
│                                                                                     │
│  final_score = (                                                                   │
│      environment_risk     * 0.15  +   // Max 15 points                            │
│      input_anomaly_score  * 0.15  +   // Max 15 points                            │
│      engine_correlation   * 0.35  +   // Max 35 points (most important)           │
│      timing_anomaly       * 0.20  +   // Max 20 points                            │
│      account_risk         * 0.15      // Max 15 points                            │
│  )                                                                                 │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │    0%────────────50%───────70%───────90%───────95%──────100%               │   │
│  │    │              │         │         │         │          │                │   │
│  │    │   NORMAL     │  WATCH  │ MONITOR │  FLAG   │   HOLD   │                │   │
│  │    │              │         │         │         │          │                │   │
│  │    └──────────────┴─────────┴─────────┴─────────┴──────────┘                │   │
│  │                                                                             │   │
│  │    NORMAL (0-50%):   Auto-settle, no action                                │   │
│  │    WATCH (50-70%):   Auto-settle, add to watchlist                         │   │
│  │    MONITOR (70-90%): Auto-settle, flag for background review               │   │
│  │    FLAG (90-95%):    Auto-settle, mandatory spot-check by jury             │   │
│  │    HOLD (95-100%):   HOLD FUNDS, mandatory jury review                     │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Settlement & Escrow Flow

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            GAME SETTLEMENT FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  PHASE 1: GAME CREATION                                                            │
│  ═══════════════════════                                                           │
│                                                                                     │
│    Player A                        Smart Contract                       Player B   │
│    ─────────                       ──────────────                       ─────────  │
│        │                                │                                   │      │
│        │──── createGame($50) ──────────▶│                                   │      │
│        │                                │                                   │      │
│        │                                │◀────── joinGame($50) ─────────────│      │
│        │                                │                                   │      │
│        │                         ┌──────┴──────┐                           │      │
│        │                         │   ESCROW    │                           │      │
│        │                         │   $100      │                           │      │
│        │                         │   LOCKED    │                           │      │
│        │                         └──────┬──────┘                           │      │
│        │                                │                                   │      │
│        │◀─── Game ID + Start Signal ────┤────────────────────────────────▶│      │
│        │                                │                                   │      │
│                                                                                     │
│  PHASE 2: GAME IN PROGRESS                                                         │
│  ═════════════════════════                                                         │
│                                                                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐     │
│    │                                                                         │     │
│    │   Players make moves via WebSocket                                      │     │
│    │   Anti-cheat silently collects data:                                   │     │
│    │     • Environment scan (once at start)                                  │     │
│    │     • Input patterns (each move)                                        │     │
│    │     • Move timing                                                       │     │
│    │   Server analyzes moves in background                                   │     │
│    │                                                                         │     │
│    │   *** GAME IS NEVER INTERRUPTED ***                                     │     │
│    │                                                                         │     │
│    └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  PHASE 3: GAME ENDS                                                                │
│  ══════════════════                                                                │
│                                                                                     │
│    Server                          Anti-Cheat Engine                               │
│    ──────                          ─────────────────                               │
│        │                                │                                          │
│        │──── Game complete ────────────▶│                                          │
│        │     (all moves + metadata)     │                                          │
│        │                                │                                          │
│        │                         ┌──────┴──────┐                                   │
│        │                         │  Calculate  │                                   │
│        │                         │  Suspicion  │                                   │
│        │                         │   Score     │                                   │
│        │                         └──────┬──────┘                                   │
│        │                                │                                          │
│        │◀─── Suspicion Score ───────────│                                          │
│        │     (0-100%)                   │                                          │
│        │                                                                           │
│                                                                                     │
│  PHASE 4: SETTLEMENT DECISION                                                      │
│  ════════════════════════════                                                      │
│                                                                                     │
│                          Suspicion Score                                           │
│                               │                                                    │
│           ┌───────────────────┼───────────────────┐                               │
│           ▼                   ▼                   ▼                               │
│    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                        │
│    │  < 95%      │     │  95-98%     │     │  > 98%      │                        │
│    │             │     │             │     │             │                        │
│    │ AUTO-SETTLE │     │ HOLD +      │     │ HOLD +      │                        │
│    │             │     │ JURY REVIEW │     │ PRIORITY    │                        │
│    │ Winner gets │     │             │     │ REVIEW      │                        │
│    │ $100 - fees │     │ Funds locked│     │             │                        │
│    └─────────────┘     │ 48h max     │     │ Funds locked│                        │
│           │            └──────┬──────┘     │ 24h max     │                        │
│           │                   │            └──────┬──────┘                        │
│           │                   │                   │                               │
│           │                   └─────────┬─────────┘                               │
│           │                             │                                          │
│           │                             ▼                                          │
│           │                    ┌─────────────────┐                                 │
│           │                    │   JURY REVIEW   │                                 │
│           │                    │   (Community)   │                                 │
│           │                    └────────┬────────┘                                 │
│           │                             │                                          │
│           │              ┌──────────────┴──────────────┐                          │
│           │              ▼                             ▼                          │
│           │     ┌─────────────────┐          ┌─────────────────┐                  │
│           │     │    GUILTY       │          │   NOT GUILTY    │                  │
│           │     │                 │          │                 │                  │
│           │     │ Victim: $100    │          │ Original winner │                  │
│           │     │ Cheater: $0     │          │ gets $100       │                  │
│           │     │ + Account ban   │          │                 │                  │
│           │     └─────────────────┘          └─────────────────┘                  │
│           │                                                                        │
│           ▼                                                                        │
│    ┌─────────────────────────────────────────────────────────────────────────┐    │
│    │                         FUNDS RELEASED                                  │    │
│    │                                                                         │    │
│    │   • Winner receives: $95 (after 5% platform fee)                       │    │
│    │   • Transaction recorded on-chain                                       │    │
│    │   • Game archived with all anti-cheat data                             │    │
│    │                                                                         │    │
│    └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Smart Contract States

```solidity
enum GameState {
    Created,      // Game created, waiting for second player
    Active,       // Both players joined, game in progress
    Completed,    // Game finished, awaiting settlement
    Settled,      // Funds released to winner
    Disputed,     // Flagged for review, funds locked
    Resolved      // Dispute resolved, funds released
}
```

### User Communication

| Scenario | Message to Winner | Message to Loser |
|----------|-------------------|------------------|
| Normal settlement | "You won! $95 credited." | "Game over. Better luck next time!" |
| Flagged (opponent) | "You won! Verifying result... (24-48h)" | "Game over. Result pending verification." |
| Flagged (you) | "Game complete. Result pending verification." | "Game over. Result pending verification." |
| Cheating confirmed | "Your opponent violated fair play. Full refund + their stake awarded." | "Your account has been suspended for fair play violations." |
| Cleared | "Verification complete. $95 credited." | "Game verified. Result stands." |

---

## 6. Community Review System (Jury)

### Inspiration: CS:GO Overwatch

Based on [CS:GO's Overwatch system](https://blog.counter-strike.net/index.php/overwatch/):

> "The Overwatch system allows the CS:GO community to independently self-police their gaming environment. Investigators are selected based on their activity (competitive wins, account age, hours played, Skill Group, low report count) and their accuracy as investigators."

### Jury System Design

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              JURY SYSTEM ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  WHO CAN BE A JUROR?                                                               │
│  ═══════════════════                                                               │
│                                                                                     │
│  Requirements (inspired by CS:GO's Gold Nova 1 + 150 wins):                        │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │   Minimum Requirements:                                                     │   │
│  │   ─────────────────────                                                     │   │
│  │   • ELO Rating: 1400+ (roughly Gold Nova equivalent)                        │   │
│  │   • Rated Games: 100+ completed                                             │   │
│  │   • Account Age: 30+ days                                                   │   │
│  │   • Report Count: Low (not frequently reported by others)                   │   │
│  │   • Never Banned: No previous fair play violations                          │   │
│  │                                                                             │   │
│  │   Preferred Qualities:                                                      │   │
│  │   ───────────────────                                                       │   │
│  │   • Higher ELO (better at recognizing skill vs cheating)                    │   │
│  │   • Active player (plays regularly)                                         │   │
│  │   • Good standing (positive community interactions)                         │   │
│  │   • Previous accurate verdicts (if returning juror)                         │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  THE REVIEW PROCESS                                                                │
│  ══════════════════                                                                │
│                                                                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐     │
│    │                                                                         │     │
│    │   1. CASE ASSIGNMENT                                                    │     │
│    │   ──────────────────                                                    │     │
│    │                                                                         │     │
│    │   Flagged game enters queue                                             │     │
│    │            │                                                            │     │
│    │            ▼                                                            │     │
│    │   System selects 5-7 eligible jurors                                    │     │
│    │   (different ELO ranges for diverse perspective)                        │     │
│    │            │                                                            │     │
│    │            ▼                                                            │     │
│    │   Jurors receive notification: "A case is available for review"         │     │
│    │                                                                         │     │
│    └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐     │
│    │                                                                         │     │
│    │   2. EVIDENCE PRESENTED                                                 │     │
│    │   ─────────────────────                                                 │     │
│    │                                                                         │     │
│    │   Juror sees ANONYMIZED data:                                           │     │
│    │                                                                         │     │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │     │
│    │   │  CASE #48291                                                    │   │     │
│    │   │  ─────────────                                                  │   │     │
│    │   │                                                                 │   │     │
│    │   │  The Suspect: [ANONYMIZED]                                      │   │     │
│    │   │  Suspect Rating: 1650                                           │   │     │
│    │   │  Opponent Rating: 1580                                          │   │     │
│    │   │  Game Length: 34 moves                                          │   │     │
│    │   │  Time Control: 5+3 Blitz                                        │   │     │
│    │   │                                                                 │   │     │
│    │   │  [REPLAY GAME]  [VIEW MOVE-BY-MOVE]  [STATISTICAL SUMMARY]      │   │     │
│    │   │                                                                 │   │     │
│    │   │  ─────────────────────────────────────────────────────────────  │   │     │
│    │   │                                                                 │   │     │
│    │   │  STATISTICAL ANALYSIS                                           │   │     │
│    │   │  • Centipawn Loss: 8 (expected for rating: 45-55)              │   │     │
│    │   │  • Top-1 Engine Match: 76% (expected: 35-40%)                  │   │     │
│    │   │  • Top-3 Engine Match: 94% (expected: 60-70%)                  │   │     │
│    │   │  • Critical Position Accuracy: 100% (expected: 50-60%)         │   │     │
│    │   │                                                                 │   │     │
│    │   │  TIMING ANALYSIS                                                │   │     │
│    │   │  • Average move time: 4.2s                                      │   │     │
│    │   │  • Move time variance: 0.89 (humans avg: 0.4)                  │   │     │
│    │   │  • Complex position think time: 3.1s (expected: 15-30s)        │   │     │
│    │   │                                                                 │   │     │
│    │   │  INPUT ANALYSIS                                                 │   │     │
│    │   │  • Path linearity: 0.94 (humans avg: 0.5-0.7)                  │   │     │
│    │   │  • Micro-corrections: 2 (humans avg: 8-15)                     │   │     │
│    │   │  • Focus lost during game: Yes (3 times)                       │   │     │
│    │   │                                                                 │   │     │
│    │   │  ENVIRONMENT (at game start)                                    │   │     │
│    │   │  • Chess engine detected: No                                    │   │     │
│    │   │  • Screen sharing active: Yes (Discord)                         │   │     │
│    │   │                                                                 │   │     │
│    │   └─────────────────────────────────────────────────────────────────┘   │     │
│    │                                                                         │     │
│    └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐     │
│    │                                                                         │     │
│    │   3. VERDICT OPTIONS                                                    │     │
│    │   ──────────────────                                                    │     │
│    │                                                                         │     │
│    │   For each charge, juror selects:                                       │     │
│    │                                                                         │     │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │     │
│    │   │                                                                 │   │     │
│    │   │   CHARGE 1: ENGINE ASSISTANCE                                   │   │     │
│    │   │   Did the suspect use computer assistance for moves?            │   │     │
│    │   │                                                                 │   │     │
│    │   │   ( ) Insufficient Evidence                                     │   │     │
│    │   │   ( ) Evident Beyond Reasonable Doubt                           │   │     │
│    │   │                                                                 │   │     │
│    │   │   ─────────────────────────────────────────────────────────     │   │     │
│    │   │                                                                 │   │     │
│    │   │   CHARGE 2: INPUT AUTOMATION                                    │   │     │
│    │   │   Did the suspect use automated input (bots, macros)?           │   │     │
│    │   │                                                                 │   │     │
│    │   │   ( ) Insufficient Evidence                                     │   │     │
│    │   │   ( ) Evident Beyond Reasonable Doubt                           │   │     │
│    │   │                                                                 │   │     │
│    │   │   ─────────────────────────────────────────────────────────     │   │     │
│    │   │                                                                 │   │     │
│    │   │   CHARGE 3: EXTERNAL ASSISTANCE                                 │   │     │
│    │   │   Did the suspect receive help from another person?             │   │     │
│    │   │                                                                 │   │     │
│    │   │   ( ) Insufficient Evidence                                     │   │     │
│    │   │   ( ) Evident Beyond Reasonable Doubt                           │   │     │
│    │   │                                                                 │   │     │
│    │   └─────────────────────────────────────────────────────────────────┘   │     │
│    │                                                                         │     │
│    │                      [SUBMIT VERDICT]  [SKIP CASE]                      │     │
│    │                                                                         │     │
│    └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐     │
│    │                                                                         │     │
│    │   4. VERDICT AGGREGATION                                                │     │
│    │   ──────────────────────                                                │     │
│    │                                                                         │     │
│    │   Verdicts are weighted by juror score:                                 │     │
│    │                                                                         │     │
│    │   Juror Score = f(accuracy_history, agreement_rate, experience)         │     │
│    │                                                                         │     │
│    │   ┌─────────────────────────────────────────────────────────────────┐   │     │
│    │   │                                                                 │   │     │
│    │   │   Juror A (Score: 0.92):  GUILTY      → Weight: 0.92           │   │     │
│    │   │   Juror B (Score: 0.85):  GUILTY      → Weight: 0.85           │   │     │
│    │   │   Juror C (Score: 0.78):  GUILTY      → Weight: 0.78           │   │     │
│    │   │   Juror D (Score: 0.71):  NOT GUILTY  → Weight: 0.71           │   │     │
│    │   │   Juror E (Score: 0.65):  GUILTY      → Weight: 0.65           │   │     │
│    │   │                                                                 │   │     │
│    │   │   Weighted GUILTY:      0.92 + 0.85 + 0.78 + 0.65 = 3.20       │   │     │
│    │   │   Weighted NOT GUILTY:  0.71 = 0.71                            │   │     │
│    │   │                                                                 │   │     │
│    │   │   GUILTY ratio: 3.20 / 3.91 = 81.8%                            │   │     │
│    │   │                                                                 │   │     │
│    │   │   Threshold for conviction: 75%                                 │   │     │
│    │   │                                                                 │   │     │
│    │   │   FINAL VERDICT: ██ GUILTY ██                                  │   │     │
│    │   │                                                                 │   │     │
│    │   └─────────────────────────────────────────────────────────────────┘   │     │
│    │                                                                         │     │
│    └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  JUROR SCORING SYSTEM                                                              │
│  ════════════════════                                                              │
│                                                                                     │
│  Based on CS:GO: "Investigators score positively for agreeing with the majority    │
│  and negatively for being in the minority. The change is larger when most          │
│  investigators agree."                                                             │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │   Score Update Formula:                                                     │   │
│  │   ─────────────────────                                                     │   │
│  │                                                                             │   │
│  │   If juror agrees with final verdict:                                       │   │
│  │      score_delta = +0.02 * consensus_strength                              │   │
│  │                                                                             │   │
│  │   If juror disagrees with final verdict:                                    │   │
│  │      score_delta = -0.05 * consensus_strength                              │   │
│  │                                                                             │   │
│  │   Where consensus_strength = |guilty_ratio - 0.5| * 2                      │   │
│  │   (ranges from 0 at 50/50 to 1 at unanimous)                               │   │
│  │                                                                             │   │
│  │   ─────────────────────────────────────────────────────────────────────     │   │
│  │                                                                             │   │
│  │   TEST CASES                                                                │   │
│  │   ──────────                                                                │   │
│  │                                                                             │   │
│  │   Randomly insert known cases (previously resolved) to calibrate jurors.    │   │
│  │   These don't affect actual players but DO affect juror scores.             │   │
│  │                                                                             │   │
│  │   Example:                                                                  │   │
│  │   • 1 in 5 cases is a "test case" with known outcome                       │   │
│  │   • If juror consistently fails test cases, their score drops              │   │
│  │   • Low-scoring jurors' votes count less                                   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  REWARDS FOR JURORS                                                                │
│  ══════════════════                                                                │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │   • XP bonus for accurate verdicts (CS:GO model)                           │   │
│  │   • "Trusted Juror" badge after 50+ accurate cases                         │   │
│  │   • Priority matchmaking or reduced fees (optional)                        │   │
│  │   • Leaderboard recognition                                                │   │
│  │   • Sense of community contribution                                        │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Technical Implementation

### Database Schema (New Tables)

```sql
-- Jury eligibility tracking
CREATE TABLE jury_investigators (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),

    -- Eligibility criteria
    elo_at_qualification INTEGER NOT NULL,
    games_at_qualification INTEGER NOT NULL,
    qualified_at TIMESTAMP NOT NULL,

    -- Performance tracking
    cases_reviewed INTEGER DEFAULT 0,
    accurate_verdicts INTEGER DEFAULT 0,
    investigator_score DECIMAL(4,3) DEFAULT 0.500, -- 0.000 to 1.000

    -- Status
    is_active BOOLEAN DEFAULT true,
    suspended_until TIMESTAMP,
    suspension_reason TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cases pending review
CREATE TABLE jury_cases (
    id UUID PRIMARY KEY,
    game_id UUID REFERENCES games(id),

    -- Case metadata
    suspicion_score INTEGER NOT NULL, -- 0-100
    priority TEXT NOT NULL, -- 'normal', 'high', 'urgent'

    -- Timing
    created_at TIMESTAMP DEFAULT NOW(),
    deadline TIMESTAMP NOT NULL, -- 48h from creation
    resolved_at TIMESTAMP,

    -- Outcome
    status TEXT DEFAULT 'pending', -- 'pending', 'reviewing', 'resolved', 'timeout'
    final_verdict TEXT, -- 'guilty', 'not_guilty', 'insufficient'
    verdict_confidence DECIMAL(4,3), -- Weighted agreement ratio

    -- For test cases
    is_test_case BOOLEAN DEFAULT false,
    known_outcome TEXT -- Only set for test cases
);

-- Individual juror verdicts
CREATE TABLE jury_verdicts (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES jury_cases(id),
    investigator_id UUID REFERENCES jury_investigators(id),

    -- Verdicts per charge
    engine_assistance TEXT NOT NULL, -- 'insufficient', 'guilty'
    input_automation TEXT NOT NULL,
    external_assistance TEXT NOT NULL,

    -- Metadata
    time_spent_seconds INTEGER, -- How long they reviewed
    submitted_at TIMESTAMP DEFAULT NOW(),

    -- Scoring (calculated after case resolves)
    agreed_with_majority BOOLEAN,
    score_delta DECIMAL(4,3),

    UNIQUE(case_id, investigator_id)
);

-- Settlement records
CREATE TABLE game_settlements (
    id UUID PRIMARY KEY,
    game_id UUID REFERENCES games(id),

    -- Financial
    total_pot DECIMAL(18,6) NOT NULL,
    platform_fee DECIMAL(18,6) NOT NULL,
    winner_payout DECIMAL(18,6),

    -- Status
    status TEXT DEFAULT 'pending', -- 'pending', 'settled', 'disputed', 'resolved'

    -- Anti-cheat
    suspicion_score INTEGER,
    flagged_player_id UUID REFERENCES users(id),
    jury_case_id UUID REFERENCES jury_cases(id),

    -- Resolution
    settled_at TIMESTAMP,
    settled_by TEXT, -- 'auto', 'jury', 'timeout', 'admin'

    -- Blockchain
    escrow_tx_hash TEXT,
    settlement_tx_hash TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints

```typescript
// Settlement endpoints
POST   /api/games/:id/settle           // Submit game result + suspicion score
GET    /api/games/:id/settlement       // Get settlement status

// Jury endpoints
GET    /api/jury/eligibility           // Check if current user can be juror
POST   /api/jury/enroll                // Enroll as juror
GET    /api/jury/cases                 // Get available cases for review
GET    /api/jury/cases/:id             // Get case details (anonymized)
POST   /api/jury/cases/:id/verdict     // Submit verdict
GET    /api/jury/stats                 // Get juror's stats and score

// Admin endpoints
GET    /api/admin/settlements/pending  // List pending settlements
POST   /api/admin/settlements/:id/resolve // Manual resolution (fallback)
GET    /api/admin/jury/investigators   // List all investigators
POST   /api/admin/jury/investigators/:id/suspend // Suspend investigator
```

### Event Flow

```typescript
// When game ends
gameEvents.on('game:ended', async (game) => {
    // 1. Calculate suspicion score
    const suspicionScore = await antiCheatEngine.analyze(game);

    // 2. Create settlement record
    const settlement = await createSettlement(game, suspicionScore);

    // 3. Decide action
    if (suspicionScore < 95) {
        // Auto-settle
        await settleGame(settlement, game.winnerId);
    } else {
        // Create jury case
        const juryCase = await createJuryCase(game, suspicionScore);
        settlement.status = 'disputed';
        settlement.jury_case_id = juryCase.id;

        // Assign jurors
        await assignJurors(juryCase, 5);

        // Notify players
        await notifyPlayers(game, 'Game under review');
    }
});

// When jury case gets enough verdicts
juryEvents.on('case:quorum_reached', async (caseId) => {
    const verdicts = await getVerdicts(caseId);

    // Calculate weighted verdict
    const result = calculateWeightedVerdict(verdicts);

    // Update case
    await resolveCase(caseId, result);

    // Update juror scores
    await updateJurorScores(verdicts, result);

    // Settle the game
    const settlement = await getSettlementByCase(caseId);
    if (result.verdict === 'guilty') {
        await settleGame(settlement, result.victimId);
        await banPlayer(result.cheaterId);
    } else {
        await settleGame(settlement, settlement.originalWinnerId);
    }
});
```

---

## 8. Pre-Release Must-Haves

### Checklist

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PRE-RELEASE CHECKLIST                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  SMART CONTRACTS                                                         Status    │
│  ═══════════════                                                                   │
│  [ ] ChessEscrow.sol - Basic escrow with deposit/withdraw                ______   │
│  [ ] ChessEscrow.sol - Disputed state and resolution                     ______   │
│  [ ] ChessEscrow.sol - 48h timeout safety valve                          ______   │
│  [ ] ChessEscrow.sol - Platform fee deduction                            ______   │
│  [ ] Testnet deployment and testing                                      ______   │
│  [ ] Security audit (external)                                           ______   │
│  [ ] Mainnet deployment                                                  ______   │
│                                                                                     │
│  ANTI-CHEAT ENGINE                                                                 │
│  ═════════════════                                                                 │
│  [ ] Environment scanning (client-side)                                  ______   │
│  [ ] Input pattern recording (client-side)                               ______   │
│  [ ] Statistical move analysis (server-side)                             ______   │
│  [ ] Timing analysis (server-side)                                       ______   │
│  [ ] Suspicion score aggregation                                         ______   │
│  [ ] Threshold tuning and testing                                        ______   │
│                                                                                     │
│  SETTLEMENT SYSTEM                                                                 │
│  ════════════════                                                                  │
│  [ ] Auto-settlement for clean games                                     ______   │
│  [ ] Hold mechanism for flagged games                                    ______   │
│  [ ] Player notification system                                          ______   │
│  [ ] Settlement status tracking                                          ______   │
│                                                                                     │
│  JURY SYSTEM                                                                       │
│  ═══════════                                                                       │
│  [ ] Juror eligibility checking                                          ______   │
│  [ ] Case assignment algorithm                                           ______   │
│  [ ] Anonymized case presentation UI                                     ______   │
│  [ ] Verdict submission                                                  ______   │
│  [ ] Weighted verdict aggregation                                        ______   │
│  [ ] Juror scoring system                                                ______   │
│  [ ] Test case insertion                                                 ______   │
│                                                                                     │
│  ADMIN TOOLS                                                                       │
│  ═══════════                                                                       │
│  [ ] Settlement dashboard                                                ______   │
│  [ ] Manual resolution capability                                        ______   │
│  [ ] Juror management                                                    ______   │
│  [ ] Audit logs                                                          ______   │
│                                                                                     │
│  PERFORMANCE                                                                       │
│  ═══════════                                                                       │
│  [ ] Stockfish lazy loading                                              ______   │
│  [ ] Stockfish auto-shutdown                                             ______   │
│  [ ] Thread/hash capping                                                 ______   │
│  [ ] Environment scan caching                                            ______   │
│  [ ] Input recording bounds                                              ______   │
│                                                                                     │
│  TESTING                                                                           │
│  ═══════                                                                           │
│  [ ] Unit tests for anti-cheat scoring                                   ______   │
│  [ ] Integration tests for settlement flow                               ______   │
│  [ ] Load testing for jury system                                        ______   │
│  [ ] End-to-end test: clean game → auto-settle                          ______   │
│  [ ] End-to-end test: flagged game → jury → resolution                  ______   │
│  [ ] End-to-end test: timeout → safety valve release                    ______   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Priority

| Priority | Component | Reason |
|----------|-----------|--------|
| **P0** | Basic escrow + auto-settlement | Can't launch without this |
| **P0** | Statistical anti-cheat (server) | Core cheat detection |
| **P0** | Hold mechanism | Protect against obvious cheaters |
| **P1** | Jury system (basic) | Community review for held games |
| **P1** | Client anti-cheat | Additional detection signal |
| **P1** | Performance optimization | User experience |
| **P2** | Jury scoring system | Quality control for jurors |
| **P2** | Test case insertion | Juror calibration |
| **P2** | Admin dashboard | Operations tooling |
| **P3** | Appeal process | Post-launch enhancement |

---

## 9. Future Considerations

### Appeal Process (Post-Launch)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            APPEAL PROCESS (FUTURE)                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  NOTE: This is documented for future implementation, not pre-release.              │
│                                                                                     │
│  WHEN CAN PLAYERS APPEAL?                                                          │
│  ─────────────────────────                                                         │
│  • Within 7 days of verdict                                                        │
│  • Only if convicted (not for "cleared" cases)                                     │
│  • One appeal per case                                                             │
│  • Requires deposit (refunded if appeal succeeds)                                  │
│                                                                                     │
│  APPEAL PROCESS                                                                    │
│  ──────────────                                                                    │
│  1. Player submits appeal with explanation                                         │
│  2. Case reviewed by senior jurors (top 10% by score)                              │
│  3. If 60%+ senior jurors disagree with original verdict → overturned             │
│  4. If upheld → deposit forfeited, ban stands                                     │
│                                                                                     │
│  SAFEGUARDS                                                                        │
│  ──────────                                                                        │
│  • Senior jurors can't have reviewed the original case                            │
│  • Appeal deposit prevents frivolous appeals                                       │
│  • Limited to one appeal (no infinite loops)                                      │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Machine Learning Enhancement (Future)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         ML ENHANCEMENT (FUTURE)                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Once we have sufficient labeled data from jury verdicts:                          │
│                                                                                     │
│  1. Train model on features → verdict mapping                                      │
│  2. Use model as additional signal (not replacement for jury)                      │
│  3. Reduce jury load by auto-clearing obvious non-cheaters                        │
│  4. Prioritize cases where model is uncertain                                      │
│                                                                                     │
│  Features for ML:                                                                  │
│  • All existing anti-cheat metrics                                                 │
│  • Historical jury verdicts                                                        │
│  • Account patterns                                                                │
│  • Time series of improvement                                                      │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## References

- [CS:GO Overwatch FAQ](https://blog.counter-strike.net/index.php/overwatch/) - Official Valve documentation
- [CS:GO Overwatch System Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2562406748) - Community guide
- [Lichess CPU Usage Discussion](https://lichess.org/forum/lichess-feedback/how-do-i-change-the-amount-of-cores-used-on-my-computer-in-analysis) - Thread optimization
- [Tauri Performance Optimization](https://medium.com/@hadiyolworld007/building-tauri-apps-that-dont-hog-memory-at-idle-de516dabb938) - Memory management
- [Input Lag and Frame Rate](https://forums.blurbusters.com/viewtopic.php?t=4070) - UX considerations

---

*Document maintained by the Chess Gamble development team. Last updated January 2025.*
