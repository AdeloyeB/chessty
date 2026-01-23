/**
 * Circuit Breaker for Redis operations.
 *
 * States:
 * - closed: normal operation, requests pass through
 * - open: too many failures, requests are rejected (or fallback used)
 * - half-open: after timeout, allows a single probe request
 *
 * Configuration:
 * - 5 consecutive failures -> open for 30 seconds -> half-open probe
 */

type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number; // ms
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000; // 30 seconds
    this.name = options.name ?? 'CircuitBreaker';
  }

  /**
   * Execute an operation through the circuit breaker.
   * If circuit is open and fallback is provided, the fallback is used.
   * If circuit is open and no fallback, throws an error.
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    if (this.state === 'open') {
      // Check if reset timeout has elapsed
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
        console.log(`[${this.name}] Transitioning to half-open state`);
      } else {
        // Circuit is still open
        if (fallback) {
          return fallback();
        }
        throw new Error(`[${this.name}] Circuit is open. Request rejected.`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      console.log(`[${this.name}] Probe succeeded. Transitioning to closed state.`);
    }
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Probe failed, go back to open
      this.state = 'open';
      console.log(`[${this.name}] Probe failed. Returning to open state.`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      console.log(
        `[${this.name}] Failure threshold (${this.failureThreshold}) reached. Circuit opened.`
      );
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get the current failure count.
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset the circuit breaker to closed state.
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
