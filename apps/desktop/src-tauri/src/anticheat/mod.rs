// =============================================================================
// anticheat/mod.rs — Anti-Cheat System Module Root
// =============================================================================
//
// This module contains the client-side anti-cheat system for the chess betting
// platform. It provides multiple detection layers to identify potential cheating:
//
// 1. **Environment Detection** (environment.rs):
//    Scans for suspicious running processes like chess engines, screen sharing
//    software, automation tools, and debuggers. Doesn't block users — just
//    reports a risk score that the server uses for statistical analysis.
//
// 2. **Input Tracking** (input.rs):
//    Records how the user makes moves — mouse paths, timing, selection methods.
//    Legitimate players have natural, curved mouse movements with micro-corrections.
//    Bot-like behavior shows perfectly straight lines and robotic timing.
//
// 3. **Network Monitoring** (network.rs):
//    Tracks network activity patterns to detect unusual behavior like suspiciously
//    timed external requests that might indicate engine API calls.
//
// Why User-Mode Only?
// -------------------
// Unlike FPS anti-cheat (which needs kernel drivers), chess anti-cheat can be
// user-mode because:
// - Chess moves happen on 1-60 second intervals, not milliseconds
// - All moves are validated server-side — can't cheat game state
// - Statistical detection catches engine assistance regardless of delivery method
// - User experience matters — kernel drivers are invasive
//
// The cheater can hide HOW they get engine moves, but can't hide THAT they're
// playing like an engine. Our server-side statistical analysis is the real defense.
//
// Usage:
// ------
// This module is used by Tauri commands to:
// 1. Scan environment before/during games
// 2. Record input patterns for each move
// 3. Generate risk reports sent to the server
//
// The server aggregates this data with statistical move analysis for final
// cheat probability scoring.
// =============================================================================

// Submodules — each handles a different detection layer
pub mod environment;
pub mod input;
pub mod network;

// Re-export commonly used types so consumers can write:
//   use anticheat::{EnvironmentChecker, MoveSource, NetworkMonitor};
// instead of:
//   use anticheat::environment::EnvironmentChecker;

// Re-export for easy access from commands module
