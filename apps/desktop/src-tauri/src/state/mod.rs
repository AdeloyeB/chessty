// =============================================================================
// state/mod.rs — Application State Module
// =============================================================================
//
// This module houses managed state that persists across IPC commands.
// Tauri's `.manage()` API injects these states into commands via dependency
// injection (the `State<T>` extractor).
//
// Current state types:
// - OverlaySettingsCache: In-memory cache for overlay settings with auto-save
//
// WHY USE MANAGED STATE?
// ======================
// Without managed state, each command would need to load from disk, modify,
// and save back. This is expensive when users rapidly change settings (like
// dragging an opacity slider). The cache pattern:
//   1. Load once at startup
//   2. Read/write to memory (microseconds)
//   3. Background task saves to disk every N seconds if dirty
//
// This reduces disk I/O from 150+ writes per slider drag to 2-3 writes.
// =============================================================================

mod overlay_cache;

pub use overlay_cache::OverlaySettingsCache;
