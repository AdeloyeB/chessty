/**
 * Rate Limiting Service
 *
 * Provides in-memory rate limiting for various endpoints.
 * Uses a sliding window algorithm for accurate rate limiting.
 *
 * For production with multiple server instances, replace with
 * Redis-backed rate limiting (e.g., rate-limiter-flexible with Redis).
 */

interface RateLimitEntry {
  timestamps: number[];
  blockedUntil?: number;
}

interface RateLimitConfig {
  points: number;        // Number of allowed requests
  duration: number;      // Time window in seconds
  blockDuration?: number; // Block duration in seconds if exceeded
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;
  private cleanupInterval: Timer;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Attempt to consume a point for the given key.
   * @returns true if allowed, false if rate limited
   */
  consume(key: string): { allowed: boolean; remainingPoints: number; retryAfter?: number } {
    const now = Date.now();
    const windowStart = now - this.config.duration * 1000;

    let entry = this.store.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Check if blocked
    if (entry.blockedUntil && entry.blockedUntil > now) {
      return {
        allowed: false,
        remainingPoints: 0,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }

    // Clear block if expired
    if (entry.blockedUntil && entry.blockedUntil <= now) {
      entry.blockedUntil = undefined;
      entry.timestamps = [];
    }

    // Filter timestamps within the current window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    // Check if limit exceeded
    if (entry.timestamps.length >= this.config.points) {
      // Block if blockDuration is configured
      if (this.config.blockDuration) {
        entry.blockedUntil = now + this.config.blockDuration * 1000;
        return {
          allowed: false,
          remainingPoints: 0,
          retryAfter: this.config.blockDuration,
        };
      }

      // Calculate retry after based on oldest timestamp in window
      const oldestTimestamp = entry.timestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + this.config.duration * 1000 - now) / 1000);

      return {
        allowed: false,
        remainingPoints: 0,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    // Add current timestamp
    entry.timestamps.push(now);

    return {
      allowed: true,
      remainingPoints: this.config.points - entry.timestamps.length,
    };
  }

  /**
   * Reset rate limit for a key (e.g., after successful login)
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Get remaining points for a key without consuming
   */
  getRemainingPoints(key: string): number {
    const now = Date.now();
    const windowStart = now - this.config.duration * 1000;
    const entry = this.store.get(key);

    if (!entry) {
      return this.config.points;
    }

    if (entry.blockedUntil && entry.blockedUntil > now) {
      return 0;
    }

    const validTimestamps = entry.timestamps.filter((ts) => ts > windowStart);
    return Math.max(0, this.config.points - validTimestamps.length);
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.duration * 1000;

    for (const [key, entry] of this.store.entries()) {
      // Remove if no recent timestamps and not blocked
      const hasRecentActivity = entry.timestamps.some((ts) => ts > windowStart);
      const isBlocked = entry.blockedUntil && entry.blockedUntil > now;

      if (!hasRecentActivity && !isBlocked) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stop(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Rate limiters for different endpoints
// Login: 5 attempts per 15 minutes, block for 30 minutes if exceeded
export const loginLimiter = new RateLimiter({
  points: 5,
  duration: 15 * 60, // 15 minutes
  blockDuration: 30 * 60, // 30 minute block
});

// Registration: 3 accounts per IP per hour
export const registerLimiter = new RateLimiter({
  points: 3,
  duration: 60 * 60, // 1 hour
  blockDuration: 60 * 60, // 1 hour block
});

// Betting: 10 bets per minute per user
export const betLimiter = new RateLimiter({
  points: 10,
  duration: 60, // 1 minute
});

// General API: 100 requests per minute per IP
export const apiLimiter = new RateLimiter({
  points: 100,
  duration: 60, // 1 minute
});

// WebSocket messages: 60 messages per minute per user
export const wsMessageLimiter = new RateLimiter({
  points: 60,
  duration: 60, // 1 minute
});

// Password reset: 3 attempts per hour per email
export const passwordResetLimiter = new RateLimiter({
  points: 3,
  duration: 60 * 60, // 1 hour
  blockDuration: 60 * 60, // 1 hour block
});

/**
 * Create a rate limit response
 */
export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
      },
    }
  );
}

/**
 * Extract client IP from request
 * Handles common proxy headers
 */
export function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a generic identifier
  return 'unknown';
}

export { RateLimiter };
