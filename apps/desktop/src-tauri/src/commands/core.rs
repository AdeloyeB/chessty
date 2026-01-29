// =============================================================================
// commands.rs — IPC Command Handlers (Tauri v2)
// =============================================================================
//
// This file defines all the "commands" that the frontend (JavaScript/TypeScript)
// can call from the Rust backend. In Tauri, this is how the two sides talk:
//
//   Frontend calls:  invoke("store_get", { key: "authToken" })
//   Rust handles:    pub async fn store_get(app, key) -> Result<...>
//
// Think of each #[tauri::command] function as an API endpoint, but instead of
// HTTP requests, the frontend sends messages through Tauri's IPC bridge.
//
// These commands replace the Electron IPC handlers from electron/main.ts:
//   ipcMain.handle('store:get', ...)   -->  store_get()
//   ipcMain.handle('store:set', ...)   -->  store_set()
//   ipcMain.handle('store:delete', ...)-->  store_delete()
//   ipcMain.handle('store:clear', ...) -->  store_clear()
//   ipcMain.handle('auth:openExternal', ...) --> auth_open_external()
//
// Engine commands for Stockfish integration:
//   init_engine()      --> Initialize the Stockfish engine
//   analyze_position() --> Analyze a single chess position
//   analyze_game()     --> Analyze all positions in a game
//   stop_analysis()    --> Stop current analysis
//   get_engine_info()  --> Get engine info (name, version)
// =============================================================================

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_store::StoreExt;

// Import our engine module types
// Note: We import spawn_engine instead of StockfishEngine because commands.rs
// now interacts with EngineHandle (via spawn_engine) rather than the engine directly.
// This is the channel-based architecture that avoids long mutex locks.
use crate::engine::{spawn_engine, EngineEvaluation, EngineInfo, EngineState};

/// The filename for our persistent key-value store on disk.
/// This matches the Electron store name "chess-gamble-config" so migrating
/// user data is straightforward. Tauri's store plugin saves this as a JSON
/// file in the app's data directory (e.g., ~/Library/Application Support/
/// on macOS).
const STORE_FILE: &str = "chess-gamble-config.json";

// =============================================================================
// Store Commands
// =============================================================================
// These four commands give the frontend persistent storage — data that survives
// app restarts. Under the hood, tauri-plugin-store reads/writes a JSON file.
// This replaces Electron's electron-store package.
// =============================================================================

/// Retrieve a value from the store by its key.
///
/// Returns `Ok(Some(value))` if the key exists, or `Ok(None)` if it doesn't.
/// The value is a `serde_json::Value`, which is Rust's way of representing
/// any valid JSON value (string, number, object, array, bool, or null).
///
/// Frontend usage:
///   const token = await invoke("store_get", { key: "authToken" });
#[tauri::command]
pub async fn store_get(
    app: AppHandle,
    key: String,
) -> Result<Option<Value>, String> {
    // Open (or create) the store file. The `store()` method returns a handle
    // to the JSON file — it loads it from disk the first time, then keeps it
    // in memory for fast access.
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Look up the key. `store.get()` returns Option<Value> — Some if found,
    // None if the key doesn't exist. We clone the value because the store
    // owns the original data and we need to return a copy to the frontend.
    Ok(store.get(&key))
}

/// Save a key-value pair to the store.
///
/// The value can be any JSON-compatible type — the frontend sends it as
/// a JavaScript value, and Tauri automatically converts it to
/// `serde_json::Value` on the Rust side.
///
/// Frontend usage:
///   await invoke("store_set", { key: "authToken", value: "eyJhbG..." });
///   await invoke("store_set", { key: "settings", value: { theme: "dark" } });
#[tauri::command]
pub async fn store_set(
    app: AppHandle,
    key: String,
    value: Value,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Insert or overwrite the key with the new value.
    // The store plugin auto-saves to disk, so we don't need to call save()
    // manually (it debounces writes to avoid thrashing the filesystem).
    store.set(key, value);

    Ok(())
}

/// Delete a single key from the store.
///
/// If the key doesn't exist, this is a no-op (no error).
///
/// Frontend usage:
///   await invoke("store_delete", { key: "authToken" });
#[tauri::command]
pub async fn store_delete(
    app: AppHandle,
    key: String,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Remove the key. Returns true if it existed, false otherwise.
    // We don't care about the return value here — deleting a non-existent
    // key is fine.
    let _ = store.delete(&key);

    Ok(())
}

/// Wipe the entire store — removes all keys and values.
///
/// This is the nuclear option. Used for things like "Log out and clear all
/// data" or resetting the app to a fresh state.
///
/// Frontend usage:
///   await invoke("store_clear");
#[tauri::command]
pub async fn store_clear(app: AppHandle) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Remove every key-value pair from the store.
    store.clear();

    Ok(())
}

// =============================================================================
// Auth Commands
// =============================================================================

/// Open a URL in the user's default web browser.
///
/// This is used for the OAuth login flow: the app opens the login page in
/// the system browser (Chrome, Safari, etc.), the user logs in there, and
/// the browser redirects back to the app via the `chessgamble://` deep link.
///
/// Why not open it inside the app? Because OAuth providers (Google, GitHub)
/// often block embedded browser windows for security — they want users to
/// see the real browser URL bar so they know they're on the legit login page.
///
/// This replaces Electron's `shell.openExternal(url)`.
///
/// Frontend usage:
///   await invoke("auth_open_external", { url: "https://auth.chessgamble.com/login" });
#[tauri::command]
pub async fn auth_open_external(
    app: AppHandle,
    url: String,
) -> Result<(), String> {
    // tauri-plugin-opener provides the `open_url()` method which delegates to
    // the OS's default handler for the URL scheme. For https:// URLs, that
    // means the default web browser. This replaced the deprecated
    // tauri-plugin-shell `open()` method.
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL in browser: {}", e))?;

    Ok(())
}

// =============================================================================
// Engine Commands (Stockfish Integration)
// =============================================================================
// These commands let the frontend interact with the Stockfish chess engine.
// The engine runs as a separate process (sidecar) and communicates via UCI.
//
// Typical usage flow:
// 1. Frontend calls init_engine() on app startup
// 2. Frontend calls analyze_position() when user wants analysis
// 3. Frontend calls stop_analysis() if user cancels
// 4. Engine state persists until app closes
// =============================================================================

/// Initialize the Stockfish engine.
///
/// This spawns the Stockfish process and performs the UCI handshake.
/// Should be called once on app startup. If already initialized, returns
/// the existing engine info without restarting.
///
/// The engine is spawned with a channel-based architecture:
/// - spawn_engine() creates the engine and a background command processor
/// - It returns an EngineHandle that can be cloned and used by any command
/// - This avoids holding the mutex during long operations like analysis
///
/// Frontend usage:
///   const info = await invoke("init_engine");
///   console.log(`Using ${info.name} by ${info.author}`);
#[tauri::command]
pub async fn init_engine(
    app: AppHandle,
    state: State<'_, EngineState>,
) -> Result<EngineInfo, String> {
    // Lock the mutex to access the handle
    // `.lock().await` waits if another task is using the state
    let mut guard = state.handle.lock().await;

    // Check if engine is already initialized
    if let Some(handle) = guard.as_ref() {
        // Already initialized — just return the cached info
        // No channel communication needed because info is immutable
        return Ok(handle.info().clone());
    }

    // Not initialized — spawn a new engine with channel-based architecture
    // This creates the StockfishEngine, sets up command channels, and spawns
    // a background task to process commands
    let handle = spawn_engine(&app).await?;
    let info = handle.info().clone();

    // Store the handle in the state
    *guard = Some(handle);

    Ok(info)
}

/// Analyze a single chess position.
///
/// Parameters:
/// - fen: The position in FEN notation (e.g., starting position:
///        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
/// - depth: How many moves ahead to analyze (1-30, higher = slower but better)
///
/// Returns the best move and evaluation.
///
/// Channel-Based Pattern:
/// ----------------------
/// 1. Briefly lock the mutex to clone the EngineHandle
/// 2. Release the lock immediately (before analysis starts)
/// 3. Call handle.analyze() which sends a command through the channel
/// 4. Wait for the result WITHOUT holding any mutex
///
/// This means other commands (like stop_analysis) can be processed while
/// we're waiting for analysis to complete.
///
/// Frontend usage:
///   const result = await invoke("analyze_position", {
///     fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
///     depth: 20
///   });
///   console.log(`Best move: ${result.best_move}, Score: ${result.score_cp}`);
#[tauri::command]
pub async fn analyze_position(
    fen: String,
    depth: u8,
    state: State<'_, EngineState>,
) -> Result<EngineEvaluation, String> {
    // Validate depth — reasonable range is 1-30
    let clamped_depth = depth.clamp(1, 30);

    // Quick lock just to clone the handle — this is the key improvement!
    // Previously, we held the lock for the entire analysis duration (2-5 seconds).
    // Now we hold it for microseconds, just to clone the handle.
    let handle = {
        let guard = state.handle.lock().await;
        guard
            .as_ref()
            .ok_or("Engine not initialized. Call init_engine first.")?
            .clone()
    };
    // Lock released here! The mutex is no longer held.

    // Analysis runs without holding any lock.
    // The handle sends a command through the channel and waits for the response.
    // Other commands (stop, new analysis) can be queued while we wait.
    handle.analyze(fen, clamped_depth).await
}

/// Analyze multiple positions (an entire game).
///
/// Analyzes each FEN position in sequence, emitting progress events so the
/// frontend can show a progress bar. Useful for post-game analysis.
///
/// Parameters:
/// - fens: Array of FEN strings (one per game position)
/// - depth: Analysis depth for each position
///
/// Emits "analysis:progress" events with { current, total } payload.
///
/// Channel-Based Pattern:
/// ----------------------
/// We clone the handle once at the start and use it for all positions.
/// Each analyze() call sends a command through the channel and waits for
/// the result without holding any mutex. This allows stop commands to be
/// processed between positions.
///
/// Frontend usage:
///   // Listen for progress events
///   await listen("analysis:progress", (event) => {
///     const { current, total } = event.payload;
///     console.log(`Analyzing position ${current}/${total}`);
///   });
///
///   // Start analysis
///   const results = await invoke("analyze_game", { fens: gameFens, depth: 15 });
#[tauri::command]
pub async fn analyze_game(
    fens: Vec<String>,
    depth: u8,
    state: State<'_, EngineState>,
    window: tauri::Window,
) -> Result<Vec<EngineEvaluation>, String> {
    let clamped_depth = depth.clamp(1, 30);
    let total = fens.len();

    if total == 0 {
        return Ok(vec![]);
    }

    // Clone the handle once — we'll use it for all positions
    // This brief lock is the only time we touch the mutex
    let handle = {
        let guard = state.handle.lock().await;
        guard
            .as_ref()
            .ok_or("Engine not initialized. Call init_engine first.")?
            .clone()
    };
    // Lock released here!

    let mut results = Vec::with_capacity(total);

    for (i, fen) in fens.iter().enumerate() {
        // Emit progress event
        // The frontend can listen with: listen("analysis:progress", ...)
        let _ = window.emit(
            "analysis:progress",
            serde_json::json!({
                "current": i + 1,
                "total": total
            }),
        );

        // Analyze this position using the handle
        // Each call sends a command and waits without holding any lock
        let eval = handle.analyze(fen.clone(), clamped_depth).await?;
        results.push(eval);
    }

    // Emit completion
    let _ = window.emit(
        "analysis:progress",
        serde_json::json!({
            "current": total,
            "total": total,
            "complete": true
        }),
    );

    Ok(results)
}

/// Stop the current analysis.
///
/// If the engine is analyzing, this tells it to stop immediately.
/// The engine will return the best move it found so far.
///
/// This command can be called even while another analysis is in progress
/// because we're using the channel-based architecture. The stop command
/// is queued and processed by the background task.
///
/// Frontend usage:
///   await invoke("stop_analysis");
#[tauri::command]
pub async fn stop_analysis(state: State<'_, EngineState>) -> Result<(), String> {
    // Clone the handle (quick operation)
    let handle = {
        let guard = state.handle.lock().await;
        guard.as_ref().cloned()
    };
    // Lock released here!

    // Send stop command through the channel
    if let Some(handle) = handle {
        handle.stop().await?;
    }
    Ok(())
}

/// Get information about the engine.
///
/// Returns the engine name, author, and ready status.
/// Fails if the engine hasn't been initialized.
///
/// This is fast because the info is cached on the EngineHandle.
/// No channel communication needed.
///
/// Frontend usage:
///   const info = await invoke("get_engine_info");
///   console.log(`Engine: ${info.name}`);
#[tauri::command]
pub async fn get_engine_info(state: State<'_, EngineState>) -> Result<EngineInfo, String> {
    let guard = state.handle.lock().await;
    let handle = guard
        .as_ref()
        .ok_or("Engine not initialized. Call init_engine first.")?;
    // info() returns a reference to cached data — no channel round-trip needed
    Ok(handle.info().clone())
}

// =============================================================================
// Cancellable Analysis Commands (Phase 4)
// =============================================================================
// These commands support frontend cancellation of long-running analyses.
//
// The Problem:
// When a user starts analyzing a 40-move game at depth 20, it could take
// several minutes. If they change their mind, they need to be able to cancel.
// The original `analyze_game` command blocks until complete — no escape.
//
// The Solution:
// 1. `analyze_game_async` returns immediately with an analysis ID
// 2. Analysis runs in a background task, emitting results via events
// 3. `cancel_analysis` lets the user stop it by ID
// 4. Partial results are returned if cancelled mid-way
//
// This is the async/event-driven pattern used by many apps for long operations:
// - Video rendering software
// - Code compilation
// - Database migrations
// =============================================================================

use std::sync::Arc;
use tokio::time::Duration;

/// Analyze multiple positions (entire game) with cancellation support.
///
/// Unlike `analyze_game`, this returns immediately with an analysis ID.
/// Results are emitted as events so the frontend can update progressively.
///
/// Parameters:
/// - fens: Array of FEN strings (one per game position)
/// - depth: Analysis depth for each position
///
/// Returns: The analysis ID (use to track or cancel)
///
/// Events emitted:
/// - "analysis:progress" { analysisId, current, total }
/// - "analysis:result" { analysisId, results, cancelled } on completion
/// - "analysis:result" { analysisId, error, cancelled, partial_results } on error/cancel
///
/// Frontend usage:
///   const analysisId = await invoke("analyze_game_async", { fens, depth: 15 });
///
///   // Listen for progress
///   await listen("analysis:progress", (e) => {
///     if (e.payload.analysisId === analysisId) {
///       console.log(`${e.payload.current}/${e.payload.total}`);
///     }
///   });
///
///   // Listen for results
///   await listen("analysis:result", (e) => {
///     if (e.payload.analysisId === analysisId) {
///       if (e.payload.cancelled) console.log("User cancelled");
///       else if (e.payload.error) console.log("Error:", e.payload.error);
///       else console.log("Results:", e.payload.results);
///     }
///   });
///
///   // Cancel if needed
///   await invoke("cancel_analysis", { analysisId });
#[tauri::command]
pub async fn analyze_game_async(
    app: AppHandle,
    fens: Vec<String>,
    depth: u8,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    let clamped_depth = depth.clamp(1, 30);
    let total = fens.len();

    if total == 0 {
        return Err("No positions to analyze".to_string());
    }

    // Register this analysis with the tracker to get a unique ID and cancel token
    // The cancel token is shared between the tracker and our analysis task —
    // when cancel_analysis is called, the tracker signals the token, and we stop.
    let (analysis_id, cancel_token) = {
        let mut tracker = state.tracker.lock().await;
        tracker.register()
    };

    // Clone the handle once — this is the key improvement!
    // Previously we cloned state.engine (Arc<Mutex<Option<StockfishEngine>>>)
    // and locked it for each position. Now we clone the lightweight handle
    // and use it without any locking during analysis.
    let handle = {
        let guard = state.handle.lock().await;
        guard
            .as_ref()
            .ok_or("Engine not initialized. Call init_engine first.")?
            .clone()
    };
    // Lock released here! No more locking needed for the entire analysis.

    let id_clone = analysis_id.clone();
    let tracker_arc = Arc::clone(&state.tracker);

    // Spawn the analysis as a background task
    // tokio::spawn creates a new async task that runs concurrently
    // The current function returns immediately with the analysis ID
    tokio::spawn(async move {
        let mut results = Vec::with_capacity(total);

        // Process each position one at a time
        for (i, fen) in fens.iter().enumerate() {
            // Check for cancellation before starting each position
            // This is the "cooperative cancellation" pattern — we check periodically
            // rather than being forcibly interrupted (which could leave things in a bad state)
            if cancel_token.is_cancelled() {
                // User cancelled — emit partial results and stop
                let _ = app.emit(
                    "analysis:result",
                    serde_json::json!({
                        "analysisId": id_clone,
                        "error": "Analysis cancelled",
                        "cancelled": true,
                        "partial_results": results,
                    }),
                );

                // Cleanup: remove from tracker
                let mut tracker = tracker_arc.lock().await;
                tracker.remove(&id_clone);
                return;
            }

            // Emit progress update
            let _ = app.emit(
                "analysis:progress",
                serde_json::json!({
                    "analysisId": id_clone,
                    "current": i + 1,
                    "total": total,
                }),
            );

            // Analyze this position using the handle
            // No locking needed! The handle sends commands through a channel.
            let eval_result = handle.analyze(fen.clone(), clamped_depth).await;

            match eval_result {
                Ok(eval) => results.push(eval),
                Err(e) => {
                    // Error analyzing this position — emit error and partial results
                    let _ = app.emit(
                        "analysis:result",
                        serde_json::json!({
                            "analysisId": id_clone,
                            "error": e,
                            "cancelled": false,
                            "partial_results": results,
                        }),
                    );

                    // Cleanup
                    let mut tracker = tracker_arc.lock().await;
                    tracker.remove(&id_clone);
                    return;
                }
            }
        }

        // All positions analyzed successfully
        let _ = app.emit(
            "analysis:result",
            serde_json::json!({
                "analysisId": id_clone,
                "results": results,
                "cancelled": false,
            }),
        );

        // Cleanup: remove from tracker
        let mut tracker = tracker_arc.lock().await;
        tracker.remove(&id_clone);
    });

    // Return immediately — analysis continues in background
    Ok(analysis_id)
}

/// Cancel an ongoing analysis by its ID.
///
/// If the analysis is still running, it will stop at the next position
/// boundary and emit a result with `cancelled: true` and any partial results.
///
/// If the analysis already finished or the ID is invalid, returns false.
///
/// Frontend usage:
///   const didCancel = await invoke("cancel_analysis", { analysisId: "..." });
///   if (didCancel) console.log("Cancelled!");
#[tauri::command]
pub async fn cancel_analysis(
    analysis_id: String,
    state: State<'_, EngineState>,
) -> Result<bool, String> {
    let mut tracker = state.tracker.lock().await;
    Ok(tracker.cancel(&analysis_id))
}

/// Analyze a single position with timeout and cancellation support.
///
/// Unlike `analyze_position`, this returns immediately with an analysis ID.
/// The result is emitted as an event.
///
/// Parameters:
/// - fen: The position in FEN notation
/// - depth: How many moves ahead to analyze (1-30)
/// - timeout_secs: Optional timeout in seconds (default: 60)
///
/// Returns: The analysis ID (use to track or cancel)
///
/// Events emitted:
/// - "analysis:result" { analysisId, result, cancelled: false } on success
/// - "analysis:result" { analysisId, error, cancelled: true/false } on error/timeout/cancel
///
/// Channel-Based Pattern:
/// ----------------------
/// We clone the handle before spawning the background task. The handle's
/// analyze() method sends commands through a channel, so no mutex locking
/// is needed during the actual analysis.
///
/// Frontend usage:
///   const analysisId = await invoke("analyze_position_async", {
///     fen: "...",
///     depth: 20,
///     timeoutSecs: 30
///   });
///
///   await listen("analysis:result", (e) => {
///     if (e.payload.analysisId === analysisId) {
///       if (e.payload.error) console.log("Failed:", e.payload.error);
///       else console.log("Best move:", e.payload.result.best_move);
///     }
///   });
#[tauri::command]
pub async fn analyze_position_async(
    app: AppHandle,
    fen: String,
    depth: u8,
    timeout_secs: Option<u64>,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    let clamped_depth = depth.clamp(1, 30);
    let timeout_duration = Duration::from_secs(timeout_secs.unwrap_or(60));

    // Register this analysis
    let (analysis_id, cancel_token) = {
        let mut tracker = state.tracker.lock().await;
        tracker.register()
    };

    // Clone the handle — no locking needed during analysis!
    let handle = {
        let guard = state.handle.lock().await;
        guard
            .as_ref()
            .ok_or("Engine not initialized. Call init_engine first.")?
            .clone()
    };
    // Lock released here!

    let id_clone = analysis_id.clone();
    let tracker_arc = Arc::clone(&state.tracker);

    tokio::spawn(async move {
        // Use tokio::select! to race between:
        // 1. The actual analysis completing
        // 2. The cancellation token being triggered
        // 3. The timeout expiring
        //
        // tokio::select! runs multiple futures concurrently and returns as soon
        // as ONE of them completes. It's like Promise.race() in JavaScript.
        let result = tokio::select! {
            // Branch 1: Run the analysis using the handle
            // No mutex locking here — handle.analyze() sends through channel
            eval_result = handle.analyze(fen.clone(), clamped_depth) => {
                // Analysis completed (success or error)
                match eval_result {
                    Ok(eval) => serde_json::json!({
                        "analysisId": id_clone,
                        "result": eval,
                        "cancelled": false,
                    }),
                    Err(e) => serde_json::json!({
                        "analysisId": id_clone,
                        "error": e,
                        "cancelled": false,
                    }),
                }
            }

            // Branch 2: Cancellation requested
            _ = cancel_token.cancelled() => {
                // Send stop through the channel (no locking!)
                let _ = handle.stop().await;
                serde_json::json!({
                    "analysisId": id_clone,
                    "error": "Analysis cancelled",
                    "cancelled": true,
                })
            }

            // Branch 3: Timeout expired
            _ = tokio::time::sleep(timeout_duration) => {
                // Send stop through the channel (no locking!)
                let _ = handle.stop().await;
                serde_json::json!({
                    "analysisId": id_clone,
                    "error": format!("Analysis timed out after {} seconds", timeout_duration.as_secs()),
                    "cancelled": false,
                })
            }
        };

        // Emit the result
        let _ = app.emit("analysis:result", result);

        // Cleanup
        let mut tracker = tracker_arc.lock().await;
        tracker.remove(&id_clone);
    });

    Ok(analysis_id)
}
