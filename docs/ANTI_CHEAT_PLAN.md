# Anti-Cheat System Plan

> **Separate from Tauri migration.** This document covers the anti-cheat system that leverages Tauri's Rust backend. It is intentionally decoupled from the Electron → Tauri migration — the migration can ship without any anti-cheat code.

---

## Why Rust for Anti-Cheat

The entire reason we migrated from Electron to Tauri is that Electron apps are trivially unpacked (`npx asar extract`). Any anti-cheat code written in JavaScript is readable and bypassable. Rust compiles to machine code — orders of magnitude harder to reverse-engineer, modify, or bypass.

---

## Foundation Layer

### What to Build

- [ ] Write `src-tauri/src/anticheat.rs` — process scanner that detects known chess engines (Stockfish, Leela, Komodo, etc.)
- [ ] Add window focus tracking — logs when the user alt-tabs during a game
- [ ] Add clipboard monitoring — detects copy-paste of move notation
- [ ] Register all anti-cheat commands in `main.rs`
- [ ] Create frontend integration — `scan_processes` called before rated/money games
- [ ] Server-side endpoint to receive and validate scan results
- [ ] Add move timing collection — exact milliseconds between moves, sent to server for statistical analysis

### Key Design Decisions

1. **The `KNOWN_ENGINES` list** — Must be comprehensive. Common engines: Stockfish, Leela Chess Zero (Lc0), Komodo, Houdini, Fritz, Shredder, Rybka, Ethereal, Arasan, Laser, Fire, Xiphos.
2. **When scanning happens** — Before every rated game? Periodically during? Both? Need to balance security vs. user experience.
3. **Privacy** — We read the user's process list. The scan should only check names against a known list, **never send the full process list to the server**.
4. **Scan result structure** — What data gets sent to the server? Process match (yes/no), timing data, focus events.

### What to Study

**Rust chapters 7-8:**
- Chapter 7: Modules — how Rust organizes code into files (`mod anticheat;` in main.rs means "include the anticheat.rs file")
- Chapter 8: Collections — `Vec<T>` (like arrays in JS), `String`, `HashMap` (like JS objects/Maps)

**Also study: How chess.com detects cheaters.**
This is product knowledge, not Rust. The server-side statistical analysis is actually the most powerful anti-cheat layer:
- **Engine correlation** — comparing player moves to Stockfish's top-3 suggestions
- **Move time analysis** — humans have natural variance, engines are unnaturally consistent
- **ELO anomaly detection** — sudden jumps in playing strength
- **Centipawn loss patterns** — how consistently "perfect" someone plays

---

## Advanced Layer (Future)

Not part of the initial build. Planned for later:

- [ ] **Signed binary verification** — server checks the client hasn't been modified before allowing money games
- [ ] **Periodic background scanning** — not just pre-game, continuous monitoring during play
- [ ] **Browser extension detection** — detect chess analysis browser extensions
- [ ] **Server-side move analysis engine** — Stockfish running server-side to correlate player moves in real-time
- [ ] **Behavioral fingerprinting** — mouse movement patterns, think-time distribution curves
- [ ] **Process scanning permissions on macOS** — modern macOS allows reading process names without special permissions, but full details (memory, CPU) need entitlements

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Tauri Desktop App               │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  anticheat.rs (Rust — compiled binary)   │    │
│  │                                           │    │
│  │  - scan_processes()                       │    │
│  │  - track_window_focus()                   │    │
│  │  - monitor_clipboard()                    │    │
│  │  - collect_move_timing()                  │    │
│  └──────────────┬───────────────────────────┘    │
│                 │ IPC (invoke)                    │
│  ┌──────────────▼───────────────────────────┐    │
│  │  Frontend (React/Next.js)                 │    │
│  │                                           │    │
│  │  - Calls scan before rated games          │    │
│  │  - Sends timing data with each move       │    │
│  │  - Reports focus changes                  │    │
│  └──────────────┬───────────────────────────┘    │
└─────────────────┼───────────────────────────────┘
                  │ WebSocket / HTTP
┌─────────────────▼───────────────────────────────┐
│                  Server                          │
│                                                  │
│  - Validates scan results                        │
│  - Statistical move analysis                     │
│  - Focus pattern analysis                        │
│  - ELO anomaly detection                         │
│  - Flags suspicious players for review           │
└─────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Process scanning permissions on macOS | macOS may block process list access | Modern macOS allows reading process names without special permissions. Full details need entitlements. |
| False positives | Legitimate chess study tools flagged | Allow whitelist of educational tools. Use multi-signal analysis, not single-signal bans. |
| Bypassing (renaming executables) | Trivial to rename `stockfish` to something else | Combine process scanning with behavioral analysis (move timing, engine correlation). Client-side is just one layer. |
| Privacy concerns | Users uncomfortable with process scanning | Clear disclosure in ToS. Only check against known list. Never transmit full process list. |
| Performance impact | Scanning slows down game start | Scan async, cache results for 5 minutes. Don't block game start on scan completion. |
