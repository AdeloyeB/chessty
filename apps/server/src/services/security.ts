/**
 * Security Service
 *
 * Provides security headers and middleware for protecting against common web attacks:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME-type sniffing
 * - Protocol downgrade attacks
 * - Information disclosure
 */

interface SecurityHeadersConfig {
  /** Enable HSTS (HTTP Strict Transport Security) - only enable in production with HTTPS */
  enableHSTS?: boolean;
  /** Content Security Policy directives */
  csp?: {
    defaultSrc?: string[];
    scriptSrc?: string[];
    styleSrc?: string[];
    imgSrc?: string[];
    connectSrc?: string[];
    fontSrc?: string[];
    objectSrc?: string[];
    mediaSrc?: string[];
    frameSrc?: string[];
  };
  /** Additional custom headers */
  customHeaders?: Record<string, string>;
}

const defaultConfig: SecurityHeadersConfig = {
  enableHSTS: process.env.NODE_ENV === 'production',
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline often needed for CSS-in-JS
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'", 'wss:', 'ws:'], // WebSocket connections
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  },
};

/**
 * Build Content-Security-Policy header value
 */
function buildCSPHeader(csp: NonNullable<SecurityHeadersConfig['csp']>): string {
  const directives: string[] = [];

  if (csp.defaultSrc) {
    directives.push(`default-src ${csp.defaultSrc.join(' ')}`);
  }
  if (csp.scriptSrc) {
    directives.push(`script-src ${csp.scriptSrc.join(' ')}`);
  }
  if (csp.styleSrc) {
    directives.push(`style-src ${csp.styleSrc.join(' ')}`);
  }
  if (csp.imgSrc) {
    directives.push(`img-src ${csp.imgSrc.join(' ')}`);
  }
  if (csp.connectSrc) {
    directives.push(`connect-src ${csp.connectSrc.join(' ')}`);
  }
  if (csp.fontSrc) {
    directives.push(`font-src ${csp.fontSrc.join(' ')}`);
  }
  if (csp.objectSrc) {
    directives.push(`object-src ${csp.objectSrc.join(' ')}`);
  }
  if (csp.mediaSrc) {
    directives.push(`media-src ${csp.mediaSrc.join(' ')}`);
  }
  if (csp.frameSrc) {
    directives.push(`frame-src ${csp.frameSrc.join(' ')}`);
  }

  // Always add frame-ancestors to prevent clickjacking
  directives.push("frame-ancestors 'none'");

  return directives.join('; ');
}

/**
 * Get security headers for responses
 */
export function getSecurityHeaders(config: SecurityHeadersConfig = defaultConfig): Record<string, string> {
  const headers: Record<string, string> = {
    // Prevent MIME-type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Prevent clickjacking (legacy browsers)
    'X-Frame-Options': 'DENY',

    // Enable XSS filter in legacy browsers
    'X-XSS-Protection': '1; mode=block',

    // Control referrer information leakage
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Prevent sites from caching sensitive data
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',

    // Restrict browser features
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };

  // HSTS - only enable in production with HTTPS
  if (config.enableHSTS) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  // Content Security Policy
  if (config.csp) {
    headers['Content-Security-Policy'] = buildCSPHeader(config.csp);
  }

  // Add custom headers
  if (config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  return headers;
}

/**
 * Apply security headers to a response
 */
export function applySecurityHeaders(
  response: Response,
  config?: SecurityHeadersConfig
): Response {
  const securityHeaders = getSecurityHeaders(config);
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(securityHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Input sanitization helpers
 */
export const sanitize = {
  /**
   * Escape HTML special characters to prevent XSS
   */
  html(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  /**
   * Resolve a path canonically, collapsing traversal sequences.
   * Repeatedly resolves '..' segments until none remain (prevents ....// bypass).
   */
  path(input: string): string {
    // Normalize backslashes to forward slashes
    let normalized = input.replace(/\\/g, '/');
    // Remove dangerous characters
    normalized = normalized.replace(/[<>:"|?*]/g, '');
    // Collapse repeated slashes
    normalized = normalized.replace(/\/+/g, '/');

    // Resolve '..' by splitting into segments and walking
    const segments = normalized.split('/');
    const resolved: string[] = [];

    for (const segment of segments) {
      if (segment === '..') {
        resolved.pop(); // go up one level (or do nothing if at root)
      } else if (segment !== '.' && segment !== '') {
        resolved.push(segment);
      }
    }

    // Preserve leading slash if original had one
    const prefix = normalized.startsWith('/') ? '/' : '';
    return prefix + resolved.join('/');
  },

  /**
   * Validate and sanitize email format
   */
  email(input: string): string {
    // Basic email sanitization - remove potentially harmful characters
    return input.toLowerCase().trim().replace(/[<>]/g, '');
  },

  /**
   * Sanitize username - allow only alphanumeric, underscore, hyphen
   */
  username(input: string): string {
    return input.replace(/[^a-zA-Z0-9_-]/g, '');
  },
};

/**
 * Request validation helpers
 */
export const validate = {
  /**
   * Check if a string looks like a path traversal attempt
   */
  isPathTraversal(input: string): boolean {
    const patterns = [
      /\.\./,              // Parent directory
      /^\/etc\//i,         // Unix system files
      /^\/proc\//i,        // Linux proc filesystem
      /^[a-z]:\\/i,        // Windows drive letter
      /%2e%2e/i,           // URL encoded ..
      /%252e%252e/i,       // Double URL encoded ..
      /\\\.\\.\\/,         // Backslash traversal
    ];

    return patterns.some((pattern) => pattern.test(input));
  },

  /**
   * Check if content-type header matches expected type
   */
  contentType(req: Request, expected: string): boolean {
    const contentType = req.headers.get('content-type');
    if (!contentType) return false;
    return contentType.toLowerCase().includes(expected.toLowerCase());
  },

  /**
   * Validate request origin against allowed origins
   */
  origin(req: Request, allowedOrigins: string[]): boolean {
    const origin = req.headers.get('origin');
    if (!origin) return false;
    return allowedOrigins.includes(origin);
  },
};

/**
 * Bot detection helpers
 */
export const botDetection = {
  /**
   * Check if user-agent looks like a known bot
   */
  isKnownBot(userAgent: string | null): boolean {
    if (!userAgent) return false;

    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python-requests/i,
      /httpclient/i,
      /java\//i,
      /libwww/i,
    ];

    return botPatterns.some((pattern) => pattern.test(userAgent));
  },

  /**
   * Check if user-agent is suspiciously short or generic
   */
  isSuspiciousUserAgent(userAgent: string | null): boolean {
    if (!userAgent) return true;
    if (userAgent.length < 20) return true;
    if (userAgent === 'Mozilla/5.0') return true;
    return false;
  },
};

/**
 * Security logging helper
 */
export function logSecurityWarning(message: string, details?: Record<string, unknown>): void {
  console.warn(`[SECURITY] ${message}`, details ? JSON.stringify(details) : '');
}
