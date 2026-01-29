// =============================================================================
// anticheat/input.rs — Input Tracking and Analysis
// =============================================================================
//
// This module tracks HOW the user makes chess moves, not just WHAT moves they
// make. The goal is to distinguish human input from bot/automation input.
//
// Human vs Bot Input Patterns:
// ----------------------------
// 1. **Mouse Movement**:
//    - Humans: Curved paths, hesitations, micro-corrections, variable speed
//    - Bots: Straight lines (linear interpolation), constant speed, perfect paths
//
// 2. **Timing**:
//    - Humans: Variable thinking time based on position complexity
//    - Bots: Often consistent timing, or instant moves on complex positions
//
// 3. **Selection Method**:
//    - Humans: Click or drag, occasional keyboard shortcuts
//    - Bots: May use programmatic input injection (Programmatic variant)
//
// Data Collected:
// ---------------
// For each move, we record:
// - How the piece was selected (click, drag, keyboard)
// - The mouse path during the move (for path analysis)
// - Time spent thinking
// - Whether the app maintained focus
//
// Privacy Note:
// -------------
// This data is sent to the server only when combined with game moves.
// We don't track input when the user isn't playing a game.
// Mouse positions are relative to the board, not global screen coordinates.
// =============================================================================

use serde::{Deserialize, Serialize};

// =============================================================================
// Constants — Memory Safety Bounds
// =============================================================================

/// Maximum number of input points to record per move.
///
/// ## Why This Limit?
///
/// Without a limit, a long move (user hovers for 30+ seconds) could accumulate
/// thousands of points, consuming significant memory. This is especially
/// problematic if:
/// - User forgets about the game and leaves mouse on board
/// - Automated testing sends rapid mouse events
/// - Malicious client tries to exhaust server memory with huge payloads
///
/// ## Chosen Value: 500 points
///
/// Typical move recording:
/// - Average move duration: 2-10 seconds
/// - Mouse event rate: ~60 Hz (60 events/second)
/// - Average points per move: 120-600
///
/// 500 points covers:
/// - ~8 seconds at 60 Hz (plenty for normal moves)
/// - Sufficient data for path analysis (linearity, corrections)
/// - ~20 KB maximum payload (500 * ~40 bytes per point)
///
/// ## Behavior When Limit Reached
///
/// Once we hit 500 points, new points are silently dropped.
/// The analysis algorithms still work because:
/// - Path linearity uses start/end + sampled middle points
/// - Micro-corrections are detected in any 10+ point segment
/// - Hesitations are detected by timestamp gaps, not point count
///
/// For very long hovers, we effectively capture the first 8 seconds,
/// which is where meaningful human input patterns occur.
const MAX_INPUT_POINTS: usize = 500;

// =============================================================================
// Core Data Structures
// =============================================================================

/// Complete record of input data for a single chess move.
///
/// This struct is attached to each move sent to the server. The server uses
/// it to calculate behavioral anomaly scores that combine with statistical
/// engine detection.
///
/// Example workflow:
/// 1. User clicks on a piece → we start recording
/// 2. User hovers, thinks, moves mouse around → we track the path
/// 3. User clicks destination → we stop recording
/// 4. MoveSource is attached to the move payload
/// 5. Server analyzes: straight-line path? instant move on complex position?
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveSource {
    /// Unix timestamp (milliseconds) when the move sequence started.
    /// This is when the user first interacted with the board for this move.
    pub timestamp: u64,

    /// How the source square/piece was selected.
    /// Normal options are MouseClick, TouchTap, DragStart.
    /// "Programmatic" is a RED FLAG — means the move wasn't from user input.
    pub selection_method: SelectionMethod,

    /// How the destination square was chosen.
    /// Usually matches selection_method (click→click or drag→drop).
    pub destination_method: DestinationMethod,

    /// The mouse/touch path during this move.
    /// Recorded from selection start to destination selection.
    /// Used to detect bot-like linear interpolation vs human curves.
    pub input_path: Vec<InputPoint>,

    /// Time in milliseconds the piece was "selected" before being moved.
    /// Long selection times on obvious moves might indicate engine lookup.
    /// Instant moves on complex positions are also suspicious.
    pub selection_duration_ms: u32,

    /// Whether the application window maintained focus throughout the move.
    /// If the user alt-tabbed to another window, this is false.
    /// Combined with engine correlation, this is a strong cheat indicator.
    pub maintained_focus: bool,
}

impl MoveSource {
    /// Create a new MoveSource with default values.
    /// Call the builder methods to fill in the data as it's recorded.
    pub fn new() -> Self {
        Self {
            timestamp: 0,
            selection_method: SelectionMethod::Unknown,
            destination_method: DestinationMethod::Unknown,
            input_path: Vec::new(),
            selection_duration_ms: 0,
            maintained_focus: true,
        }
    }

    /// Start tracking a move (called when user starts selecting a piece).
    pub fn start(&mut self, method: SelectionMethod) {
        self.timestamp = current_timestamp_ms();
        self.selection_method = method;
        self.input_path.clear();
    }

    /// Record a point along the mouse path.
    /// Call this on each mouse move event while tracking.
    ///
    /// ## Memory Safety
    ///
    /// Points are only recorded up to MAX_INPUT_POINTS (500).
    /// Beyond that, new points are silently dropped to prevent
    /// unbounded memory growth from very long moves or rapid events.
    ///
    /// This limit doesn't affect analysis quality because:
    /// - 500 points covers ~8 seconds of movement at 60 Hz
    /// - Path analysis only needs representative samples
    /// - Most meaningful patterns occur in the first few seconds
    pub fn record_point(&mut self, point: InputPoint) {
        // Bounds check: Prevent unbounded memory growth
        if self.input_path.len() < MAX_INPUT_POINTS {
            self.input_path.push(point);
        }
        // If we're at the limit, silently drop new points.
        // The existing 500 points are sufficient for analysis.
    }

    /// Complete the move tracking (called when destination is selected).
    pub fn complete(&mut self, destination: DestinationMethod) {
        self.destination_method = destination;
        self.selection_duration_ms = (current_timestamp_ms() - self.timestamp) as u32;
    }

    /// Mark that focus was lost at some point during the move.
    pub fn mark_focus_lost(&mut self) {
        self.maintained_focus = false;
    }

    /// Calculate path linearity (0.0 = very curved, 1.0 = perfectly straight).
    ///
    /// Humans typically have linearity < 0.8 due to natural hand movement.
    /// Bots often have linearity > 0.95 (linear interpolation).
    pub fn calculate_path_linearity(&self) -> f32 {
        if self.input_path.len() < 3 {
            return 1.0; // Not enough points to measure
        }

        let start = &self.input_path[0];
        let end = &self.input_path[self.input_path.len() - 1];

        // Calculate total distance traveled vs straight-line distance
        let straight_distance = distance(start.x, start.y, end.x, end.y);
        if straight_distance < 1.0 {
            return 1.0; // Points too close together
        }

        let mut path_distance = 0.0;
        for i in 1..self.input_path.len() {
            let prev = &self.input_path[i - 1];
            let curr = &self.input_path[i];
            path_distance += distance(prev.x, prev.y, curr.x, curr.y);
        }

        if path_distance < straight_distance {
            1.0 // Edge case: shouldn't happen, but be safe
        } else {
            straight_distance / path_distance
        }
    }

    /// Check if the path has natural micro-corrections.
    ///
    /// Humans unconsciously make small adjustments as they move the mouse.
    /// Bots typically move in smooth arcs or straight lines without corrections.
    pub fn has_micro_corrections(&self) -> bool {
        if self.input_path.len() < 10 {
            return false; // Need more points to detect corrections
        }

        // Look for direction changes (velocity sign changes)
        let mut direction_changes = 0;
        for i in 2..self.input_path.len() {
            let p0 = &self.input_path[i - 2];
            let p1 = &self.input_path[i - 1];
            let p2 = &self.input_path[i];

            // Calculate velocity vectors
            let v1_x = p1.x - p0.x;
            let v1_y = p1.y - p0.y;
            let v2_x = p2.x - p1.x;
            let v2_y = p2.y - p1.y;

            // Cross product sign indicates turn direction
            let cross = v1_x * v2_y - v1_y * v2_x;

            // If cross product is significant and changes sign, it's a correction
            // Use a threshold to ignore tiny variations
            if cross.abs() > 2.0
                && i >= 3 {
                    let p_prev = &self.input_path[i - 3];
                    let v0_x = p0.x - p_prev.x;
                    let v0_y = p0.y - p_prev.y;
                    let prev_cross = v0_x * v1_y - v0_y * v1_x;

                    if (prev_cross > 0.0) != (cross > 0.0) {
                        direction_changes += 1;
                    }
                }
        }

        // More than 2 direction changes in a path suggests human micro-corrections
        direction_changes >= 2
    }

    /// Check for hesitations (points where velocity drops near zero).
    ///
    /// Humans hesitate when thinking or aiming.
    /// Bots move at constant velocity.
    pub fn count_hesitations(&self) -> usize {
        if self.input_path.len() < 5 {
            return 0;
        }

        let mut hesitations = 0;
        for i in 1..self.input_path.len() {
            let prev = &self.input_path[i - 1];
            let curr = &self.input_path[i];

            // Calculate velocity (distance per time)
            let time_delta = curr.timestamp.saturating_sub(prev.timestamp);
            if time_delta == 0 {
                continue;
            }

            let dist = distance(prev.x, prev.y, curr.x, curr.y);
            let velocity = dist / (time_delta as f32);

            // Very low velocity = hesitation
            if velocity < 0.1 {
                hesitations += 1;
            }
        }

        hesitations
    }
}

impl Default for MoveSource {
    fn default() -> Self {
        Self::new()
    }
}

/// Method used to select the source piece.
///
/// Each method has different implications:
/// - MouseClick/TouchTap: Normal human input
/// - DragStart: Also normal (drag-and-drop move style)
/// - KeyboardShortcut: Power users, rare but legitimate
/// - Programmatic: RED FLAG — move wasn't from physical input
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SelectionMethod {
    /// Standard mouse click on a piece.
    /// Most common input method for desktop users.
    MouseClick { x: f32, y: f32 },

    /// Touch tap on a piece (tablet/touchscreen).
    TouchTap { x: f32, y: f32 },

    /// Keyboard shortcut (e.g., "e4" typed to move pawn).
    /// Rare but legitimate for power users.
    KeyboardShortcut { key: String },

    /// Started a drag operation from this position.
    /// Common for users who prefer drag-and-drop moves.
    DragStart { x: f32, y: f32 },

    /// Move was made programmatically (not from user input).
    /// This is a RED FLAG — should never appear in legitimate play.
    /// If we see this, someone is injecting moves via automation.
    Programmatic,

    /// Unknown or not yet recorded.
    Unknown,
}

/// Method used to select the destination square.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DestinationMethod {
    /// Standard mouse click on destination.
    MouseClick { x: f32, y: f32 },

    /// Touch tap on destination.
    TouchTap { x: f32, y: f32 },

    /// Keyboard input for destination.
    KeyboardInput { notation: String },

    /// Released a drag at this position.
    DragRelease { x: f32, y: f32 },

    /// Move was made programmatically.
    Programmatic,

    /// Unknown or not yet recorded.
    Unknown,
}

/// A single point in the input path.
///
/// We record these during the move to analyze the full trajectory.
/// Human movements have curves, hesitations, and speed variations.
/// Bot movements tend to be linear with constant velocity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputPoint {
    /// X coordinate relative to the board.
    /// 0.0 = left edge, 1.0 = right edge (normalized).
    /// Using normalized coordinates avoids leaking screen resolution info.
    pub x: f32,

    /// Y coordinate relative to the board.
    /// 0.0 = top edge, 1.0 = bottom edge (normalized).
    pub y: f32,

    /// Timestamp when this point was recorded (milliseconds).
    pub timestamp: u64,

    /// Touch pressure (0.0-1.0) if available.
    /// Only present on devices with pressure-sensitive input.
    /// Can help distinguish stylus from finger from mouse.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pressure: Option<f32>,

    /// Whether a mouse/touch button was pressed at this point.
    /// Useful for detecting drag operations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button_pressed: Option<bool>,
}

impl InputPoint {
    /// Create a new input point at the current timestamp.
    pub fn new(x: f32, y: f32) -> Self {
        Self {
            x,
            y,
            timestamp: current_timestamp_ms(),
            pressure: None,
            button_pressed: None,
        }
    }

    /// Create a point with explicit timestamp.
    pub fn with_timestamp(x: f32, y: f32, timestamp: u64) -> Self {
        Self {
            x,
            y,
            timestamp,
            pressure: None,
            button_pressed: None,
        }
    }

    /// Add pressure information.
    pub fn with_pressure(mut self, pressure: f32) -> Self {
        self.pressure = Some(pressure);
        self
    }

    /// Add button state.
    pub fn with_button(mut self, pressed: bool) -> Self {
        self.button_pressed = Some(pressed);
        self
    }
}

// =============================================================================
// Move Input Recorder
// =============================================================================

/// Stateful recorder for move input.
///
/// Usage:
/// 1. Call `start_recording()` when user begins interacting with the board
/// 2. Call `record_point()` on each mouse/touch move event
/// 3. Call `finish_recording()` when the move is made
/// 4. Use `get_move_source()` to get the final MoveSource for the server
///
/// This struct is meant to be held by the game UI component and reused
/// for each move.
#[derive(Debug, Clone, Default)]
pub struct MoveInputRecorder {
    /// The move source being recorded.
    current: MoveSource,

    /// Whether we're currently recording.
    is_recording: bool,

    /// Tracks if we've seen any focus loss during recording.
    focus_lost: bool,
}

impl MoveInputRecorder {
    /// Create a new recorder.
    pub fn new() -> Self {
        Self {
            current: MoveSource::new(),
            is_recording: false,
            focus_lost: false,
        }
    }

    /// Start recording a new move.
    /// Call this when the user clicks/taps on a piece to select it.
    pub fn start_recording(&mut self, method: SelectionMethod) {
        self.current = MoveSource::new();
        self.current.start(method);
        self.is_recording = true;
        self.focus_lost = false;
    }

    /// Record a point along the input path.
    /// Call this on each mouse move event while recording.
    ///
    /// ## Memory Safety
    ///
    /// Delegates to MoveSource::record_point which enforces the
    /// MAX_INPUT_POINTS limit (500 points). This prevents memory
    /// exhaustion from very long moves or rapid mouse events.
    pub fn record_point(&mut self, x: f32, y: f32) {
        if self.is_recording {
            // MoveSource::record_point handles bounds checking internally
            self.current.record_point(InputPoint::new(x, y));
        }
    }

    /// Record a point with explicit timestamp.
    /// Use this for replaying recorded input or testing.
    pub fn record_point_with_timestamp(&mut self, x: f32, y: f32, timestamp: u64) {
        if self.is_recording {
            self.current
                .record_point(InputPoint::with_timestamp(x, y, timestamp));
        }
    }

    /// Mark that focus was lost (user alt-tabbed or similar).
    pub fn mark_focus_lost(&mut self) {
        if self.is_recording {
            self.focus_lost = true;
            self.current.mark_focus_lost();
        }
    }

    /// Finish recording and return the MoveSource.
    /// Call this when the user selects a destination square.
    pub fn finish_recording(&mut self, destination: DestinationMethod) -> MoveSource {
        self.current.complete(destination);
        if self.focus_lost {
            self.current.maintained_focus = false;
        }
        self.is_recording = false;

        // Clone and return the completed move source
        self.current.clone()
    }

    /// Check if currently recording.
    pub fn is_recording(&self) -> bool {
        self.is_recording
    }

    /// Cancel the current recording without producing a MoveSource.
    /// Use this if the user deselects the piece or cancels the move.
    pub fn cancel_recording(&mut self) {
        self.is_recording = false;
        self.current = MoveSource::new();
    }

    /// Get a reference to the current (possibly incomplete) move source.
    /// Useful for debugging or live analysis.
    pub fn current(&self) -> &MoveSource {
        &self.current
    }
}

// =============================================================================
// Analysis Functions
// =============================================================================

/// Analyze a MoveSource for suspicious patterns.
///
/// Returns a list of flags that might indicate automated input.
/// The server combines these with other signals for final cheat detection.
pub fn analyze_input_patterns(source: &MoveSource) -> Vec<&'static str> {
    let mut flags = Vec::new();

    // Check for programmatic input (RED FLAG)
    if source.selection_method == SelectionMethod::Programmatic
        || source.destination_method == DestinationMethod::Programmatic
    {
        flags.push("programmatic_input");
    }

    // Check for empty path (move appeared without mouse movement)
    if source.input_path.is_empty() {
        flags.push("empty_input_path");
    }

    // Check for too-linear path (bot-like)
    let linearity = source.calculate_path_linearity();
    if linearity > 0.95 && source.input_path.len() > 10 {
        flags.push("linear_path");
    }

    // Check for lack of micro-corrections
    if !source.has_micro_corrections() && source.input_path.len() > 20 {
        flags.push("no_micro_corrections");
    }

    // Check for no hesitations on long path
    if source.count_hesitations() == 0 && source.input_path.len() > 30 {
        flags.push("no_hesitations");
    }

    // Check for lost focus during move
    if !source.maintained_focus {
        flags.push("focus_lost_during_move");
    }

    flags
}

// =============================================================================
// Utility Functions
// =============================================================================

/// Get current timestamp in milliseconds.
fn current_timestamp_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Calculate Euclidean distance between two points.
fn distance(x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    (dx * dx + dy * dy).sqrt()
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_move_source_new() {
        let source = MoveSource::new();
        assert!(source.input_path.is_empty());
        assert!(source.maintained_focus);
        assert_eq!(source.selection_duration_ms, 0);
    }

    #[test]
    fn test_input_point_creation() {
        let point = InputPoint::new(0.5, 0.5);
        assert_eq!(point.x, 0.5);
        assert_eq!(point.y, 0.5);
        assert!(point.timestamp > 0);
        assert!(point.pressure.is_none());
    }

    #[test]
    fn test_path_linearity_straight_line() {
        let mut source = MoveSource::new();
        // Create a perfectly straight line
        for i in 0..10 {
            source.input_path.push(InputPoint::with_timestamp(
                i as f32 * 0.1,
                i as f32 * 0.1,
                i as u64 * 100,
            ));
        }

        let linearity = source.calculate_path_linearity();
        assert!(linearity > 0.99, "Expected near-perfect linearity, got {}", linearity);
    }

    #[test]
    fn test_path_linearity_curved() {
        let mut source = MoveSource::new();
        // Create a curved path (semicircle)
        for i in 0..20 {
            let angle = (i as f32 / 20.0) * std::f32::consts::PI;
            let x = angle.cos();
            let y = angle.sin();
            source.input_path.push(InputPoint::with_timestamp(
                x,
                y,
                i as u64 * 100,
            ));
        }

        let linearity = source.calculate_path_linearity();
        assert!(linearity < 0.8, "Expected curved path to have low linearity, got {}", linearity);
    }

    #[test]
    fn test_recorder_workflow() {
        let mut recorder = MoveInputRecorder::new();

        recorder.start_recording(SelectionMethod::MouseClick { x: 0.0, y: 0.0 });
        assert!(recorder.is_recording());

        recorder.record_point(0.1, 0.1);
        recorder.record_point(0.2, 0.2);
        recorder.record_point(0.3, 0.3);

        let source = recorder.finish_recording(DestinationMethod::MouseClick { x: 0.3, y: 0.3 });

        assert!(!recorder.is_recording());
        assert_eq!(source.input_path.len(), 3);
        assert!(source.maintained_focus);
    }

    #[test]
    fn test_focus_lost_tracking() {
        let mut recorder = MoveInputRecorder::new();

        recorder.start_recording(SelectionMethod::MouseClick { x: 0.0, y: 0.0 });
        recorder.record_point(0.1, 0.1);
        recorder.mark_focus_lost();
        recorder.record_point(0.2, 0.2);

        let source = recorder.finish_recording(DestinationMethod::MouseClick { x: 0.2, y: 0.2 });

        assert!(!source.maintained_focus);
    }

    #[test]
    fn test_analyze_programmatic_input() {
        let mut source = MoveSource::new();
        source.selection_method = SelectionMethod::Programmatic;

        let flags = analyze_input_patterns(&source);
        assert!(flags.contains(&"programmatic_input"));
    }

    #[test]
    fn test_analyze_empty_path() {
        let source = MoveSource::new();

        let flags = analyze_input_patterns(&source);
        assert!(flags.contains(&"empty_input_path"));
    }

    #[test]
    fn test_input_points_bounded() {
        let mut source = MoveSource::new();

        // Try to add more than MAX_INPUT_POINTS
        for i in 0..1000 {
            source.record_point(InputPoint::with_timestamp(
                i as f32 * 0.001,
                i as f32 * 0.001,
                i as u64,
            ));
        }

        // Should be capped at MAX_INPUT_POINTS
        assert_eq!(source.input_path.len(), MAX_INPUT_POINTS);
        assert_eq!(source.input_path.len(), 500);
    }

    #[test]
    fn test_recorder_respects_bounds() {
        let mut recorder = MoveInputRecorder::new();
        recorder.start_recording(SelectionMethod::MouseClick { x: 0.0, y: 0.0 });

        // Record more than MAX_INPUT_POINTS
        for i in 0..1000 {
            recorder.record_point(i as f32 * 0.001, i as f32 * 0.001);
        }

        let source = recorder.finish_recording(DestinationMethod::MouseClick { x: 1.0, y: 1.0 });

        // Should be capped at MAX_INPUT_POINTS
        assert_eq!(source.input_path.len(), MAX_INPUT_POINTS);
    }
}
