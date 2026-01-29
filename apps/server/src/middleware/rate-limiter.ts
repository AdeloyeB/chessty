/**
 * Rate Limiter Middleware
 * =======================
 * Prevents abuse by limiting requests per user/IP within a time window.
 *
 * IMPLEMENTATION:
 * Uses in-memory LRU cache with sliding window algorithm.
 * For horizontal scaling, replace with Redis.
 */

/**
 * Simple LRU Cache implementation.
 * Evicts least recently used entries when capacity is reached.
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed in window */
  maxRequests: number;
  /** Cache size - max tracked keys (default: 10000) */
  cacheSize?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Timestamp when the window resets */
  resetAt: number;
}

/**
 * Rate limiter using sliding window algorithm.
 *
 * @example
 * const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 10 });
 * const result = limiter.check(userId);
 * if (!result.allowed) {
 *   return rateLimitResponse(result);
 * }
 */
export class RateLimiter {
  private cache: LRUCache<string, RateLimitEntry>;
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(config: RateLimitConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.cache = new LRUCache(config.cacheSize ?? 10000);
  }

  /**
   * Check if a request should be allowed.
   * @param key - Unique identifier (usually userId or IP)
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = this.cache.get(key);

    // Reset if window expired
    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { count: 0, windowStart: now };
    }

    entry.count++;
    this.cache.set(key, entry);

    const resetAt = entry.windowStart + this.windowMs;
    const remaining = Math.max(0, this.maxRequests - entry.count);

    return {
      allowed: entry.count <= this.maxRequests,
      remaining,
      resetAt,
    };
  }

  /**
   * Reset the rate limit for a key.
   */
  reset(key: string): void {
    this.cache.delete(key);
  }
}

// Pre-configured limiters for Arbiter Overwatch endpoints
export const OVERWATCH_RATE_LIMITERS = {
  /** Verdict submission: 10 per minute */
  verdict: new RateLimiter({ windowMs: 60_000, maxRequests: 10 }),
  /** Enrollment: 3 per hour */
  enroll: new RateLimiter({ windowMs: 3600_000, maxRequests: 3 }),
  /** Get cases list: 30 per minute */
  getCases: new RateLimiter({ windowMs: 60_000, maxRequests: 30 }),
  /** Get single case: 20 per minute */
  getCase: new RateLimiter({ windowMs: 60_000, maxRequests: 20 }),
} as const;

/**
 * Create a 429 Too Many Requests response.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

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
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt.toString(),
        'Retry-After': retryAfter.toString(),
      },
    }
  );
}

/**
 * Helper to extract client IP from request.
 */
export function getClientIP(req: Request): string {
  // Check common proxy headers
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback - in production this should come from the server
  return 'unknown';
}
