/**
 * Tests for Circuit Breaker pattern
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { CircuitBreaker } from './circuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 100, // 100ms for faster tests
      name: 'TestBreaker',
    });
  });

  test('should start in closed state', () => {
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(0);
  });

  test('should allow successful operations', async () => {
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('closed');
  });

  test('should count failures', async () => {
    try {
      await breaker.execute(async () => {
        throw new Error('fail');
      });
    } catch {
      // Expected
    }

    expect(breaker.getFailureCount()).toBe(1);
    expect(breaker.getState()).toBe('closed');
  });

  test('should open after failure threshold', async () => {
    // Trigger 3 failures
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }
    }

    expect(breaker.getState()).toBe('open');
  });

  test('should reject requests when open', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }
    }

    // Should reject without calling the operation
    let rejected = false;
    try {
      await breaker.execute(async () => 'should not run');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Circuit is open')) {
        rejected = true;
      }
    }

    expect(rejected).toBe(true);
  });

  test('should use fallback when open', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }
    }

    // Should use fallback
    const result = await breaker.execute(
      async () => 'should not run',
      () => 'fallback-value'
    );

    expect(result).toBe('fallback-value');
  });

  test('should transition to half-open after reset timeout', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }
    }

    expect(breaker.getState()).toBe('open');

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Next request should probe (half-open state)
    const result = await breaker.execute(async () => 'probe-success');

    expect(result).toBe('probe-success');
    expect(breaker.getState()).toBe('closed');
  });

  test('should return to open if probe fails', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Probe should fail
    try {
      await breaker.execute(async () => {
        throw new Error('probe-fail');
      });
    } catch {
      // Expected
    }

    expect(breaker.getState()).toBe('open');
  });

  test('should reset failure count on success', async () => {
    // Cause some failures (but not enough to open)
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }
    }

    expect(breaker.getFailureCount()).toBe(2);

    // Successful request should reset count
    await breaker.execute(async () => 'success');

    expect(breaker.getFailureCount()).toBe(0);
  });

  test('should support manual reset', () => {
    // Set some failure state
    breaker.reset();

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(0);
  });
});
