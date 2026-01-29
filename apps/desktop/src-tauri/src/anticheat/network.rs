// =============================================================================
// anticheat/network.rs — Network Activity Monitoring (Stub)
// =============================================================================
//
// This module provides network monitoring capabilities for anti-cheat purposes.
// The goal is to detect suspicious network patterns that might indicate:
//
// 1. **Engine API Calls**: User making HTTP requests to chess engine APIs
//    (e.g., chessify.me, lichess.org/api for analysis)
//
// 2. **Suspiciously Timed Requests**: Network requests that correlate with
//    move timing (request made right before each move)
//
// 3. **Unusual Request Patterns**: Spike in requests during game vs before
//
// Current Status: STUB
// --------------------
// This is a minimal implementation that provides the structure and types.
// Full implementation will:
// - Hook into system network monitoring (platform-specific)
// - Track request domains and timing
// - Correlate with game moves for anomaly detection
//
// Privacy Considerations:
// ----------------------
// We do NOT log the content of network requests — only metadata:
// - Domain/hostname (not full URLs with query params)
// - Request timing (when, not what)
// - Request counts (aggregate statistics)
//
// This is less invasive than a full packet sniffer but still useful for
// detecting patterns like "user makes API call → makes perfect move".
// =============================================================================

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

// =============================================================================
// Data Structures
// =============================================================================

/// Summary of network activity during a game.
///
/// This is sent to the server after each game for analysis.
/// The server can correlate network patterns with move quality.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NetworkSummary {
    /// Total number of HTTP/HTTPS requests made during the game.
    pub total_requests: u32,

    /// Number of requests to known chess analysis services.
    /// Higher counts may indicate engine API usage.
    pub chess_api_requests: u32,

    /// Number of WebSocket connections opened during the game.
    /// Could indicate real-time communication with external helper.
    pub websocket_connections: u32,

    /// Request counts per domain.
    /// Key = domain (e.g., "lichess.org"), Value = request count.
    pub requests_by_domain: HashMap<String, u32>,

    /// Timestamp of the first network event monitored.
    pub monitoring_started: u64,

    /// Timestamp of the last network event recorded.
    pub monitoring_ended: u64,

    /// Average time between requests (milliseconds).
    /// Very regular intervals might indicate automated requests.
    pub avg_request_interval_ms: Option<u64>,
}

/// A single network event recorded during monitoring.
///
/// Used internally for tracking and analysis.
/// The full list is NOT sent to the server — only the summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkEvent {
    /// Timestamp when the request was made.
    pub timestamp: u64,

    /// Domain of the request (e.g., "lichess.org").
    pub domain: String,

    /// Whether this is a known chess-related domain.
    pub is_chess_related: bool,

    /// Type of event.
    pub event_type: NetworkEventType,
}

/// Type of network event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NetworkEventType {
    /// HTTP/HTTPS request
    HttpRequest,
    /// WebSocket connection opened
    WebSocketOpen,
    /// WebSocket connection closed
    WebSocketClose,
    /// DNS lookup
    DnsLookup,
    /// Unknown or other network activity
    Other,
}

// =============================================================================
// Known Chess Domains
// =============================================================================

/// Domains known to provide chess analysis or engine access.
///
/// Requests to these domains during a game are flagged for correlation
/// with move quality. Note that legitimate users might open these in
/// a browser — we're looking for patterns, not blocking access.
const CHESS_ANALYSIS_DOMAINS: &[&str] = &[
    // Analysis services
    "lichess.org",      // Has cloud analysis API
    "chess.com",        // Has analysis features
    "chessify.me",      // Cloud engine access
    "chess24.com",      // Analysis features
    "decodechess.com",  // Engine analysis
    "nextchessmove.com", // Best move lookup
    // Engine APIs (if exposed via HTTP)
    "stockfish.online",
    "lichess1.org",    // Lichess analysis backend
    "chess-api.com",
];

// =============================================================================
// NetworkMonitor
// =============================================================================

/// Monitors network activity during a game.
///
/// Usage:
/// 1. Create a new monitor at game start: `NetworkMonitor::new()`
/// 2. Call `start_monitoring()` to begin recording
/// 3. (Network events are recorded automatically via platform hooks)
/// 4. Call `stop_monitoring()` at game end
/// 5. Use `get_summary()` to get the final report for the server
///
/// Current Status: This is a stub implementation. The actual network
/// monitoring requires platform-specific code to hook into system APIs:
/// - macOS: Network Extension framework or nettop command
/// - Windows: Event Tracing for Windows (ETW) or WFP
/// - Linux: netfilter/iptables or eBPF
///
/// For the initial release, this provides the data structures and
/// manual recording methods. Full passive monitoring will come later.
#[derive(Debug, Clone)]
pub struct NetworkMonitor {
    /// Whether monitoring is currently active.
    is_active: bool,

    /// Recorded events during this monitoring session.
    events: Vec<NetworkEvent>,

    /// When monitoring started.
    start_time: u64,

    /// Running count of requests.
    total_requests: u32,

    /// Running count of chess API requests.
    chess_api_requests: u32,

    /// Running count of WebSocket connections.
    websocket_connections: u32,
}

impl NetworkMonitor {
    /// Create a new network monitor.
    pub fn new() -> Self {
        Self {
            is_active: false,
            events: Vec::new(),
            start_time: 0,
            total_requests: 0,
            chess_api_requests: 0,
            websocket_connections: 0,
        }
    }

    /// Start monitoring network activity.
    ///
    /// In the full implementation, this would install system hooks.
    /// Currently, it just initializes tracking state.
    pub fn start_monitoring(&mut self) {
        self.is_active = true;
        self.events.clear();
        self.start_time = current_timestamp_ms();
        self.total_requests = 0;
        self.chess_api_requests = 0;
        self.websocket_connections = 0;
    }

    /// Stop monitoring and finalize the session.
    pub fn stop_monitoring(&mut self) {
        self.is_active = false;
    }

    /// Check if monitoring is active.
    pub fn is_active(&self) -> bool {
        self.is_active
    }

    /// Record a network event manually.
    ///
    /// This is used by the application when it knows about network activity
    /// (e.g., its own API calls). In the full implementation, events would
    /// be captured automatically via system hooks.
    pub fn record_event(&mut self, domain: &str, event_type: NetworkEventType) {
        if !self.is_active {
            return;
        }

        let is_chess_related = is_chess_domain(domain);

        let event = NetworkEvent {
            timestamp: current_timestamp_ms(),
            domain: domain.to_string(),
            is_chess_related,
            event_type,
        };

        // Update counters
        match event_type {
            NetworkEventType::HttpRequest => {
                self.total_requests += 1;
                if is_chess_related {
                    self.chess_api_requests += 1;
                }
            }
            NetworkEventType::WebSocketOpen => {
                self.websocket_connections += 1;
            }
            _ => {}
        }

        self.events.push(event);
    }

    /// Get the summary of network activity for the server.
    pub fn get_summary(&self) -> NetworkSummary {
        let end_time = if self.is_active {
            current_timestamp_ms()
        } else if let Some(last) = self.events.last() {
            last.timestamp
        } else {
            self.start_time
        };

        // Calculate requests per domain
        let mut requests_by_domain: HashMap<String, u32> = HashMap::new();
        for event in &self.events {
            if event.event_type == NetworkEventType::HttpRequest {
                *requests_by_domain.entry(event.domain.clone()).or_insert(0) += 1;
            }
        }

        // Calculate average interval between requests
        let avg_interval = if self.events.len() >= 2 {
            let total_time = end_time.saturating_sub(self.start_time);
            Some(total_time / (self.events.len() as u64 - 1).max(1))
        } else {
            None
        };

        NetworkSummary {
            total_requests: self.total_requests,
            chess_api_requests: self.chess_api_requests,
            websocket_connections: self.websocket_connections,
            requests_by_domain,
            monitoring_started: self.start_time,
            monitoring_ended: end_time,
            avg_request_interval_ms: avg_interval,
        }
    }

    /// Get the raw events for detailed analysis (internal use only).
    pub fn get_events(&self) -> &[NetworkEvent] {
        &self.events
    }

    /// Analyze network activity for suspicious patterns.
    ///
    /// Returns a list of flags that might indicate cheating.
    pub fn analyze_patterns(&self) -> Vec<&'static str> {
        let mut flags = Vec::new();

        // Flag: Many chess API requests during the game
        if self.chess_api_requests > 5 {
            flags.push("high_chess_api_requests");
        }

        // Flag: Very regular request intervals (automated)
        if let Some(avg) = self.get_summary().avg_request_interval_ms {
            // Check if intervals are suspiciously regular
            // (would need to check variance in full implementation)
            if avg > 0 && avg < 1000 {
                // More than 1 request per second on average
                flags.push("frequent_regular_requests");
            }
        }

        // Flag: WebSocket connections to chess sites during game
        if self.websocket_connections > 0 {
            // Check if any are to chess domains
            let chess_ws = self.events.iter().any(|e| {
                e.event_type == NetworkEventType::WebSocketOpen && e.is_chess_related
            });
            if chess_ws {
                flags.push("chess_websocket_active");
            }
        }

        flags
    }
}

impl Default for NetworkMonitor {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Thread-Safe Network Monitor Wrapper
// =============================================================================

/// Thread-safe wrapper for NetworkMonitor.
///
/// Use this when you need to share the monitor across async tasks.
/// The inner monitor is protected by a Tokio Mutex.
pub struct SharedNetworkMonitor {
    inner: Arc<Mutex<NetworkMonitor>>,
}

impl SharedNetworkMonitor {
    /// Create a new shared network monitor.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(NetworkMonitor::new())),
        }
    }

    /// Start monitoring.
    pub async fn start_monitoring(&self) {
        let mut guard = self.inner.lock().await;
        guard.start_monitoring();
    }

    /// Stop monitoring.
    pub async fn stop_monitoring(&self) {
        let mut guard = self.inner.lock().await;
        guard.stop_monitoring();
    }

    /// Record an event.
    pub async fn record_event(&self, domain: &str, event_type: NetworkEventType) {
        let mut guard = self.inner.lock().await;
        guard.record_event(domain, event_type);
    }

    /// Get the summary.
    pub async fn get_summary(&self) -> NetworkSummary {
        let guard = self.inner.lock().await;
        guard.get_summary()
    }

    /// Analyze patterns.
    pub async fn analyze_patterns(&self) -> Vec<&'static str> {
        let guard = self.inner.lock().await;
        guard.analyze_patterns()
    }

    /// Clone the inner Arc for sharing.
    pub fn clone_inner(&self) -> Arc<Mutex<NetworkMonitor>> {
        Arc::clone(&self.inner)
    }
}

impl Default for SharedNetworkMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for SharedNetworkMonitor {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Check if a domain is a known chess-related service.
fn is_chess_domain(domain: &str) -> bool {
    let domain_lower = domain.to_lowercase();
    CHESS_ANALYSIS_DOMAINS.iter().any(|&d| domain_lower.contains(d))
}

/// Get current timestamp in milliseconds.
fn current_timestamp_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// =============================================================================
// Future Implementation Notes
// =============================================================================
//
// Full network monitoring will require platform-specific code:
//
// macOS:
// ------
// - Network Extension framework (requires entitlements)
// - Or parse `nettop` command output
// - Or use libpcap for packet capture
//
// Windows:
// --------
// - Windows Filtering Platform (WFP)
// - Event Tracing for Windows (ETW)
// - Or hook into WinHTTP/WinINet
//
// Linux:
// ------
// - eBPF for low-overhead packet capture
// - netfilter conntrack
// - /proc/net/tcp for connection info
//
// All platforms will need:
// 1. DNS resolution hooking to correlate IPs with domains
// 2. Filtering to ignore our own game traffic
// 3. Rate limiting to avoid performance impact
// 4. Privacy controls (no request body capture)
//
// =============================================================================

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_monitor_new() {
        let monitor = NetworkMonitor::new();
        assert!(!monitor.is_active());
        assert!(monitor.get_events().is_empty());
    }

    #[test]
    fn test_start_stop_monitoring() {
        let mut monitor = NetworkMonitor::new();

        monitor.start_monitoring();
        assert!(monitor.is_active());

        monitor.stop_monitoring();
        assert!(!monitor.is_active());
    }

    #[test]
    fn test_record_event() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        monitor.record_event("lichess.org", NetworkEventType::HttpRequest);

        let summary = monitor.get_summary();
        assert_eq!(summary.total_requests, 2);
        assert_eq!(summary.chess_api_requests, 1);
    }

    #[test]
    fn test_chess_domain_detection() {
        assert!(is_chess_domain("lichess.org"));
        assert!(is_chess_domain("api.chess.com"));
        assert!(is_chess_domain("www.chessify.me"));
        assert!(!is_chess_domain("google.com"));
        assert!(!is_chess_domain("example.com"));
    }

    #[test]
    fn test_summary_generation() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        monitor.record_event("lichess.org", NetworkEventType::HttpRequest);
        monitor.record_event("lichess.org", NetworkEventType::WebSocketOpen);

        let summary = monitor.get_summary();

        assert_eq!(summary.total_requests, 3);
        assert_eq!(summary.chess_api_requests, 1);
        assert_eq!(summary.websocket_connections, 1);
        assert_eq!(*summary.requests_by_domain.get("example.com").unwrap_or(&0), 2);
        assert_eq!(*summary.requests_by_domain.get("lichess.org").unwrap_or(&0), 1);
    }

    #[test]
    fn test_pattern_analysis() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Add many chess API requests
        for _ in 0..10 {
            monitor.record_event("lichess.org", NetworkEventType::HttpRequest);
        }

        let flags = monitor.analyze_patterns();
        assert!(flags.contains(&"high_chess_api_requests"));
    }

    #[test]
    fn test_events_not_recorded_when_inactive() {
        let mut monitor = NetworkMonitor::new();
        // Don't call start_monitoring()

        monitor.record_event("example.com", NetworkEventType::HttpRequest);

        assert!(monitor.get_events().is_empty());
        assert_eq!(monitor.get_summary().total_requests, 0);
    }

    #[tokio::test]
    async fn test_shared_network_monitor() {
        let monitor = SharedNetworkMonitor::new();

        monitor.start_monitoring().await;
        monitor.record_event("example.com", NetworkEventType::HttpRequest).await;

        let summary = monitor.get_summary().await;
        assert_eq!(summary.total_requests, 1);

        monitor.stop_monitoring().await;
    }
}
