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

    // =========================================================================
    // NetworkMonitor Basic Tests
    // =========================================================================

    #[test]
    fn test_network_monitor_new() {
        let monitor = NetworkMonitor::new();
        assert!(!monitor.is_active());
        assert!(monitor.get_events().is_empty());
        assert_eq!(monitor.total_requests, 0);
        assert_eq!(monitor.chess_api_requests, 0);
        assert_eq!(monitor.websocket_connections, 0);
    }

    #[test]
    fn test_network_monitor_default() {
        let monitor = NetworkMonitor::default();
        assert!(!monitor.is_active());
        assert!(monitor.get_events().is_empty());
    }

    #[test]
    fn test_start_monitoring_initializes_state() {
        let mut monitor = NetworkMonitor::new();

        monitor.start_monitoring();

        assert!(monitor.is_active());
        assert!(monitor.start_time > 0);
        assert_eq!(monitor.total_requests, 0);
        assert_eq!(monitor.chess_api_requests, 0);
        assert_eq!(monitor.websocket_connections, 0);
        assert!(monitor.get_events().is_empty());
    }

    #[test]
    fn test_start_monitoring_clears_previous_state() {
        let mut monitor = NetworkMonitor::new();

        // First session
        monitor.start_monitoring();
        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        monitor.stop_monitoring();

        // Second session should start fresh
        monitor.start_monitoring();

        assert!(monitor.is_active());
        assert!(monitor.get_events().is_empty());
        assert_eq!(monitor.total_requests, 0);
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
    fn test_stop_monitoring_preserves_events() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        monitor.record_event("test.com", NetworkEventType::HttpRequest);

        monitor.stop_monitoring();

        // Events should still be accessible after stopping
        assert_eq!(monitor.get_events().len(), 2);
        assert_eq!(monitor.total_requests, 2);
    }

    // =========================================================================
    // Event Recording Tests
    // =========================================================================

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
    fn test_record_event_http_request() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::HttpRequest);

        assert_eq!(monitor.total_requests, 1);
        assert_eq!(monitor.get_events().len(), 1);
        assert_eq!(monitor.get_events()[0].event_type, NetworkEventType::HttpRequest);
    }

    #[test]
    fn test_record_event_websocket_open() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::WebSocketOpen);

        assert_eq!(monitor.websocket_connections, 1);
        assert_eq!(monitor.total_requests, 0); // WebSocket open is not an HTTP request
    }

    #[test]
    fn test_record_event_websocket_close() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::WebSocketClose);

        // WebSocket close doesn't increment counters
        assert_eq!(monitor.websocket_connections, 0);
        assert_eq!(monitor.total_requests, 0);
        assert_eq!(monitor.get_events().len(), 1);
    }

    #[test]
    fn test_record_event_dns_lookup() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::DnsLookup);

        assert_eq!(monitor.total_requests, 0);
        assert_eq!(monitor.get_events().len(), 1);
        assert_eq!(monitor.get_events()[0].event_type, NetworkEventType::DnsLookup);
    }

    #[test]
    fn test_record_event_other() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::Other);

        assert_eq!(monitor.total_requests, 0);
        assert_eq!(monitor.get_events().len(), 1);
    }

    #[test]
    fn test_events_not_recorded_when_inactive() {
        let mut monitor = NetworkMonitor::new();
        // Don't call start_monitoring()

        monitor.record_event("example.com", NetworkEventType::HttpRequest);

        assert!(monitor.get_events().is_empty());
        assert_eq!(monitor.get_summary().total_requests, 0);
    }

    #[test]
    fn test_record_event_chess_domain_flagged() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("lichess.org", NetworkEventType::HttpRequest);

        assert_eq!(monitor.chess_api_requests, 1);
        assert!(monitor.get_events()[0].is_chess_related);
    }

    #[test]
    fn test_record_event_non_chess_domain_not_flagged() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("google.com", NetworkEventType::HttpRequest);

        assert_eq!(monitor.chess_api_requests, 0);
        assert!(!monitor.get_events()[0].is_chess_related);
    }

    #[test]
    fn test_record_event_timestamp() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        let before = current_timestamp_ms();
        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        let after = current_timestamp_ms();

        let event = &monitor.get_events()[0];
        assert!(event.timestamp >= before);
        assert!(event.timestamp <= after);
    }

    // =========================================================================
    // Chess Domain Detection Tests
    // =========================================================================

    #[test]
    fn test_chess_domain_detection() {
        assert!(is_chess_domain("lichess.org"));
        assert!(is_chess_domain("api.chess.com"));
        assert!(is_chess_domain("www.chessify.me"));
        assert!(!is_chess_domain("google.com"));
        assert!(!is_chess_domain("example.com"));
    }

    #[test]
    fn test_chess_domain_detection_lichess() {
        assert!(is_chess_domain("lichess.org"));
        assert!(is_chess_domain("api.lichess.org"));
        assert!(is_chess_domain("lichess.org/api/analysis"));
    }

    #[test]
    fn test_chess_domain_detection_chess_com() {
        assert!(is_chess_domain("chess.com"));
        assert!(is_chess_domain("www.chess.com"));
        assert!(is_chess_domain("api.chess.com"));
    }

    #[test]
    fn test_chess_domain_detection_chessify() {
        assert!(is_chess_domain("chessify.me"));
        assert!(is_chess_domain("api.chessify.me"));
    }

    #[test]
    fn test_chess_domain_detection_chess24() {
        assert!(is_chess_domain("chess24.com"));
    }

    #[test]
    fn test_chess_domain_detection_decodechess() {
        assert!(is_chess_domain("decodechess.com"));
    }

    #[test]
    fn test_chess_domain_detection_nextchessmove() {
        assert!(is_chess_domain("nextchessmove.com"));
    }

    #[test]
    fn test_chess_domain_detection_stockfish_online() {
        assert!(is_chess_domain("stockfish.online"));
    }

    #[test]
    fn test_chess_domain_detection_case_insensitive() {
        assert!(is_chess_domain("LICHESS.ORG"));
        assert!(is_chess_domain("Chess.Com"));
        assert!(is_chess_domain("CHESSIFY.ME"));
    }

    #[test]
    fn test_chess_domain_detection_not_chess() {
        assert!(!is_chess_domain("google.com"));
        assert!(!is_chess_domain("github.com"));
        assert!(!is_chess_domain("stackoverflow.com"));
        assert!(!is_chess_domain("example.com"));
        assert!(!is_chess_domain(""));
    }

    #[test]
    fn test_chess_domain_detection_partial_match_false() {
        // "chess" alone doesn't match specific domains
        // The domain must contain one of the known chess analysis domains
        assert!(!is_chess_domain("mychesssite.com")); // Contains "chess" but not in list
    }

    // =========================================================================
    // Summary Generation Tests
    // =========================================================================

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
    fn test_summary_empty_monitor() {
        let monitor = NetworkMonitor::new();
        let summary = monitor.get_summary();

        assert_eq!(summary.total_requests, 0);
        assert_eq!(summary.chess_api_requests, 0);
        assert_eq!(summary.websocket_connections, 0);
        assert!(summary.requests_by_domain.is_empty());
        assert!(summary.avg_request_interval_ms.is_none());
    }

    #[test]
    fn test_summary_monitoring_timestamps() {
        let mut monitor = NetworkMonitor::new();

        let before = current_timestamp_ms();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        std::thread::sleep(std::time::Duration::from_millis(10));

        let summary = monitor.get_summary();
        let after = current_timestamp_ms();

        assert!(summary.monitoring_started >= before);
        assert!(summary.monitoring_ended <= after);
        assert!(summary.monitoring_ended >= summary.monitoring_started);
    }

    #[test]
    fn test_summary_requests_by_domain() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("a.com", NetworkEventType::HttpRequest);
        monitor.record_event("b.com", NetworkEventType::HttpRequest);
        monitor.record_event("a.com", NetworkEventType::HttpRequest);
        monitor.record_event("c.com", NetworkEventType::HttpRequest);
        monitor.record_event("a.com", NetworkEventType::HttpRequest);

        let summary = monitor.get_summary();

        assert_eq!(*summary.requests_by_domain.get("a.com").unwrap(), 3);
        assert_eq!(*summary.requests_by_domain.get("b.com").unwrap(), 1);
        assert_eq!(*summary.requests_by_domain.get("c.com").unwrap(), 1);
    }

    #[test]
    fn test_summary_websocket_not_counted_as_request() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::WebSocketOpen);
        monitor.record_event("example.com", NetworkEventType::WebSocketClose);

        let summary = monitor.get_summary();

        // WebSocket events are not HTTP requests
        assert!(summary.requests_by_domain.is_empty());
    }

    #[test]
    fn test_summary_average_interval_single_event() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::HttpRequest);

        let summary = monitor.get_summary();

        // With only one event, no interval can be calculated
        assert!(summary.avg_request_interval_ms.is_none());
    }

    #[test]
    fn test_summary_average_interval_multiple_events() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::HttpRequest);
        std::thread::sleep(std::time::Duration::from_millis(10));
        monitor.record_event("example.com", NetworkEventType::HttpRequest);

        let summary = monitor.get_summary();

        // With 2+ events, interval should be calculated
        assert!(summary.avg_request_interval_ms.is_some());
    }

    // =========================================================================
    // Pattern Analysis Tests
    // =========================================================================

    #[test]
    fn test_pattern_analysis_clean() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Few non-chess requests
        monitor.record_event("google.com", NetworkEventType::HttpRequest);
        monitor.record_event("github.com", NetworkEventType::HttpRequest);

        let flags = monitor.analyze_patterns();

        // Should be clean
        assert!(!flags.contains(&"high_chess_api_requests"));
    }

    #[test]
    fn test_pattern_analysis_high_chess_api_requests() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Add many chess API requests (more than 5)
        for _ in 0..10 {
            monitor.record_event("lichess.org", NetworkEventType::HttpRequest);
        }

        let flags = monitor.analyze_patterns();
        assert!(flags.contains(&"high_chess_api_requests"));
    }

    #[test]
    fn test_pattern_analysis_threshold_chess_requests() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Exactly 5 chess API requests (at threshold)
        for _ in 0..5 {
            monitor.record_event("lichess.org", NetworkEventType::HttpRequest);
        }

        let flags = monitor.analyze_patterns();

        // 5 is not > 5, so should not flag
        assert!(!flags.contains(&"high_chess_api_requests"));
    }

    #[test]
    fn test_pattern_analysis_just_over_threshold() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // 6 chess API requests (just over threshold)
        for _ in 0..6 {
            monitor.record_event("lichess.org", NetworkEventType::HttpRequest);
        }

        let flags = monitor.analyze_patterns();

        // 6 > 5, should flag
        assert!(flags.contains(&"high_chess_api_requests"));
    }

    #[test]
    fn test_pattern_analysis_chess_websocket() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("lichess.org", NetworkEventType::WebSocketOpen);

        let flags = monitor.analyze_patterns();
        assert!(flags.contains(&"chess_websocket_active"));
    }

    #[test]
    fn test_pattern_analysis_non_chess_websocket() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("example.com", NetworkEventType::WebSocketOpen);

        let flags = monitor.analyze_patterns();

        // WebSocket to non-chess site should not flag chess_websocket_active
        assert!(!flags.contains(&"chess_websocket_active"));
    }

    #[test]
    fn test_pattern_analysis_empty_monitor() {
        let monitor = NetworkMonitor::new();
        let flags = monitor.analyze_patterns();
        assert!(flags.is_empty());
    }

    #[test]
    fn test_pattern_analysis_multiple_flags() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Many chess API requests
        for _ in 0..10 {
            monitor.record_event("lichess.org", NetworkEventType::HttpRequest);
        }

        // Chess WebSocket
        monitor.record_event("chess.com", NetworkEventType::WebSocketOpen);

        let flags = monitor.analyze_patterns();

        assert!(flags.contains(&"high_chess_api_requests"));
        assert!(flags.contains(&"chess_websocket_active"));
    }

    // =========================================================================
    // NetworkEvent Tests
    // =========================================================================

    #[test]
    fn test_network_event_creation() {
        let event = NetworkEvent {
            timestamp: 12345,
            domain: "example.com".to_string(),
            is_chess_related: false,
            event_type: NetworkEventType::HttpRequest,
        };

        assert_eq!(event.timestamp, 12345);
        assert_eq!(event.domain, "example.com");
        assert!(!event.is_chess_related);
        assert_eq!(event.event_type, NetworkEventType::HttpRequest);
    }

    #[test]
    fn test_network_event_clone() {
        let original = NetworkEvent {
            timestamp: 1000,
            domain: "test.com".to_string(),
            is_chess_related: true,
            event_type: NetworkEventType::WebSocketOpen,
        };

        let cloned = original.clone();

        assert_eq!(cloned.timestamp, original.timestamp);
        assert_eq!(cloned.domain, original.domain);
        assert_eq!(cloned.is_chess_related, original.is_chess_related);
        assert_eq!(cloned.event_type, original.event_type);
    }

    // =========================================================================
    // NetworkEventType Tests
    // =========================================================================

    #[test]
    fn test_network_event_type_equality() {
        assert_eq!(NetworkEventType::HttpRequest, NetworkEventType::HttpRequest);
        assert_ne!(NetworkEventType::HttpRequest, NetworkEventType::WebSocketOpen);
    }

    #[test]
    fn test_network_event_type_copy() {
        let event_type = NetworkEventType::DnsLookup;
        let copied = event_type;
        assert_eq!(event_type, copied);
    }

    // =========================================================================
    // NetworkSummary Tests
    // =========================================================================

    #[test]
    fn test_network_summary_default() {
        let summary = NetworkSummary::default();

        assert_eq!(summary.total_requests, 0);
        assert_eq!(summary.chess_api_requests, 0);
        assert_eq!(summary.websocket_connections, 0);
        assert!(summary.requests_by_domain.is_empty());
        assert_eq!(summary.monitoring_started, 0);
        assert_eq!(summary.monitoring_ended, 0);
        assert!(summary.avg_request_interval_ms.is_none());
    }

    #[test]
    fn test_network_summary_clone() {
        let mut summary = NetworkSummary::default();
        summary.total_requests = 10;
        summary.requests_by_domain.insert("test.com".to_string(), 5);

        let cloned = summary.clone();

        assert_eq!(cloned.total_requests, 10);
        assert_eq!(*cloned.requests_by_domain.get("test.com").unwrap(), 5);
    }

    // =========================================================================
    // SharedNetworkMonitor Tests
    // =========================================================================

    #[test]
    fn test_shared_network_monitor_new() {
        let monitor = SharedNetworkMonitor::new();
        let _ = monitor; // Just verify it creates
    }

    #[test]
    fn test_shared_network_monitor_default() {
        let monitor = SharedNetworkMonitor::default();
        let _ = monitor;
    }

    #[test]
    fn test_shared_network_monitor_clone() {
        let monitor1 = SharedNetworkMonitor::new();
        let monitor2 = monitor1.clone();

        // Both should reference the same inner monitor
        let _ = (monitor1, monitor2);
    }

    #[test]
    fn test_shared_network_monitor_clone_inner() {
        let monitor = SharedNetworkMonitor::new();
        let inner = monitor.clone_inner();

        // Should get a cloned Arc
        assert_eq!(Arc::strong_count(&inner), 2);
    }

    #[tokio::test]
    async fn test_shared_network_monitor_basic_workflow() {
        let monitor = SharedNetworkMonitor::new();

        monitor.start_monitoring().await;
        monitor.record_event("example.com", NetworkEventType::HttpRequest).await;

        let summary = monitor.get_summary().await;
        assert_eq!(summary.total_requests, 1);

        monitor.stop_monitoring().await;
    }

    #[tokio::test]
    async fn test_shared_network_monitor_multiple_events() {
        let monitor = SharedNetworkMonitor::new();

        monitor.start_monitoring().await;
        monitor.record_event("a.com", NetworkEventType::HttpRequest).await;
        monitor.record_event("b.com", NetworkEventType::HttpRequest).await;
        monitor.record_event("lichess.org", NetworkEventType::HttpRequest).await;

        let summary = monitor.get_summary().await;

        assert_eq!(summary.total_requests, 3);
        assert_eq!(summary.chess_api_requests, 1);
    }

    #[tokio::test]
    async fn test_shared_network_monitor_analyze_patterns() {
        let monitor = SharedNetworkMonitor::new();

        monitor.start_monitoring().await;

        // Add enough chess API requests to trigger flag
        for _ in 0..10 {
            monitor.record_event("lichess.org", NetworkEventType::HttpRequest).await;
        }

        let flags = monitor.analyze_patterns().await;
        assert!(flags.contains(&"high_chess_api_requests"));
    }

    #[tokio::test]
    async fn test_shared_network_monitor_concurrent_clones() {
        let monitor = SharedNetworkMonitor::new();
        let monitor_clone = monitor.clone();

        monitor.start_monitoring().await;

        // Record from original
        monitor.record_event("a.com", NetworkEventType::HttpRequest).await;

        // Record from clone (should affect same underlying monitor)
        monitor_clone.record_event("b.com", NetworkEventType::HttpRequest).await;

        let summary = monitor.get_summary().await;
        assert_eq!(summary.total_requests, 2);

        let summary_clone = monitor_clone.get_summary().await;
        assert_eq!(summary_clone.total_requests, 2);
    }

    // =========================================================================
    // Baseline Network Activity Tests
    // =========================================================================

    #[test]
    fn test_baseline_no_activity() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();
        // No events recorded

        let summary = monitor.get_summary();

        assert_eq!(summary.total_requests, 0);
        assert_eq!(summary.chess_api_requests, 0);
        assert_eq!(summary.websocket_connections, 0);
        assert!(summary.requests_by_domain.is_empty());
    }

    #[test]
    fn test_baseline_normal_browsing() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Simulate normal browsing (non-chess sites)
        monitor.record_event("google.com", NetworkEventType::HttpRequest);
        monitor.record_event("youtube.com", NetworkEventType::HttpRequest);
        monitor.record_event("github.com", NetworkEventType::HttpRequest);

        let flags = monitor.analyze_patterns();

        // Normal browsing should not trigger any flags
        assert!(flags.is_empty());
    }

    // =========================================================================
    // Anomalous Timing Tests
    // =========================================================================

    #[test]
    fn test_anomalous_timing_many_requests() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Many requests in quick succession
        for i in 0..20 {
            monitor.record_event(&format!("site{}.com", i), NetworkEventType::HttpRequest);
        }

        let summary = monitor.get_summary();

        // Should have an average interval calculated
        if summary.avg_request_interval_ms.is_some() {
            // With many quick requests, interval should be small
            let interval = summary.avg_request_interval_ms.unwrap();
            // Just verify it's a reasonable value (not testing exact timing)
            assert!(interval < 10000); // Less than 10 seconds
        }
    }

    // =========================================================================
    // Serialization Tests
    // =========================================================================

    #[test]
    fn test_network_summary_serialization() {
        let mut summary = NetworkSummary::default();
        summary.total_requests = 5;
        summary.chess_api_requests = 2;
        summary.websocket_connections = 1;
        summary.requests_by_domain.insert("lichess.org".to_string(), 2);
        summary.monitoring_started = 1000;
        summary.monitoring_ended = 2000;
        summary.avg_request_interval_ms = Some(200);

        let json = serde_json::to_string(&summary).expect("Serialization failed");
        let deserialized: NetworkSummary =
            serde_json::from_str(&json).expect("Deserialization failed");

        assert_eq!(deserialized.total_requests, summary.total_requests);
        assert_eq!(deserialized.chess_api_requests, summary.chess_api_requests);
        assert_eq!(deserialized.websocket_connections, summary.websocket_connections);
        assert_eq!(deserialized.monitoring_started, summary.monitoring_started);
        assert_eq!(deserialized.monitoring_ended, summary.monitoring_ended);
        assert_eq!(deserialized.avg_request_interval_ms, summary.avg_request_interval_ms);
    }

    #[test]
    fn test_network_event_serialization() {
        let event = NetworkEvent {
            timestamp: 12345,
            domain: "lichess.org".to_string(),
            is_chess_related: true,
            event_type: NetworkEventType::HttpRequest,
        };

        let json = serde_json::to_string(&event).expect("Serialization failed");
        let deserialized: NetworkEvent =
            serde_json::from_str(&json).expect("Deserialization failed");

        assert_eq!(deserialized.timestamp, event.timestamp);
        assert_eq!(deserialized.domain, event.domain);
        assert_eq!(deserialized.is_chess_related, event.is_chess_related);
        assert_eq!(deserialized.event_type, event.event_type);
    }

    #[test]
    fn test_network_event_type_serialization() {
        let event_types = vec![
            NetworkEventType::HttpRequest,
            NetworkEventType::WebSocketOpen,
            NetworkEventType::WebSocketClose,
            NetworkEventType::DnsLookup,
            NetworkEventType::Other,
        ];

        for event_type in event_types {
            let json = serde_json::to_string(&event_type).expect("Serialization failed");
            let deserialized: NetworkEventType =
                serde_json::from_str(&json).expect("Deserialization failed");
            assert_eq!(deserialized, event_type);
        }
    }

    // =========================================================================
    // Edge Case Tests
    // =========================================================================

    #[test]
    fn test_empty_domain() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("", NetworkEventType::HttpRequest);

        assert_eq!(monitor.get_events().len(), 1);
        assert_eq!(monitor.get_events()[0].domain, "");
        assert!(!monitor.get_events()[0].is_chess_related);
    }

    #[test]
    fn test_long_domain() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        let long_domain = "a".repeat(1000) + ".com";
        monitor.record_event(&long_domain, NetworkEventType::HttpRequest);

        assert_eq!(monitor.get_events().len(), 1);
        assert_eq!(monitor.get_events()[0].domain.len(), 1004);
    }

    #[test]
    fn test_special_characters_in_domain() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        monitor.record_event("test-site.co.uk", NetworkEventType::HttpRequest);
        monitor.record_event("sub.domain.example.com", NetworkEventType::HttpRequest);

        assert_eq!(monitor.get_events().len(), 2);
    }

    #[test]
    fn test_many_events() {
        let mut monitor = NetworkMonitor::new();
        monitor.start_monitoring();

        // Record many events
        for i in 0..1000 {
            monitor.record_event(&format!("site{}.com", i), NetworkEventType::HttpRequest);
        }

        assert_eq!(monitor.total_requests, 1000);
        assert_eq!(monitor.get_events().len(), 1000);
    }

    #[test]
    fn test_utility_current_timestamp_ms() {
        let ts1 = current_timestamp_ms();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let ts2 = current_timestamp_ms();

        assert!(ts2 > ts1);
        assert!(ts2 - ts1 >= 5);
    }
}
