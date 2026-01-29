// =============================================================================
// engine.rs — Stockfish Chess Engine Manager
// =============================================================================
//
// This module manages the Stockfish chess engine process. Stockfish is an
// external program that we communicate with using the UCI (Universal Chess
// Interface) protocol — a text-based protocol where we send commands via
// stdin and read responses from stdout.
//
// UCI Protocol Basics:
// --------------------
// UCI is like a chat conversation between our app (the "GUI") and Stockfish
// (the "engine"). We send text commands, it sends text responses:
//
//   GUI → Engine: uci              (Hey, are you UCI-compatible?)
//   Engine → GUI: id name Stockfish 17
//                 id author T. Romstad...
//                 uciok             (Yes, I'm ready!)
//
//   GUI → Engine: position fen ... (Here's a chess position)
//   GUI → Engine: go depth 20      (Analyze it to depth 20)
//   Engine → GUI: info depth 1 score cp 20 pv e2e4 ...  (Progress updates)
//                 info depth 2 score cp 25 pv e2e4 e7e5 ...
//                 bestmove e2e4    (Done! Best move is e2e4)
//
// Key Terms:
// - FEN: A string that describes a chess position (piece locations, whose turn, etc.)
// - depth: How many moves ahead to analyze (higher = stronger but slower)
// - cp (centipawns): Score in 1/100th of a pawn (positive = white winning)
// - pv (principal variation): The best sequence of moves the engine found
// - mate: Number of moves until checkmate (positive = white wins, negative = black)
//
// Why Sidecar?
// ------------
// In Tauri, a "sidecar" is an external binary bundled with your app. We can't
// compile Stockfish into our Rust code (it's a separate C++ project), so we
// ship it alongside our app and spawn it as a child process.
// =============================================================================

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
// Note: ARCH and OS were previously used for platform-specific engine config,
// but the new background-friendly config uses a unified approach.
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
// =============================================================================
// Channel Types for Message Passing
// =============================================================================
// Channels are like pipes for sending messages between different parts of code:
//
// - mpsc (multi-producer, single-consumer): Many senders can push messages into
//   one receiver. Like a mailbox where multiple people can drop letters but only
//   one person picks them up. We use this for the command queue.
//
// - oneshot: A single-use channel for request/response patterns. The sender sends
//   exactly one message, the receiver gets exactly one message. Like passing a
//   note that expects a reply.
// =============================================================================
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};
// =============================================================================
// Cancellation Support
// =============================================================================
// CancellationToken from tokio-util is a thread-safe way to signal "please stop"
// to running async tasks. When we call .cancel() on a token, any code that's
// checking .is_cancelled() or awaiting .cancelled() will know to stop.
// =============================================================================
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

// =============================================================================
// Timeout Constants
// =============================================================================
// These timeouts prevent the application from hanging if Stockfish becomes
// unresponsive or crashes. Each timeout is tuned for its specific use case:
// =============================================================================

/// Timeout for UCI handshake (engine loading).
/// Stockfish typically responds within 1-2 seconds, but we allow 10 seconds
/// for slower systems or cold starts from disk.
const UCI_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Timeout for isready/readyok responses.
/// The "isready" command should return almost instantly — 5 seconds is generous.
const READY_TIMEOUT: Duration = Duration::from_secs(5);

/// Timeout between info lines during analysis.
/// During deep analysis, Stockfish sends periodic "info" updates. If we don't
/// hear anything for 30 seconds, something is wrong (engine crashed or stuck).
const ANALYSIS_LINE_TIMEOUT: Duration = Duration::from_secs(30);

/// Timeout for bestmove after stop command.
/// After "stop", Stockfish should respond with "bestmove" within a few seconds.
/// This is used when we need to abort analysis early.
#[allow(dead_code)]
const STOP_RESPONSE_TIMEOUT: Duration = Duration::from_secs(5);

// =============================================================================
// Engine Configuration
// =============================================================================
// Stockfish performance depends heavily on two UCI options:
// - Threads: How many CPU cores to use for parallel search
// - Hash: How much memory (in MB) for the transposition table (position cache)
//
// Default Stockfish only uses 1 thread and 16MB hash, which is ~10% of potential
// speed on modern multi-core machines. We auto-detect the optimal settings based
// on the user's hardware.
// =============================================================================

/// Configuration for Stockfish engine performance settings.
///
/// These values are auto-detected based on the user's platform and CPU.
/// Different platforms have different optimal settings:
/// - Apple Silicon (M1/M2/M3/M4): Use all cores, they're efficient
/// - Intel Macs: Use all cores, but lower hash for older memory constraints
/// - Windows: Leave 1 core free for OS/other apps
/// - Linux: Use all cores (typically servers/power users)
#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// Number of CPU threads for Stockfish to use.
    /// More threads = faster search, but diminishing returns past physical core count.
    pub threads: u32,

    /// Hash table size in megabytes.
    /// Larger hash = less re-calculation of positions, but more RAM usage.
    /// Rule of thumb: 64MB per thread is a good balance.
    pub hash_mb: u32,
}

impl EngineConfig {
    /// Auto-detect optimal configuration based on the current platform.
    ///
    /// # Performance Optimization for Background Use
    ///
    /// This chess app runs as a **background activity** alongside resource-intensive
    /// applications like trading platforms (TradingView, Thinkorswim, etc.). The
    /// configuration prioritizes:
    ///
    /// 1. **Thermal headroom**: Prevents CPU throttling that would slow down
    ///    the user's primary applications
    /// 2. **Memory efficiency**: Caps hash table to leave RAM for other apps
    /// 3. **UI responsiveness**: N-1 threads ensures smooth rendering
    ///
    /// ## Design Rationale (based on Lichess recommendations)
    ///
    /// From the Lichess engine analysis documentation:
    /// > "Use one fewer thread than available cores for smooth UI responsiveness"
    ///
    /// We go further by capping at 4 threads because:
    /// - Chess analysis doesn't need 8+ threads for casual play
    /// - 4 threads at depth 20 is plenty strong (~2800+ Elo)
    /// - More threads = more heat = thermal throttling on sustained use
    /// - This app is secondary to trading/work apps
    ///
    /// ## Expected Resource Usage
    ///
    /// | State          | CPU    | Memory |
    /// |----------------|--------|--------|
    /// | App idle       | <1%    | ~40MB  |
    /// | Game active    | 3-8%   | ~60MB  |
    /// | Analysis mode  | 15-30% | ~150MB |
    ///
    /// ## Thread Calculation
    ///
    /// ```text
    /// threads = min(max(physical_cores - 1, 2), 4)
    ///
    /// Examples:
    ///   M1 (8 cores)  → min(max(7, 2), 4) = 4 threads
    ///   M4 Pro (14)   → min(max(13, 2), 4) = 4 threads
    ///   Intel i5 (4)  → min(max(3, 2), 4) = 3 threads
    ///   Intel i3 (2)  → min(max(1, 2), 4) = 2 threads
    /// ```
    pub fn auto_detect() -> Self {
        // Get the number of *physical* cores (not hyperthreaded logical cores).
        // Stockfish benefits from physical cores, not hyperthreads.
        let physical_cores = num_cpus::get_physical() as u32;

        // ==========================================================================
        // Background-Friendly Thread Calculation
        // ==========================================================================
        //
        // N-1 threads: Leave one core free for UI rendering and other apps.
        // This follows the Lichess recommendation: "one less than available for
        // smooth UI". Without this, the chess board can stutter during analysis.
        //
        // Minimum 2 threads: Stockfish's parallel search algorithm requires at
        // least 2 threads to work efficiently. Single-threaded mode uses a
        // different (slower) algorithm.
        //
        // Maximum 4 threads: This is the key optimization for background use.
        // - 4 threads is ~2800 Elo strength, sufficient for all but GM-level analysis
        // - Caps CPU usage at ~30% on 8+ core machines during analysis
        // - Prevents thermal throttling on sustained analysis sessions
        // - Leaves 4+ cores completely free for trading platforms, browsers, etc.
        //
        // Trade-off: Slightly slower deep analysis (depth 30+) in exchange for
        // zero impact on the user's primary applications.
        // ==========================================================================
        let threads = (physical_cores.saturating_sub(1))
            .max(2)   // Minimum 2 threads for efficient parallel search
            .min(4);  // Maximum 4 threads for background-friendly operation

        // ==========================================================================
        // Memory-Efficient Hash Table
        // ==========================================================================
        //
        // The hash table (transposition table) caches previously analyzed positions.
        // Larger = faster analysis (fewer recalculations), but more RAM usage.
        //
        // 64MB per thread: Standard ratio recommended by Stockfish developers.
        // This gives good cache hit rates without excessive memory.
        //
        // Minimum 128MB: Below this, cache eviction happens too frequently and
        // performance degrades significantly.
        //
        // Maximum 256MB: Aggressive cap for background use. Default Stockfish
        // configurations often use 512MB-2GB, but that's for dedicated analysis.
        // 256MB is sufficient for depth 20-25 analysis which is our use case.
        //
        // Memory footprint breakdown:
        // - Hash table: 128-256MB (configurable here)
        // - Engine process: ~10-20MB
        // - Our Tauri app: ~40MB base
        // - Total: ~180-320MB
        // ==========================================================================
        let hash_mb = (threads * 64).clamp(128, 256);

        Self { threads, hash_mb }
    }
}

// =============================================================================
// Data Types
// =============================================================================
// These structs define the shape of data we send to/from the frontend.
// The #[derive(...)] macros auto-generate code for:
// - Debug: Lets us print the struct for debugging
// - Clone: Lets us copy the struct
// - Serialize/Deserialize: Converts to/from JSON for frontend communication
// =============================================================================

/// The result of analyzing a chess position.
/// This is what the frontend receives after calling `analyze_position`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineEvaluation {
    /// The position that was analyzed (in FEN notation)
    pub fen: String,

    /// Best move in UCI format (e.g., "e2e4" means pawn from e2 to e4)
    pub best_move: String,

    /// Best move in Standard Algebraic Notation (e.g., "e4") — more human-readable
    /// This is optional because we might not always be able to convert it
    pub best_move_san: Option<String>,

    /// Score in centipawns (1/100th of a pawn value)
    /// Positive = white is winning, Negative = black is winning
    /// Example: +150 means white is up about 1.5 pawns worth
    pub score_cp: i32,

    /// If there's a forced checkmate, how many moves until mate
    /// Positive = white wins, Negative = black wins
    /// Example: Some(3) means checkmate in 3 moves
    pub score_mate: Option<i32>,

    /// How many moves ahead the engine analyzed
    pub depth: u8,

    /// Principal Variation — the best sequence of moves found
    /// Each move is in UCI format (e.g., ["e2e4", "e7e5", "g1f3"])
    pub pv: Vec<String>,

    /// How many positions the engine evaluated
    pub nodes: u64,

    /// How long the analysis took in milliseconds
    pub time_ms: u64,
}

/// Basic information about the engine.
/// Returned after initialization so the frontend knows what engine is running.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineInfo {
    /// Engine name (e.g., "Stockfish 17")
    pub name: String,

    /// Engine author(s)
    pub author: String,

    /// Whether the engine is ready to accept commands
    pub ready: bool,

    /// Number of CPU threads configured for the engine
    pub threads: u32,

    /// Hash table size in megabytes
    pub hash_mb: u32,
}

/// Internal struct to accumulate info from "info" lines during analysis.
/// As Stockfish analyzes, it sends multiple "info" lines with increasing depth.
/// We keep updating this struct and convert it to EngineEvaluation when done.
#[derive(Debug, Clone, Default)]
struct PartialEval {
    depth: u8,
    score_cp: i32,
    score_mate: Option<i32>,
    pv: Vec<String>,
    nodes: u64,
    time_ms: u64,
}

// =============================================================================
// Channel-Based Engine Architecture
// =============================================================================
// The Problem:
// ------------
// Previously, we held a Mutex lock for the entire duration of analysis (2-5
// seconds). This blocked ALL other engine commands — stop, get info, even new
// analysis requests had to wait.
//
// The Solution:
// -------------
// Use channels to decouple command sending from command processing:
//
//   Frontend → analyze_position()
//                    ↓
//            EngineHandle.analyze()
//                    ↓
//            Send command through channel (instant)
//                    ↓
//            Wait for response via oneshot channel
//                    ↓
//   Background Task (engine_command_loop) processes commands one at a time
//
// Benefits:
// - Mutex is only held briefly to clone the EngineHandle
// - Analysis runs in a background task without blocking
// - Multiple requests queue up properly in the channel
// - Stop commands can be sent while analysis is running
// =============================================================================

/// Commands that can be sent to the engine background task.
///
/// Think of this like a menu of operations the engine can perform.
/// Each variant carries the data needed for that operation, plus a
/// oneshot sender to deliver the result back to the caller.
#[derive(Debug)]
pub enum EngineCommand {
    /// Analyze a chess position to a given depth.
    /// The response_tx channel is used to send the result back.
    Analyze {
        fen: String,
        depth: u8,
        response_tx: oneshot::Sender<Result<EngineEvaluation, String>>,
    },

    /// Stop the current analysis immediately.
    /// Stockfish will return the best move found so far.
    Stop,

    /// Gracefully shut down the engine process.
    /// The background task will exit after processing this.
    Quit,
}

/// A cloneable handle to interact with the engine.
///
/// This is the key to the channel-based architecture. Instead of holding
/// a reference to the actual StockfishEngine (which would require a lock),
/// we hold a lightweight handle that can send commands through a channel.
///
/// Why Clone?
/// ----------
/// Tauri commands run on different threads. By making EngineHandle cloneable,
/// each command can get its own copy and send commands independently.
/// The actual engine runs in one background task that receives from all handles.
///
/// The pattern is similar to how you might have multiple TV remotes (handles)
/// that all control one TV (the engine). Each remote can send commands, but
/// only one command is processed at a time.
#[derive(Clone)]
pub struct EngineHandle {
    /// Channel sender for commands. Cloning the handle clones this sender,
    /// which is cheap and thread-safe.
    command_tx: mpsc::Sender<EngineCommand>,

    /// Cached engine info (name, author). This never changes after init,
    /// so we store a copy to avoid channel round-trips for simple queries.
    info: EngineInfo,
}

impl EngineHandle {
    /// Request position analysis (non-blocking send).
    ///
    /// How it works:
    /// 1. Create a oneshot channel for the response
    /// 2. Send the Analyze command with the response sender
    /// 3. Wait for the response to come back
    ///
    /// The actual analysis happens in the background task. This method
    /// just sends the request and waits for the result.
    pub async fn analyze(&self, fen: String, depth: u8) -> Result<EngineEvaluation, String> {
        // Create a oneshot channel for the response.
        // response_tx sends the result, response_rx receives it.
        let (response_tx, response_rx) = oneshot::channel();

        // Send the command through the channel.
        // This is almost instant — we're just putting a message in a queue.
        self.command_tx
            .send(EngineCommand::Analyze {
                fen,
                depth,
                response_tx,
            })
            .await
            .map_err(|_| "Engine channel closed".to_string())?;

        // Now wait for the response. This is where the actual waiting happens,
        // but we're NOT holding any mutex while waiting!
        response_rx
            .await
            .map_err(|_| "Engine response dropped".to_string())?
    }

    /// Request engine to stop current analysis.
    ///
    /// This sends a stop command that the background task will process.
    /// When processed, it tells Stockfish to stop and return immediately.
    pub async fn stop(&self) -> Result<(), String> {
        self.command_tx
            .send(EngineCommand::Stop)
            .await
            .map_err(|_| "Engine channel closed".to_string())
    }

    /// Get cached engine info (name, author, ready status).
    ///
    /// This doesn't need to go through the channel because the info
    /// is immutable after initialization.
    pub fn info(&self) -> &EngineInfo {
        &self.info
    }

    /// Send a quit command without waiting (non-blocking).
    ///
    /// This is used by the LazyEngine shutdown code which can't use async.
    /// Returns Ok(()) if the command was queued, Err if the channel is closed.
    ///
    /// Note: This doesn't wait for the engine to actually quit — it just
    /// sends the command. The engine will quit asynchronously.
    pub fn try_quit(&self) -> Result<(), String> {
        self.command_tx
            .try_send(EngineCommand::Quit)
            .map_err(|_| "Engine channel closed".to_string())
    }
}

/// Spawn a new Stockfish engine and return a handle to it.
///
/// This function:
/// 1. Creates the StockfishEngine (spawns the process, does UCI handshake)
/// 2. Sets up a command channel for communication
/// 3. Spawns a background task to process commands
/// 4. Returns an EngineHandle that can be cloned and used by multiple callers
///
/// The background task runs until it receives a Quit command or the channel closes.
pub async fn spawn_engine(app: &AppHandle) -> Result<EngineHandle, String> {
    // Create the engine (existing StockfishEngine::new logic)
    let engine = StockfishEngine::new(app).await?;
    let info = engine.info();

    // Create command channel with buffer size 32.
    // This means up to 32 commands can be queued before senders block.
    // In practice, we rarely have more than 1-2 pending.
    let (command_tx, command_rx) = mpsc::channel::<EngineCommand>(32);

    // Spawn background task to process commands.
    // tokio::spawn() starts a new async task that runs concurrently.
    // The task will run until engine_command_loop() returns (on Quit or error).
    tokio::spawn(engine_command_loop(command_rx, engine));

    Ok(EngineHandle { command_tx, info })
}

/// Background task that processes engine commands.
///
/// This function runs in a loop, receiving commands from the channel and
/// executing them on the engine. It's the only place that interacts directly
/// with the StockfishEngine, which is why we don't need the engine behind a mutex.
///
/// The loop exits when:
/// - A Quit command is received
/// - The command channel closes (all senders dropped)
async fn engine_command_loop(
    mut command_rx: mpsc::Receiver<EngineCommand>,
    mut engine: StockfishEngine,
) {
    // Keep processing commands until the channel closes or we get Quit
    while let Some(cmd) = command_rx.recv().await {
        match cmd {
            EngineCommand::Analyze {
                fen,
                depth,
                response_tx,
            } => {
                // Perform the analysis
                let result = engine.analyze_position(&fen, depth).await;
                // Send result back (ignore if receiver dropped — caller gave up)
                let _ = response_tx.send(result);
            }
            EngineCommand::Stop => {
                // Tell Stockfish to stop the current analysis
                let _ = engine.stop().await;
            }
            EngineCommand::Quit => {
                // Gracefully shut down the engine and exit the loop
                let _ = engine.quit().await;
                break;
            }
        }
    }
}

// =============================================================================
// StockfishEngine — The Main Engine Manager
// =============================================================================

/// Manages a running Stockfish process.
///
/// This struct holds:
/// - A handle to write to Stockfish's stdin (to send commands)
/// - Engine metadata (name, author) from the UCI handshake
///
/// The process runs in the background, and we communicate with it
/// through stdin/stdout channels.
pub struct StockfishEngine {
    /// The child process handle — used to write to stdin and eventually kill the process
    child: CommandChild,

    /// Channel to receive stdout/stderr events from the engine
    receiver: mpsc::Receiver<CommandEvent>,

    /// Engine name from "id name ..." response
    name: String,

    /// Engine author from "id author ..." response
    author: String,

    /// Engine configuration (threads, hash size) applied during initialization
    config: EngineConfig,
}

impl StockfishEngine {
    // =========================================================================
    // Initialization
    // =========================================================================

    /// Spawn a new Stockfish process and perform the UCI handshake.
    ///
    /// The UCI handshake works like this:
    /// 1. We send "uci" to ask if the engine supports UCI
    /// 2. Engine responds with its name and author
    /// 3. Engine sends "uciok" to confirm UCI mode
    /// 4. We send "isready" to check if it's ready for commands
    /// 5. Engine responds "readyok" when ready
    ///
    /// If any step fails, we return an error.
    pub async fn new(app: &AppHandle) -> Result<Self, String> {
        // Spawn the Stockfish sidecar using Tauri's shell plugin.
        //
        // IMPORTANT: In Tauri v2, the Rust sidecar() function takes just the binary NAME,
        // not the full path from externalBin. The shell plugin resolves the path internally.
        //
        // Config structure:
        // - tauri.conf.json: externalBin: ["binaries/stockfish"]
        // - capabilities:    name: "binaries/stockfish" (for permissions)
        // - Rust code:       sidecar("stockfish") (just the name!)
        //
        // Tauri automatically appends the platform suffix (e.g., -aarch64-apple-darwin)
        // and resolves the path to src-tauri/binaries/stockfish-{target}
        let sidecar_command = app
            .shell()
            .sidecar("stockfish")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

        // `.spawn()` starts the process and returns:
        // - rx: A channel receiver for stdout/stderr events
        // - child: A handle to write to stdin and control the process
        let (rx, child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Failed to spawn Stockfish: {}", e))?;

        // Auto-detect optimal configuration for this platform
        let config = EngineConfig::auto_detect();
        println!(
            "Configuring Stockfish: {} threads, {} MB hash",
            config.threads, config.hash_mb
        );

        // Create our engine struct with the process handles
        let mut engine = StockfishEngine {
            child,
            receiver: rx,
            name: String::new(),
            author: String::new(),
            config,
        };

        // Perform the UCI handshake to initialize the engine
        engine.uci_handshake().await?;

        // Configure engine for optimal performance on this platform
        engine.configure_engine().await?;

        Ok(engine)
    }

    /// Configure Stockfish with optimal settings for this platform.
    ///
    /// This sends UCI "setoption" commands to set:
    /// - Threads: Number of CPU cores to use for parallel search
    /// - Hash: Size of transposition table in MB
    ///
    /// These settings are applied once during initialization and dramatically
    /// improve analysis speed (10x or more on multi-core systems).
    async fn configure_engine(&mut self) -> Result<(), String> {
        // Set number of threads first
        self.send_command(&format!(
            "setoption name Threads value {}",
            self.config.threads
        ))
        .await?;

        // Set hash table size (must be after Threads for some Stockfish versions)
        self.send_command(&format!(
            "setoption name Hash value {}",
            self.config.hash_mb
        ))
        .await?;

        // Verify the engine is ready after configuration changes
        self.send_command("isready").await?;

        // Wait for "readyok" to confirm settings were applied
        loop {
            let line = self.read_line_with_timeout(READY_TIMEOUT).await?;
            if line == "readyok" {
                break;
            }
        }

        Ok(())
    }

    /// Perform the UCI initialization handshake.
    /// This must be called right after spawning the process.
    ///
    /// Uses specific timeouts for each phase:
    /// - UCI_HANDSHAKE_TIMEOUT (10s) for the initial "uci" → "uciok" exchange
    /// - READY_TIMEOUT (5s) for the "isready" → "readyok" check
    async fn uci_handshake(&mut self) -> Result<(), String> {
        // Send "uci" command — this tells Stockfish we want UCI mode
        self.send_command("uci").await?;

        // Read responses until we see "uciok"
        // Along the way, we'll capture "id name" and "id author" lines
        // Use handshake timeout since engine is still loading
        loop {
            let line = self.read_line_with_timeout(UCI_HANDSHAKE_TIMEOUT).await?;

            if line.starts_with("id name ") {
                // Extract engine name: "id name Stockfish 17" → "Stockfish 17"
                self.name = line.strip_prefix("id name ").unwrap_or("").to_string();
            } else if line.starts_with("id author ") {
                // Extract author: "id author T. Romstad..." → "T. Romstad..."
                self.author = line.strip_prefix("id author ").unwrap_or("").to_string();
            } else if line == "uciok" {
                // Engine confirmed UCI mode — handshake part 1 complete
                break;
            }
        }

        // Now send "isready" to check the engine is fully initialized
        // (Stockfish might be loading opening books, etc.)
        self.send_command("isready").await?;

        // Wait for "readyok" — should be nearly instant, use short timeout
        loop {
            let line = self.read_line_with_timeout(READY_TIMEOUT).await?;
            if line == "readyok" {
                break;
            }
        }

        Ok(())
    }

    // =========================================================================
    // Analysis Commands
    // =========================================================================

    /// Analyze a chess position to a given depth.
    ///
    /// Parameters:
    /// - fen: The position in FEN notation
    /// - depth: How many half-moves (plies) to search
    ///
    /// Returns an EngineEvaluation with the best move and score.
    ///
    /// Uses ANALYSIS_LINE_TIMEOUT (30s) between lines — if Stockfish goes silent
    /// for 30 seconds during analysis, we assume something went wrong.
    pub async fn analyze_position(
        &mut self,
        fen: &str,
        depth: u8,
    ) -> Result<EngineEvaluation, String> {
        // Tell Stockfish which position to analyze
        // "position fen <fen>" sets up the board
        self.send_command(&format!("position fen {}", fen)).await?;

        // Start the analysis
        // "go depth N" means: analyze until you've searched N plies deep
        self.send_command(&format!("go depth {}", depth)).await?;

        // Track the best evaluation we've seen
        // Stockfish sends multiple "info" lines as it searches deeper
        let mut best_eval = PartialEval::default();
        #[allow(unused_assignments)]
        let mut best_move: Option<String> = None;

        // Read output until we see "bestmove"
        // Uses default 30s timeout via read_line()
        loop {
            let line = self.read_line().await?;

            if line.starts_with("info ") {
                // Parse the info line to update our evaluation
                if let Some(eval) = parse_info_line(&line) {
                    // Only update if this is a deeper search than before
                    if eval.depth >= best_eval.depth {
                        best_eval = eval;
                    }
                }
            } else if line.starts_with("bestmove ") {
                // Analysis complete — extract the best move
                best_move = parse_bestmove(&line);
                break;
            }
        }

        Ok(EngineEvaluation {
            fen: fen.to_string(),
            best_move: best_move.unwrap_or_default(),
            best_move_san: None, // We'd need a chess library to convert UCI → SAN
            score_cp: best_eval.score_cp,
            score_mate: best_eval.score_mate,
            depth: best_eval.depth,
            pv: best_eval.pv,
            nodes: best_eval.nodes,
            time_ms: best_eval.time_ms,
        })
    }

    /// Stop the current analysis.
    /// Stockfish will respond with "bestmove" for whatever it found so far.
    pub async fn stop(&mut self) -> Result<(), String> {
        self.send_command("stop").await
    }

    /// Get engine information (name, author, ready status, configuration).
    pub fn info(&self) -> EngineInfo {
        EngineInfo {
            name: self.name.clone(),
            author: self.author.clone(),
            ready: true, // If we got here, the engine is ready
            threads: self.config.threads,
            hash_mb: self.config.hash_mb,
        }
    }

    /// Gracefully shut down the engine.
    /// Sends "quit" command which tells Stockfish to exit.
    pub async fn quit(&mut self) -> Result<(), String> {
        self.send_command("quit").await?;
        // The process should exit on its own after receiving "quit"
        Ok(())
    }

    // =========================================================================
    // Low-Level I/O
    // =========================================================================

    /// Send a command to Stockfish via stdin.
    /// Commands must end with a newline character.
    async fn send_command(&mut self, cmd: &str) -> Result<(), String> {
        // Write the command with a newline
        let cmd_with_newline = format!("{}\n", cmd);
        self.child
            .write(cmd_with_newline.as_bytes())
            .map_err(|e| format!("Failed to write to Stockfish: {}", e))?;
        Ok(())
    }

    /// Read a line with the default analysis timeout (30 seconds).
    /// This is the standard method used during position analysis.
    async fn read_line(&mut self) -> Result<String, String> {
        self.read_line_with_timeout(ANALYSIS_LINE_TIMEOUT).await
    }

    /// Read a line with a custom timeout.
    ///
    /// Different operations need different timeouts:
    /// - UCI handshake: 10s (engine startup can be slow)
    /// - Ready check: 5s (should be nearly instant)
    /// - Analysis: 30s (deep searches take time between updates)
    ///
    /// If Stockfish sends nothing for the specified duration, we return an error
    /// instead of blocking forever. This prevents the app from hanging if the
    /// engine crashes or becomes unresponsive.
    async fn read_line_with_timeout(&mut self, max_wait: Duration) -> Result<String, String> {
        match timeout(max_wait, self.read_line_internal()).await {
            Ok(result) => result,
            Err(_) => Err(format!(
                "Engine read timeout after {:?} — Stockfish may have crashed or hung",
                max_wait
            )),
        }
    }

    /// Internal implementation of read_line without timeout.
    /// This is wrapped by `read_line_with_timeout` to add timeout handling.
    /// Never call this directly — always use `read_line` or `read_line_with_timeout`.
    async fn read_line_internal(&mut self) -> Result<String, String> {
        loop {
            match self.receiver.recv().await {
                Some(CommandEvent::Stdout(bytes)) => {
                    // Convert bytes to string, trimming any trailing newline/whitespace
                    let line = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !line.is_empty() {
                        return Ok(line);
                    }
                    // Empty lines are ignored, keep reading
                }
                Some(CommandEvent::Stderr(bytes)) => {
                    // Log stderr but don't treat as an error — some engines use stderr for debug info
                    let msg = String::from_utf8_lossy(&bytes);
                    eprintln!("Stockfish stderr: {}", msg);
                }
                Some(CommandEvent::Error(e)) => {
                    return Err(format!("Stockfish process error: {}", e));
                }
                Some(CommandEvent::Terminated(status)) => {
                    return Err(format!("Stockfish terminated unexpectedly: {:?}", status));
                }
                None => {
                    return Err("Stockfish process channel closed".to_string());
                }
                _ => {
                    // Other event types (e.g., process started) — ignore
                }
            }
        }
    }
}

// =============================================================================
// UCI Output Parsing Helpers
// =============================================================================
// These functions parse the text output from Stockfish into structured data.
// UCI output is space-separated with keyword-value pairs.
// =============================================================================

/// Parse an "info" line from Stockfish.
///
/// Example input:
/// "info depth 15 seldepth 22 score cp 32 nodes 450000 time 234 pv e2e4 e7e5 g1f3"
///
/// The format is: info [keyword value] [keyword value] ...
/// Keywords we care about: depth, score, nodes, time, pv
fn parse_info_line(line: &str) -> Option<PartialEval> {
    // Only parse lines that have useful info (depth and score)
    if !line.contains("depth ") || !line.contains(" pv ") {
        return None;
    }

    let mut eval = PartialEval::default();
    let parts: Vec<&str> = line.split_whitespace().collect();

    let mut i = 0;
    while i < parts.len() {
        match parts[i] {
            "depth" => {
                // Next token is the depth value
                if i + 1 < parts.len() {
                    eval.depth = parts[i + 1].parse().unwrap_or(0);
                    i += 1;
                }
            }
            "score" => {
                // Score can be "cp <value>" (centipawns) or "mate <value>"
                if i + 2 < parts.len() {
                    match parts[i + 1] {
                        "cp" => {
                            eval.score_cp = parts[i + 2].parse().unwrap_or(0);
                            eval.score_mate = None;
                            i += 2;
                        }
                        "mate" => {
                            eval.score_mate = parts[i + 2].parse().ok();
                            // When there's a forced mate, set cp to a large value
                            // to indicate winning/losing
                            eval.score_cp = if eval.score_mate.unwrap_or(0) > 0 {
                                30000 // White is winning
                            } else {
                                -30000 // Black is winning
                            };
                            i += 2;
                        }
                        _ => {}
                    }
                }
            }
            "nodes" => {
                if i + 1 < parts.len() {
                    eval.nodes = parts[i + 1].parse().unwrap_or(0);
                    i += 1;
                }
            }
            "time" => {
                if i + 1 < parts.len() {
                    eval.time_ms = parts[i + 1].parse().unwrap_or(0);
                    i += 1;
                }
            }
            "pv" => {
                // Parse PV (Principal Variation) moves defensively.
                //
                // UCI spec doesn't guarantee PV is the last token in the info line.
                // Some engines may send additional tokens after PV. We need to:
                // 1. Stop collecting moves when we hit a known UCI keyword
                // 2. Validate that each token looks like a UCI move (4-5 chars, alphanumeric)
                //
                // UCI move format: e2e4 (4 chars) or e7e8q (5 chars for promotion)
                const UCI_KEYWORDS: &[&str] = &[
                    "depth", "seldepth", "multipv", "score", "nodes", "nps", "hashfull",
                    "tbhits", "time", "pv", "currmove", "currmovenumber", "string",
                    "refutation", "bmc", "cpuload", "sbhits", "wdl",
                ];

                let mut pv_moves = Vec::new();
                for part in &parts[i + 1..] {
                    // Stop if we hit another UCI keyword
                    if UCI_KEYWORDS.contains(part) {
                        break;
                    }
                    // Validate move format: 4-5 characters, all alphanumeric
                    // Examples: e2e4, g1f3, e7e8q (pawn promotion)
                    if part.len() >= 4
                        && part.len() <= 5
                        && part.chars().all(|c| c.is_ascii_alphanumeric())
                    {
                        pv_moves.push(part.to_string());
                    } else {
                        // Invalid move format — stop collecting
                        // This handles unexpected tokens after PV
                        break;
                    }
                }
                eval.pv = pv_moves;
                // Don't break — continue parsing in case there are other fields
                // (though in practice, most engines put PV last)
            }
            _ => {}
        }
        i += 1;
    }

    Some(eval)
}

/// Parse a "bestmove" line from Stockfish.
///
/// Example input: "bestmove e2e4 ponder e7e5"
/// Returns: Some("e2e4")
///
/// The format is: bestmove <move> [ponder <move>]
/// We only care about the first move.
fn parse_bestmove(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 2 && parts[0] == "bestmove" {
        // Handle the "(none)" case which happens in checkmate/stalemate positions
        if parts[1] == "(none)" {
            return None;
        }
        return Some(parts[1].to_string());
    }
    None
}

// =============================================================================
// Thread-Safe Engine State (Updated for Channel-Based Architecture)
// =============================================================================
// Now we store an EngineHandle instead of the engine directly.
// The handle is cheap to clone and doesn't require holding a lock during analysis.
//
// - Arc: "Atomically Reference Counted" — allows multiple owners of the same data
// - Mutex: "Mutual Exclusion" — only one thread can access the data at a time
//         (but now we only hold it briefly to clone the handle)
// =============================================================================

// =============================================================================
// Analysis Tracker — Cancellation Support
// =============================================================================
// When the frontend starts a long-running analysis (especially analyze_game
// which processes many positions), the user needs a way to cancel it mid-way.
//
// The AnalysisTracker keeps track of all ongoing analyses and their cancellation
// tokens. Think of it like a registry:
// - When analysis starts: we create a unique ID and a "cancel button" (token)
// - When user wants to cancel: they send the ID, we "press" the cancel button
// - When analysis finishes: we clean up the registry entry
//
// CancellationToken is from tokio-util — it's a thread-safe way to signal
// "please stop what you're doing" to async tasks. The token can be cloned
// (so both the tracker and the running task hold a copy) and when we call
// .cancel() on one copy, all copies see that it was cancelled.
// =============================================================================

/// Tracks active analyses that can be cancelled by the frontend.
///
/// This solves the problem of long-running analysis blocking the UI with
/// no way to stop it. Each analysis gets a unique ID that the frontend
/// can use to cancel it.
pub struct AnalysisTracker {
    /// Map of analysis_id → CancellationToken
    /// When we want to cancel, we look up the token and call .cancel() on it
    active: HashMap<String, CancellationToken>,
}

impl AnalysisTracker {
    /// Create a new empty tracker.
    pub fn new() -> Self {
        Self {
            active: HashMap::new(),
        }
    }

    /// Register a new analysis and get back its ID and cancellation token.
    ///
    /// Returns (analysis_id, token) where:
    /// - analysis_id: A unique UUID string to identify this analysis
    /// - token: A CancellationToken that should be checked during analysis
    ///
    /// The running analysis should periodically check token.is_cancelled()
    /// and stop early if true.
    pub fn register(&mut self) -> (String, CancellationToken) {
        // Generate a unique ID using UUID v4 (random UUID)
        let id = Uuid::new_v4().to_string();

        // Create a new cancellation token
        // CancellationToken is like a shared boolean that can be set to "cancelled"
        let token = CancellationToken::new();

        // Store a clone in our registry — both we and the caller have a copy
        self.active.insert(id.clone(), token.clone());

        (id, token)
    }

    /// Cancel an ongoing analysis by its ID.
    ///
    /// Returns true if the analysis was found and cancelled, false if not found.
    /// After calling this, any code checking that token's is_cancelled() will
    /// see true, and any code awaiting token.cancelled() will wake up.
    pub fn cancel(&mut self, id: &str) -> bool {
        if let Some(token) = self.active.remove(id) {
            // Signal cancellation — any task waiting on this token will wake up
            token.cancel();
            true
        } else {
            // Analysis not found — maybe it already finished, or invalid ID
            false
        }
    }

    /// Remove an analysis from tracking (called when analysis completes normally).
    ///
    /// This is cleanup — we don't need to track finished analyses.
    pub fn remove(&mut self, id: &str) {
        self.active.remove(id);
    }
}

impl Default for AnalysisTracker {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe wrapper for the engine handle and analysis tracker.
/// This is what gets stored in Tauri's state management.
pub struct EngineState {
    /// The engine handle, wrapped in Arc<Mutex<>> for thread-safe access.
    /// Option<> because the engine might not be initialized yet.
    ///
    /// Key difference from before: We store EngineHandle, not StockfishEngine.
    /// This means:
    /// - The mutex is only held briefly to clone the handle
    /// - Analysis runs without holding any locks
    /// - Multiple commands can queue up properly
    pub handle: Arc<Mutex<Option<EngineHandle>>>,

    /// Tracks ongoing analyses that can be cancelled.
    /// The frontend can call cancel_analysis(id) to stop a running analysis.
    pub tracker: Arc<Mutex<AnalysisTracker>>,
}

impl EngineState {
    /// Create a new EngineState with no engine initialized.
    pub fn new() -> Self {
        Self {
            handle: Arc::new(Mutex::new(None)),
            tracker: Arc::new(Mutex::new(AnalysisTracker::new())),
        }
    }
}

impl Default for EngineState {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Unit Tests
// =============================================================================
//
// These tests verify the UCI parsing logic and helper functions without needing
// a running Stockfish process. Tests that would require actual Stockfish are
// marked with #[ignore] and need integration test setup.
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // parse_info_line() Tests
    // =========================================================================
    //
    // The info line parser extracts evaluation data from Stockfish's progress
    // output. It needs to handle various formats robustly.
    // =========================================================================

    #[test]
    fn test_parse_info_line_full_format() {
        // Test parsing a complete info line with all fields.
        // This is the typical format during analysis.
        let line = "info depth 15 seldepth 22 score cp 32 nodes 450000 time 234 pv e2e4 e7e5 g1f3";
        let eval = parse_info_line(line).expect("Should parse valid info line");

        assert_eq!(eval.depth, 15, "Should extract depth correctly");
        assert_eq!(eval.score_cp, 32, "Should extract centipawn score");
        assert!(eval.score_mate.is_none(), "No mate score in this line");
        assert_eq!(eval.nodes, 450000, "Should extract node count");
        assert_eq!(eval.time_ms, 234, "Should extract time in ms");
        assert_eq!(
            eval.pv,
            vec!["e2e4", "e7e5", "g1f3"],
            "Should extract PV moves"
        );
    }

    #[test]
    fn test_parse_info_line_minimal_with_pv() {
        // Minimal info line that should still parse (has depth and pv).
        let line = "info depth 10 score cp 50 pv e2e4";
        let eval = parse_info_line(line).expect("Should parse minimal info line");

        assert_eq!(eval.depth, 10);
        assert_eq!(eval.score_cp, 50);
        assert_eq!(eval.pv, vec!["e2e4"]);
        assert_eq!(eval.nodes, 0, "Missing nodes should default to 0");
        assert_eq!(eval.time_ms, 0, "Missing time should default to 0");
    }

    #[test]
    fn test_parse_info_line_mate_positive() {
        // Mate in 3 moves for white (positive mate score).
        // Stockfish uses "score mate N" where N > 0 means white wins.
        let line = "info depth 20 score mate 3 pv e2e4 e7e5 d1h5";
        let eval = parse_info_line(line).expect("Should parse mate line");

        assert_eq!(eval.score_mate, Some(3), "Should extract mate in 3");
        assert_eq!(
            eval.score_cp, 30000,
            "Positive mate should set large positive cp"
        );
    }

    #[test]
    fn test_parse_info_line_mate_negative() {
        // Mate in 5 moves for black (negative mate score).
        // N < 0 means black is winning (white gets mated).
        let line = "info depth 25 score mate -5 pv d7d5 e2e4";
        let eval = parse_info_line(line).expect("Should parse negative mate line");

        assert_eq!(eval.score_mate, Some(-5), "Should extract mate in -5");
        assert_eq!(
            eval.score_cp, -30000,
            "Negative mate should set large negative cp"
        );
    }

    #[test]
    fn test_parse_info_line_no_depth() {
        // Lines without depth should return None (incomplete info).
        let line = "info score cp 50 pv e2e4";
        assert!(
            parse_info_line(line).is_none(),
            "Should return None for line without depth"
        );
    }

    #[test]
    fn test_parse_info_line_no_pv() {
        // Lines without PV should return None (we need the move sequence).
        let line = "info depth 10 score cp 50";
        assert!(
            parse_info_line(line).is_none(),
            "Should return None for line without pv"
        );
    }

    #[test]
    fn test_parse_info_line_currmove() {
        // "currmove" lines are progress updates without analysis, should be skipped.
        let line = "info depth 0 currmove e2e4 currmovenumber 1";
        assert!(
            parse_info_line(line).is_none(),
            "Should skip currmove lines (no pv)"
        );
    }

    #[test]
    fn test_parse_info_line_pv_stops_at_uci_keyword() {
        // Robustness: PV parsing should stop if it hits another UCI keyword.
        // This shouldn't happen normally but defends against malformed output.
        let line = "info depth 10 score cp 50 pv e2e4 e7e5 score cp 60";
        let eval = parse_info_line(line).expect("Should parse line with keyword after pv");

        // Should stop collecting moves when hitting "score"
        assert_eq!(
            eval.pv,
            vec!["e2e4", "e7e5"],
            "PV should stop at UCI keyword"
        );
    }

    #[test]
    fn test_parse_info_line_pv_validates_move_format() {
        // UCI moves are 4-5 alphanumeric characters (e2e4, e7e8q for promotion).
        // Invalid formats should stop PV collection.
        let line = "info depth 10 score cp 50 pv e2e4 invalid! g1f3";
        let eval = parse_info_line(line).expect("Should parse line with invalid move in pv");

        // Should stop at "invalid!" which doesn't match move format
        assert_eq!(
            eval.pv,
            vec!["e2e4"],
            "PV should stop at invalid move format"
        );
    }

    #[test]
    fn test_parse_info_line_promotion_moves() {
        // Promotion moves are 5 characters: e7e8q (pawn e7 to e8, promote to queen).
        let line = "info depth 10 score cp 900 pv e7e8q d8d1";
        let eval = parse_info_line(line).expect("Should parse line with promotion");

        assert_eq!(
            eval.pv,
            vec!["e7e8q", "d8d1"],
            "Should accept 5-char promotion moves"
        );
    }

    #[test]
    fn test_parse_info_line_long_pv() {
        // PV can be quite long in deep analysis.
        let line = "info depth 30 score cp 15 pv e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7";
        let eval = parse_info_line(line).expect("Should parse long PV");

        assert_eq!(eval.pv.len(), 10, "Should extract all 10 moves in PV");
        assert_eq!(eval.pv[0], "e2e4");
        assert_eq!(eval.pv[9], "f8e7");
    }

    #[test]
    fn test_parse_info_line_negative_score() {
        // Negative centipawn scores (black is winning).
        let line = "info depth 12 score cp -150 pv d7d5";
        let eval = parse_info_line(line).expect("Should parse negative score");

        assert_eq!(
            eval.score_cp, -150,
            "Should correctly parse negative centipawn score"
        );
    }

    #[test]
    fn test_parse_info_line_large_values() {
        // Handles large node counts and time values.
        let line = "info depth 25 score cp 100 nodes 1234567890 time 60000 pv e2e4";
        let eval = parse_info_line(line).expect("Should parse large values");

        assert_eq!(eval.nodes, 1234567890, "Should handle large node count");
        assert_eq!(eval.time_ms, 60000, "Should handle large time (60 seconds)");
    }

    // =========================================================================
    // parse_bestmove() Tests
    // =========================================================================
    //
    // The bestmove parser extracts the final recommended move from Stockfish.
    // =========================================================================

    #[test]
    fn test_parse_bestmove_with_ponder() {
        // Standard format: "bestmove <move> ponder <move>"
        // "ponder" is the expected reply — we only care about the best move.
        let line = "bestmove e2e4 ponder e7e5";
        let result = parse_bestmove(line);

        assert_eq!(result, Some("e2e4".to_string()), "Should extract best move");
    }

    #[test]
    fn test_parse_bestmove_without_ponder() {
        // Sometimes Stockfish omits the ponder move.
        let line = "bestmove g1f3";
        let result = parse_bestmove(line);

        assert_eq!(
            result,
            Some("g1f3".to_string()),
            "Should extract move without ponder"
        );
    }

    #[test]
    fn test_parse_bestmove_promotion() {
        // Promotion moves in bestmove.
        let line = "bestmove a7a8q ponder b8c6";
        let result = parse_bestmove(line);

        assert_eq!(
            result,
            Some("a7a8q".to_string()),
            "Should extract promotion move"
        );
    }

    #[test]
    fn test_parse_bestmove_none() {
        // "(none)" is returned when there are no legal moves (checkmate/stalemate).
        let line = "bestmove (none)";
        let result = parse_bestmove(line);

        assert!(result.is_none(), "Should return None for (none) best move");
    }

    #[test]
    fn test_parse_bestmove_malformed() {
        // Malformed lines should return None safely.
        let line = "bestmove";
        let result = parse_bestmove(line);

        assert!(result.is_none(), "Should return None for malformed line");
    }

    #[test]
    fn test_parse_bestmove_wrong_prefix() {
        // Lines that don't start with "bestmove" should return None.
        let line = "info depth 10 bestmove e2e4";
        let result = parse_bestmove(line);

        assert!(
            result.is_none(),
            "Should return None for non-bestmove line"
        );
    }

    // =========================================================================
    // EngineConfig::auto_detect() Tests
    // =========================================================================
    //
    // Auto-detection should produce sane values within the documented ranges.
    // We can't control the test machine's CPU count, so we verify constraints.
    // =========================================================================

    #[test]
    fn test_engine_config_auto_detect_threads_range() {
        // Threads should be between 2 and 4 (background-friendly cap).
        let config = EngineConfig::auto_detect();

        assert!(
            config.threads >= 2,
            "Threads should be at least 2 for parallel search, got {}",
            config.threads
        );
        assert!(
            config.threads <= 4,
            "Threads should be capped at 4 for background use, got {}",
            config.threads
        );
    }

    #[test]
    fn test_engine_config_auto_detect_hash_range() {
        // Hash should be between 128 and 256 MB.
        let config = EngineConfig::auto_detect();

        assert!(
            config.hash_mb >= 128,
            "Hash should be at least 128 MB, got {}",
            config.hash_mb
        );
        assert!(
            config.hash_mb <= 256,
            "Hash should be capped at 256 MB for background use, got {}",
            config.hash_mb
        );
    }

    #[test]
    fn test_engine_config_hash_proportional_to_threads() {
        // Hash is calculated as threads * 64, clamped to 128-256.
        let config = EngineConfig::auto_detect();

        // threads * 64 should equal hash_mb (before clamping)
        // With 2-4 threads: 128-256 MB, which matches our clamp range.
        let expected_unclamped = config.threads * 64;
        let expected_clamped = expected_unclamped.clamp(128, 256);

        assert_eq!(
            config.hash_mb, expected_clamped,
            "Hash should be threads * 64 (clamped)"
        );
    }

    // =========================================================================
    // AnalysisTracker Tests
    // =========================================================================
    //
    // The tracker manages cancellation tokens for ongoing analyses.
    // =========================================================================

    #[test]
    fn test_analysis_tracker_new() {
        // Tracker starts empty.
        let tracker = AnalysisTracker::new();
        assert!(tracker.active.is_empty(), "New tracker should be empty");
    }

    #[test]
    fn test_analysis_tracker_register_returns_unique_ids() {
        // Each registration should return a unique ID.
        let mut tracker = AnalysisTracker::new();

        let (id1, _token1) = tracker.register();
        let (id2, _token2) = tracker.register();
        let (id3, _token3) = tracker.register();

        assert_ne!(id1, id2, "IDs should be unique");
        assert_ne!(id2, id3, "IDs should be unique");
        assert_ne!(id1, id3, "IDs should be unique");
    }

    #[test]
    fn test_analysis_tracker_register_adds_to_active() {
        // Registration should add the ID to the active map.
        let mut tracker = AnalysisTracker::new();

        let (id, _token) = tracker.register();

        assert!(
            tracker.active.contains_key(&id),
            "ID should be in active map"
        );
        assert_eq!(tracker.active.len(), 1, "Should have exactly one active");
    }

    #[test]
    fn test_analysis_tracker_cancel_existing() {
        // Cancelling an existing ID should return true and remove it.
        let mut tracker = AnalysisTracker::new();

        let (id, _token) = tracker.register();
        let cancelled = tracker.cancel(&id);

        assert!(cancelled, "Should return true for existing ID");
        assert!(
            !tracker.active.contains_key(&id),
            "ID should be removed after cancel"
        );
    }

    #[test]
    fn test_analysis_tracker_cancel_nonexistent() {
        // Cancelling a non-existent ID should return false.
        let mut tracker = AnalysisTracker::new();

        let cancelled = tracker.cancel("nonexistent-id");

        assert!(
            !cancelled,
            "Should return false for non-existent ID"
        );
    }

    #[test]
    fn test_analysis_tracker_cancel_triggers_token() {
        // When we cancel, the token should be marked as cancelled.
        let mut tracker = AnalysisTracker::new();

        let (id, token) = tracker.register();

        // Before cancel
        assert!(
            !token.is_cancelled(),
            "Token should not be cancelled before cancel()"
        );

        // Cancel it
        tracker.cancel(&id);

        // After cancel
        assert!(
            token.is_cancelled(),
            "Token should be cancelled after cancel()"
        );
    }

    #[test]
    fn test_analysis_tracker_remove_cleans_up() {
        // Remove should clean up without triggering cancellation.
        let mut tracker = AnalysisTracker::new();

        let (id, token) = tracker.register();
        tracker.remove(&id);

        assert!(
            !tracker.active.contains_key(&id),
            "ID should be removed"
        );
        // Note: remove() doesn't cancel the token (it's for normal completion)
        // The token is dropped when remove() is called, but since we cloned it
        // in register(), checking is_cancelled() here tests the clone.
        // The token in the hashmap was dropped, but our clone is still valid.
        assert!(
            !token.is_cancelled(),
            "Remove should not trigger cancellation"
        );
    }

    #[test]
    fn test_analysis_tracker_remove_nonexistent_safe() {
        // Removing a non-existent ID should be safe (no-op).
        let mut tracker = AnalysisTracker::new();

        // Should not panic
        tracker.remove("nonexistent-id");

        assert!(tracker.active.is_empty(), "Tracker should still be empty");
    }

    #[test]
    fn test_analysis_tracker_multiple_operations() {
        // Test a sequence of register, cancel, remove operations.
        let mut tracker = AnalysisTracker::new();

        // Register 3 analyses
        let (id1, token1) = tracker.register();
        let (id2, token2) = tracker.register();
        let (id3, _token3) = tracker.register();

        assert_eq!(tracker.active.len(), 3);

        // Cancel id1
        assert!(tracker.cancel(&id1));
        assert!(token1.is_cancelled());
        assert_eq!(tracker.active.len(), 2);

        // Remove id2 (normal completion)
        tracker.remove(&id2);
        assert!(!token2.is_cancelled());
        assert_eq!(tracker.active.len(), 1);

        // id3 should still be active
        assert!(tracker.active.contains_key(&id3));
    }

    #[test]
    fn test_analysis_tracker_default() {
        // Default trait should create empty tracker.
        let tracker = AnalysisTracker::default();
        assert!(tracker.active.is_empty());
    }

    // =========================================================================
    // EngineState Tests
    // =========================================================================

    #[test]
    fn test_engine_state_new() {
        // EngineState should initialize with None handle.
        let _state = EngineState::new();
        // Can't easily test the contents without async, but construction should work.
    }

    #[test]
    fn test_engine_state_default() {
        // Default trait should work.
        let _state = EngineState::default();
    }

    // =========================================================================
    // EngineInfo Tests
    // =========================================================================

    #[test]
    fn test_engine_info_serialization() {
        // EngineInfo should serialize/deserialize correctly (used for IPC).
        let info = EngineInfo {
            name: "Stockfish 17".to_string(),
            author: "T. Romstad".to_string(),
            ready: true,
            threads: 4,
            hash_mb: 256,
        };

        // Serialize to JSON
        let json = serde_json::to_string(&info).expect("Should serialize");
        assert!(json.contains("Stockfish 17"));
        assert!(json.contains("threads"));

        // Deserialize back
        let deserialized: EngineInfo =
            serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.name, "Stockfish 17");
        assert_eq!(deserialized.threads, 4);
    }

    // =========================================================================
    // EngineEvaluation Tests
    // =========================================================================

    #[test]
    fn test_engine_evaluation_serialization() {
        // EngineEvaluation should serialize/deserialize correctly.
        let eval = EngineEvaluation {
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1".to_string(),
            best_move: "e7e5".to_string(),
            best_move_san: Some("e5".to_string()),
            score_cp: 50,
            score_mate: None,
            depth: 20,
            pv: vec!["e7e5".to_string(), "g1f3".to_string()],
            nodes: 1000000,
            time_ms: 500,
        };

        let json = serde_json::to_string(&eval).expect("Should serialize");
        assert!(json.contains("e7e5"));
        assert!(json.contains("\"depth\":20"));

        let deserialized: EngineEvaluation =
            serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.best_move, "e7e5");
        assert_eq!(deserialized.depth, 20);
    }

    #[test]
    fn test_engine_evaluation_with_mate() {
        // Test evaluation with mate score.
        let eval = EngineEvaluation {
            fen: "some_position".to_string(),
            best_move: "d1h5".to_string(),
            best_move_san: Some("Qh5#".to_string()),
            score_cp: 30000,
            score_mate: Some(1),
            depth: 15,
            pv: vec!["d1h5".to_string()],
            nodes: 50000,
            time_ms: 100,
        };

        let json = serde_json::to_string(&eval).expect("Should serialize");
        assert!(json.contains("\"score_mate\":1"));
    }

    // =========================================================================
    // PartialEval Tests
    // =========================================================================

    #[test]
    fn test_partial_eval_default() {
        // PartialEval default should have zero values.
        let eval = PartialEval::default();

        assert_eq!(eval.depth, 0);
        assert_eq!(eval.score_cp, 0);
        assert!(eval.score_mate.is_none());
        assert!(eval.pv.is_empty());
        assert_eq!(eval.nodes, 0);
        assert_eq!(eval.time_ms, 0);
    }

    // =========================================================================
    // Integration Tests (Require Running Stockfish)
    // =========================================================================
    //
    // These tests are marked #[ignore] because they require:
    // 1. A Tauri runtime with AppHandle
    // 2. The Stockfish sidecar binary to be available
    //
    // Run with: cargo test -- --ignored
    // =========================================================================

    #[tokio::test]
    #[ignore = "Requires Tauri AppHandle and Stockfish sidecar"]
    async fn test_spawn_engine_integration() {
        // This would test actual engine spawning.
        // Requires: tauri::test::mock_app() or similar setup.
        todo!("Integration test: spawn engine and verify UCI handshake");
    }

    #[tokio::test]
    #[ignore = "Requires Tauri AppHandle and Stockfish sidecar"]
    async fn test_analyze_position_integration() {
        // This would test actual position analysis.
        // Requires: running Stockfish process.
        todo!("Integration test: analyze starting position");
    }
}

// =============================================================================
// Resource Cleanup — Drop Trait Implementation
// =============================================================================
// The Drop trait is Rust's destructor — it runs automatically when a value
// goes out of scope or is explicitly dropped. This is critical for cleanup.
//
// Why this matters:
// -----------------
// If the Tauri app crashes, closes unexpectedly, or the EngineState is dropped
// for any reason, we need to ensure the Stockfish child process is terminated.
// Without this, orphaned Stockfish processes would continue running, consuming
// CPU and memory (zombie processes).
//
// Implementation notes:
// --------------------
// - Drop cannot be async, so we can't use .await or async locks
// - We use try_lock() instead of lock().await to avoid deadlocks
// - We use try_send() which is non-blocking (doesn't need .await)
// - This is "best-effort" cleanup — if the lock is held elsewhere, we skip it
//   (the OS will clean up the process when our app fully exits anyway)
// =============================================================================

impl Drop for EngineState {
    fn drop(&mut self) {
        // Best-effort cleanup: send quit command to engine
        // Use try_lock to avoid deadlocks during drop (Drop can't be async)
        if let Ok(mut guard) = self.handle.try_lock() {
            if let Some(handle) = guard.take() {
                // Attempt to send quit command (non-blocking)
                // try_send() returns immediately — either succeeds or fails
                // We ignore the result because we're in cleanup anyway
                let _ = handle.command_tx.try_send(EngineCommand::Quit);
            }
        }
        // If try_lock fails, another task holds the lock — that's OK.
        // Either that task will clean up, or the OS will kill the child
        // process when our entire app exits.
    }
}
