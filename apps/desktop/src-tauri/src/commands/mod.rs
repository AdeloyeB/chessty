// =============================================================================
// commands/mod.rs — IPC Command Module Root
// =============================================================================
//
// This module organizes all Tauri IPC commands into logical groups:
//
// - `store`: Persistent key-value storage commands
// - `auth`: OAuth and authentication commands
// - `engine`: Stockfish chess engine commands
// - `anticheat`: Anti-cheat system commands (environment, input, network)
//
// Each submodule exports its commands, which are then re-exported here
// for easy registration in main.rs.
// =============================================================================

// Submodules
mod anticheat;
mod core;

// Re-export all commands for registration in main.rs
pub use anticheat::*;
pub use core::*;
