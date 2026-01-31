// =============================================================================
// commands/mod.rs — IPC Command Module Root
// =============================================================================
//
// This module organizes all Tauri IPC commands into logical groups:
//
// - `core`: Store, auth, and Stockfish engine commands
// - `anticheat`: Anti-cheat system commands (environment, input, network)
// - `overlay`: Game overlay window management (always-on-top compact view)
//
// Each submodule exports its commands, which are then re-exported here
// for easy registration in main.rs.
// =============================================================================

// Submodules
mod anticheat;
mod core;
pub mod overlay; // pub for state/overlay_cache.rs to import OverlaySettings

// Re-export all commands for registration in main.rs
pub use anticheat::*;
pub use core::*;
pub use overlay::*;
