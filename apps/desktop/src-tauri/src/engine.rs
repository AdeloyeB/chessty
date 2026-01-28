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
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{mpsc, Mutex};

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
        // "binaries/stockfish" matches the externalBin path in tauri.conf.json.
        // The `.sidecar()` method looks for a binary in the app bundle.
        // Tauri automatically appends the platform suffix (e.g., -x86_64-apple-darwin).
        let sidecar_command = app
            .shell()
            .sidecar("binaries/stockfish")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

        // `.spawn()` starts the process and returns:
        // - rx: A channel receiver for stdout/stderr events
        // - child: A handle to write to stdin and control the process
        let (rx, child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Failed to spawn Stockfish: {}", e))?;

        // Create our engine struct with the process handles
        let mut engine = StockfishEngine {
            child,
            receiver: rx,
            name: String::new(),
            author: String::new(),
        };

        // Perform the UCI handshake to initialize the engine
        engine.uci_handshake().await?;

        Ok(engine)
    }

    /// Perform the UCI initialization handshake.
    /// This must be called right after spawning the process.
    async fn uci_handshake(&mut self) -> Result<(), String> {
        // Send "uci" command — this tells Stockfish we want UCI mode
        self.send_command("uci").await?;

        // Read responses until we see "uciok"
        // Along the way, we'll capture "id name" and "id author" lines
        loop {
            let line = self.read_line().await?;

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

        // Wait for "readyok"
        loop {
            let line = self.read_line().await?;
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
    pub async fn analyze_position(&mut self, fen: &str, depth: u8) -> Result<EngineEvaluation, String> {
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

    /// Get engine information (name, author, ready status).
    pub fn info(&self) -> EngineInfo {
        EngineInfo {
            name: self.name.clone(),
            author: self.author.clone(),
            ready: true, // If we got here, the engine is ready
        }
    }

    /// Gracefully shut down the engine.
    /// Sends "quit" command which tells Stockfish to exit.
    /// Currently unused but will be needed for app shutdown handling.
    #[allow(dead_code)]
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

    /// Read the next line of output from Stockfish.
    /// Blocks until a line is available or the process exits.
    async fn read_line(&mut self) -> Result<String, String> {
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
                // PV is a sequence of moves — collect all remaining tokens until end
                // (or until we hit another keyword, but typically pv is last)
                let pv_moves: Vec<String> = parts[i + 1..].iter().map(|s| s.to_string()).collect();
                eval.pv = pv_moves;
                break; // PV is always at the end, so we're done
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
// Thread-Safe Engine State
// =============================================================================
// We wrap the engine in Arc<Mutex<>> so multiple Tauri commands can access it
// safely. This is Rust's way of handling shared mutable state across threads.
//
// - Arc: "Atomically Reference Counted" — allows multiple owners of the same data
// - Mutex: "Mutual Exclusion" — only one thread can access the data at a time
// =============================================================================

/// Thread-safe wrapper for the Stockfish engine.
/// This is what gets stored in Tauri's state management.
pub struct EngineState {
    /// The engine, wrapped in Arc<Mutex<>> for thread-safe access.
    /// Option<> because the engine might not be initialized yet.
    pub engine: Arc<Mutex<Option<StockfishEngine>>>,
}

impl EngineState {
    /// Create a new EngineState with no engine initialized.
    pub fn new() -> Self {
        Self {
            engine: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for EngineState {
    fn default() -> Self {
        Self::new()
    }
}
