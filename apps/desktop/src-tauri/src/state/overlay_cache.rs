// =============================================================================
// state/overlay_cache.rs — In-Memory Overlay Settings Cache
// =============================================================================
//
// This module provides an in-memory cache for overlay window settings.
// It eliminates disk I/O on every IPC call by:
//   1. Loading settings from disk once at startup
//   2. Serving reads from memory (microsecond access)
//   3. Marking a "dirty" flag on writes
//   4. Running a background task that saves every 2 seconds if dirty
//
// THREAD SAFETY
// =============
// - RwLock<OverlaySettings>: Allows multiple concurrent reads, exclusive writes
// - AtomicBool (dirty flag): Lock-free check for whether save is needed
// - The background save task acquires the read lock briefly, then saves
//
// LIFECYCLE
// =========
// 1. Created in main.rs and registered via .manage()
// 2. Background monitor started via .start_auto_save()
// 3. Commands use State<OverlaySettingsCache> to access
// 4. On app exit, pending dirty data is saved (via Drop or explicit flush)
//
// USAGE FROM COMMANDS
// ===================
// ```rust
// #[tauri::command]
// pub async fn set_overlay_opacity(
//     cache: State<'_, OverlaySettingsCache>,
//     opacity: f64
// ) -> Result<(), String> {
//     cache.update(|s| s.opacity = opacity.clamp(0.3, 1.0));
//     Ok(())
// }
// ```
// =============================================================================

use crate::commands::OverlaySettings;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::RwLock;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

// =============================================================================
// Constants
// =============================================================================

const STORE_FILE: &str = "chess-gamble-config.json";
const OVERLAY_SETTINGS_KEY: &str = "overlay_settings";
const AUTO_SAVE_INTERVAL_SECS: u64 = 2;

// =============================================================================
// Cache Implementation
// =============================================================================

/// In-memory cache for overlay settings with auto-save functionality.
///
/// This cache reduces disk I/O by:
/// - Serving all reads from memory
/// - Batching writes via a dirty flag and periodic save
///
/// The cache is thread-safe and can be accessed from multiple async tasks.
pub struct OverlaySettingsCache {
    /// The cached settings, protected by a read-write lock.
    /// RwLock allows multiple concurrent readers but exclusive writers.
    settings: RwLock<OverlaySettings>,

    /// Whether the cache has been modified since last save.
    /// Using AtomicBool avoids acquiring a lock just to check if save is needed.
    dirty: AtomicBool,

    /// Flag to signal the auto-save task to stop.
    shutdown: AtomicBool,
}

impl OverlaySettingsCache {
    /// Create a new cache with default settings.
    ///
    /// Call `load_from_app()` in setup to populate from disk.
    pub fn new() -> Self {
        Self {
            settings: RwLock::new(OverlaySettings::default()),
            dirty: AtomicBool::new(false),
            shutdown: AtomicBool::new(false),
        }
    }

    /// Create a cache with default settings (for testing or when app handle unavailable).
    pub fn with_defaults() -> Self {
        Self {
            settings: RwLock::new(OverlaySettings::default()),
            dirty: AtomicBool::new(false),
            shutdown: AtomicBool::new(false),
        }
    }

    /// Load settings from disk into the cache.
    ///
    /// Call this in setup() after the cache is registered with `.manage()`.
    /// If loading fails, the cache keeps its default values.
    pub fn load_from_app(&self, app: &AppHandle) {
        match Self::load_from_disk(app) {
            Ok(loaded_settings) => {
                let mut settings = self.settings.write().unwrap();
                *settings = loaded_settings;
                println!("[OverlayCache] Loaded settings from disk");
            }
            Err(e) => {
                println!("[OverlayCache] Using defaults, load failed: {}", e);
            }
        }
    }

    /// Get a clone of the current settings.
    ///
    /// This is a fast in-memory read (microseconds).
    /// Multiple commands can call this concurrently without blocking each other.
    pub fn get(&self) -> OverlaySettings {
        self.settings.read().unwrap().clone()
    }

    /// Update settings using a closure.
    ///
    /// The closure receives a mutable reference to the settings.
    /// After the update, the dirty flag is set so the auto-save task knows to persist.
    ///
    /// # Example
    /// ```rust
    /// cache.update(|s| s.opacity = 0.8);
    /// ```
    pub fn update<F>(&self, updater: F)
    where
        F: FnOnce(&mut OverlaySettings),
    {
        {
            let mut settings = self.settings.write().unwrap();
            updater(&mut settings);
        }
        self.dirty.store(true, Ordering::Release);
    }

    /// Replace the entire settings struct.
    ///
    /// Useful for bulk updates or loading from a different source.
    pub fn set(&self, new_settings: OverlaySettings) {
        {
            let mut settings = self.settings.write().unwrap();
            *settings = new_settings;
        }
        self.dirty.store(true, Ordering::Release);
    }

    /// Check if there are unsaved changes.
    pub fn is_dirty(&self) -> bool {
        self.dirty.load(Ordering::Acquire)
    }

    /// Start the auto-save background task.
    ///
    /// This spawns an async task that:
    /// 1. Checks the dirty flag every N seconds
    /// 2. If dirty, saves to disk and clears the flag
    /// 3. Stops when the shutdown flag is set
    ///
    /// Call this once after registering the cache with `.manage()`.
    pub fn start_auto_save(&self, app: AppHandle) {
        // Clone the app handle for the async task
        let app_clone = app.clone();

        tauri::async_runtime::spawn(async move {
            loop {
                // Sleep first to give the app time to initialize
                tokio::time::sleep(Duration::from_secs(AUTO_SAVE_INTERVAL_SECS)).await;

                // Access the cache via the app's managed state
                let cache = app_clone.state::<std::sync::Arc<OverlaySettingsCache>>();

                // Check shutdown flag
                if cache.shutdown.load(Ordering::Acquire) {
                    // Final save before shutting down
                    if cache.is_dirty() {
                        let _ = cache.save_to_disk(&app_clone);
                    }
                    break;
                }

                // If dirty, save to disk
                if cache
                    .dirty
                    .compare_exchange(true, false, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
                {
                    if let Err(e) = cache.save_to_disk(&app_clone) {
                        eprintln!("[OverlayCache] Auto-save failed: {}", e);
                        // Re-mark as dirty so we try again next cycle
                        cache.dirty.store(true, Ordering::Release);
                    } else {
                        println!("[OverlayCache] Auto-saved settings to disk");
                    }
                }
            }
        });
    }

    /// Signal the auto-save task to stop.
    ///
    /// Call this during app shutdown to ensure pending changes are saved.
    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::Release);
    }

    /// Manually trigger a save to disk.
    ///
    /// This is useful when you need to ensure data is persisted immediately,
    /// such as before navigating away or closing the overlay.
    pub fn flush(&self, app: &AppHandle) -> Result<(), String> {
        if self
            .dirty
            .compare_exchange(true, false, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            self.save_to_disk(app)?;
        }
        Ok(())
    }

    /// Emit a settings update event to the overlay window.
    ///
    /// Call this after updating settings so the frontend can react.
    pub fn emit_update(&self, app: &AppHandle) {
        use tauri::Emitter;
        let settings = self.get();
        if let Some(window) = app.get_webview_window("game-overlay") {
            let _ = window.emit("overlay:settings-updated", &settings);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /// Load settings from the Tauri store.
    fn load_from_disk(app: &AppHandle) -> Result<OverlaySettings, String> {
        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("Failed to open store: {}", e))?;

        match store.get(OVERLAY_SETTINGS_KEY) {
            Some(value) => serde_json::from_value(value.clone())
                .map_err(|e| format!("Failed to parse overlay settings: {}", e)),
            None => Ok(OverlaySettings::default()),
        }
    }

    /// Save current settings to the Tauri store.
    fn save_to_disk(&self, app: &AppHandle) -> Result<(), String> {
        let settings = self.get();

        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("Failed to open store: {}", e))?;

        let value = serde_json::to_value(&settings)
            .map_err(|e| format!("Failed to serialize overlay settings: {}", e))?;

        store.set(OVERLAY_SETTINGS_KEY, value);

        Ok(())
    }
}

impl Default for OverlaySettingsCache {
    fn default() -> Self {
        Self::new()
    }
}

// Ensure we save on drop (app shutdown)
impl Drop for OverlaySettingsCache {
    fn drop(&mut self) {
        // Note: We can't save here because we don't have the app handle.
        // The shutdown() method should be called explicitly before dropping.
        // The auto-save task will do a final save when shutdown flag is set.
    }
}
