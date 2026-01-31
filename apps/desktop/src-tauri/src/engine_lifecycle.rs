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

use tauri::{async_runtime, AppHandle};
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
    // Use tauri::async_runtime::spawn instead of tokio::spawn.
    // This is necessary because this function may be called during Tauri's
    // synchronous setup phase (in .manage()), before the Tokio runtime is
    // fully initialized. Tauri's async_runtime handles this gracefully.
    async_runtime::spawn(async move {
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

    // =========================================================================
    // LazyEngine Construction Tests
    // =========================================================================

    #[test]
    fn test_lazy_engine_new() {
        // LazyEngine should construct without errors.
        // This verifies all internal fields initialize correctly.
        let _engine = LazyEngine::new();
    }

    #[test]
    fn test_lazy_engine_default() {
        // Default trait should work identically to new().
        let _engine = LazyEngine::default();
    }

    // =========================================================================
    // LazyEngineState Construction Tests
    // =========================================================================

    #[test]
    fn test_lazy_engine_state_new() {
        // LazyEngineState wraps LazyEngine for Tauri state management.
        let _state = LazyEngineState::new();
    }

    #[test]
    fn test_lazy_engine_state_default() {
        // Default trait should work.
        let _state = LazyEngineState::default();
    }

    #[test]
    fn test_lazy_engine_state_clone() {
        // LazyEngineState should be Clone (required for some Tauri patterns).
        let state1 = LazyEngineState::new();
        let _state2 = state1.clone();
    }

    // =========================================================================
    // is_spawned() Tests
    // =========================================================================

    #[tokio::test]
    async fn test_is_spawned_initially_false() {
        // A new LazyEngine has no engine spawned.
        let engine = LazyEngine::new();
        assert!(
            !engine.is_spawned().await,
            "Engine should not be spawned initially"
        );
    }

    #[tokio::test]
    async fn test_is_spawned_state_initially_false() {
        // LazyEngineState delegates to LazyEngine.
        let state = LazyEngineState::new();
        assert!(
            !state.is_spawned().await,
            "State should report engine not spawned initially"
        );
    }

    // =========================================================================
    // idle_duration() Tests
    // =========================================================================

    #[tokio::test]
    async fn test_idle_duration_starts_at_zero() {
        // Immediately after creation, idle duration should be near zero.
        let engine = LazyEngine::new();
        let idle = engine.idle_duration().await;

        // Allow small tolerance for test execution time
        assert!(
            idle < Duration::from_millis(100),
            "Idle duration should start near zero, got {:?}",
            idle
        );
    }

    #[tokio::test]
    async fn test_idle_duration_increases_over_time() {
        // Idle duration should increase as time passes.
        let engine = LazyEngine::new();

        // Wait a bit
        tokio::time::sleep(Duration::from_millis(50)).await;

        let idle = engine.idle_duration().await;

        // Should have increased by at least 40ms (allowing for timing variance)
        assert!(
            idle >= Duration::from_millis(40),
            "Idle duration should increase over time, got {:?}",
            idle
        );
    }

    #[tokio::test]
    async fn test_idle_duration_resets_on_last_use_update() {
        // Manually updating last_use should reset idle duration.
        // This simulates what get_or_spawn() does internally.
        let engine = LazyEngine::new();

        // Wait to accumulate some idle time
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Verify idle time accumulated
        let idle_before = engine.idle_duration().await;
        assert!(idle_before >= Duration::from_millis(40));

        // Simulate what get_or_spawn does: update last_use
        *engine.last_use.lock().await = Instant::now();

        // Idle duration should reset to near zero
        let idle_after = engine.idle_duration().await;
        assert!(
            idle_after < Duration::from_millis(20),
            "Idle duration should reset after last_use update, got {:?}",
            idle_after
        );
    }

    // =========================================================================
    // shutdown_signal Tests
    // =========================================================================

    #[tokio::test]
    async fn test_shutdown_signal_initially_false() {
        // Shutdown signal should start as false.
        let engine = LazyEngine::new();
        assert!(
            !engine.is_shutdown_signaled().await,
            "Shutdown should not be signaled initially"
        );
    }

    #[tokio::test]
    async fn test_signal_shutdown_sets_flag() {
        // Calling signal_shutdown() should set the flag to true.
        let engine = LazyEngine::new();

        engine.signal_shutdown().await;

        assert!(
            engine.is_shutdown_signaled().await,
            "Shutdown should be signaled after signal_shutdown()"
        );
    }

    #[tokio::test]
    async fn test_signal_shutdown_idempotent() {
        // Multiple calls to signal_shutdown() should be safe.
        let engine = LazyEngine::new();

        engine.signal_shutdown().await;
        engine.signal_shutdown().await;
        engine.signal_shutdown().await;

        assert!(
            engine.is_shutdown_signaled().await,
            "Shutdown should remain signaled"
        );
    }

    #[tokio::test]
    async fn test_signal_shutdown_via_state() {
        // LazyEngineState should delegate signal_shutdown.
        let state = LazyEngineState::new();

        assert!(!state.inner.is_shutdown_signaled().await);

        state.signal_shutdown().await;

        assert!(state.inner.is_shutdown_signaled().await);
    }

    // =========================================================================
    // shutdown() Tests (without actual engine)
    // =========================================================================

    #[tokio::test]
    async fn test_shutdown_when_not_spawned() {
        // Shutdown should be safe to call even if engine was never spawned.
        let engine = LazyEngine::new();

        // Should not panic
        engine.shutdown().await;

        // Still not spawned
        assert!(!engine.is_spawned().await);
    }

    #[tokio::test]
    async fn test_shutdown_via_state_when_not_spawned() {
        // LazyEngineState.shutdown() should be safe when not spawned.
        let state = LazyEngineState::new();

        // Should not panic
        state.shutdown().await;
    }

    // =========================================================================
    // AnalysisTracker via LazyEngineState Tests
    // =========================================================================

    #[tokio::test]
    async fn test_with_tracker_register() {
        // Test registering analysis through the state's tracker interface.
        let state = LazyEngineState::new();

        let (id, token) = state.with_tracker(|tracker| tracker.register()).await;

        assert!(!id.is_empty(), "Should return a non-empty ID");
        assert!(!token.is_cancelled(), "Token should not be cancelled");
    }

    #[tokio::test]
    async fn test_with_tracker_cancel() {
        // Test cancelling analysis through the state's tracker interface.
        let state = LazyEngineState::new();

        let (id, token) = state.with_tracker(|tracker| tracker.register()).await;

        let cancelled = state.with_tracker(|tracker| tracker.cancel(&id)).await;

        assert!(cancelled, "Should successfully cancel");
        assert!(token.is_cancelled(), "Token should be cancelled");
    }

    #[tokio::test]
    async fn test_tracker_arc_clone() {
        // tracker_arc() should return a cloneable Arc for use in spawned tasks.
        let state = LazyEngineState::new();

        let tracker = state.tracker_arc();
        let _tracker_clone = Arc::clone(&tracker);

        // Both should work
        {
            let mut guard = tracker.lock().await;
            let (_id, _token) = guard.register();
        }
    }

    #[tokio::test]
    async fn test_tracker_arc_shared_state() {
        // Changes through one Arc should be visible through another.
        let state = LazyEngineState::new();

        let tracker1 = state.tracker_arc();
        let tracker2 = state.tracker_arc();

        // Register through tracker1
        let id = {
            let mut guard = tracker1.lock().await;
            let (id, _token) = guard.register();
            id
        };

        // Cancel through tracker2
        let cancelled = {
            let mut guard = tracker2.lock().await;
            guard.cancel(&id)
        };

        assert!(cancelled, "Should see registration from other Arc clone");
    }

    // =========================================================================
    // Constant Verification Tests
    // =========================================================================

    #[test]
    fn test_idle_timeout_is_60_seconds() {
        // Document and verify the idle timeout constant.
        assert_eq!(
            IDLE_TIMEOUT_SECS, 60,
            "Idle timeout should be 60 seconds as documented"
        );
    }

    #[test]
    fn test_check_interval_is_10_seconds() {
        // Document and verify the check interval constant.
        assert_eq!(
            IDLE_CHECK_INTERVAL_SECS, 10,
            "Check interval should be 10 seconds"
        );
    }

    // =========================================================================
    // Idle Monitor Tests
    // =========================================================================

    #[tokio::test]
    async fn test_idle_monitor_respects_shutdown_signal() {
        // The idle monitor should stop when shutdown is signaled.
        let engine = Arc::new(LazyEngine::new());
        let engine_clone = Arc::clone(&engine);

        // Start the monitor
        start_idle_monitor(engine_clone);

        // Signal shutdown immediately
        engine.signal_shutdown().await;

        // Give the monitor time to see the signal and stop
        // (It checks every IDLE_CHECK_INTERVAL_SECS, but we can't wait that long in tests)
        // This test verifies the setup doesn't panic, actual timing test would need longer.
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    // =========================================================================
    // Drop Implementation Tests
    // =========================================================================

    #[test]
    fn test_drop_lazy_engine_safe_when_not_spawned() {
        // Drop should be safe even if engine was never spawned.
        {
            let _engine = LazyEngine::new();
            // engine is dropped here
        }
        // Should not panic
    }

    #[test]
    fn test_drop_sets_shutdown_signal() {
        // Drop should set shutdown signal to stop idle monitor.
        // We can't easily test this since we can't access fields after drop,
        // but we can verify drop doesn't panic.
        let engine = LazyEngine::new();
        drop(engine);
    }

    // =========================================================================
    // get_or_spawn() Tests (without actual spawning)
    // =========================================================================
    //
    // We can't test actual spawning without a Tauri AppHandle, but we can
    // test some behaviors around the double-check pattern.
    // =========================================================================

    #[tokio::test]
    #[ignore = "Requires Tauri AppHandle and Stockfish sidecar"]
    async fn test_get_or_spawn_creates_engine() {
        // This would test that get_or_spawn actually spawns an engine.
        // Requires: tauri::test::mock_app() or similar setup.
        todo!("Integration test: get_or_spawn creates engine on first call");
    }

    #[tokio::test]
    #[ignore = "Requires Tauri AppHandle and Stockfish sidecar"]
    async fn test_get_or_spawn_reuses_existing() {
        // This would test that subsequent calls reuse the existing handle.
        todo!("Integration test: get_or_spawn reuses existing engine");
    }

    #[tokio::test]
    #[ignore = "Requires Tauri AppHandle and Stockfish sidecar"]
    async fn test_get_or_spawn_updates_last_use() {
        // This would verify that get_or_spawn updates the last_use timestamp.
        todo!("Integration test: get_or_spawn updates last_use timestamp");
    }

    #[tokio::test]
    #[ignore = "Requires Tauri AppHandle and Stockfish sidecar"]
    async fn test_idle_monitor_shuts_down_after_timeout() {
        // This would test the full idle monitor flow.
        todo!("Integration test: monitor shuts down engine after 60s idle");
    }

    // =========================================================================
    // Thread Safety Tests
    // =========================================================================

    #[tokio::test]
    async fn test_concurrent_is_spawned_calls() {
        // Multiple concurrent calls to is_spawned should be safe.
        let engine = Arc::new(LazyEngine::new());

        let handles: Vec<_> = (0..10)
            .map(|_| {
                let engine_clone = Arc::clone(&engine);
                tokio::spawn(async move { engine_clone.is_spawned().await })
            })
            .collect();

        // All should complete without deadlock
        for handle in handles {
            let result = handle.await.expect("Task should complete");
            assert!(!result, "All should report not spawned");
        }
    }

    #[tokio::test]
    async fn test_concurrent_idle_duration_calls() {
        // Multiple concurrent calls to idle_duration should be safe.
        let engine = Arc::new(LazyEngine::new());

        let handles: Vec<_> = (0..10)
            .map(|_| {
                let engine_clone = Arc::clone(&engine);
                tokio::spawn(async move { engine_clone.idle_duration().await })
            })
            .collect();

        // All should complete without deadlock
        for handle in handles {
            let _duration = handle.await.expect("Task should complete");
        }
    }

    #[tokio::test]
    async fn test_concurrent_tracker_operations() {
        // Multiple tasks accessing tracker concurrently should be safe.
        let state = Arc::new(LazyEngineState::new());

        // Spawn multiple tasks that register and cancel
        let handles: Vec<_> = (0..5)
            .map(|_| {
                let state_clone = Arc::clone(&state);
                tokio::spawn(async move {
                    let tracker = state_clone.tracker_arc();

                    // Register
                    let (id, token) = {
                        let mut guard = tracker.lock().await;
                        guard.register()
                    };

                    // Small delay
                    tokio::time::sleep(Duration::from_millis(5)).await;

                    // Cancel
                    {
                        let mut guard = tracker.lock().await;
                        guard.cancel(&id);
                    }

                    token.is_cancelled()
                })
            })
            .collect();

        // All should complete and tokens should be cancelled
        for handle in handles {
            let was_cancelled = handle.await.expect("Task should complete");
            assert!(was_cancelled, "Token should be cancelled");
        }
    }
}
