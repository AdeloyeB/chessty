// =============================================================================
// commands/anticheat.rs — Anti-Cheat IPC Command Handlers
// =============================================================================
//
// This file defines Tauri commands that expose the anti-cheat system to the
// frontend. These commands allow the JavaScript/TypeScript code to:
//
// 1. Scan the environment for suspicious processes (chess engines, debuggers)
// 2. Track mouse input during chess moves (for bot vs human detection)
// 3. Monitor network activity patterns (for engine API usage detection)
// 4. Analyze recorded input for suspicious patterns
//
// The frontend calls these commands via Tauri's invoke() function:
//   const risk = await invoke("scan_environment");
//   await invoke("start_move_recording", { gameId: "...", moveNumber: 5 });
//
// Security Note:
// --------------
// These commands collect behavioral data during gameplay to detect cheating.
// The data is only collected during active games and is sent to the server
// for analysis combined with statistical move quality scoring.
//
// We do NOT:
// - Block users based on detected processes (that happens server-side)
// - Record data when the user isn't in an active game
// - Log personal information or request content
// =============================================================================

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

// Import anti-cheat modules
use crate::anticheat::{
    environment::{EnvironmentChecker, EnvironmentRisk},
    input::{
        analyze_input_patterns, DestinationMethod, MoveInputRecorder, MoveSource, SelectionMethod,
    },
    network::{NetworkMonitor, NetworkSummary},
};

// =============================================================================
// State Management
// =============================================================================
//
// Tauri's state management lets us share data between commands. We wrap our
// stateful types in Arc<Mutex<>> for thread-safe access across async commands.
//
// Why Arc<Mutex<>>?
// - Arc (Atomic Reference Counted): Allows multiple owners of the same data
// - Mutex (Mutual Exclusion): Ensures only one task can access the data at a time
// - Together: Safe to share across async tasks in Tauri's multi-threaded runtime
// =============================================================================

/// State container for the anti-cheat system.
///
/// This struct holds all stateful anti-cheat components:
/// - `input_recorder`: Tracks mouse movements during each chess move
/// - `network_monitor`: Monitors network activity during games
/// - `current_game_id`: The active game being monitored (if any)
/// - `current_move_number`: The move being recorded (if any)
///
/// Register this in main.rs with: `.manage(AntiCheatState::new())`
pub struct AntiCheatState {
    /// The move input recorder, protected by a mutex for thread safety.
    pub input_recorder: Arc<Mutex<MoveInputRecorder>>,

    /// The network monitor, protected by a mutex for thread safety.
    pub network_monitor: Arc<Mutex<NetworkMonitor>>,

    /// The currently active game ID (if recording).
    pub current_game_id: Arc<Mutex<Option<String>>>,

    /// The current move number being recorded.
    pub current_move_number: Arc<Mutex<Option<u32>>>,
}

impl AntiCheatState {
    /// Create a new anti-cheat state with initialized components.
    pub fn new() -> Self {
        Self {
            input_recorder: Arc::new(Mutex::new(MoveInputRecorder::new())),
            network_monitor: Arc::new(Mutex::new(NetworkMonitor::new())),
            current_game_id: Arc::new(Mutex::new(None)),
            current_move_number: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for AntiCheatState {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Command Response Types
// =============================================================================
//
// Tauri commands return serializable types. These structs define the shape
// of data sent back to the frontend when commands complete.
// =============================================================================

/// Response from start_move_recording command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartRecordingResponse {
    /// Whether recording started successfully.
    pub success: bool,
    /// The game ID recording is active for.
    pub game_id: String,
    /// The move number being recorded.
    pub move_number: u32,
}

/// Response from finish_move_recording command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinishRecordingResponse {
    /// The complete move source data for analysis.
    pub move_source: MoveSource,
    /// Path linearity score (0.0 = curved, 1.0 = straight line).
    /// Values > 0.95 are suspicious (bot-like).
    pub path_linearity: f32,
    /// Whether the path shows natural micro-corrections.
    pub has_micro_corrections: bool,
    /// Number of hesitation points detected.
    pub hesitation_count: usize,
}

/// Response from analyze_input_patterns command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputAnalysisResult {
    /// List of suspicious flags detected.
    pub flags: Vec<String>,
    /// Whether any critical flags were detected.
    pub has_critical_flags: bool,
}

// =============================================================================
// Environment Commands
// =============================================================================

/// Scan the environment for suspicious processes and conditions.
///
/// This command runs an asynchronous scan of the system to detect:
/// - Running chess engines (Stockfish, Leela, etc.)
/// - Screen sharing applications (Discord, Zoom, etc.)
/// - Automation tools (AutoHotKey, etc.)
/// - Debuggers attached to the process
/// - Virtual machine indicators
///
/// The scan results in a risk score (0-100) and detailed flags that the
/// server uses to correlate with move quality for cheat detection.
///
/// Frontend usage:
/// ```javascript
/// const risk = await invoke("scan_environment");
/// console.log(`Risk score: ${risk.score}`);
/// console.log(`Flags: ${risk.flags.join(", ")}`);
/// ```
///
/// Returns: EnvironmentRisk with score, flags, and detected processes.
#[tauri::command]
pub async fn scan_environment() -> Result<EnvironmentRisk, String> {
    // Run the async environment scan
    // This spawns OS processes to list running programs, so it's not instant
    let checker = EnvironmentChecker::scan().await;

    // Calculate and return the risk assessment
    Ok(checker.calculate_risk())
}

// =============================================================================
// Input Recording Commands
// =============================================================================

/// Start recording input for a new chess move.
///
/// Call this when the user begins interacting with the board to select a piece.
/// The recorder will track all subsequent mouse movements until
/// `finish_move_recording` is called.
///
/// Parameters:
/// - `game_id`: The unique identifier of the current game
/// - `move_number`: Which move this is (1, 2, 3, etc.)
///
/// Frontend usage:
/// ```javascript
/// // When user clicks on a piece
/// await invoke("start_move_recording", {
///   gameId: "game-12345",
///   moveNumber: 15
/// });
/// ```
///
/// Returns: StartRecordingResponse with success status.
#[tauri::command]
pub async fn start_move_recording(
    game_id: String,
    move_number: u32,
    state: State<'_, AntiCheatState>,
) -> Result<StartRecordingResponse, String> {
    // Lock the recorder
    let mut recorder = state.input_recorder.lock().await;

    // If already recording, finish the previous recording first
    if recorder.is_recording() {
        recorder.cancel_recording();
    }

    // Start new recording with mouse click as the selection method
    // The actual selection coordinates will be recorded with the first input point
    recorder.start_recording(SelectionMethod::MouseClick { x: 0.0, y: 0.0 });

    // Store the game context
    {
        let mut game_id_lock = state.current_game_id.lock().await;
        *game_id_lock = Some(game_id.clone());
    }
    {
        let mut move_num_lock = state.current_move_number.lock().await;
        *move_num_lock = Some(move_number);
    }

    Ok(StartRecordingResponse {
        success: true,
        game_id,
        move_number,
    })
}

/// Record a mouse position during move input.
///
/// Call this for each mouse move event while the user is making a move.
/// These points are analyzed to distinguish human movement (curved paths,
/// hesitations, micro-corrections) from bot movement (straight lines,
/// constant velocity).
///
/// Parameters:
/// - `x`: X coordinate (0.0 = left edge, 1.0 = right edge of board)
/// - `y`: Y coordinate (0.0 = top edge, 1.0 = bottom edge of board)
/// - `timestamp`: Unix timestamp in milliseconds
///
/// Frontend usage:
/// ```javascript
/// // On mouse move over the board
/// board.addEventListener("mousemove", (e) => {
///   const rect = board.getBoundingClientRect();
///   const x = (e.clientX - rect.left) / rect.width;
///   const y = (e.clientY - rect.top) / rect.height;
///   invoke("record_input_point", { x, y, timestamp: Date.now() });
/// });
/// ```
#[tauri::command]
pub async fn record_input_point(
    x: f32,
    y: f32,
    timestamp: u64,
    state: State<'_, AntiCheatState>,
) -> Result<(), String> {
    let mut recorder = state.input_recorder.lock().await;

    if !recorder.is_recording() {
        return Err("Not currently recording. Call start_move_recording first.".to_string());
    }

    // Record the point with the provided timestamp
    recorder.record_point_with_timestamp(x, y, timestamp);

    Ok(())
}

/// Finish recording and get the complete move source data.
///
/// Call this when the user selects a destination square to complete the move.
/// Returns the full input path analysis including path linearity, hesitations,
/// and micro-correction detection.
///
/// Parameters:
/// - `dest_x`: Destination X coordinate (normalized 0.0-1.0)
/// - `dest_y`: Destination Y coordinate (normalized 0.0-1.0)
///
/// Frontend usage:
/// ```javascript
/// // When user clicks destination square
/// const result = await invoke("finish_move_recording", {
///   destX: 0.75,
///   destY: 0.25
/// });
/// console.log(`Path linearity: ${result.path_linearity}`);
/// console.log(`Hesitations: ${result.hesitation_count}`);
/// // Send result.move_source to server with the move
/// ```
///
/// Returns: FinishRecordingResponse with complete analysis.
#[tauri::command]
pub async fn finish_move_recording(
    dest_x: f32,
    dest_y: f32,
    state: State<'_, AntiCheatState>,
) -> Result<FinishRecordingResponse, String> {
    let mut recorder = state.input_recorder.lock().await;

    if !recorder.is_recording() {
        return Err("Not currently recording. Call start_move_recording first.".to_string());
    }

    // Complete the recording with the destination click
    let move_source = recorder.finish_recording(DestinationMethod::MouseClick {
        x: dest_x,
        y: dest_y,
    });

    // Calculate analysis metrics
    let path_linearity = move_source.calculate_path_linearity();
    let has_micro_corrections = move_source.has_micro_corrections();
    let hesitation_count = move_source.count_hesitations();

    // Clear game context
    {
        let mut game_id_lock = state.current_game_id.lock().await;
        *game_id_lock = None;
    }
    {
        let mut move_num_lock = state.current_move_number.lock().await;
        *move_num_lock = None;
    }

    Ok(FinishRecordingResponse {
        move_source,
        path_linearity,
        has_micro_corrections,
        hesitation_count,
    })
}

/// Mark that the application lost focus during move recording.
///
/// Call this when the app window loses focus (user alt-tabbed away).
/// This is an important signal — if the user loses focus before making
/// a strong move, they might have been looking at an engine.
///
/// Frontend usage:
/// ```javascript
/// window.addEventListener("blur", () => {
///   invoke("mark_focus_lost");
/// });
/// ```
#[tauri::command]
pub async fn mark_focus_lost(state: State<'_, AntiCheatState>) -> Result<(), String> {
    let mut recorder = state.input_recorder.lock().await;
    recorder.mark_focus_lost();
    Ok(())
}

/// Cancel the current move recording without producing data.
///
/// Call this if the user deselects a piece or cancels their move.
///
/// Frontend usage:
/// ```javascript
/// // User pressed Escape or clicked elsewhere
/// await invoke("cancel_move_recording");
/// ```
#[tauri::command]
pub async fn cancel_move_recording(state: State<'_, AntiCheatState>) -> Result<(), String> {
    let mut recorder = state.input_recorder.lock().await;
    recorder.cancel_recording();

    // Clear game context
    {
        let mut game_id_lock = state.current_game_id.lock().await;
        *game_id_lock = None;
    }
    {
        let mut move_num_lock = state.current_move_number.lock().await;
        *move_num_lock = None;
    }

    Ok(())
}

// =============================================================================
// Network Monitoring Commands
// =============================================================================

/// Get the current network activity summary.
///
/// Returns statistics about network requests made during the current session:
/// - Total HTTP requests
/// - Requests to known chess analysis services
/// - WebSocket connections
/// - Request counts by domain
///
/// Frontend usage:
/// ```javascript
/// const summary = await invoke("get_network_summary");
/// console.log(`Chess API requests: ${summary.chess_api_requests}`);
/// ```
///
/// Returns: NetworkSummary with activity statistics.
#[tauri::command]
pub async fn get_network_summary(
    state: State<'_, AntiCheatState>,
) -> Result<NetworkSummary, String> {
    let monitor = state.network_monitor.lock().await;
    Ok(monitor.get_summary())
}

/// Start network monitoring for a game.
///
/// Call this when a game starts to begin tracking network activity.
/// The monitor will record requests to chess analysis domains.
///
/// Frontend usage:
/// ```javascript
/// await invoke("start_network_monitoring");
/// ```
#[tauri::command]
pub async fn start_network_monitoring(state: State<'_, AntiCheatState>) -> Result<(), String> {
    let mut monitor = state.network_monitor.lock().await;
    monitor.start_monitoring();
    Ok(())
}

/// Stop network monitoring for a game.
///
/// Call this when a game ends to stop tracking.
///
/// Frontend usage:
/// ```javascript
/// await invoke("stop_network_monitoring");
/// ```
#[tauri::command]
pub async fn stop_network_monitoring(state: State<'_, AntiCheatState>) -> Result<(), String> {
    let mut monitor = state.network_monitor.lock().await;
    monitor.stop_monitoring();
    Ok(())
}

/// Analyze network patterns for suspicious activity.
///
/// Returns a list of flags if suspicious patterns are detected:
/// - `high_chess_api_requests`: Many requests to chess analysis services
/// - `frequent_regular_requests`: Suspiciously regular request intervals
/// - `chess_websocket_active`: Active WebSocket to chess domain
///
/// Frontend usage:
/// ```javascript
/// const flags = await invoke("analyze_network_patterns");
/// if (flags.length > 0) {
///   console.log("Suspicious network activity:", flags);
/// }
/// ```
#[tauri::command]
pub async fn analyze_network_patterns(
    state: State<'_, AntiCheatState>,
) -> Result<Vec<String>, String> {
    let monitor = state.network_monitor.lock().await;
    // Convert &'static str to String for JSON serialization
    Ok(monitor
        .analyze_patterns()
        .into_iter()
        .map(String::from)
        .collect())
}

// =============================================================================
// Input Analysis Commands
// =============================================================================

/// Analyze recorded input for suspicious patterns.
///
/// Takes a MoveSource (from finish_move_recording) and returns a list of
/// suspicious flags. These flags are used by the server to adjust cheat
/// probability scores.
///
/// Possible flags:
/// - `programmatic_input`: Move was injected programmatically (RED FLAG)
/// - `empty_input_path`: No mouse movement recorded
/// - `linear_path`: Path is suspiciously straight (bot-like)
/// - `no_micro_corrections`: Lacks natural human hand corrections
/// - `no_hesitations`: No pauses during movement
/// - `focus_lost_during_move`: User alt-tabbed during move
///
/// Frontend usage:
/// ```javascript
/// const result = await invoke("finish_move_recording", { destX, destY });
/// const analysis = await invoke("analyze_input_patterns", {
///   moveSource: result.move_source
/// });
/// console.log("Suspicious flags:", analysis.flags);
/// ```
///
/// Returns: InputAnalysisResult with flags and critical flag indicator.
#[tauri::command]
pub async fn analyze_input_patterns_cmd(
    move_source: MoveSource,
) -> Result<InputAnalysisResult, String> {
    // Run the pattern analysis
    let flags: Vec<String> = analyze_input_patterns(&move_source)
        .into_iter()
        .map(String::from)
        .collect();

    // Check for critical flags (definite cheating indicators)
    let critical_flags = ["programmatic_input", "empty_input_path"];
    let has_critical_flags = flags
        .iter()
        .any(|f| critical_flags.contains(&f.as_str()));

    Ok(InputAnalysisResult {
        flags,
        has_critical_flags,
    })
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anticheat_state_creation() {
        let state = AntiCheatState::new();
        // Verify state is properly initialized
        assert!(Arc::strong_count(&state.input_recorder) == 1);
        assert!(Arc::strong_count(&state.network_monitor) == 1);
    }

    #[test]
    fn test_start_recording_response_serialization() {
        let response = StartRecordingResponse {
            success: true,
            game_id: "test-game".to_string(),
            move_number: 1,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("success"));
        assert!(json.contains("test-game"));
    }

    #[test]
    fn test_input_analysis_result_serialization() {
        let result = InputAnalysisResult {
            flags: vec!["linear_path".to_string(), "no_hesitations".to_string()],
            has_critical_flags: false,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("linear_path"));
        assert!(json.contains("no_hesitations"));
        assert!(json.contains("has_critical_flags"));
    }
}
