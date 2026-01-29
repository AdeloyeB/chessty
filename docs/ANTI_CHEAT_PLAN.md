# Anti-Cheat System Architecture

> **Purpose**: Comprehensive plan for detecting and preventing cheating in a real-money chess betting platform.
>
> **Stakes**: Users wager real money. Cheating directly steals from honest players. False positives wrongly accuse innocent users. Both outcomes destroy trust and kill the platform.

---

## Design Decisions & Trade-offs

### User-Mode Only Architecture (No Kernel Drivers)

**Decision:** This anti-cheat system operates entirely in user-mode. We deliberately avoid kernel-level protection.

**Why kernel drivers are common in gaming anti-cheat:**
- EAC, BattlEye, and Vanguard use kernel drivers for process integrity and memory protection
- Kernel access catches DMA-based cheats, driver-level hooks, and hypervisor attacks
- Required for FPS games where millisecond-level detection matters

**Why we don't need them for chess:**
1. **Time scale**: Chess moves happen on 1-60 second intervals, not milliseconds
2. **Server authority**: All moves validated server-side—client can't cheat the game state
3. **Statistical detection**: Post-move analysis is impossible to bypass from client
4. **User experience**: Kernel drivers require admin rights, cause compatibility issues, and feel invasive

**Trade-off acknowledged:**
- A sophisticated attacker can hook the Tauri IPC channel or spoof input data
- We accept this because our statistical layers will catch engine-assisted play regardless of delivery method
- The cheater can hide *how* they get engine moves, but can't hide *that* they're playing like an engine

**Mitigation:** Enhanced server-side statistical analysis, network traffic monitoring, and input replay verification compensate for lack of kernel-level visibility.

---

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Defense Philosophy](#2-defense-philosophy)
3. [Layer 1: Client Integrity](#3-layer-1-client-integrity)
4. [Layer 2: Behavioral Analysis](#4-layer-2-behavioral-analysis)
5. [Layer 3: Statistical Engine Detection](#5-layer-3-statistical-engine-detection)
6. [Layer 4: Network Traffic Analysis](#6-layer-4-network-traffic-analysis)
7. [Layer 5: Input Replay Verification](#7-layer-5-input-replay-verification)
8. [Layer 6: Economic & Account Controls](#8-layer-6-economic--account-controls)
9. [Layer 7: Real-time Monitoring](#9-layer-7-real-time-monitoring)
10. [Layer 8: Post-Game Deep Analysis](#10-layer-8-post-game-deep-analysis)
11. [Layer 9: Human Review Pipeline](#11-layer-9-human-review-pipeline)
12. [Implementation Phases](#12-implementation-phases)
13. [Data Architecture](#13-data-architecture)
14. [Privacy & Legal Considerations](#14-privacy--legal-considerations)
15. [Appendix: Detection Algorithms](#15-appendix-detection-algorithms)

---

## 1. Threat Model

### 1.1 Who Are the Adversaries?

| Adversary Type | Sophistication | Motivation | Risk Level |
|----------------|----------------|------------|------------|
| **Casual Cheater** | Low | Win games, boost ego | Medium |
| **Profit-Motivated** | Medium-High | Extract money from platform | Critical |
| **Organized Rings** | High | Systematic exploitation | Critical |
| **Technical Attackers** | Very High | Reverse engineer client, exploit vulnerabilities | Critical |

### 1.2 Attack Vectors

#### A. Engine Assistance (Primary Threat)

The most common and dangerous cheat. Player uses Stockfish or similar engine to get optimal moves.

**Variations:**
- **Direct engine use**: Engine running on same machine, player copies moves
- **Remote assistance**: Engine running on another device, moves communicated via second screen/phone
- **Delayed engine**: Only using engine on "critical" positions to avoid detection
- **Selective engine**: Using engine only when losing or in complex positions
- **Blended play**: Mixing own moves with engine moves to appear more human

**Why it's hard to detect:**
- Modern engines play at superhuman level
- A player using engine 30% of the time can still win most games
- Strong human players naturally find engine moves sometimes
- No direct evidence—it's all statistical inference

#### B. Move Database Lookup

Using opening books (first 15-20 moves) or endgame tablebases (perfect play with 7 or fewer pieces).

**Threat level:** Lower than engine, because:
- Opening theory is memorized by strong players anyway
- Endgame tablebases only help in simplified positions
- Doesn't help in complex middlegame where most games are decided

**Still matters because:**
- Combined with engine for middlegame = complete coverage
- Instant lookup is faster than human recall

#### C. Collaboration / Coaching

Having a stronger player (or someone with engine access) watch and suggest moves.

**Methods:**
- Screen sharing via Discord/Zoom
- Second person in room looking at screen
- Phone propped up showing the position to remote helper
- Text/voice chat with move suggestions

**Detection difficulty:** Very hard—no software signature, purely behavioral.

#### D. Time Manipulation

Exploiting clock mechanics to gain unfair advantage.

**Attacks:**
- Network lag simulation to get more thinking time
- Clock desync exploits
- Premove abuse in lag situations

**Mitigation:** Server-authoritative clocks with atomic operations (already implemented via Redis Lua scripts).

#### E. Sandbagging / Rating Manipulation

Intentionally losing games to lower rating, then winning against weaker opponents.

**Why it matters for betting:**
- Lower-rated player gets better odds
- Sandbagger then plays at true strength and wins easy money
- Multiple accounts enable parallel sandbagging

#### F. Match Fixing / Collusion

Two or more players working together to manipulate outcomes.

**Schemes:**
- Agree beforehand who wins, split winnings
- One player deliberately plays poorly
- Create artificial betting opportunities
- Wash trading between accounts

#### G. Account Abuse

- **Multi-accounting**: One person with multiple accounts
- **Account selling**: Buying high-rated accounts
- **Account sharing**: Multiple people using one account
- **Sybil attacks**: Creating fake accounts to manipulate matchmaking

#### H. Client Tampering

Modifying the Tauri desktop application to:
- Inject engine moves directly
- Bypass behavioral tracking
- Spoof mouse movements and timing data
- Disable integrity checks

---

## 2. Defense Philosophy

### 2.1 Core Principles

#### Principle 1: Defense in Depth

No single check catches all cheaters. Layer multiple independent detection systems so bypassing one doesn't grant immunity.

```
┌─────────────────────────────────────────────────────────────┐
│                    CHEATER ATTEMPT                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Client Integrity                                  │
│  - Code signing, tamper detection, environment checks       │
│  - Catches: Script kiddies, basic client mods              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Behavioral Analysis                               │
│  - Mouse patterns, timing, focus detection                  │
│  - Catches: Remote assistance, alt-tabbing to engine       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Statistical Engine Detection                      │
│  - Move correlation, centipawn loss, accuracy patterns     │
│  - Catches: Engine users, regardless of delivery method    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Economic Controls                                 │
│  - Stake limits, withdrawal delays, KYC                    │
│  - Catches: Profit-motivated cheaters (makes it not worth) │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Real-time Monitoring                              │
│  - Live flagging, human escalation                         │
│  - Catches: Obvious cheaters mid-game                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 6: Post-Game Deep Analysis                           │
│  - Full engine correlation, pattern matching               │
│  - Catches: Sophisticated cheaters missed by real-time     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 7: Human Review                                      │
│  - Expert analysis, appeal handling                        │
│  - Catches: Edge cases, prevents false positives           │
└─────────────────────────────────────────────────────────────┘
```

#### Principle 2: Asymmetric Costs

Make cheating expensive (time, money, risk) while keeping honest play frictionless.

| Action | Honest Player Cost | Cheater Cost |
|--------|-------------------|--------------|
| Play a game | Zero friction | Risk of detection |
| Withdraw winnings | Instant (under threshold) | Delayed + review |
| Get banned | N/A | Lose account + funds |
| Create new account | One-time setup | KYC + device flagged |

#### Principle 3: Probabilistic, Not Binary

Don't think "cheater or not." Think "cheat probability score."

- **0-20%**: Normal play, no action
- **20-50%**: Monitor closely, collect more data
- **50-80%**: Restrict high-stakes games, flag for review
- **80-95%**: Suspend betting privileges, human review
- **95%+**: Account suspension pending appeal

#### Principle 4: Assume Motivated Adversaries

Design as if attackers:
- Have read this document
- Have reverse-engineered the client
- Have unlimited time and technical skill
- Are willing to lose money testing detection systems

Security through obscurity is not security. Publish detection philosophy, keep specific thresholds secret.

#### Principle 5: Preserve User Experience

Anti-cheat that makes honest players miserable is worse than no anti-cheat.

**Never:**
- Require invasive kernel drivers
- Demand webcam/microphone access
- Block legitimate software (OBS, Discord)
- Create false positive hell

**Always:**
- Minimize performance impact
- Explain restrictions clearly
- Provide appeal process
- Respect privacy

---

## 3. Layer 1: Client Integrity

### 3.1 Why Rust/Tauri Matters

The Tauri architecture gives us significant advantages over Electron:

| Aspect | Electron | Tauri |
|--------|----------|-------|
| Core language | JavaScript (easy to read/modify) | Rust (compiled, hard to reverse) |
| Binary size | ~150MB | ~8MB |
| Code protection | ASAR archive (trivially extractable) | Native binary |
| Memory safety | V8 sandbox (bypassable) | Rust ownership model |

**Key insight:** Security-critical code lives in Rust, not JavaScript. The React frontend is just a view layer—all validation happens in Rust.

### 3.2 Code Signing

**What:** Digitally sign the application binary so users know it hasn't been tampered with.

**Implementation:**
```rust
// On app startup, verify own signature
fn verify_app_integrity() -> Result<(), SecurityError> {
    #[cfg(target_os = "macos")]
    {
        // Use codesign to verify bundle signature
        let output = Command::new("codesign")
            .args(["--verify", "--deep", "--strict", &bundle_path])
            .output()?;

        if !output.status.success() {
            return Err(SecurityError::TamperedBinary);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Use signtool or WinVerifyTrust API
        verify_authenticode_signature(&exe_path)?;
    }

    Ok(())
}
```

**Limitations:** A sophisticated attacker can patch out the signature check itself. This is a speed bump, not a wall.

### 3.3 Environment Detection

Detect suspicious runtime environments:

```rust
/// Checks for debugging, virtualization, and known cheat tools
pub struct EnvironmentChecker {
    flags: EnvironmentFlags,
}

#[derive(Default)]
pub struct EnvironmentFlags {
    pub debugger_present: bool,
    pub virtual_machine: bool,
    pub known_cheat_tools: Vec<String>,
    pub suspicious_processes: Vec<String>,
    pub memory_tampering: bool,
}

impl EnvironmentChecker {
    pub fn scan() -> Self {
        let mut flags = EnvironmentFlags::default();

        // Check for debugger
        #[cfg(target_os = "windows")]
        {
            flags.debugger_present = unsafe { IsDebuggerPresent() != 0 };
        }

        #[cfg(target_os = "macos")]
        {
            flags.debugger_present = check_ptrace_deny_attach();
        }

        // Check for VM (not blocking, just flagging)
        flags.virtual_machine = detect_vm_artifacts();

        // Scan for known cheat tools
        flags.known_cheat_tools = scan_for_processes(&[
            "cheatengine", "ollydbg", "x64dbg", "ida",
            "stockfish", "komodo", "leela",  // Chess engines
        ]);

        Self { flags }
    }

    /// Returns risk score 0-100
    pub fn risk_score(&self) -> u8 {
        let mut score = 0u8;

        if self.flags.debugger_present { score += 40; }
        if self.flags.virtual_machine { score += 10; }
        if !self.flags.known_cheat_tools.is_empty() { score += 50; }

        score.min(100)
    }
}
```

**Chess-specific process detection:**
```rust
const CHESS_ENGINE_PROCESSES: &[&str] = &[
    // Commercial/Open Source Engines
    "stockfish", "komodo", "leela", "lc0", "houdini", "fire",
    "rybka", "fritz", "shredder", "crafty", "fruit", "ethereal",
    "berserk", "koivisto", "slowchess", "demolito",

    // Chess GUIs (might have engine attached)
    "arena", "scid", "chessbase", "lucaschess", "tarrasch",
    "cutechess", "banksiagui", "nibbler",

    // Analysis tools / browser tabs
    "lichess", "chess.com", "chess24", "chessify",
];

const SCREEN_SHARING_PROCESSES: &[&str] = &[
    // Video conferencing (screen share capable)
    "discord", "zoom", "teams", "skype", "slack", "webex",
    "googlemeet", "facetime",

    // Streaming software
    "obs", "streamlabs", "xsplit", "nvidia broadcast",

    // Remote access (high risk - full control)
    "anydesk", "teamviewer", "parsec", "rustdesk",
    "chrome remote desktop", "vnc", "rdp",
];

const MOBILE_MIRRORING_PROCESSES: &[&str] = &[
    // Phone screen mirroring (engine on phone, visible on desktop)
    "scrcpy", "vysor", "airdroid", "apowermirror",
    "letsview", "reflector", "airserver",
];

const AUTOMATION_TOOLS: &[&str] = &[
    // Input automation (could inject moves programmatically)
    "autohotkey", "autoit", "macro", "sikuli",
    "pyautogui", "robotjs", "xdotool",
];

const OCR_TOOLS: &[&str] = &[
    // Screen OCR (position → FEN → engine pipeline)
    "tesseract", "ocr", "textract", "abbyy",
    "chessocr", "chessvision",
];
```

**Detection strategy:**
- **Don't block** these processes—many legitimate users have Discord open
- **Adjust trust score** based on presence (cumulative risk)
- **Correlate with behavior**: Discord + unfocus + instant best move = high suspicion
- **Log for post-game analysis**: Reviewer sees what was running during the game

**Process correlation scoring:**
```rust
fn calculate_environment_risk(processes: &[DetectedProcess]) -> EnvironmentRisk {
    let mut score = 0u8;
    let mut flags = Vec::new();

    // Chess engine running = major flag
    if processes.iter().any(|p| CHESS_ENGINE_PROCESSES.contains(&p.name)) {
        score += 60;
        flags.push("chess_engine_detected");
    }

    // Screen sharing during game = moderate flag
    if processes.iter().any(|p| SCREEN_SHARING_PROCESSES.contains(&p.name)) {
        score += 20;
        flags.push("screen_sharing_active");
    }

    // Mobile mirroring = high flag (common engine delivery method)
    if processes.iter().any(|p| MOBILE_MIRRORING_PROCESSES.contains(&p.name)) {
        score += 40;
        flags.push("mobile_mirroring_detected");
    }

    // Automation tools = moderate flag
    if processes.iter().any(|p| AUTOMATION_TOOLS.contains(&p.name)) {
        score += 30;
        flags.push("automation_tool_detected");
    }

    // OCR tools = high flag (position extraction)
    if processes.iter().any(|p| OCR_TOOLS.contains(&p.name)) {
        score += 45;
        flags.push("ocr_tool_detected");
    }

    EnvironmentRisk {
        score: score.min(100),
        flags,
        detected_processes: processes.to_vec(),
    }
}
```

### 3.4 Memory Integrity

Detect if game state has been modified in memory:

```rust
/// Periodic check that critical game state matches server
pub async fn verify_game_state_integrity(
    local_state: &GameState,
    game_id: &str,
) -> Result<IntegrityResult, Error> {
    // Get authoritative state from server
    let server_state = api::get_game_state(game_id).await?;

    // Compare critical fields
    let fen_matches = local_state.fen == server_state.fen;
    let moves_match = local_state.move_history == server_state.move_history;
    let clocks_reasonable = (local_state.white_time - server_state.white_time).abs() < 2000;

    if !fen_matches || !moves_match {
        return Ok(IntegrityResult::Tampering {
            field: if !fen_matches { "fen" } else { "moves" },
            local: local_state.clone(),
            server: server_state,
        });
    }

    Ok(IntegrityResult::Valid)
}
```

### 3.5 Input Source Verification

Track whether moves come from legitimate user input:

```rust
/// Records the source of each move for analysis
#[derive(Debug, Clone, Serialize)]
pub struct MoveSource {
    /// Timestamp when move was initiated
    pub timestamp: u64,

    /// How the piece was selected
    pub selection_method: SelectionMethod,

    /// How the destination was chosen
    pub destination_method: DestinationMethod,

    /// Mouse/touch path during move
    pub input_path: Vec<InputPoint>,

    /// Time spent with piece selected
    pub selection_duration_ms: u32,

    /// Whether window had focus throughout
    pub maintained_focus: bool,
}

#[derive(Debug, Clone, Serialize)]
pub enum SelectionMethod {
    MouseClick { x: f32, y: f32 },
    TouchTap { x: f32, y: f32 },
    KeyboardShortcut { key: String },
    DragStart { x: f32, y: f32 },
    Programmatic,  // RED FLAG if this appears
}

#[derive(Debug, Clone, Serialize)]
pub struct InputPoint {
    pub x: f32,
    pub y: f32,
    pub timestamp: u64,
    pub pressure: Option<f32>,  // For touch devices
}
```

**Red flags:**
- `Programmatic` selection method
- Empty input path (move appeared without mouse movement)
- Perfectly straight input paths (pixel-perfect lines are inhuman)
- Input during window unfocus

---

## 4. Layer 2: Behavioral Analysis

### 4.1 The Human Fingerprint

Humans exhibit predictable patterns that are hard to fake:

1. **Thinking time varies** with position complexity
2. **Mouse movements are curved**, not linear
3. **Focus shifts** between board areas based on threats
4. **Fatigue** affects late-game performance
5. **Emotional responses** to blunders/brilliancies

### 4.2 Move Timing Analysis

```typescript
interface MoveTimingProfile {
  // Time taken for this specific move
  moveTimeMs: number;

  // Position complexity (material, pawn structure, piece activity)
  positionComplexity: number;  // 0-100

  // Number of legal moves available
  legalMoveCount: number;

  // Whether this was a "forced" move (only good option)
  isForcedMove: boolean;

  // Time remaining on clock
  clockRemaining: number;

  // Time control (bullet/blitz/rapid affects behavior)
  timeControl: TimeControl;
}

function analyzeTimingAnomaly(profile: MoveTimingProfile): AnomalyScore {
  const expected = calculateExpectedTime(profile);
  const actual = profile.moveTimeMs;

  // Suspiciously fast on complex position
  if (profile.positionComplexity > 70 && actual < expected * 0.3) {
    return { score: 0.7, reason: 'fast_complex_position' };
  }

  // Suspiciously consistent timing
  // Humans vary; engines + copy-paste are consistent
  if (timingVariance < 0.1 && gameLength > 20) {
    return { score: 0.6, reason: 'robotic_consistency' };
  }

  // Instant moves on non-obvious positions
  if (actual < 500 && !profile.isForcedMove && profile.legalMoveCount > 10) {
    return { score: 0.5, reason: 'instant_non_forced' };
  }

  return { score: 0, reason: null };
}
```

### 4.3 Mouse Movement Patterns

```typescript
interface MousePattern {
  // Path from click to click
  path: Point[];

  // Velocity profile
  velocities: number[];

  // Acceleration profile
  accelerations: number[];

  // Hesitations (velocity near zero)
  hesitations: { position: Point; duration: number }[];
}

function analyzeMousePattern(pattern: MousePattern): AnomalyScore {
  // Check for linear interpolation (bot-like)
  const linearity = calculatePathLinearity(pattern.path);
  if (linearity > 0.95) {
    return { score: 0.8, reason: 'linear_mouse_path' };
  }

  // Check for natural acceleration curve
  // Humans accelerate at start, decelerate at end
  const hasNaturalCurve = checkAccelerationProfile(pattern.accelerations);
  if (!hasNaturalCurve) {
    return { score: 0.6, reason: 'unnatural_acceleration' };
  }

  // Check for micro-corrections (human fine-tuning)
  const hasMicroCorrections = detectMicroCorrections(pattern.path);
  if (!hasMicroCorrections && pattern.path.length > 50) {
    return { score: 0.4, reason: 'no_micro_corrections' };
  }

  return { score: 0, reason: null };
}
```

### 4.4 Focus and Attention Tracking

```rust
/// Tracks user attention patterns during the game
pub struct AttentionTracker {
    /// Whether app window is currently focused
    window_focused: bool,

    /// History of focus changes
    focus_events: Vec<FocusEvent>,

    /// Mouse position relative to window
    mouse_in_window: bool,

    /// Keyboard activity (any key pressed recently)
    keyboard_active: bool,
}

#[derive(Debug, Clone)]
pub struct FocusEvent {
    pub timestamp: u64,
    pub event_type: FocusEventType,
    pub duration_unfocused_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub enum FocusEventType {
    WindowFocused,
    WindowUnfocused,
    MouseEntered,
    MouseExited,
}

impl AttentionTracker {
    /// Analyze focus patterns for suspicious behavior
    pub fn analyze(&self, game_moves: &[MoveWithTiming]) -> AttentionAnalysis {
        let mut suspicious_moves = Vec::new();

        for (i, move_data) in game_moves.iter().enumerate() {
            // Find focus events during this move's thinking time
            let events_during_move = self.focus_events.iter()
                .filter(|e| e.timestamp >= move_data.start_time
                         && e.timestamp <= move_data.end_time)
                .collect::<Vec<_>>();

            // Pattern: Unfocus → (thinking) → Refocus → Instant move
            if let Some(unfocus) = events_during_move.iter()
                .find(|e| matches!(e.event_type, FocusEventType::WindowUnfocused))
            {
                if let Some(refocus) = events_during_move.iter()
                    .find(|e| matches!(e.event_type, FocusEventType::WindowFocused)
                           && e.timestamp > unfocus.timestamp)
                {
                    let time_after_refocus = move_data.end_time - refocus.timestamp;
                    if time_after_refocus < 2000 {  // Moved within 2 seconds of refocus
                        suspicious_moves.push(SuspiciousMove {
                            move_index: i,
                            reason: "instant_move_after_refocus",
                            confidence: 0.7,
                        });
                    }
                }
            }
        }

        AttentionAnalysis {
            total_unfocus_time: self.calculate_total_unfocus_time(),
            unfocus_count: self.count_unfocus_events(),
            suspicious_moves,
            risk_score: self.calculate_risk_score(game_moves),
        }
    }
}
```

### 4.5 Behavioral Baseline Building

Each player develops a behavioral "fingerprint" over time:

```typescript
interface PlayerBehaviorProfile {
  playerId: string;

  // Timing patterns
  avgMoveTimeByComplexity: Map<ComplexityBucket, Distribution>;
  moveTimeVariance: number;

  // Mouse patterns
  avgPathCurvature: number;
  avgMicroCorrectionCount: number;

  // Focus patterns
  avgUnfocusPerGame: number;
  typicalUnfocusDuration: Distribution;

  // Performance patterns
  accuracyByTimeRemaining: Map<TimeBucket, number>;
  blunderRateByFatigue: number[];  // By move number

  // Time control preferences
  performanceByTimeControl: Map<TimeControl, Rating>;
}

function detectBehaviorShift(
  historical: PlayerBehaviorProfile,
  currentGame: GameBehaviorData
): BehaviorShiftAnalysis {
  const shifts: BehaviorShift[] = [];

  // Timing shift
  const timingDiff = compareDistributions(
    historical.avgMoveTimeByComplexity,
    currentGame.moveTimesByComplexity
  );
  if (timingDiff.significanceLevel < 0.01) {
    shifts.push({
      type: 'timing',
      direction: timingDiff.direction,
      magnitude: timingDiff.effectSize,
    });
  }

  // Accuracy shift (suddenly playing way above their level)
  const accuracyDiff = currentGame.accuracy - historical.expectedAccuracy;
  if (accuracyDiff > 15) {  // 15+ accuracy points above baseline
    shifts.push({
      type: 'accuracy',
      direction: 'increase',
      magnitude: accuracyDiff,
    });
  }

  // Mouse pattern shift
  if (currentGame.avgPathCurvature < historical.avgPathCurvature * 0.5) {
    shifts.push({
      type: 'mouse_pattern',
      direction: 'more_linear',
      magnitude: (historical.avgPathCurvature - currentGame.avgPathCurvature)
                 / historical.avgPathCurvature,
    });
  }

  return {
    shifts,
    overallShiftScore: calculateOverallShiftScore(shifts),
    possibleExplanations: generateExplanations(shifts),
  };
}
```

---

## 5. Layer 3: Statistical Engine Detection

This is the core of anti-cheat: detecting when moves correlate too strongly with engine recommendations.

### 5.1 The Challenge

**The fundamental problem:** Strong humans and engines often find the same moves.

Consider this position:
```
r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4
```

Both a 2000-rated human and Stockfish might play `Ng5` (threatening Nxf7). The engine correlation is 100% for this move—but it's not cheating, it's just an obvious move.

**Key insight:** We don't flag individual moves. We analyze patterns across many moves.

### 5.2 Move Correlation Analysis

```typescript
interface EngineCorrelationAnalysis {
  gameId: string;

  // How many moves matched engine's #1 choice
  topMoveMatches: number;
  totalMoves: number;
  topMoveRate: number;  // topMoveMatches / totalMoves

  // How many moves were in engine's top 3
  top3Matches: number;
  top3Rate: number;

  // Average centipawn loss per move
  avgCentipawnLoss: number;

  // Centipawn loss on critical moves (where one move is much better)
  criticalMoveCPL: number;

  // Move rank distribution [#1, #2, #3, #4, #5+]
  moveRankDistribution: number[];

  // Correlation broken down by game phase
  openingCorrelation: number;    // Moves 1-15
  middlegameCorrelation: number; // Moves 16-35
  endgameCorrelation: number;    // Moves 36+
}

async function analyzeEngineCorrelation(
  game: GameRecord,
  depth: number = 20
): Promise<EngineCorrelationAnalysis> {
  const analysis: MoveAnalysis[] = [];

  for (let i = 0; i < game.moves.length; i++) {
    const position = game.fens[i];
    const playedMove = game.moves[i];

    // Get engine evaluation
    const engineEval = await stockfish.analyze(position, depth);

    // Find where the played move ranks in engine's list
    const moveRank = engineEval.moves.findIndex(
      m => m.move === playedMove
    ) + 1;

    // Calculate centipawn loss
    const bestEval = engineEval.moves[0].score;
    const playedEval = engineEval.moves.find(m => m.move === playedMove)?.score ?? -Infinity;
    const cpLoss = Math.max(0, bestEval - playedEval);

    analysis.push({
      moveIndex: i,
      playedMove,
      moveRank: moveRank || 99,  // 99 if not in top moves
      centipawnLoss: cpLoss,
      isCritical: isCriticalPosition(engineEval),
      phase: getGamePhase(i, game.moves.length),
    });
  }

  return computeCorrelationMetrics(analysis);
}
```

### 5.3 Critical Position Detection

Not all moves matter equally. A "critical position" is where:
- There's a big gap between the best move and second-best
- The position is complex (many reasonable-looking options)
- The best move is non-obvious (requires deep calculation)

```typescript
function isCriticalPosition(engineEval: EngineEvaluation): boolean {
  const moves = engineEval.moves;

  if (moves.length < 2) return false;

  const bestScore = moves[0].score;
  const secondScore = moves[1].score;
  const gap = bestScore - secondScore;

  // Critical if best move is significantly better
  if (gap > 100) return true;  // 1+ pawn advantage

  // Critical if there are many moves but only one is good
  if (moves.length > 10 && gap > 50) return true;

  // Critical if it's a tactical shot
  if (moves[0].isTactical && gap > 30) return true;

  return false;
}
```

### 5.4 Expected Performance Model

Compare actual performance to expected performance based on rating:

```typescript
interface ExpectedPerformance {
  rating: number;

  // Expected metrics based on historical data from millions of games
  expectedTopMoveRate: Distribution;
  expectedTop3Rate: Distribution;
  expectedAvgCPL: Distribution;
  expectedCriticalCPL: Distribution;
}

// Based on Lichess research data
const PERFORMANCE_BY_RATING: Map<RatingBucket, ExpectedPerformance> = new Map([
  ['1000-1200', {
    expectedTopMoveRate: { mean: 0.35, std: 0.08 },
    expectedTop3Rate: { mean: 0.55, std: 0.10 },
    expectedAvgCPL: { mean: 85, std: 25 },
    expectedCriticalCPL: { mean: 120, std: 40 },
  }],
  ['1200-1400', {
    expectedTopMoveRate: { mean: 0.40, std: 0.08 },
    expectedTop3Rate: { mean: 0.60, std: 0.09 },
    expectedAvgCPL: { mean: 65, std: 20 },
    expectedCriticalCPL: { mean: 95, std: 35 },
  }],
  ['1400-1600', {
    expectedTopMoveRate: { mean: 0.45, std: 0.07 },
    expectedTop3Rate: { mean: 0.65, std: 0.08 },
    expectedAvgCPL: { mean: 50, std: 18 },
    expectedCriticalCPL: { mean: 75, std: 30 },
  }],
  ['1600-1800', {
    expectedTopMoveRate: { mean: 0.50, std: 0.07 },
    expectedTop3Rate: { mean: 0.70, std: 0.07 },
    expectedAvgCPL: { mean: 40, std: 15 },
    expectedCriticalCPL: { mean: 60, std: 25 },
  }],
  ['1800-2000', {
    expectedTopMoveRate: { mean: 0.55, std: 0.06 },
    expectedTop3Rate: { mean: 0.75, std: 0.06 },
    expectedAvgCPL: { mean: 32, std: 12 },
    expectedCriticalCPL: { mean: 48, std: 20 },
  }],
  ['2000-2200', {
    expectedTopMoveRate: { mean: 0.60, std: 0.06 },
    expectedTop3Rate: { mean: 0.80, std: 0.05 },
    expectedAvgCPL: { mean: 25, std: 10 },
    expectedCriticalCPL: { mean: 38, std: 18 },
  }],
  ['2200+', {
    expectedTopMoveRate: { mean: 0.65, std: 0.05 },
    expectedTop3Rate: { mean: 0.85, std: 0.05 },
    expectedAvgCPL: { mean: 20, std: 8 },
    expectedCriticalCPL: { mean: 30, std: 15 },
  }],
]);

function calculatePerformanceAnomaly(
  observed: EngineCorrelationAnalysis,
  playerRating: number
): AnomalyScore {
  const expected = getExpectedPerformance(playerRating);

  // Z-score for top move rate
  const topMoveZ = (observed.topMoveRate - expected.expectedTopMoveRate.mean)
                   / expected.expectedTopMoveRate.std;

  // Z-score for critical position CPL
  const criticalZ = (expected.expectedCriticalCPL.mean - observed.criticalMoveCPL)
                    / expected.expectedCriticalCPL.std;

  // Combined anomaly score
  // High positive Z-scores mean playing better than expected
  const combinedZ = (topMoveZ + criticalZ) / 2;

  // Convert to probability of cheating
  // Uses empirical data: what % of flagged players with this Z were confirmed cheaters
  const cheatProbability = zScoreToCheatProbability(combinedZ);

  return {
    score: cheatProbability,
    topMoveZ,
    criticalZ,
    details: {
      observedTopMoveRate: observed.topMoveRate,
      expectedTopMoveRate: expected.expectedTopMoveRate.mean,
      observedCriticalCPL: observed.criticalMoveCPL,
      expectedCriticalCPL: expected.expectedCriticalCPL.mean,
    },
  };
}
```

### 5.5 Detecting Selective Engine Use

Smart cheaters don't use engine every move. They blend:

```typescript
interface SelectiveEnginePattern {
  // Moves where engine was likely used
  suspiciousMoves: number[];

  // Moves that seem human
  humanMoves: number[];

  // Pattern analysis
  usagePattern: UsagePattern;
}

type UsagePattern =
  | 'consistent_human'      // Normal player
  | 'consistent_engine'     // Obvious cheater
  | 'critical_only'         // Uses engine on critical moves only
  | 'losing_only'           // Uses engine when behind
  | 'random_blend';         // Random mix (sophisticated cheater)

function detectSelectiveUse(
  analysis: MoveAnalysis[],
  playerRating: number
): SelectiveEnginePattern {
  const expected = getExpectedPerformance(playerRating);

  // Classify each move
  const classified = analysis.map(move => ({
    ...move,
    classification: classifyMove(move, expected),
  }));

  const suspiciousMoves = classified
    .filter(m => m.classification === 'engine_likely')
    .map(m => m.moveIndex);

  const humanMoves = classified
    .filter(m => m.classification === 'human_likely')
    .map(m => m.moveIndex);

  // Detect pattern
  const pattern = detectUsagePattern(classified);

  return { suspiciousMoves, humanMoves, usagePattern: pattern };
}

function classifyMove(move: MoveAnalysis, expected: ExpectedPerformance): MoveClass {
  // IMPROVED: Check top-3 moves, not just top-1
  // Smart cheaters occasionally pick #2 or #3 to appear more human
  if (move.moveRank <= 3 && move.isCritical) {
    // What's the probability a player of this rating finds a top-N move here?
    const findProbability = topNFinderProbability(expected.rating, move.moveRank, move);

    // Top-1 on critical position with low find probability = likely engine
    if (move.moveRank === 1 && findProbability < 0.10) {
      return 'engine_likely';
    }

    // Top-2 or top-3 on very critical position (gap > 150cp) = also suspicious
    if (move.moveRank <= 3 && move.isCritical && move.positionGap > 150 && findProbability < 0.15) {
      return 'engine_likely';
    }
  }

  // If move had significant CPL, probably human
  if (move.centipawnLoss > expected.expectedCriticalCPL.mean) {
    return 'human_likely';
  }

  return 'ambiguous';
}

/**
 * Calculate probability that a player of given rating finds a top-N move
 * Based on position complexity, move rank, and rating band statistics
 */
function topNFinderProbability(
  rating: number,
  moveRank: number,
  move: MoveAnalysis
): number {
  const baseRate = getExpectedPerformance(rating);

  // Top-1 move: use expectedTopMoveRate
  if (moveRank === 1) {
    // Adjust for position complexity
    const complexityMultiplier = move.positionComplexity > 70 ? 0.6 : 1.0;
    return baseRate.expectedTopMoveRate.mean * complexityMultiplier;
  }

  // Top-2 move: slightly higher probability
  if (moveRank === 2) {
    return baseRate.expectedTop3Rate.mean * 0.4;  // Rough estimate
  }

  // Top-3 move
  return baseRate.expectedTop3Rate.mean * 0.25;
}

function detectUsagePattern(classified: ClassifiedMove[]): UsagePattern {
  const engineMoves = classified.filter(m => m.classification === 'engine_likely');
  const humanMoves = classified.filter(m => m.classification === 'human_likely');

  // All human
  if (engineMoves.length === 0) {
    return 'consistent_human';
  }

  // All engine (or nearly)
  if (humanMoves.length < classified.length * 0.1) {
    return 'consistent_engine';
  }

  // Engine only on critical positions
  const engineOnCritical = engineMoves.filter(m => m.isCritical).length;
  if (engineOnCritical / engineMoves.length > 0.8) {
    return 'critical_only';
  }

  // Engine only when losing
  const engineWhenLosing = engineMoves.filter(m => m.evalBefore < -100).length;
  if (engineWhenLosing / engineMoves.length > 0.7) {
    return 'losing_only';
  }

  return 'random_blend';
}
```

### 5.6 Multi-Game Analysis

One game is not enough data. Analyze patterns across multiple games:

```typescript
interface MultiGameAnalysis {
  playerId: string;
  gameCount: number;

  // Aggregated metrics
  overallTopMoveRate: number;
  overallAvgCPL: number;

  // Variance (cheaters often have suspiciously low variance)
  performanceVariance: number;

  // Trend (improving too fast?)
  ratingTrend: number;      // ELO change per game
  accuracyTrend: number;    // Accuracy change over time

  // Cross-game patterns
  consistentEngineSignature: boolean;  // Same engine settings across games

  // Per-opponent analysis (collusion detection)
  performanceByOpponent: Map<string, PerformanceStats>;
}

async function analyzePlayerHistory(
  playerId: string,
  recentGames: number = 50
): Promise<MultiGameAnalysis> {
  const games = await db.getRecentGames(playerId, recentGames);
  const analyses = await Promise.all(
    games.map(g => analyzeEngineCorrelation(g))
  );

  // Check for suspicious consistency
  const topMoveRates = analyses.map(a => a.topMoveRate);
  const variance = calculateVariance(topMoveRates);

  // Humans have bad days. If variance is too low, suspicious.
  const expectedVariance = getExpectedVariance(games[0].playerRating);
  const varianceRatio = variance / expectedVariance;

  // Check for rapid improvement
  const ratingChange = games[games.length - 1].playerRating - games[0].playerRating;
  const ratingTrend = ratingChange / games.length;

  // Dangerous if gaining >10 ELO per game sustained

  return {
    playerId,
    gameCount: games.length,
    overallTopMoveRate: mean(topMoveRates),
    overallAvgCPL: mean(analyses.map(a => a.avgCentipawnLoss)),
    performanceVariance: variance,
    ratingTrend,
    accuracyTrend: calculateAccuracyTrend(analyses),
    consistentEngineSignature: detectConsistentEngine(analyses),
    performanceByOpponent: groupByOpponent(games, analyses),
  };
}
```

---

## 6. Layer 4: Network Traffic Analysis

### 6.1 Why This Layer Matters

A player can have a browser tab open to an external chess analysis API. The client sees nothing suspicious—no detectable process, no window unfocus. But network traffic reveals the communication.

**Attack vector:** Player sends position to `api.chess-engine.com`, receives best move, plays it.

**Key insight:** Even without deep packet inspection, traffic *patterns* are detectable.

### 6.2 Traffic Pattern Detection

```typescript
interface NetworkActivityProfile {
  gameId: string;
  playerId: string;

  // Per-move network events
  moveNetworkEvents: MoveNetworkEvent[];

  // Aggregate patterns
  totalExternalRequests: number;
  requestsCorrelatedWithMoves: number;
  suspiciousEndpoints: string[];
}

interface MoveNetworkEvent {
  moveIndex: number;
  moveTimestamp: number;

  // Network activity in window around move
  requestsBefore: NetworkRequest[];  // 5 seconds before move
  requestsAfter: NetworkRequest[];   // 2 seconds after move

  // Correlation flags
  hasPreMoveSpike: boolean;
  hasSuspiciousEndpoint: boolean;
}

interface NetworkRequest {
  timestamp: number;
  destination: string;  // Domain only, not full URL
  sizeBytes: number;
  durationMs: number;
  protocol: 'http' | 'https' | 'ws' | 'wss';
}
```

### 6.3 Suspicious Endpoint Detection

```typescript
const KNOWN_CHESS_API_DOMAINS: string[] = [
  // Public chess analysis APIs
  'lichess.org/api',
  'chess.com/callback',
  'chessify.me/api',
  'chess-api.com',
  'stockfish.online',
  'chess.wintrcat.uk',

  // Cloud compute (could be running engine)
  'compute.amazonaws.com',
  'cloudfunction.net',
  'run.app',  // Google Cloud Run
  'azurewebsites.net',
  'workers.dev',  // Cloudflare Workers

  // VPS providers (self-hosted engine)
  'digitaloceanspaces.com',
  'linode.com',
  'vultr.com',
];

const SUSPICIOUS_PATTERNS: RegExp[] = [
  /stockfish/i,
  /chess.*engine/i,
  /analysis.*api/i,
  /eval.*position/i,
  /bestmove/i,
  /fen.*uci/i,
];

function analyzeNetworkActivity(
  requests: NetworkRequest[],
  gameMoves: MoveWithTiming[]
): NetworkSuspicionScore {
  const suspiciousRequests: SuspiciousRequest[] = [];

  for (const request of requests) {
    // Check for known chess API domains
    const isKnownChessApi = KNOWN_CHESS_API_DOMAINS.some(
      domain => request.destination.includes(domain)
    );

    // Check for suspicious patterns in domain
    const matchesSuspiciousPattern = SUSPICIOUS_PATTERNS.some(
      pattern => pattern.test(request.destination)
    );

    if (isKnownChessApi || matchesSuspiciousPattern) {
      // Find if this request correlates with a move
      const correlatedMove = findCorrelatedMove(request.timestamp, gameMoves);

      suspiciousRequests.push({
        request,
        reason: isKnownChessApi ? 'known_chess_api' : 'suspicious_pattern',
        correlatedMoveIndex: correlatedMove?.index ?? null,
      });
    }
  }

  // Calculate score based on correlation strength
  const correlatedCount = suspiciousRequests.filter(r => r.correlatedMoveIndex !== null).length;
  const totalMoves = gameMoves.length;

  return {
    score: Math.min(correlatedCount / totalMoves * 2, 1),  // 50% correlated = 100% suspicion
    suspiciousRequests,
    summary: `${correlatedCount} requests correlated with moves out of ${suspiciousRequests.length} suspicious total`,
  };
}

function findCorrelatedMove(
  requestTimestamp: number,
  moves: MoveWithTiming[]
): { index: number; move: MoveWithTiming } | null {
  // Request is "correlated" if it happens 1-10 seconds before a move
  // (Time to send position, receive analysis, think briefly, play)
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const timeBefore = move.timestamp - requestTimestamp;

    if (timeBefore > 1000 && timeBefore < 10000) {
      return { index: i, move };
    }
  }
  return null;
}
```

### 6.4 WebSocket Analysis

Real-time engine assistance often uses WebSockets for low latency:

```typescript
interface WebSocketProfile {
  // Active WS connections during game
  connections: WebSocketConnection[];

  // Message patterns
  messageFrequency: number;  // Messages per minute
  messageSizeDistribution: Distribution;

  // Correlation with moves
  messagesCorrelatedWithMoves: number;
}

interface WebSocketConnection {
  endpoint: string;
  openedAt: number;
  closedAt: number | null;
  messageCount: number;
  totalBytesReceived: number;
}

function analyzeWebSocketActivity(profile: WebSocketProfile, gameMoves: MoveWithTiming[]): number {
  let suspicionScore = 0;

  for (const conn of profile.connections) {
    // WebSocket open for duration of game = persistent connection
    const wasOpenDuringGame = conn.openedAt < gameMoves[0].timestamp
      && (conn.closedAt === null || conn.closedAt > gameMoves[gameMoves.length - 1].timestamp);

    if (wasOpenDuringGame) {
      // Check if message count roughly matches move count
      const moveCount = gameMoves.length;
      const messageCount = conn.messageCount;

      // Suspicious: ~2 messages per move (send position, receive analysis)
      if (messageCount >= moveCount * 1.5 && messageCount <= moveCount * 3) {
        suspicionScore += 0.4;
      }

      // Check endpoint
      if (KNOWN_CHESS_API_DOMAINS.some(d => conn.endpoint.includes(d))) {
        suspicionScore += 0.5;
      }
    }
  }

  return Math.min(suspicionScore, 1);
}
```

### 6.5 Implementation Note: Privacy-Preserving Monitoring

We monitor network *patterns*, not content:
- **Collect:** Domain names, request timing, size
- **Don't collect:** Request bodies, authentication tokens, personal data
- **Process locally:** Analysis happens on client, only flags sent to server

```rust
/// Client-side network monitor (Tauri/Rust)
/// Only collects metadata, not content
pub struct NetworkMonitor {
    /// Domain → request count during game
    request_counts: HashMap<String, u32>,

    /// Timestamps of requests to suspicious domains
    suspicious_request_times: Vec<u64>,
}

impl NetworkMonitor {
    pub fn on_request(&mut self, domain: &str, timestamp: u64) {
        *self.request_counts.entry(domain.to_string()).or_insert(0) += 1;

        if self.is_suspicious_domain(domain) {
            self.suspicious_request_times.push(timestamp);
        }
    }

    /// Returns summary for server (no raw domains/IPs)
    pub fn get_summary(&self) -> NetworkSummary {
        NetworkSummary {
            total_requests: self.request_counts.values().sum(),
            suspicious_request_count: self.suspicious_request_times.len(),
            suspicious_request_timestamps: self.suspicious_request_times.clone(),
            // Don't send actual domain names to server
        }
    }
}
```

---

## 7. Layer 5: Input Replay Verification

### 7.1 Why Input Verification Matters

The client sends mouse paths and timing data with each move. But how do we know it's real?

**Attack vector:** Automated tool generates fake mouse paths that look human, injects them into the client.

**Solution:** Server-side verification that the input data is physically possible and internally consistent.

### 7.2 Physics-Based Validation

```typescript
interface InputValidation {
  moveIndex: number;
  claimedPath: InputPoint[];
  claimedDuration: number;

  // Validation results
  isPhysicallyPossible: boolean;
  physicsViolations: PhysicsViolation[];
  consistencyScore: number;
}

interface PhysicsViolation {
  type: 'impossible_speed' | 'teleportation' | 'negative_time' | 'impossible_acceleration';
  details: string;
  severity: 'warning' | 'critical';
}

function validateInputPhysics(path: InputPoint[]): PhysicsViolation[] {
  const violations: PhysicsViolation[] = [];

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];

    const distance = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
    );
    const timeDelta = curr.timestamp - prev.timestamp;

    // Check 1: Time must move forward
    if (timeDelta <= 0) {
      violations.push({
        type: 'negative_time',
        details: `Time went backwards: ${timeDelta}ms`,
        severity: 'critical',
      });
    }

    // Check 2: Speed limit (fastest human mouse movement ~15,000 px/sec)
    const speed = distance / (timeDelta / 1000);
    if (speed > 20000) {  // Allow some margin
      violations.push({
        type: 'impossible_speed',
        details: `Speed ${speed.toFixed(0)} px/sec exceeds human limit`,
        severity: 'critical',
      });
    }

    // Check 3: No teleportation (large instant jumps)
    if (distance > 500 && timeDelta < 10) {
      violations.push({
        type: 'teleportation',
        details: `Moved ${distance.toFixed(0)}px in ${timeDelta}ms`,
        severity: 'critical',
      });
    }

    // Check 4: Acceleration limits
    if (i >= 2) {
      const prevPrev = path[i - 2];
      const prevSpeed = calculateSpeed(prevPrev, prev);
      const currSpeed = calculateSpeed(prev, curr);
      const acceleration = Math.abs(currSpeed - prevSpeed) / (timeDelta / 1000);

      // Human acceleration limit ~50,000 px/sec²
      if (acceleration > 80000) {
        violations.push({
          type: 'impossible_acceleration',
          details: `Acceleration ${acceleration.toFixed(0)} px/sec² exceeds human limit`,
          severity: 'warning',
        });
      }
    }
  }

  return violations;
}
```

### 7.3 Cross-Validation with Move Timing

```typescript
interface MoveInputConsistency {
  // Claimed data
  claimedMoveTime: number;      // Time from "my turn" to move sent
  claimedInputDuration: number;  // Time from first click to final click

  // Derived checks
  inputAccountsForMoveTime: boolean;
  inputStartedBeforeTurn: boolean;  // RED FLAG
  pathEndsAtCorrectSquare: boolean;
}

function validateMoveConsistency(
  move: Move,
  input: MoveInput,
  gameState: GameState
): MoveInputConsistency {
  const turnStartTime = gameState.lastMoveTimestamp;
  const moveEndTime = move.timestamp;
  const claimedMoveTime = moveEndTime - turnStartTime;

  const inputStartTime = input.path[0]?.timestamp ?? 0;
  const inputEndTime = input.path[input.path.length - 1]?.timestamp ?? 0;
  const claimedInputDuration = inputEndTime - inputStartTime;

  // Check 1: Input should account for most of thinking time
  // (Can't move mouse for 30 seconds but claim move took 2 seconds)
  const inputAccountsForMoveTime = claimedInputDuration >= claimedMoveTime * 0.3
    || claimedMoveTime < 2000;  // Very fast moves may have short paths

  // Check 2: Input should not start before it was player's turn
  const inputStartedBeforeTurn = inputStartTime < turnStartTime - 100;  // 100ms tolerance

  // Check 3: Path should end near the destination square
  const destSquare = getSquarePixelCoords(move.to, gameState.boardOrientation);
  const pathEnd = input.path[input.path.length - 1];
  const distanceToSquare = Math.sqrt(
    Math.pow(pathEnd.x - destSquare.centerX, 2) +
    Math.pow(pathEnd.y - destSquare.centerY, 2)
  );
  const pathEndsAtCorrectSquare = distanceToSquare < 50;  // Within 50px

  return {
    claimedMoveTime,
    claimedInputDuration,
    inputAccountsForMoveTime,
    inputStartedBeforeTurn,
    pathEndsAtCorrectSquare,
  };
}
```

### 7.4 Detecting Synthetic Input

```typescript
/**
 * Real human input has characteristic "noise" that's hard to fake:
 * - Micro-tremors (tiny random movements)
 * - Variable polling rate (OS scheduler jitter)
 * - Overshoot/correction patterns
 */
function detectSyntheticInput(path: InputPoint[]): SyntheticScore {
  let score = 0;
  const reasons: string[] = [];

  // Check 1: Timestamp regularity
  // Humans have variable polling; synthetic often has perfect intervals
  const intervals = [];
  for (let i = 1; i < path.length; i++) {
    intervals.push(path[i].timestamp - path[i - 1].timestamp);
  }
  const intervalVariance = calculateVariance(intervals);
  if (intervalVariance < 1) {  // Perfectly regular = suspicious
    score += 0.4;
    reasons.push('perfectly_regular_timestamps');
  }

  // Check 2: Sub-pixel precision
  // Real mouse input is integer pixels; synthetic might have decimals
  const hasSubPixel = path.some(p =>
    p.x !== Math.floor(p.x) || p.y !== Math.floor(p.y)
  );
  if (hasSubPixel) {
    score += 0.3;
    reasons.push('sub_pixel_coordinates');
  }

  // Check 3: Path noise (micro-tremors)
  // Real paths have tiny random deviations; synthetic are too smooth
  const pathNoise = calculatePathNoise(path);
  if (pathNoise < 0.5 && path.length > 20) {
    score += 0.3;
    reasons.push('path_too_smooth');
  }

  // Check 4: Acceleration profile
  // Humans have characteristic S-curve; bots often linear
  const hasNaturalAcceleration = checkAccelerationCurve(path);
  if (!hasNaturalAcceleration) {
    score += 0.2;
    reasons.push('unnatural_acceleration_curve');
  }

  return {
    isSynthetic: score > 0.6,
    confidence: score,
    reasons,
  };
}

function calculatePathNoise(path: InputPoint[]): number {
  if (path.length < 10) return 1;  // Not enough data

  // Calculate perpendicular distance from each point to the line
  // between its neighbors (measures micro-jitter)
  let totalNoise = 0;

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    // Expected position (midpoint of neighbors)
    const expectedX = (prev.x + next.x) / 2;
    const expectedY = (prev.y + next.y) / 2;

    // Actual deviation
    const deviation = Math.sqrt(
      Math.pow(curr.x - expectedX, 2) + Math.pow(curr.y - expectedY, 2)
    );

    totalNoise += deviation;
  }

  return totalNoise / (path.length - 2);
}
```

### 7.5 Impossible Move Detection

Some moves are physically impossible given the input:

```typescript
interface ImpossibleMoveCheck {
  moveIndex: number;
  issue: ImpossibleMoveType;
  details: string;
}

type ImpossibleMoveType =
  | 'move_without_input'      // Move appeared with empty input path
  | 'input_too_short'         // 2ms input for complex move
  | 'wrong_piece_selected'    // Input clicked different square than move source
  | 'premove_violation';      // Claimed premove but input during opponent's turn

function detectImpossibleMoves(
  moves: Move[],
  inputs: MoveInput[],
  gameStates: GameState[]
): ImpossibleMoveCheck[] {
  const issues: ImpossibleMoveCheck[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const input = inputs[i];
    const state = gameStates[i];

    // Issue 1: No input data at all
    if (!input || input.path.length === 0) {
      // Exception: Premoves are allowed to have minimal input
      if (!move.isPremove) {
        issues.push({
          moveIndex: i,
          issue: 'move_without_input',
          details: 'Move received with no input path data',
        });
      }
    }

    // Issue 2: Input duration impossibly short
    if (input && input.path.length > 0) {
      const duration = input.path[input.path.length - 1].timestamp - input.path[0].timestamp;
      if (duration < 50 && !move.isPremove) {  // <50ms is suspicious
        issues.push({
          moveIndex: i,
          issue: 'input_too_short',
          details: `Input duration ${duration}ms is impossibly fast`,
        });
      }
    }

    // Issue 3: Input started on wrong square
    if (input && input.path.length > 0 && input.selectionMethod.type === 'click') {
      const clickedSquare = getSquareFromPixel(
        input.path[0].x,
        input.path[0].y,
        state.boardOrientation
      );
      if (clickedSquare !== move.from) {
        issues.push({
          moveIndex: i,
          issue: 'wrong_piece_selected',
          details: `Clicked ${clickedSquare} but move was from ${move.from}`,
        });
      }
    }
  }

  return issues;
}
```

---

## 8. Layer 6: Economic & Account Controls

### 6.1 Philosophy

Make cheating economically unattractive:
- Low-stakes play: Minimal friction
- High-stakes play: Increased scrutiny
- Withdrawals: Risk-based delays
- Bans: Lose funds, not just access

### 6.2 Stake-Based Trust Tiers

```typescript
interface TrustTier {
  name: string;
  maxStakePerGame: number;
  maxDailyVolume: number;
  withdrawalDelay: number;  // hours
  requiredVerification: VerificationLevel;
  monitoringLevel: MonitoringLevel;
}

const TRUST_TIERS: TrustTier[] = [
  {
    name: 'unverified',
    maxStakePerGame: 10,      // $10 max
    maxDailyVolume: 50,       // $50/day
    withdrawalDelay: 72,      // 3 days
    requiredVerification: 'email',
    monitoringLevel: 'standard',
  },
  {
    name: 'verified',
    maxStakePerGame: 100,     // $100 max
    maxDailyVolume: 500,      // $500/day
    withdrawalDelay: 24,      // 1 day
    requiredVerification: 'phone',
    monitoringLevel: 'standard',
  },
  {
    name: 'trusted',
    maxStakePerGame: 500,     // $500 max
    maxDailyVolume: 2000,     // $2000/day
    withdrawalDelay: 4,       // 4 hours
    requiredVerification: 'kyc_basic',
    monitoringLevel: 'enhanced',
  },
  {
    name: 'vip',
    maxStakePerGame: 5000,    // $5000 max
    maxDailyVolume: 20000,    // $20,000/day
    withdrawalDelay: 1,       // 1 hour
    requiredVerification: 'kyc_full',
    monitoringLevel: 'priority',
  },
];
```

### 6.3 Withdrawal Risk Assessment

```typescript
interface WithdrawalRequest {
  userId: string;
  amount: number;
  destination: string;
  requestedAt: Date;
}

interface WithdrawalRiskAssessment {
  riskScore: number;  // 0-100
  flags: RiskFlag[];
  recommendedAction: 'approve' | 'delay' | 'review' | 'block';
  delayHours: number;
}

async function assessWithdrawalRisk(
  request: WithdrawalRequest
): Promise<WithdrawalRiskAssessment> {
  const user = await db.getUser(request.userId);
  const recentActivity = await db.getRecentActivity(request.userId, 7);  // 7 days
  const flags: RiskFlag[] = [];

  // Flag 1: New account with quick profit
  if (user.accountAge < 7 && user.netProfit > request.amount * 0.5) {
    flags.push({
      type: 'new_account_profit',
      severity: 'high',
      details: `Account ${user.accountAge} days old with ${user.netProfit} profit`,
    });
  }

  // Flag 2: Unusual win rate
  const winRate = recentActivity.wins / recentActivity.totalGames;
  if (winRate > 0.75 && recentActivity.totalGames > 10) {
    flags.push({
      type: 'unusual_win_rate',
      severity: 'medium',
      details: `${(winRate * 100).toFixed(1)}% win rate over ${recentActivity.totalGames} games`,
    });
  }

  // Flag 3: Any active cheat flags
  const cheatFlags = await db.getActiveCheatFlags(request.userId);
  if (cheatFlags.length > 0) {
    flags.push({
      type: 'active_cheat_investigation',
      severity: 'critical',
      details: `${cheatFlags.length} active investigation(s)`,
    });
  }

  // Flag 4: Withdrawing entire balance
  if (request.amount > user.balance * 0.9) {
    flags.push({
      type: 'full_withdrawal',
      severity: 'low',
      details: 'Withdrawing >90% of balance',
    });
  }

  // Flag 5: Destination analysis
  const destinationRisk = await analyzeDestination(request.destination);
  if (destinationRisk.isMixer || destinationRisk.isHighRisk) {
    flags.push({
      type: 'risky_destination',
      severity: 'high',
      details: destinationRisk.reason,
    });
  }

  // Calculate overall risk
  const riskScore = calculateRiskScore(flags);

  return {
    riskScore,
    flags,
    recommendedAction: determineAction(riskScore, flags),
    delayHours: calculateDelay(riskScore, user.trustTier),
  };
}
```

### 6.4 Device Fingerprinting

Track devices to detect multi-accounting:

```typescript
interface DeviceFingerprint {
  // Hardware
  screenResolution: string;
  colorDepth: number;
  deviceMemory: number;
  hardwareConcurrency: number;

  // Software
  platform: string;
  userAgent: string;
  language: string;
  timezone: string;

  // Behavioral
  canvasFingerprint: string;
  audioFingerprint: string;
  webglFingerprint: string;

  // Network
  ipAddress: string;
  ipGeolocation: GeoLocation;
}

async function checkForMultiAccounting(
  fingerprint: DeviceFingerprint,
  userId: string
): Promise<MultiAccountCheck> {
  // Find other accounts with similar fingerprints
  const similarAccounts = await db.findSimilarFingerprints(fingerprint, {
    excludeUserId: userId,
    similarityThreshold: 0.9,
  });

  if (similarAccounts.length === 0) {
    return { isMultiAccount: false };
  }

  // Check if it's the same household (legitimate)
  const sameHousehold = await checkSameHousehold(fingerprint, similarAccounts);

  // Check if accounts have played each other (collusion)
  const havePlayedEachOther = await checkMutualGames(userId, similarAccounts);

  return {
    isMultiAccount: true,
    linkedAccounts: similarAccounts.map(a => a.userId),
    sameHousehold,
    possibleCollusion: havePlayedEachOther,
    riskLevel: determineMultiAccountRisk(similarAccounts, havePlayedEachOther),
  };
}
```

### 6.5 Sandbagging Detection

```typescript
interface SandbaggingAnalysis {
  playerId: string;

  // Rating history
  ratingHistory: { date: Date; rating: number }[];

  // Suspicious patterns
  intentionalLosses: SuspiciousLoss[];
  ratingSwings: RatingSwing[];

  // Profit correlation
  profitByRatingBand: Map<RatingBand, number>;

  // Verdict
  sandbaggingScore: number;
}

interface SuspiciousLoss {
  gameId: string;
  indicators: string[];
  confidence: number;
}

async function detectSandbagging(playerId: string): Promise<SandbaggingAnalysis> {
  const games = await db.getAllGames(playerId);
  const losses = games.filter(g => g.result === 'loss');

  const intentionalLosses: SuspiciousLoss[] = [];

  for (const loss of losses) {
    const indicators: string[] = [];

    // Indicator 1: Resigned in winning position
    const finalEval = await getEvaluation(loss.finalFen);
    if (finalEval > 300) {  // Player was winning by 3+ pawns
      indicators.push('resigned_while_winning');
    }

    // Indicator 2: Obvious blunders in simple positions
    const analysis = await analyzeEngineCorrelation(loss);
    if (analysis.avgCentipawnLoss > 200 && loss.moveCount < 20) {
      indicators.push('massive_early_blunders');
    }

    // Indicator 3: Played much faster than usual
    const avgMoveTime = loss.totalTime / loss.moveCount;
    const playerAvgMoveTime = await getPlayerAverageMoveTime(playerId);
    if (avgMoveTime < playerAvgMoveTime * 0.3) {
      indicators.push('suspiciously_fast_loss');
    }

    // Indicator 4: Against linked account
    const isLinked = await checkLinkedAccount(playerId, loss.opponentId);
    if (isLinked) {
      indicators.push('loss_to_linked_account');
    }

    if (indicators.length >= 2) {
      intentionalLosses.push({
        gameId: loss.id,
        indicators,
        confidence: indicators.length / 4,
      });
    }
  }

  // Check profit patterns
  const profitByRatingBand = await calculateProfitByRating(playerId, games);

  // Sandbagging signature: lose at high rating, win big at low rating
  const highRatingProfit = profitByRatingBand.get('high') ?? 0;
  const lowRatingProfit = profitByRatingBand.get('low') ?? 0;

  const profitAsymmetry = lowRatingProfit - highRatingProfit;

  return {
    playerId,
    ratingHistory: await getRatingHistory(playerId),
    intentionalLosses,
    ratingSwings: detectRatingSwings(games),
    profitByRatingBand,
    sandbaggingScore: calculateSandbaggingScore(intentionalLosses, profitAsymmetry),
  };
}
```

---

## 9. Layer 7: Real-time Monitoring

### 9.1 Live Game Monitoring

Monitor games in real-time, especially high-stakes:

```typescript
interface LiveMonitor {
  gameId: string;
  stake: number;
  players: [Player, Player];

  // Running metrics
  suspicionScores: [number, number];  // Per player
  flags: LiveFlag[];

  // Thresholds for this game (based on stake)
  alertThreshold: number;
  interventionThreshold: number;
}

class RealTimeMonitoringService {
  private activeMonitors: Map<string, LiveMonitor> = new Map();
  private stockfish: StockfishPool;

  async monitorMove(
    gameId: string,
    playerId: string,
    move: Move,
    behaviorData: BehaviorData
  ): Promise<void> {
    const monitor = this.activeMonitors.get(gameId);
    if (!monitor) return;

    const playerIndex = monitor.players.findIndex(p => p.id === playerId);

    // Quick engine check (shallow depth for speed)
    const quickEval = await this.stockfish.analyze(move.fenBefore, 12);
    const moveRank = quickEval.moves.findIndex(m => m.move === move.uci) + 1;

    // Update running suspicion score
    const moveSuspicion = this.calculateMoveSuspicion(
      moveRank,
      quickEval,
      behaviorData,
      monitor.players[playerIndex].rating
    );

    monitor.suspicionScores[playerIndex] =
      monitor.suspicionScores[playerIndex] * 0.9 + moveSuspicion * 0.1;

    // Check for flags
    if (behaviorData.focusLost && moveRank === 1) {
      monitor.flags.push({
        type: 'unfocus_then_best_move',
        playerId,
        moveNumber: move.moveNumber,
        timestamp: Date.now(),
      });
    }

    // Alert if threshold exceeded
    if (monitor.suspicionScores[playerIndex] > monitor.alertThreshold) {
      await this.raiseAlert(monitor, playerIndex);
    }

    // Intervention if critical threshold exceeded
    if (monitor.suspicionScores[playerIndex] > monitor.interventionThreshold) {
      await this.triggerIntervention(monitor, playerIndex);
    }
  }

  private async raiseAlert(monitor: LiveMonitor, playerIndex: number): Promise<void> {
    // Notify moderation team
    await this.notifyModerators({
      type: 'live_suspicion_alert',
      gameId: monitor.gameId,
      playerId: monitor.players[playerIndex].id,
      suspicionScore: monitor.suspicionScores[playerIndex],
      flags: monitor.flags.filter(f => f.playerId === monitor.players[playerIndex].id),
      stake: monitor.stake,
    });

    // Increase monitoring depth
    monitor.alertThreshold = Infinity;  // Don't re-alert

    // Start recording additional data
    await this.enableEnhancedMonitoring(monitor.gameId);
  }

  private async triggerIntervention(monitor: LiveMonitor, playerIndex: number): Promise<void> {
    // Options based on severity and stake:
    // 1. Continue monitoring (low stakes)
    // 2. Pause betting on this game
    // 3. Flag for post-game review
    // 4. Pause the game (extreme cases only)

    if (monitor.stake > 500) {
      // High stakes: pause betting
      await this.pauseBettingOnGame(monitor.gameId);
    }

    // Always flag for deep review
    await db.createReviewTask({
      gameId: monitor.gameId,
      playerId: monitor.players[playerIndex].id,
      reason: 'real_time_intervention_triggered',
      priority: 'high',
      suspicionScore: monitor.suspicionScores[playerIndex],
      flags: monitor.flags,
    });
  }
}
```

### 9.2 Mid-Game Skill Shift Detection

**Critical addition:** Detect when a player's skill level suddenly changes mid-game.

Pattern: Player struggling for 20 moves, then suddenly plays perfect chess for the rest of the game.

```typescript
interface MidGameShiftDetector {
  gameId: string;
  playerId: string;

  // Sliding window of move quality
  windowSize: number;  // e.g., 5 moves
  windowScores: number[];  // CPL for each window

  // Detected shifts
  shiftPoints: SkillShiftPoint[];
}

interface SkillShiftPoint {
  moveIndex: number;
  beforeWindowAvgCPL: number;
  afterWindowAvgCPL: number;
  shiftMagnitude: number;
  coincidentEvents: string[];  // What else happened at this point
}

class MidGameShiftAnalyzer {
  private windowSize = 5;
  private significantShiftThreshold = 30;  // 30+ CPL improvement

  analyzeGame(moves: MoveAnalysis[]): MidGameShiftDetector {
    const result: MidGameShiftDetector = {
      gameId: moves[0]?.gameId ?? '',
      playerId: moves[0]?.playerId ?? '',
      windowSize: this.windowSize,
      windowScores: [],
      shiftPoints: [],
    };

    if (moves.length < this.windowSize * 2) {
      return result;  // Not enough moves to analyze
    }

    // Calculate CPL for each sliding window
    for (let i = 0; i <= moves.length - this.windowSize; i++) {
      const window = moves.slice(i, i + this.windowSize);
      const avgCPL = window.reduce((sum, m) => sum + m.centipawnLoss, 0) / this.windowSize;
      result.windowScores.push(avgCPL);
    }

    // Detect significant shifts
    for (let i = 1; i < result.windowScores.length; i++) {
      const before = result.windowScores[i - 1];
      const after = result.windowScores[i];
      const improvement = before - after;  // Positive = got better

      if (improvement > this.significantShiftThreshold) {
        // Check for coincident events
        const coincidentEvents = this.findCoincidentEvents(
          moves[i + this.windowSize - 1]  // The move where shift became apparent
        );

        result.shiftPoints.push({
          moveIndex: i + this.windowSize - 1,
          beforeWindowAvgCPL: before,
          afterWindowAvgCPL: after,
          shiftMagnitude: improvement,
          coincidentEvents,
        });
      }
    }

    return result;
  }

  private findCoincidentEvents(move: MoveAnalysis): string[] {
    const events: string[] = [];

    // Check behavioral data
    if (move.behaviorData?.focusLostDuringMove) {
      events.push('focus_lost_before_improvement');
    }

    if (move.behaviorData?.longPauseBeforeMove) {
      events.push('long_pause_then_perfect_play');
    }

    if (move.networkData?.suspiciousRequestBefore) {
      events.push('network_activity_before_improvement');
    }

    // Check position context
    if (move.evalBefore < -200) {
      events.push('started_playing_perfectly_when_losing');
    }

    return events;
  }
}

/**
 * Real-time version: call after each move
 */
function checkForMidGameShift(
  recentMoves: MoveAnalysis[],
  playerBaseline: PlayerBehaviorProfile
): MidGameShiftAlert | null {
  if (recentMoves.length < 10) return null;

  // Compare last 5 moves to previous 5
  const recent5 = recentMoves.slice(-5);
  const previous5 = recentMoves.slice(-10, -5);

  const recentAvgCPL = average(recent5.map(m => m.centipawnLoss));
  const previousAvgCPL = average(previous5.map(m => m.centipawnLoss));

  const improvement = previousAvgCPL - recentAvgCPL;

  // Also compare to player's baseline
  const expectedCPL = playerBaseline.expectedAvgCPL;
  const playingAboveBaseline = recentAvgCPL < expectedCPL * 0.6;  // 40% better than usual

  if (improvement > 35 && playingAboveBaseline) {
    return {
      type: 'mid_game_skill_shift',
      severity: improvement > 50 ? 'high' : 'medium',
      details: {
        previousWindowCPL: previousAvgCPL,
        currentWindowCPL: recentAvgCPL,
        improvement,
        expectedCPL,
        moveIndex: recentMoves.length - 1,
      },
    };
  }

  return null;
}
```

### 9.3 Anomaly Detection Stream

Process all game events through anomaly detection:

```typescript
interface GameEvent {
  type: 'move' | 'focus_change' | 'mouse_activity' | 'clock_tick';
  gameId: string;
  playerId: string;
  timestamp: number;
  data: unknown;
}

class AnomalyDetectionStream {
  private models: {
    timing: TimingAnomalyModel;
    behavior: BehaviorAnomalyModel;
    statistical: StatisticalAnomalyModel;
  };

  async processEvent(event: GameEvent): Promise<AnomalyResult | null> {
    switch (event.type) {
      case 'move':
        return this.processMoveEvent(event);
      case 'focus_change':
        return this.processFocusEvent(event);
      case 'mouse_activity':
        return this.processMouseEvent(event);
      default:
        return null;
    }
  }

  private async processMoveEvent(event: GameEvent): Promise<AnomalyResult | null> {
    const moveData = event.data as MoveEventData;

    // Parallel anomaly checks
    const [timingAnomaly, behaviorAnomaly] = await Promise.all([
      this.models.timing.check(moveData),
      this.models.behavior.check(moveData),
    ]);

    // Combine signals
    const combinedScore = this.combineAnomalyScores([
      timingAnomaly,
      behaviorAnomaly,
    ]);

    if (combinedScore > 0.5) {
      return {
        type: 'move_anomaly',
        score: combinedScore,
        components: { timingAnomaly, behaviorAnomaly },
        event,
      };
    }

    return null;
  }
}
```

---

## 10. Layer 8: Post-Game Deep Analysis

### 10.1 Full Engine Analysis Pipeline

After game ends, run comprehensive analysis:

```typescript
interface DeepAnalysisJob {
  gameId: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  requestedAt: Date;

  // What triggered this analysis
  trigger: AnalysisTrigger;
}

type AnalysisTrigger =
  | 'routine'              // All games get analyzed eventually
  | 'real_time_flag'       // Flagged during game
  | 'player_report'        // Opponent reported
  | 'withdrawal_review'    // Part of withdrawal risk assessment
  | 'manual_request';      // Moderator requested

class DeepAnalysisService {
  private stockfish: StockfishPool;
  private jobQueue: PriorityQueue<DeepAnalysisJob>;

  async analyzeGame(job: DeepAnalysisJob): Promise<DeepAnalysisResult> {
    const game = await db.getGame(job.gameId);

    // Step 1: Full engine analysis at high depth
    const engineAnalysis = await this.runEngineAnalysis(game, {
      depth: 24,                    // Higher than real-time (12)
      multiPV: 5,                   // Get top 5 moves per position
      timePerPosition: 5000,        // 5 seconds per position
    });

    // Step 2: Calculate comprehensive metrics
    const metrics = this.calculateMetrics(game, engineAnalysis);

    // Step 3: Compare to player baseline
    const playerProfile = await db.getPlayerProfile(game.whitePlayer.id);
    const baseline = playerProfile.behaviorBaseline;
    const deviation = this.calculateDeviation(metrics, baseline);

    // Step 4: Pattern matching against known cheating signatures
    const patternMatches = this.matchCheatPatterns(game, engineAnalysis, metrics);

    // Step 5: Compute final verdict
    const verdict = this.computeVerdict(metrics, deviation, patternMatches);

    return {
      gameId: job.gameId,
      engineAnalysis,
      metrics,
      deviation,
      patternMatches,
      verdict,
      analyzedAt: new Date(),
    };
  }

  private matchCheatPatterns(
    game: GameRecord,
    analysis: FullEngineAnalysis,
    metrics: GameMetrics
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Pattern 1: Engine signature - consistent depth artifacts
    const depthSignature = this.detectDepthSignature(analysis);
    if (depthSignature.confidence > 0.7) {
      matches.push({
        pattern: 'engine_depth_signature',
        confidence: depthSignature.confidence,
        details: depthSignature,
      });
    }

    // Pattern 2: Inhuman precision on complex tactics
    const tacticalPrecision = this.analyzeTacticalPrecision(analysis);
    if (tacticalPrecision.inhumanScore > 0.8) {
      matches.push({
        pattern: 'inhuman_tactical_precision',
        confidence: tacticalPrecision.inhumanScore,
        details: tacticalPrecision,
      });
    }

    // Pattern 3: Suspicious timing patterns
    const timingPattern = this.analyzeTimingPattern(game);
    if (timingPattern.suspiciousScore > 0.6) {
      matches.push({
        pattern: 'suspicious_timing',
        confidence: timingPattern.suspiciousScore,
        details: timingPattern,
      });
    }

    // Pattern 4: Correlation with specific engine (Stockfish vs Leela)
    const engineMatch = this.identifyEngine(analysis);
    if (engineMatch.confidence > 0.6) {
      matches.push({
        pattern: 'specific_engine_match',
        confidence: engineMatch.confidence,
        details: engineMatch,
      });
    }

    return matches;
  }
}
```

### 10.2 Cross-Player Analysis (Collusion Detection)

```typescript
interface CollusionAnalysis {
  players: [string, string];
  gamesAnalyzed: number;

  patterns: CollusionPattern[];
  collusionScore: number;
}

type CollusionPatternType =
  | 'consistent_winner'       // Same person always wins
  | 'prearranged_result'      // Game ended in unusual way
  | 'financial_flow'          // Money flows one direction
  | 'simultaneous_activity'   // Always online at same time
  | 'linked_accounts';        // Device/IP overlap

async function analyzeCollusion(
  player1: string,
  player2: string
): Promise<CollusionAnalysis> {
  const games = await db.getGamesBetween(player1, player2);

  if (games.length < 3) {
    return { players: [player1, player2], gamesAnalyzed: 0, patterns: [], collusionScore: 0 };
  }

  const patterns: CollusionPattern[] = [];

  // Pattern 1: One player always wins
  const player1Wins = games.filter(g => g.winnerId === player1).length;
  const winRate = player1Wins / games.length;
  if (winRate > 0.9 || winRate < 0.1) {
    patterns.push({
      type: 'consistent_winner',
      evidence: [`${Math.max(winRate, 1 - winRate) * 100}% win rate for one player over ${games.length} games`],
      confidence: Math.abs(winRate - 0.5) * 2,
    });
  }

  // Pattern 2: Games end unusually (early resignation)
  const unusualEndings = games.filter(g =>
    g.endReason === 'resignation' && g.moveCount < 10
  );
  if (unusualEndings.length / games.length > 0.3) {
    patterns.push({
      type: 'prearranged_result',
      evidence: [`${unusualEndings.length} of ${games.length} games ended in early resignation`],
      confidence: unusualEndings.length / games.length,
    });
  }

  // Pattern 3: Net money flow
  const netFlow = calculateNetFlow(games, player1, player2);
  if (Math.abs(netFlow) > 1000) {
    patterns.push({
      type: 'financial_flow',
      evidence: [`Net flow of $${Math.abs(netFlow)} from one player to other`],
      confidence: Math.min(Math.abs(netFlow) / 5000, 1),
    });
  }

  // Pattern 4: Account linkage
  const linkage = await checkAccountLinkage(player1, player2);
  if (linkage.linked) {
    patterns.push({
      type: 'linked_accounts',
      evidence: linkage.reasons,
      confidence: linkage.confidence,
    });
  }

  return {
    players: [player1, player2],
    gamesAnalyzed: games.length,
    patterns,
    collusionScore: calculateCollusionScore(patterns),
  };
}
```

---

## 11. Layer 9: Human Review Pipeline

### 11.1 Review Queue System

```typescript
interface ReviewTask {
  id: string;
  type: ReviewTaskType;
  priority: Priority;

  playerId: string;
  gameIds: string[];

  reason: string;
  automatedAnalysis: DeepAnalysisResult[];
  suspicionScore: number;

  status: 'pending' | 'in_progress' | 'completed';
  assignedTo: string | null;

  verdict: ReviewVerdict | null;
  notes: string | null;
}

type ReviewTaskType =
  | 'cheat_investigation'
  | 'collusion_investigation'
  | 'sandbagging_investigation'
  | 'appeal_review'
  | 'withdrawal_review';

interface ReviewVerdict {
  decision: 'innocent' | 'warning' | 'temp_ban' | 'permanent_ban';
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
  reviewer: string;
  reviewedAt: Date;
}
```

### 11.2 Decision Guidelines

**Warning (first offense, moderate evidence):**
- 60-75% suspicion score
- 1-2 suspicious games
- No previous flags
- Behavioral anomalies present but explainable

**Temporary Ban (strong evidence, repeat offense):**
- 75-90% suspicion score
- 3+ suspicious games
- Or: 1 game with overwhelming evidence + previous warning
- Clear pattern of cheating behavior

**Permanent Ban (overwhelming evidence):**
- 90%+ suspicion score
- Multiple games with consistent engine correlation
- Or: Caught with clear technical evidence (modified client, etc.)
- Or: Repeat offense after temp ban

---

## 12. Implementation Phases

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Basic detection that catches obvious cheaters

**Deliverables:**
1. Client environment scanning (Rust)
2. Basic move timing collection
3. Post-game engine analysis pipeline
4. Simple threshold-based flagging
5. Admin dashboard for manual review

**Metrics:**
- Can detect engine use >50% of moves
- <1% false positive rate on test set

### Phase 2: Behavioral Layer (Weeks 5-8)

**Goal:** Detect cheating through behavior, not just statistics

**Deliverables:**
1. Mouse movement tracking
2. Focus/attention monitoring
3. Player behavior baseline building
4. Deviation detection
5. Enhanced real-time monitoring
6. **Mid-game skill shift detection**

**Metrics:**
- Detect 70% of selective engine users
- Maintain <1% false positive rate

### Phase 2.5: Network & Input Verification (Weeks 9-10)

**Goal:** Close the external engine API attack vector

**Deliverables:**
1. Network traffic pattern monitoring (client-side)
2. Suspicious endpoint detection
3. Input physics validation
4. Synthetic input detection
5. Move-input consistency verification

**Metrics:**
- Detect 80% of external API assistance
- Zero false positives on legitimate network activity

### Phase 3: Economic Controls (Weeks 11-14)

**Goal:** Make cheating economically unattractive

**Deliverables:**
1. Trust tier system
2. Withdrawal risk assessment
3. Device fingerprinting
4. Multi-account detection
5. Sandbagging detection

**Metrics:**
- 24h+ delay on suspicious withdrawals
- 80% multi-account detection rate

### Phase 4: Advanced Detection (Weeks 15-22)

**Goal:** Catch sophisticated cheaters

**Deliverables:**
1. Deep analysis pipeline (high-depth engine)
2. Pattern matching against known cheat signatures
3. Collusion detection
4. ML model for anomaly detection
5. Cross-game analysis

**Metrics:**
- Detect 85% of all cheating (including selective)
- False positive rate <0.5%

### Phase 5: Polish & Automation (Weeks 23-26)

**Goal:** Production-ready system

**Deliverables:**
1. Automated review queue
2. Appeal handling system
3. Reviewer tools and training
4. Performance optimization
5. Documentation and runbooks

**Metrics:**
- <24h review time for high priority
- <3 day review time for normal priority
- 95% reviewer agreement rate

---

## 13. Data Architecture

### 13.1 Schema Overview

```sql
-- Core anti-cheat tables

CREATE TABLE cheat_flags (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES users(id),
  game_id UUID REFERENCES games(id),

  flag_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  suspicion_score DECIMAL(5,4) NOT NULL,

  details JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'active',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES admin_users(id)
);

CREATE TABLE game_analyses (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id),

  engine_name VARCHAR(50) NOT NULL,
  engine_depth INT NOT NULL,

  white_top_move_rate DECIMAL(5,4),
  white_avg_cpl DECIMAL(6,2),
  black_top_move_rate DECIMAL(5,4),
  black_avg_cpl DECIMAL(6,2),

  move_analyses JSONB NOT NULL,
  detected_patterns JSONB,

  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE player_behavior_profiles (
  player_id UUID PRIMARY KEY REFERENCES users(id),

  move_time_distribution JSONB,
  move_time_variance DECIMAL(8,4),
  avg_path_curvature DECIMAL(6,4),
  avg_unfocus_per_game DECIMAL(5,2),

  games_in_profile INT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE review_tasks (
  id UUID PRIMARY KEY,

  task_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL,

  player_id UUID NOT NULL REFERENCES users(id),
  game_ids UUID[] NOT NULL,

  reason TEXT NOT NULL,
  suspicion_score DECIMAL(5,4) NOT NULL,

  status VARCHAR(20) DEFAULT 'pending',
  assigned_to UUID REFERENCES admin_users(id),

  verdict VARCHAR(30),
  verdict_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE player_sanctions (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES users(id),

  sanction_type VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL,

  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,

  review_task_id UUID REFERENCES review_tasks(id),

  appealed BOOLEAN DEFAULT FALSE,
  appeal_outcome VARCHAR(30)
);

-- Network activity tracking
CREATE TABLE game_network_activity (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id),
  player_id UUID NOT NULL REFERENCES users(id),

  total_requests INT NOT NULL,
  suspicious_request_count INT NOT NULL,
  suspicious_request_timestamps BIGINT[] NOT NULL,

  correlated_with_moves INT DEFAULT 0,
  suspicion_score DECIMAL(5,4) NOT NULL,

  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Input verification results
CREATE TABLE move_input_validations (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id),
  move_index INT NOT NULL,

  physics_valid BOOLEAN NOT NULL,
  physics_violations JSONB,

  consistency_valid BOOLEAN NOT NULL,
  consistency_issues JSONB,

  synthetic_score DECIMAL(5,4) NOT NULL,
  synthetic_reasons TEXT[],

  validated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mid-game skill shifts
CREATE TABLE detected_skill_shifts (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id),
  player_id UUID NOT NULL REFERENCES users(id),

  move_index INT NOT NULL,
  before_window_cpl DECIMAL(6,2) NOT NULL,
  after_window_cpl DECIMAL(6,2) NOT NULL,
  shift_magnitude DECIMAL(6,2) NOT NULL,

  coincident_events TEXT[],
  severity VARCHAR(20) NOT NULL,

  detected_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 14. Privacy & Legal Considerations

### 14.1 Data Collection Disclosure

Users must be informed about:
1. What data we collect:
   - Move times and mouse movements
   - Focus events (window focus/blur)
   - **Network traffic patterns** (domains only, not content)
   - **Input physics data** (timing, coordinates)
   - Running processes during games
2. Why we collect it (fair play enforcement)
3. How long we keep it (90 days for raw data, aggregates indefinitely)
4. Who can access it (automated systems, reviewers)

**Network monitoring disclosure:**
We monitor network request *patterns* (timing, destination domains) but NOT request content, authentication tokens, or other personal data. This is similar to how a firewall logs connections without reading packet contents.

### 14.2 False Positive Safeguards

**Principle:** Assume innocence. Require strong evidence before action.

```typescript
const FALSE_POSITIVE_SAFEGUARDS = {
  // Never auto-ban without human review
  autoBanEnabled: false,

  // Minimum evidence thresholds
  minimumForWarning: { suspicionScore: 0.6, games: 1, humanReview: false },
  minimumForTempBan: { suspicionScore: 0.75, games: 2, humanReview: true },
  minimumForPermBan: { suspicionScore: 0.9, games: 3, humanReview: true, seniorReview: true },

  // Appeal process
  appealEnabled: true,
  appealReviewDifferentPerson: true,
};
```

---

## 15. Appendix: Detection Algorithms

### A. Centipawn Loss Calculation

```typescript
function calculateCentipawnLoss(playedMove: string, engineAnalysis: EngineAnalysis): number {
  const bestMove = engineAnalysis.moves[0];
  const playedMoveAnalysis = engineAnalysis.moves.find(m => m.move === playedMove);

  if (!playedMoveAnalysis) return 500;  // Not in top N

  const bestScore = convertToCP(bestMove.score);
  const playedScore = convertToCP(playedMoveAnalysis.score);

  return Math.max(0, bestScore - playedScore);
}
```

### B. Mouse Path Linearity

```typescript
function calculatePathLinearity(path: Point[]): number {
  if (path.length < 3) return 1;

  const start = path[0];
  const end = path[path.length - 1];
  const directDistance = distance(start, end);

  if (directDistance < 10) return 1;

  let totalDeviation = 0;
  for (let i = 1; i < path.length - 1; i++) {
    totalDeviation += pointToLineDistance(path[i], start, end);
  }

  const avgDeviation = totalDeviation / (path.length - 2);
  return Math.max(0, 1 - (avgDeviation / 50));
}
```

### C. Z-Score to Cheat Probability

```typescript
function zScoreToCheatProbability(z: number): number {
  if (z < 1.0) return 0.05;
  if (z < 1.5) return 0.15;
  if (z < 2.0) return 0.35;
  if (z < 2.5) return 0.60;
  if (z < 3.0) return 0.80;
  if (z < 3.5) return 0.92;
  if (z < 4.0) return 0.97;
  return 0.99;
}
```

### D. Network Request Correlation Window

```typescript
/**
 * Determine if a network request is correlated with a move.
 * Request should happen 1-10 seconds before the move:
 * - ~1 second to send position
 * - ~1-5 seconds for engine to think
 * - ~1-3 seconds for player to "verify" and play
 */
function isRequestCorrelatedWithMove(
  requestTime: number,
  moveTime: number
): boolean {
  const timeBefore = moveTime - requestTime;
  return timeBefore > 1000 && timeBefore < 10000;
}
```

### E. Input Path Noise Calculation

```typescript
/**
 * Measures micro-jitter in mouse path.
 * Real human input has small random deviations.
 * Synthetic paths are too smooth.
 */
function calculatePathNoise(path: InputPoint[]): number {
  if (path.length < 10) return 1;  // Not enough data

  let totalNoise = 0;

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    // Expected position (midpoint of neighbors)
    const expectedX = (prev.x + next.x) / 2;
    const expectedY = (prev.y + next.y) / 2;

    // Actual deviation from expected
    const deviation = Math.sqrt(
      Math.pow(curr.x - expectedX, 2) +
      Math.pow(curr.y - expectedY, 2)
    );

    totalNoise += deviation;
  }

  return totalNoise / (path.length - 2);
}

// Thresholds:
// < 0.5: Suspiciously smooth (likely synthetic)
// 0.5 - 3.0: Normal human range
// > 3.0: Very jittery (nervous player or hardware issue)
```

### F. Mid-Game Skill Shift Detection

```typescript
/**
 * Detect sudden improvement in play quality mid-game.
 * Compare sliding windows of CPL (centipawn loss).
 */
function detectSkillShift(
  moveCPLs: number[],
  windowSize: number = 5,
  threshold: number = 30
): { index: number; magnitude: number } | null {
  if (moveCPLs.length < windowSize * 2) return null;

  for (let i = windowSize; i < moveCPLs.length - windowSize; i++) {
    const before = moveCPLs.slice(i - windowSize, i);
    const after = moveCPLs.slice(i, i + windowSize);

    const beforeAvg = before.reduce((a, b) => a + b, 0) / windowSize;
    const afterAvg = after.reduce((a, b) => a + b, 0) / windowSize;

    const improvement = beforeAvg - afterAvg;

    if (improvement > threshold) {
      return { index: i, magnitude: improvement };
    }
  }

  return null;
}
```

---

## Summary

This anti-cheat system uses **9 layers of defense**:

1. **Client Integrity**: Code signing, environment scanning, input verification
2. **Behavioral Analysis**: Timing patterns, mouse movements, focus tracking
3. **Statistical Detection**: Engine correlation, CPL analysis, performance anomalies
4. **Network Traffic Analysis**: External engine API detection, WebSocket monitoring
5. **Input Replay Verification**: Physics validation, synthetic input detection
6. **Economic Controls**: Trust tiers, withdrawal delays, KYC requirements
7. **Real-time Monitoring**: Live game surveillance, mid-game skill shift detection
8. **Post-game Analysis**: Deep engine analysis, pattern matching
9. **Human Review**: Expert investigation, appeal handling

**Design Philosophy:** User-mode only, no kernel drivers. Server-side statistical analysis catches engine-assisted play regardless of how the player receives the moves.

No single layer catches all cheaters. Together, they create a defense-in-depth system that:
- Catches obvious cheaters immediately
- Detects sophisticated cheaters over time
- Makes cheating economically unattractive
- Maintains fairness for honest players
- Preserves user experience and privacy

The key insight: **We can never prove cheating with 100% certainty.** We can only make probabilistic assessments based on evidence. The goal is to make those assessments accurate enough that cheaters face meaningful risk while honest players face minimal friction.
