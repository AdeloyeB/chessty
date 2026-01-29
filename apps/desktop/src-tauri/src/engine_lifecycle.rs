// =============================================================================
// engine_lifecycle.rs — Lazy Engine Loading & Idle Shutdown
// =============================================================================
//
// This module implements LAZY LOADING for the Stockfish chess engine. Instead of
// spawning Stockfish when the app starts (consuming ~60MB RAM + CPU even when
// not analyzing), we spawn it ON-DEMAND when the user first requests analysis.
//
// Why Lazy Loading?
// -----------------
// The chess app runs alongside resource-intensive applications like:
// - Trading platforms (TradingView, Thinkorswim)
// - Browsers with many tabs
// - IDEs and development tools
//
// Most of the time, users are:
// - Viewing the dashboard (no engine needed)
// - Playing a game (no engine needed — moves are validated server-side)
// - Chatting or browsing (no engine needed)
//
// Engine is only needed for:
// - Post-game analysis (reviewing moves)
// - Opening practice (getting suggestions)
//
// By loading lazily, we reduce idle memory from ~100MB to ~40MB.
//
// Idle Shutdown
// -------------
// After 60 seconds of no engine use, we automatically shut down Stockfish.
// This prevents "orphan" engine processes from accumulating memory/CPU when
// users forget they had analysis open.
//
// Resource Usage Goals
// --------------------
// | State          | CPU    | Memory  |
// |----------------|--------|---------|
// | App idle       | <1%    | ~40MB   |
// | Game active    | 3-8%   | ~60MB   |
// | Analysis mode  | 15-30% | ~150MB  |
// | After 60s idle | <1%    | ~40MB   | ← Auto-shutdown
//
// Implementation Notes
// --------------------
// - LazyEngine wraps an Option<EngineHandle>
// - get_or_spawn() creates the engine on first use
// - An idle monitor task runs in the background checking last-use time
// - shutdown() cleanly terminates the engine process
// =============================================================================

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tokio::sync::{Mutex, RwLock};

use crate::engine::{spawn_engine, AnalysisTracker, EngineHandle};

// =============================================================================
// Constants
// =============================================================================

/// Time in seconds before an idle engine is automatically shut down.
///
/// 60 seconds is chosen because:
/// - Long enough: Users often pause between moves during analysis
/// - Short enough: Doesn't waste resources if user navigates away
/// - Restart is fast: ~1-2 seconds to respawn Stockfish
///
/// If users find this too aggressive, we can increase it. But starting
/// conservative helps with thermal management.
const IDLE_TIMEOUT_SECS: u64 = 60;

/// How often to check if the engine has been idle too long.
///
/// Checking every 10 seconds balances responsiveness with efficiency.
/// We don't need sub-second precision for idle detection.
const IDLE_CHECK_INTERVAL_SECS: u64 = 10;

// =============================================================================
// LazyEngine — On-Demand Engine Spawning
// =============================================================================

/// Wraps the Stockfish engine handle with lazy loading and idle shutdown.
///
/// ## Thread Safety
///
/// LazyEngine uses multiple synchronization primitives:
///
/// - `RwLock<Option<EngineHandle>>`: Protects the engine handle itself.
///   RwLock allows multiple concurrent reads (checking if engine exists)
///   but exclusive writes (spawning or shutting down).
///
/// - `Mutex<Instant>`: Tracks the last time the engine was used.
///   Simple mutex since updates are quick and infrequent.
///
/// - `Mutex<AnalysisTracker>`: Tracks ongoing analyses for cancellation.
///
/// ## Usage Pattern
///
/// ```rust
/// // In a Tauri command:
/// async fn analyze_position(
///     state: State<'_, LazyEngine>,
///     app: AppHandle,
///     fen: String,
/// ) -> Result<EngineEvaluation, String> {
///     // Get or spawn the engine (lazy loading)
///     let handle = state.get_or_spawn(&app).await?;
///
///     // Use the handle (automatically updates last-use time)
///     handle.analyze(fen, 20).await
/// }
/// ```
pub struct LazyEngine {
    /// The engine handle, wrapped in RwLock for read-heavy access patterns.
    ///
    /// - None: Engine not yet spawned (initial state, or after shutdown)
    /// - Some(handle): Engine is running and ready for commands
    ///
    /// RwLock is used instead of Mutex because:
    /// - Most accesses are reads (checking if handle exists)
    /// - Multiple commands can read the handle concurrently
    /// - Only spawn/shutdown need exclusive write access
    handle: RwLock<Option<EngineHandle>>,

    /// Timestamp of the last engine activity.
    ///
    /// Updated whenever the engine is accessed via get_or_spawn().
    /// The idle monitor checks this to decide when to shut down.
    last_use: Mutex<Instant>,

    /// Tracks ongoing analyses that can be cancelled by the frontend.
    ///
    /// When a user starts a long-running analysis (like analyze_game),
    /// we register it here. They can then cancel it by ID.
    pub tracker: Mutex<AnalysisTracker>,

    /// Flag to signal the idle monitor to stop.
    ///
    /// Set to true when the LazyEngine is being dropped or when we
    /// want to permanently shut down.
    shutdown_signal: Mutex<bool>,
}

impl LazyEngine {
    /// Create a new LazyEngine with no engine spawned.
    ///
    /// The engine will be spawned on the first call to `get_or_spawn()`.
    /// This is the initial state when the Tauri app starts.
    pub fn new() -> Self {
        Self {
            handle: RwLock::new(None),
            last_use: Mutex::new(Instant::now()),
            tracker: Mutex::new(AnalysisTracker::new()),
            shutdown_signal: Mutex::new(false),
        }
    }

    /// Get the engine handle, spawning it if necessary.
    ///
    /// This is the main entry point for engine access. It:
    /// 1. Checks if an engine handle already exists
    /// 2. If not, spawns a new Stockfish process
    /// 3. Updates the last-use timestamp
    /// 4. Returns a clone of the handle
    ///
    /// ## Performance
    ///
    /// - If engine is already running: ~1 microsecond (just RwLock read)
    /// - If engine needs spawning: ~1-2 seconds (process startup + UCI handshake)
    ///
    /// The 1-2 second spawn time is why we use lazy loading — we only pay
    /// this cost when the user actually wants analysis, not on app startup.
    ///
    /// ## Errors
    ///
    /// Returns an error if Stockfish fails to spawn. This can happen if:
    /// - The sidecar binary is missing or corrupted
    /// - The system is out of memory
    /// - Permissions prevent process spawning
    pub async fn get_or_spawn(&self, app: &AppHandle) -> Result<EngineHandle, String> {
        // Fast path: Check if engine already exists using a read lock.
        // This is the common case during active analysis sessions.
        {
            let read_guard = self.handle.read().await;
            if let Some(ref handle) = *read_guard {
                // Update last-use timestamp to prevent idle shutdown
                *self.last_use.lock().await = Instant::now();
                return Ok(handle.clone());
            }
        }
        // Read lock is dropped here, allowing write access below.

        // Slow path: Need to spawn the engine.
        // Acquire write lock for exclusive access.
        let mut write_guard = self.handle.write().await;

        // Double-check pattern: Another thread may have spawned while we waited.
        // This prevents spawning multiple engines if concurrent requests arrive.
        if let Some(ref handle) = *write_guard {
            *self.last_use.lock().await = Instant::now();
            return Ok(handle.clone());
        }

        // Actually spawn the engine now.
        println!("LazyEngine: Spawning Stockfish on-demand...");
        let handle = spawn_engine(app).await?;
        println!(
            "LazyEngine: Stockfish ready ({} threads, {}MB hash)",
            handle.info().threads,
            handle.info().hash_mb
        );

        // Store the handle and update timestamp
        *write_guard = Some(handle.clone());
        *self.last_use.lock().await = Instant::now();

        Ok(handle)
    }

    /// Check if the engine is currently spawned.
    ///
    /// This is a quick check that doesn't spawn the engine if it's not running.
    /// Useful for UI to show "Engine ready" vs "Engine loading" status.
    pub async fn is_spawned(&self) -> bool {
        self.handle.read().await.is_some()
    }

    /// Shut down the engine immediately.
    ///
    /// Called by:
    /// - The idle monitor after 60 seconds of inactivity
    /// - The Drop implementation when LazyEngine is destroyed
    /// - Manual cleanup (e.g., app going to background on mobile)
    ///
    /// After shutdown, the next call to `get_or_spawn()` will respawn the engine.
    pub async fn shutdown(&self) {
        let mut write_guard = self.handle.write().await;

        if let Some(handle) = write_guard.take() {
            println!("LazyEngine: Shutting down Stockfish...");
            // Send quit command to the engine.
            // We use try_quit() because the channel might be closed if the
            // engine process already died.
            let _ = handle.try_quit();
        }
    }

    /// Get the duration since the engine was last used.
    ///
    /// Returns None if the engine has never been spawned.
    /// The idle monitor uses this to decide when to shut down.
    pub async fn idle_duration(&self) -> Duration {
        Instant::now().duration_since(*self.last_use.lock().await)
    }

    /// Signal the idle monitor to stop.
    ///
    /// Called during app shutdown to prevent the monitor from
    /// continuing to run after the engine is dropped.
    pub async fn signal_shutdown(&self) {
        *self.shutdown_signal.lock().await = true;
    }

    /// Check if shutdown has been signaled.
    pub async fn is_shutdown_signaled(&self) -> bool {
        *self.shutdown_signal.lock().await
    }
}

impl Default for LazyEngine {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Idle Monitor — Background Task for Auto-Shutdown
// =============================================================================

/// Start the idle monitor background task.
///
/// This function spawns a tokio task that periodically checks if the engine
/// has been idle for too long. If so, it shuts down Stockfish to free resources.
///
/// ## How It Works
///
/// ```text
/// Every 10 seconds:
///   1. Check if engine is spawned
///   2. If spawned, check idle duration
///   3. If idle > 60 seconds, shut down
///   4. Sleep and repeat
/// ```
///
/// ## Thread Safety
///
/// The monitor runs on its own async task and only accesses LazyEngine through
/// its public async methods, which handle their own locking. No risk of deadlock.
///
/// ## Lifetime
///
/// The monitor runs until:
/// - `lazy_engine.signal_shutdown()` is called
/// - The LazyEngine is dropped (which calls signal_shutdown via Drop)
///
/// We use Arc to share the LazyEngine between the monitor task and the rest
/// of the application.
///
/// ## Example
///
/// ```rust
/// let lazy_engine = Arc::new(LazyEngine::new());
/// start_idle_monitor(Arc::clone(&lazy_engine));
///
/// // ... app runs ...
///
/// // On shutdown:
/// lazy_engine.signal_shutdown().await;
/// ```
pub fn start_idle_monitor(lazy_engine: Arc<LazyEngine>) {
    tokio::spawn(async move {
        let idle_timeout = Duration::from_secs(IDLE_TIMEOUT_SECS);
        let check_interval = Duration::from_secs(IDLE_CHECK_INTERVAL_SECS);

        loop {
            // Sleep first to avoid checking immediately on startup
            tokio::time::sleep(check_interval).await;

            // Check if we should stop monitoring
            if lazy_engine.is_shutdown_signaled().await {
                println!("LazyEngine: Idle monitor stopping (shutdown signaled)");
                break;
            }

            // Only check idle time if engine is actually spawned
            if !lazy_engine.is_spawned().await {
                // Engine not running, nothing to shut down
                continue;
            }

            // Check how long the engine has been idle
            let idle = lazy_engine.idle_duration().await;

            if idle >= idle_timeout {
                println!(
                    "LazyEngine: Engine idle for {:?}, shutting down to save resources",
                    idle
                );
                lazy_engine.shutdown().await;
            }
        }
    });
}

// =============================================================================
// LazyEngineState — Tauri State Wrapper
// =============================================================================

/// Thread-safe wrapper for LazyEngine that can be registered with Tauri.
///
/// Tauri's `.manage()` requires the state type to be `Send + Sync`.
/// Arc<LazyEngine> satisfies this because:
/// - Arc is Send + Sync when T is Send + Sync
/// - LazyEngine uses async-safe primitives (RwLock, Mutex from tokio)
///
/// ## Usage in main.rs
///
/// ```rust
/// let lazy_engine = LazyEngineState::new();
/// lazy_engine.start_monitor(); // Start the idle monitor
///
/// tauri::Builder::default()
///     .manage(lazy_engine)
///     // ...
/// ```
///
/// ## Usage in Commands
///
/// ```rust
/// #[tauri::command]
/// async fn analyze_position(
///     state: State<'_, LazyEngineState>,
///     app: AppHandle,
///     fen: String,
/// ) -> Result<EngineEvaluation, String> {
///     let handle = state.get_or_spawn(&app).await?;
///     handle.analyze(fen, 20).await
/// }
/// ```
#[derive(Clone)]
pub struct LazyEngineState {
    inner: Arc<LazyEngine>,
    /// Shared tracker that can be cloned into spawned tasks.
    /// This is separate from LazyEngine so we can clone it without
    /// lifetime issues in async spawned tasks.
    tracker: Arc<Mutex<AnalysisTracker>>,
}

impl LazyEngineState {
    /// Create a new LazyEngineState.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(LazyEngine::new()),
            tracker: Arc::new(Mutex::new(AnalysisTracker::new())),
        }
    }

    /// Start the background idle monitor task.
    ///
    /// Call this once after creating the state, typically in main.rs setup.
    /// The monitor will automatically shut down the engine after 60 seconds
    /// of inactivity.
    pub fn start_monitor(&self) {
        start_idle_monitor(Arc::clone(&self.inner));
    }

    /// Delegate to LazyEngine::get_or_spawn
    pub async fn get_or_spawn(&self, app: &AppHandle) -> Result<EngineHandle, String> {
        self.inner.get_or_spawn(app).await
    }

    /// Delegate to LazyEngine::is_spawned
    pub async fn is_spawned(&self) -> bool {
        self.inner.is_spawned().await
    }

    /// Delegate to LazyEngine::shutdown
    pub async fn shutdown(&self) {
        self.inner.shutdown().await
    }

    /// Get a clone of the analysis tracker Arc for use in spawned tasks.
    ///
    /// This returns a cloned Arc so the tracker can be moved into async tasks
    /// that outlive the original function call. The Arc ensures the tracker
    /// lives as long as any task needs it.
    ///
    /// Example:
    /// ```rust
    /// let tracker = state.tracker_arc();
    /// tokio::spawn(async move {
    ///     let mut guard = tracker.lock().await;
    ///     guard.remove(&analysis_id);
    /// });
    /// ```
    pub fn tracker_arc(&self) -> Arc<Mutex<AnalysisTracker>> {
        Arc::clone(&self.tracker)
    }

    /// Get access to the analysis tracker for synchronous operations.
    ///
    /// Use this for operations that don't need to spawn tasks, like
    /// registering or cancelling analyses.
    pub async fn with_tracker<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut AnalysisTracker) -> R,
    {
        let mut guard = self.tracker.lock().await;
        f(&mut guard)
    }

    /// Signal the idle monitor to stop (for app shutdown).
    pub async fn signal_shutdown(&self) {
        self.inner.signal_shutdown().await
    }
}

impl Default for LazyEngineState {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Drop Implementation for Clean Shutdown
// =============================================================================

impl Drop for LazyEngine {
    fn drop(&mut self) {
        // Best-effort cleanup: Signal shutdown and try to quit the engine.
        // This runs when the LazyEngine is being destroyed (app exit).
        //
        // Note: We can't use async in drop, so we use blocking try_lock
        // and try_send. This is "best effort" — the OS will clean up
        // the child process if we fail here.

        // Signal the idle monitor to stop
        if let Ok(mut guard) = self.shutdown_signal.try_lock() {
            *guard = true;
        }

        // Try to send quit command to the engine
        if let Ok(guard) = self.handle.try_read() {
            if let Some(ref handle) = *guard {
                let _ = handle.try_quit();
            }
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lazy_engine_new() {
        // Can't test async functions easily without tokio runtime,
        // but we can at least verify construction works.
        let _engine = LazyEngine::new();
    }

    #[test]
    fn test_lazy_engine_state_new() {
        let _state = LazyEngineState::new();
    }

    #[tokio::test]
    async fn test_is_spawned_initially_false() {
        let engine = LazyEngine::new();
        assert!(!engine.is_spawned().await);
    }

    #[tokio::test]
    async fn test_idle_duration_starts_at_zero() {
        let engine = LazyEngine::new();
        let idle = engine.idle_duration().await;
        // Should be very small (just created)
        assert!(idle < Duration::from_secs(1));
    }

    #[tokio::test]
    async fn test_shutdown_signal() {
        let engine = LazyEngine::new();
        assert!(!engine.is_shutdown_signaled().await);
        engine.signal_shutdown().await;
        assert!(engine.is_shutdown_signaled().await);
    }
}
