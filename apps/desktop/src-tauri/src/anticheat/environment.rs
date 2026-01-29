// =============================================================================
// anticheat/environment.rs — Environment Detection
// =============================================================================
//
// This module detects suspicious runtime environments that might indicate
// cheating. It scans for:
//
// 1. **Debuggers**: Tools used to reverse-engineer or modify the app
// 2. **Virtual Machines**: While legitimate, VMs can hide cheat tools
// 3. **Chess Engines**: Stockfish, Komodo, Leela — the primary cheat vector
// 4. **Screen Sharing**: Discord, Zoom — could be showing position to helper
// 5. **Automation Tools**: AutoHotKey, macros — could inject moves
// 6. **OCR Tools**: Screen-to-text could extract position for remote engine
//
// IMPORTANT: This module does NOT block users or refuse to run the game.
// It only reports what's detected. The server uses this data combined with
// statistical move analysis to calculate overall cheat probability.
//
// Why not block?
// -------------
// Many legitimate users have Discord open while playing, or OBS for streaming.
// Blocking these would hurt honest users. Instead, we:
// 1. Log what's running (for post-game review if flagged)
// 2. Adjust trust scores (Discord + instant best moves = higher suspicion)
// 3. Let the server's statistical engine make the final call
// =============================================================================

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

// =============================================================================
// Process Detection Lists
// =============================================================================
//
// These are the known processes we scan for. Each category has different
// implications for cheat probability:
//
// - Chess engines: High risk — direct source of computer moves
// - Screen sharing: Moderate risk — could show position to remote helper
// - Mobile mirroring: High risk — common engine delivery method (phone on desk)
// - Automation: Moderate risk — could inject moves programmatically
// - OCR: High risk — extracts position from screen for remote engine
// =============================================================================

/// Chess engine processes — the primary cheating vector.
/// If any of these are running, the user could be copying engine moves.
///
/// Note: We detect process NAMES (case-insensitive substring match), so
/// "stockfish" matches "Stockfish 17.exe", "stockfish-macos", etc.
pub const CHESS_ENGINE_PROCESSES: &[&str] = &[
    // Open source engines
    "stockfish",  // Most popular, very strong
    "komodo",     // Commercial engine
    "leela",      // Neural network engine
    "lc0",        // Leela Chess Zero (GPU-accelerated)
    "houdini",    // Very strong (older)
    "fire",       // Strong open source
    "rybka",      // Famous (now banned in competition)
    "shredder",   // Commercial
    "crafty",     // Classic open source
    "fruit",      // Historic open source
    "ethereal",   // Strong open source
    "berserk",    // Rising engine
    "koivisto",   // Strong open source
    "slowchess",  // Community engine
    "demolito",   // Open source
    // Chess GUIs that might have engines attached
    "arena",       // Free chess GUI (often runs with engine)
    "scid",        // Chess database with analysis
    "chessbase",   // Commercial chess database
    "lucaschess",  // Free GUI with engine support
    "tarrasch",    // Chess GUI
    "cutechess",   // Engine testing GUI
    "banksiagui",  // Chess GUI
    "nibbler",     // Leela analysis GUI
    // Browser-based analysis (detectable as tab names on some systems)
    "lichess",   // Has built-in analysis
    "chess.com", // Has built-in analysis
    "chess24",   // Analysis features
    "chessify",  // Cloud analysis service
];

/// Screen sharing processes — could be showing the game to a remote helper.
/// Moderate risk since many users legitimately use Discord while gaming.
pub const SCREEN_SHARING_PROCESSES: &[&str] = &[
    // Video conferencing
    "discord",
    "zoom",
    "teams",
    "skype",
    "slack",
    "webex",
    "googlemeet",
    "facetime",
    // Streaming software
    "obs",
    "streamlabs",
    "xsplit",
    "nvidia broadcast",
    // Remote access (high risk — full control)
    "anydesk",
    "teamviewer",
    "parsec",
    "rustdesk",
    "chrome remote desktop",
    "vnc",
    "rdp",
];

/// Mobile mirroring processes — shows phone screen on desktop.
/// High risk because a common cheat pattern is:
/// 1. Play on desktop
/// 2. Mirror phone to desktop (or just have phone visible)
/// 3. Run engine on phone, copy moves to desktop
pub const MOBILE_MIRRORING_PROCESSES: &[&str] = &[
    "scrcpy",       // Android screen mirroring
    "vysor",        // Chrome extension for Android
    "airdroid",     // Android mirroring
    "apowermirror", // Cross-platform mirroring
    "letsview",     // Screen mirroring
    "reflector",    // AirPlay receiver for Mac/Windows
    "airserver",    // AirPlay/Miracast receiver
];

/// Automation tools — can inject moves programmatically.
/// Moderate risk because they can bypass our input tracking.
pub const AUTOMATION_TOOLS: &[&str] = &[
    "autohotkey", // Windows automation
    "autoit",     // Windows scripting
    "macro",      // Various macro programs
    "sikuli",     // Image-based automation
    "pyautogui",  // Python automation
    "robotjs",    // Node.js automation
    "xdotool",    // Linux automation
];

/// OCR (Optical Character Recognition) tools — can extract board position.
/// High risk because they enable a pipeline:
/// 1. OCR reads the board from screen
/// 2. Position sent to remote engine (not detectable locally)
/// 3. Move returned to user
pub const OCR_TOOLS: &[&str] = &[
    "tesseract",   // Open source OCR
    "ocr",         // Generic OCR processes
    "textract",    // AWS OCR (unlikely locally)
    "abbyy",       // Commercial OCR
    "chessocr",    // Chess-specific OCR
    "chessvision", // Chess position recognition
];

// =============================================================================
// Data Structures
// =============================================================================

/// Flags indicating what suspicious elements were detected in the environment.
///
/// This struct is sent to the server as part of each move's metadata so that
/// server-side analysis can correlate environment with behavior.
///
/// Example: debugger_present=true alone might just be a developer.
/// But debugger_present=true + 95% engine correlation = likely cheater.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EnvironmentFlags {
    /// Whether a debugger is attached to the process.
    /// True = someone might be inspecting/modifying the app.
    ///
    /// Detection method varies by OS:
    /// - macOS: ptrace(PT_DENY_ATTACH) or sysctl check
    /// - Windows: IsDebuggerPresent() Win32 API
    /// - Linux: /proc/self/status check
    pub debugger_present: bool,

    /// Whether the app is running inside a virtual machine.
    /// Not inherently suspicious (many developers use VMs), but cheaters
    /// sometimes use VMs to isolate cheat tools.
    ///
    /// Detection: Check for VM-specific hardware identifiers, registry keys,
    /// or process names (VMware, VirtualBox, QEMU, Hyper-V).
    pub virtual_machine: bool,

    /// List of known cheat-related tools detected running.
    /// Each entry is the process name that matched our blocklists.
    pub known_cheat_tools: Vec<String>,

    /// List of suspicious but not definitively cheat-related processes.
    /// These are things like Discord (screen sharing capable) that many
    /// legitimate users have running.
    pub suspicious_processes: Vec<String>,
}

/// A process detected on the system during the environment scan.
/// Used internally and can be sent to server for detailed logging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedProcess {
    /// Process name (executable name without path)
    pub name: String,

    /// Process ID (platform-specific)
    pub pid: u32,

    /// Which category this process belongs to
    pub category: ProcessCategory,
}

/// Categories for detected processes — helps the server weight risk appropriately.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProcessCategory {
    /// Chess engine — highest risk
    ChessEngine,
    /// Screen sharing — moderate risk
    ScreenSharing,
    /// Mobile mirroring — high risk
    MobileMirroring,
    /// Automation tool — moderate risk
    Automation,
    /// OCR tool — high risk
    Ocr,
    /// Debugger — context-dependent
    Debugger,
    /// Unknown but flagged
    Other,
}

/// Result of environment risk calculation.
/// This is what gets sent to the server with each move or on game start.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentRisk {
    /// Overall risk score from 0-100.
    /// 0 = clean environment, 100 = maximum suspicion
    pub score: u8,

    /// List of flags that contributed to the score.
    /// Useful for post-game review if the player is flagged.
    pub flags: Vec<String>,

    /// Full list of detected processes for detailed logging.
    pub detected_processes: Vec<DetectedProcess>,
}

// =============================================================================
// EnvironmentChecker — Main Entry Point
// =============================================================================

/// Scans the system environment for suspicious indicators.
///
/// Usage:
/// ```rust
/// let checker = EnvironmentChecker::scan().await;
/// let risk = checker.calculate_risk();
/// send_to_server(risk);
/// ```
///
/// This struct holds the raw detection results. Call `calculate_risk()` to
/// get the final risk score for the server.
#[derive(Debug, Clone)]
pub struct EnvironmentChecker {
    /// Raw environment flags from the scan
    pub flags: EnvironmentFlags,

    /// All detected processes (for detailed logging)
    detected_processes: Vec<DetectedProcess>,
}

impl EnvironmentChecker {
    /// Perform a full environment scan.
    ///
    /// This is an expensive operation that spawns OS processes to list
    /// running processes. Call once at game start and cache the result.
    /// For periodic re-scans, consider a lighter incremental check.
    pub async fn scan() -> Self {
        let mut flags = EnvironmentFlags::default();
        let mut detected_processes = Vec::new();

        // Step 1: Check for debugger
        flags.debugger_present = check_debugger_present();

        // Step 2: Check for virtual machine
        flags.virtual_machine = detect_vm_artifacts();

        // Step 3: Scan running processes for known tools
        let running_processes = scan_for_processes_internal().await;

        for proc in &running_processes {
            let name_lower = proc.name.to_lowercase();

            // Check against each category
            if contains_any(&name_lower, CHESS_ENGINE_PROCESSES) {
                flags.known_cheat_tools.push(proc.name.clone());
                detected_processes.push(DetectedProcess {
                    name: proc.name.clone(),
                    pid: proc.pid,
                    category: ProcessCategory::ChessEngine,
                });
            } else if contains_any(&name_lower, OCR_TOOLS) {
                flags.known_cheat_tools.push(proc.name.clone());
                detected_processes.push(DetectedProcess {
                    name: proc.name.clone(),
                    pid: proc.pid,
                    category: ProcessCategory::Ocr,
                });
            } else if contains_any(&name_lower, MOBILE_MIRRORING_PROCESSES) {
                flags.suspicious_processes.push(proc.name.clone());
                detected_processes.push(DetectedProcess {
                    name: proc.name.clone(),
                    pid: proc.pid,
                    category: ProcessCategory::MobileMirroring,
                });
            } else if contains_any(&name_lower, AUTOMATION_TOOLS) {
                flags.suspicious_processes.push(proc.name.clone());
                detected_processes.push(DetectedProcess {
                    name: proc.name.clone(),
                    pid: proc.pid,
                    category: ProcessCategory::Automation,
                });
            } else if contains_any(&name_lower, SCREEN_SHARING_PROCESSES) {
                flags.suspicious_processes.push(proc.name.clone());
                detected_processes.push(DetectedProcess {
                    name: proc.name.clone(),
                    pid: proc.pid,
                    category: ProcessCategory::ScreenSharing,
                });
            }
        }

        Self {
            flags,
            detected_processes,
        }
    }

    /// Calculate the overall environment risk score.
    ///
    /// This combines all detected flags into a single 0-100 score that
    /// the server uses as one input to its cheat probability model.
    pub fn calculate_risk(&self) -> EnvironmentRisk {
        calculate_environment_risk(&self.detected_processes, &self.flags)
    }

    /// Get raw flags for detailed inspection.
    pub fn flags(&self) -> &EnvironmentFlags {
        &self.flags
    }

    /// Get list of all detected processes.
    pub fn detected_processes(&self) -> &[DetectedProcess] {
        &self.detected_processes
    }
}

// =============================================================================
// EnvironmentCache — TTL-Based Scan Caching
// =============================================================================
//
// Environment scanning is EXPENSIVE because it:
// 1. Spawns external processes (ps, tasklist) to list running processes
// 2. Parses potentially large output (hundreds of processes)
// 3. Runs file system checks for debuggers and VMs
//
// Without caching, every move could trigger a full rescan, which:
// - Adds 50-100ms latency per move
// - Causes CPU spikes that could affect game timing
// - Wastes resources since the process list rarely changes mid-game
//
// Solution: Cache scan results with a configurable TTL (time-to-live).
//
// Cache Strategy:
// ---------------
// - Default TTL: 5 minutes (300 seconds)
// - Game duration TTL: Can be extended to cover an entire game
// - Manual invalidation: For security-critical re-checks
//
// The cache stores the full EnvironmentChecker result so we can:
// - Return the cached risk score immediately
// - Access detailed process lists without rescanning
// - Invalidate and rescan if something suspicious happens
//
// Performance Impact:
// -------------------
// | Operation              | Without Cache | With Cache |
// |------------------------|---------------|------------|
// | First scan             | 50-100ms      | 50-100ms   |
// | Subsequent checks      | 50-100ms      | <1ms       |
// | Memory overhead        | 0             | ~1KB       |
// =============================================================================

/// Default cache TTL: 5 minutes.
///
/// Most chess games last 10-30 minutes. A 5-minute TTL means:
/// - 2-6 rescans per game (reasonable for security)
/// - Cached results for most move sequences
/// - Fresh data if user opens new suspicious apps mid-game
const DEFAULT_CACHE_TTL_SECS: u64 = 300;

/// Thread-safe cache for environment scan results.
///
/// This cache wraps EnvironmentChecker with TTL-based expiration.
/// Use `scan_with_cache()` for cached access or `force_rescan()` to bypass.
///
/// ## Thread Safety
///
/// Uses RwLock for efficient concurrent reads:
/// - Multiple commands can check cache validity concurrently
/// - Only actual rescans require exclusive write access
/// - Arc wrapper allows sharing across Tauri commands
///
/// ## Usage
///
/// ```rust
/// // Create cache (once at app startup)
/// let cache = EnvironmentCache::new();
///
/// // In move handler:
/// let risk = cache.scan_with_cache().await;
/// send_to_server(risk);
///
/// // For security-critical moments (game start, suspicious move):
/// let risk = cache.force_rescan().await;
/// ```
pub struct EnvironmentCache {
    /// Cached scan result with timestamp.
    ///
    /// - None: Never scanned or cache explicitly cleared
    /// - Some((checker, timestamp)): Cached result with creation time
    cached: RwLock<Option<(EnvironmentChecker, Instant)>>,

    /// How long cached results are valid.
    ///
    /// After this duration, the next `scan_with_cache()` call will
    /// perform a fresh scan.
    ttl: Duration,
}

impl EnvironmentCache {
    /// Create a new cache with the default TTL (5 minutes).
    pub fn new() -> Self {
        Self {
            cached: RwLock::new(None),
            ttl: Duration::from_secs(DEFAULT_CACHE_TTL_SECS),
        }
    }

    /// Create a cache with a custom TTL.
    ///
    /// Use this for game-specific caching:
    /// ```rust
    /// // Cache for entire 30-minute game
    /// let game_cache = EnvironmentCache::with_ttl(Duration::from_secs(30 * 60));
    /// ```
    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            cached: RwLock::new(None),
            ttl,
        }
    }

    /// Get environment risk, using cached result if still valid.
    ///
    /// This is the primary API for most use cases:
    /// 1. Check if cache is valid (exists and not expired)
    /// 2. If valid, return cached result immediately (<1ms)
    /// 3. If invalid, perform full scan and cache result (50-100ms)
    ///
    /// ## Performance
    ///
    /// - Cache hit: ~1 microsecond
    /// - Cache miss: 50-100ms (full process list scan)
    ///
    /// ## Concurrency
    ///
    /// Multiple concurrent calls during a cache miss will all wait for
    /// the single scan to complete. The RwLock ensures only one scan runs.
    pub async fn scan_with_cache(&self) -> EnvironmentRisk {
        // Fast path: Check if cache is valid using read lock
        {
            let read_guard = self.cached.read().await;
            if let Some((ref checker, timestamp)) = *read_guard {
                let age = Instant::now().duration_since(timestamp);
                if age < self.ttl {
                    // Cache hit! Return immediately.
                    return checker.calculate_risk();
                }
            }
        }
        // Read lock dropped here.

        // Slow path: Cache miss or expired. Need to rescan.
        self.force_rescan().await
    }

    /// Force a fresh scan, bypassing the cache.
    ///
    /// Use this for security-critical moments:
    /// - Game start (ensure clean baseline)
    /// - After a flagged move (check if new tools appeared)
    /// - User-requested security check
    ///
    /// The result is cached for future calls to `scan_with_cache()`.
    pub async fn force_rescan(&self) -> EnvironmentRisk {
        // Acquire write lock for exclusive scan access
        let mut write_guard = self.cached.write().await;

        // Double-check: Another thread may have scanned while we waited
        if let Some((ref checker, timestamp)) = *write_guard {
            let age = Instant::now().duration_since(timestamp);
            if age < Duration::from_secs(1) {
                // Very recent scan (within 1 second), use it
                return checker.calculate_risk();
            }
        }

        // Perform the actual scan
        let checker = EnvironmentChecker::scan().await;
        let risk = checker.calculate_risk();

        // Cache the result
        *write_guard = Some((checker, Instant::now()));

        risk
    }

    /// Clear the cache, forcing the next access to rescan.
    ///
    /// Use when you know the environment has changed:
    /// - User minimized/restored the app
    /// - Network change detected
    /// - Manual "rescan" button pressed
    pub async fn invalidate(&self) {
        let mut write_guard = self.cached.write().await;
        *write_guard = None;
    }

    /// Check if the cache currently holds valid (non-expired) data.
    ///
    /// Useful for UI to show "Last scanned: X seconds ago".
    pub async fn is_valid(&self) -> bool {
        let read_guard = self.cached.read().await;
        if let Some((_, timestamp)) = *read_guard {
            Instant::now().duration_since(timestamp) < self.ttl
        } else {
            false
        }
    }

    /// Get the age of the cached data, if any.
    ///
    /// Returns None if never scanned, or the duration since last scan.
    pub async fn cache_age(&self) -> Option<Duration> {
        let read_guard = self.cached.read().await;
        read_guard
            .as_ref()
            .map(|(_, timestamp)| Instant::now().duration_since(*timestamp))
    }

    /// Get the cached checker for detailed inspection.
    ///
    /// Returns None if cache is empty or expired.
    /// Use this to access detailed process lists without triggering a rescan.
    pub async fn get_cached(&self) -> Option<EnvironmentChecker> {
        let read_guard = self.cached.read().await;
        if let Some((ref checker, timestamp)) = *read_guard {
            let age = Instant::now().duration_since(timestamp);
            if age < self.ttl {
                return Some(checker.clone());
            }
        }
        None
    }
}

impl Default for EnvironmentCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe wrapper for EnvironmentCache that can be shared across Tauri commands.
///
/// Arc wrapper allows the cache to be cloned cheaply and shared between
/// different parts of the application.
#[derive(Clone)]
pub struct SharedEnvironmentCache {
    inner: Arc<EnvironmentCache>,
}

impl SharedEnvironmentCache {
    /// Create a new shared cache with default TTL.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(EnvironmentCache::new()),
        }
    }

    /// Create with custom TTL.
    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            inner: Arc::new(EnvironmentCache::with_ttl(ttl)),
        }
    }

    /// Delegate to inner cache methods.
    pub async fn scan_with_cache(&self) -> EnvironmentRisk {
        self.inner.scan_with_cache().await
    }

    pub async fn force_rescan(&self) -> EnvironmentRisk {
        self.inner.force_rescan().await
    }

    pub async fn invalidate(&self) {
        self.inner.invalidate().await
    }

    pub async fn is_valid(&self) -> bool {
        self.inner.is_valid().await
    }

    pub async fn cache_age(&self) -> Option<Duration> {
        self.inner.cache_age().await
    }

    pub async fn get_cached(&self) -> Option<EnvironmentChecker> {
        self.inner.get_cached().await
    }
}

impl Default for SharedEnvironmentCache {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Risk Calculation
// =============================================================================

/// Calculate environment risk score from detected processes and flags.
///
/// Scoring logic:
/// - Chess engine detected: +60 (very high)
/// - Mobile mirroring: +40 (high — common cheat method)
/// - OCR tools: +45 (high — position extraction)
/// - Automation tools: +30 (moderate)
/// - Screen sharing: +20 (moderate — many legit uses)
/// - Debugger: +40 (context-dependent but suspicious)
/// - Virtual machine: +10 (minor flag)
///
/// The maximum score is clamped to 100.
pub fn calculate_environment_risk(
    processes: &[DetectedProcess],
    flags: &EnvironmentFlags,
) -> EnvironmentRisk {
    let mut score: u16 = 0; // Use u16 to avoid overflow before clamping
    let mut risk_flags = Vec::new();

    // Check for chess engine (highest risk)
    if processes
        .iter()
        .any(|p| p.category == ProcessCategory::ChessEngine)
    {
        score += 60;
        risk_flags.push("chess_engine_detected".to_string());
    }

    // Check for OCR tools (high risk)
    if processes.iter().any(|p| p.category == ProcessCategory::Ocr) {
        score += 45;
        risk_flags.push("ocr_tool_detected".to_string());
    }

    // Check for mobile mirroring (high risk)
    if processes
        .iter()
        .any(|p| p.category == ProcessCategory::MobileMirroring)
    {
        score += 40;
        risk_flags.push("mobile_mirroring_detected".to_string());
    }

    // Check for automation tools (moderate risk)
    if processes
        .iter()
        .any(|p| p.category == ProcessCategory::Automation)
    {
        score += 30;
        risk_flags.push("automation_tool_detected".to_string());
    }

    // Check for screen sharing (moderate risk)
    if processes
        .iter()
        .any(|p| p.category == ProcessCategory::ScreenSharing)
    {
        score += 20;
        risk_flags.push("screen_sharing_active".to_string());
    }

    // Check for debugger
    if flags.debugger_present {
        score += 40;
        risk_flags.push("debugger_present".to_string());
    }

    // Check for VM
    if flags.virtual_machine {
        score += 10;
        risk_flags.push("virtual_machine_detected".to_string());
    }

    EnvironmentRisk {
        score: (score as u8).min(100),
        flags: risk_flags,
        detected_processes: processes.to_vec(),
    }
}

// =============================================================================
// Process Scanning
// =============================================================================

/// Internal process info from the OS process list.
#[derive(Debug, Clone)]
struct ProcessInfo {
    name: String,
    pid: u32,
}

/// Scan for processes matching the given patterns.
///
/// This is the public API for checking specific process patterns.
/// Returns a list of process names that matched any of the patterns.
pub fn scan_for_processes(patterns: &[&str]) -> Vec<String> {
    // This is a blocking call — in production, use scan_for_processes_internal
    // which is async. This sync version is for quick checks.
    let processes = scan_for_processes_sync();

    processes
        .into_iter()
        .filter(|p| contains_any(&p.name.to_lowercase(), patterns))
        .map(|p| p.name)
        .collect()
}

/// Async version of process scanning — preferred for non-blocking operation.
async fn scan_for_processes_internal() -> Vec<ProcessInfo> {
    // On different platforms, we use different methods to list processes.
    // This is all platform-specific code wrapped in cfg attributes.

    #[cfg(target_os = "macos")]
    {
        scan_processes_macos().await
    }

    #[cfg(target_os = "windows")]
    {
        scan_processes_windows().await
    }

    #[cfg(target_os = "linux")]
    {
        scan_processes_linux().await
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        // Unsupported platform — return empty list
        Vec::new()
    }
}

/// Synchronous process scanning (for quick checks).
fn scan_for_processes_sync() -> Vec<ProcessInfo> {
    #[cfg(target_os = "macos")]
    {
        scan_processes_macos_sync()
    }

    #[cfg(target_os = "windows")]
    {
        scan_processes_windows_sync()
    }

    #[cfg(target_os = "linux")]
    {
        scan_processes_linux_sync()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Vec::new()
    }
}

// =============================================================================
// Platform-Specific Process Scanning
// =============================================================================

#[cfg(target_os = "macos")]
async fn scan_processes_macos() -> Vec<ProcessInfo> {
    use tokio::process::Command;

    // Use `ps` command to list all processes
    // -e: show all processes (not just current user)
    // -o pid=,comm=: output format (PID and command name, no headers)
    let output = Command::new("ps")
        .args(["-e", "-o", "pid=,comm="])
        .output()
        .await;

    match output {
        Ok(out) => parse_ps_output(&out.stdout),
        Err(_) => Vec::new(),
    }
}

#[cfg(target_os = "macos")]
fn scan_processes_macos_sync() -> Vec<ProcessInfo> {
    use std::process::Command;

    let output = Command::new("ps").args(["-e", "-o", "pid=,comm="]).output();

    match output {
        Ok(out) => parse_ps_output(&out.stdout),
        Err(_) => Vec::new(),
    }
}

#[cfg(target_os = "linux")]
async fn scan_processes_linux() -> Vec<ProcessInfo> {
    use tokio::process::Command;

    // Linux also uses `ps`, same format as macOS
    let output = Command::new("ps")
        .args(["-e", "-o", "pid=,comm="])
        .output()
        .await;

    match output {
        Ok(out) => parse_ps_output(&out.stdout),
        Err(_) => Vec::new(),
    }
}

#[cfg(target_os = "linux")]
fn scan_processes_linux_sync() -> Vec<ProcessInfo> {
    use std::process::Command;

    let output = Command::new("ps").args(["-e", "-o", "pid=,comm="]).output();

    match output {
        Ok(out) => parse_ps_output(&out.stdout),
        Err(_) => Vec::new(),
    }
}

#[cfg(target_os = "windows")]
async fn scan_processes_windows() -> Vec<ProcessInfo> {
    use tokio::process::Command;

    // Windows uses `tasklist` command
    // /FO CSV: output in CSV format for easy parsing
    // /NH: no header row
    let output = Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output()
        .await;

    match output {
        Ok(out) => parse_tasklist_output(&out.stdout),
        Err(_) => Vec::new(),
    }
}

#[cfg(target_os = "windows")]
fn scan_processes_windows_sync() -> Vec<ProcessInfo> {
    use std::process::Command;

    let output = Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output();

    match output {
        Ok(out) => parse_tasklist_output(&out.stdout),
        Err(_) => Vec::new(),
    }
}

/// Parse output from `ps -e -o pid=,comm=` (macOS/Linux)
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_ps_output(output: &[u8]) -> Vec<ProcessInfo> {
    let text = String::from_utf8_lossy(output);
    let mut processes = Vec::new();

    for line in text.lines() {
        let parts: Vec<&str> = line.trim().splitn(2, char::is_whitespace).collect();
        if parts.len() >= 2 {
            if let Ok(pid) = parts[0].trim().parse::<u32>() {
                let name = parts[1].trim().to_string();
                if !name.is_empty() {
                    processes.push(ProcessInfo { name, pid });
                }
            }
        }
    }

    processes
}

/// Parse output from `tasklist /FO CSV /NH` (Windows)
#[cfg(target_os = "windows")]
fn parse_tasklist_output(output: &[u8]) -> Vec<ProcessInfo> {
    let text = String::from_utf8_lossy(output);
    let mut processes = Vec::new();

    // Format: "Image Name","PID","Session Name","Session#","Mem Usage"
    for line in text.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            // Remove quotes from process name
            let name = parts[0].trim().trim_matches('"').to_string();
            // Parse PID (also quoted)
            if let Ok(pid) = parts[1].trim().trim_matches('"').parse::<u32>() {
                if !name.is_empty() {
                    processes.push(ProcessInfo { name, pid });
                }
            }
        }
    }

    processes
}

// =============================================================================
// Debugger Detection
// =============================================================================

/// Check if a debugger is attached to the current process.
fn check_debugger_present() -> bool {
    #[cfg(target_os = "macos")]
    {
        check_debugger_macos()
    }

    #[cfg(target_os = "windows")]
    {
        check_debugger_windows()
    }

    #[cfg(target_os = "linux")]
    {
        check_debugger_linux()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
fn check_debugger_macos() -> bool {
    // On macOS, we can check using sysctl
    // CTL_KERN.KERN_PROC.KERN_PROC_PID.<pid> returns info including P_TRACED flag
    use std::process::Command;

    // Simpler approach: try to read our own process info and check for tracers
    // sysctl -n kern.proc.pid.<pid> | grep P_TRACED
    let pid = std::process::id();
    let output = Command::new("sysctl")
        .args(["-n", &format!("kern.proc.pid.{}", pid)])
        .output();

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.contains("P_TRACED")
        }
        Err(_) => false,
    }
}

#[cfg(target_os = "windows")]
fn check_debugger_windows() -> bool {
    // On Windows, use IsDebuggerPresent from kernel32
    // This is a simple Win32 API call
    #[link(name = "kernel32")]
    extern "system" {
        fn IsDebuggerPresent() -> i32;
    }

    unsafe { IsDebuggerPresent() != 0 }
}

#[cfg(target_os = "linux")]
fn check_debugger_linux() -> bool {
    // On Linux, check /proc/self/status for TracerPid
    // If TracerPid is non-zero, we're being traced
    use std::fs;

    if let Ok(status) = fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("TracerPid:") {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() >= 2 {
                    if let Ok(tracer_pid) = parts[1].trim().parse::<u32>() {
                        return tracer_pid != 0;
                    }
                }
            }
        }
    }

    false
}

// =============================================================================
// Virtual Machine Detection
// =============================================================================

/// Detect if running inside a virtual machine.
///
/// We check for common VM artifacts like:
/// - VMware, VirtualBox, Hyper-V, QEMU process names
/// - VM-specific hardware identifiers
///
/// Note: This is NOT used to block users — VMs are legitimate.
/// It's just one data point for the overall risk calculation.
fn detect_vm_artifacts() -> bool {
    #[cfg(target_os = "macos")]
    {
        detect_vm_macos()
    }

    #[cfg(target_os = "windows")]
    {
        detect_vm_windows()
    }

    #[cfg(target_os = "linux")]
    {
        detect_vm_linux()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
fn detect_vm_macos() -> bool {
    use std::process::Command;

    // Check for VM-related kexts (kernel extensions)
    // Common ones: com.vmware.kext, org.virtualbox.kext
    let output = Command::new("kextstat").output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if text.contains("vmware") || text.contains("virtualbox") || text.contains("parallels") {
            return true;
        }
    }

    // Also check system_profiler for hardware
    let output = Command::new("system_profiler")
        .args(["SPHardwareDataType"])
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
        // Virtual machines often have specific model identifiers
        if text.contains("vmware") || text.contains("virtualbox") || text.contains("parallels") {
            return true;
        }
    }

    false
}

#[cfg(target_os = "windows")]
fn detect_vm_windows() -> bool {
    use std::process::Command;

    // Check WMI for VM indicators
    // wmic computersystem get model,manufacturer
    let output = Command::new("wmic")
        .args(["computersystem", "get", "model,manufacturer"])
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if text.contains("vmware")
            || text.contains("virtualbox")
            || text.contains("virtual")
            || text.contains("hyper-v")
            || text.contains("qemu")
            || text.contains("xen")
        {
            return true;
        }
    }

    false
}

#[cfg(target_os = "linux")]
fn detect_vm_linux() -> bool {
    use std::fs;

    // Check /sys/class/dmi/id for VM indicators
    let files_to_check = [
        "/sys/class/dmi/id/product_name",
        "/sys/class/dmi/id/sys_vendor",
        "/sys/class/dmi/id/board_vendor",
    ];

    for file in &files_to_check {
        if let Ok(content) = fs::read_to_string(file) {
            let lower = content.to_lowercase();
            if lower.contains("vmware")
                || lower.contains("virtualbox")
                || lower.contains("qemu")
                || lower.contains("kvm")
                || lower.contains("xen")
                || lower.contains("hyper-v")
            {
                return true;
            }
        }
    }

    // Also check /proc/cpuinfo for hypervisor flag
    if let Ok(cpuinfo) = fs::read_to_string("/proc/cpuinfo") {
        if cpuinfo.contains("hypervisor") {
            return true;
        }
    }

    false
}

// =============================================================================
// Utility Functions
// =============================================================================

/// Check if the target string contains any of the patterns (case-insensitive).
fn contains_any(target: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|pattern| target.contains(pattern))
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_any() {
        assert!(contains_any("stockfish 17", CHESS_ENGINE_PROCESSES));
        assert!(contains_any("discord", SCREEN_SHARING_PROCESSES));
        assert!(!contains_any("notepad", CHESS_ENGINE_PROCESSES));
    }

    #[test]
    fn test_environment_flags_default() {
        let flags = EnvironmentFlags::default();
        assert!(!flags.debugger_present);
        assert!(!flags.virtual_machine);
        assert!(flags.known_cheat_tools.is_empty());
        assert!(flags.suspicious_processes.is_empty());
    }

    #[test]
    fn test_risk_calculation() {
        let processes = vec![DetectedProcess {
            name: "stockfish".to_string(),
            pid: 1234,
            category: ProcessCategory::ChessEngine,
        }];
        let flags = EnvironmentFlags::default();

        let risk = calculate_environment_risk(&processes, &flags);
        assert!(risk.score >= 60); // Chess engine adds 60 points
        assert!(risk.flags.contains(&"chess_engine_detected".to_string()));
    }

    #[test]
    fn test_risk_capped_at_100() {
        let processes = vec![
            DetectedProcess {
                name: "stockfish".to_string(),
                pid: 1,
                category: ProcessCategory::ChessEngine,
            },
            DetectedProcess {
                name: "tesseract".to_string(),
                pid: 2,
                category: ProcessCategory::Ocr,
            },
            DetectedProcess {
                name: "scrcpy".to_string(),
                pid: 3,
                category: ProcessCategory::MobileMirroring,
            },
        ];
        let mut flags = EnvironmentFlags::default();
        flags.debugger_present = true;
        flags.virtual_machine = true;

        let risk = calculate_environment_risk(&processes, &flags);
        assert_eq!(risk.score, 100); // Should be capped at 100
    }
}
