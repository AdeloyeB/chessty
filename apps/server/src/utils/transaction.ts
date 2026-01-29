/**
 * Transaction Utility
 * ===================
 *
 * Provides a wrapper for database transactions with proper error handling
 * and row locking support for fund operations.
 *
 * WHY WE NEED THIS:
 * In a real-money platform, concurrent operations on the same settlement
 * can cause race conditions. For example, if a jury verdict and timeout
 * both try to resolve the same dispute at the same time, we could:
 * - Pay the same funds twice (double-spend)
 * - Leave funds stuck in limbo
 * - Corrupt the settlement state
 *
 * WHAT THIS DOES:
 * 1. Wraps all database operations in a transaction (all-or-nothing)
 * 2. Uses SELECT FOR UPDATE to lock rows being modified
 * 3. Provides consistent error handling
 * 4. Prevents internal state from leaking in error messages
 */

import { db } from '../drizzle';

/**
 * Custom error class for transaction failures.
 * This allows callers to distinguish transaction errors from other errors.
 */
export class TransactionError extends Error {
  public readonly originalError?: Error;
  public readonly code: string;

  constructor(message: string, code: string = 'TRANSACTION_ERROR', originalError?: Error) {
    super(message);
    this.name = 'TransactionError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Type for the transaction callback function.
 *
 * The `tx` parameter is the transaction object from Drizzle.
 * Use it instead of `db` for all queries inside the transaction.
 */
export type TransactionCallback<T> = (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
) => Promise<T>;

/**
 * Execute a function within a database transaction.
 *
 * USAGE:
 * ```typescript
 * await withTransaction(async (tx) => {
 *   // Use tx instead of db for all queries
 *   const settlement = await tx.query.settlements.findFirst({
 *     where: eq(settlements.id, settlementId),
 *   });
 *
 *   // All operations here are atomic
 *   await tx.update(settlements).set({ ... }).where(...);
 * });
 * ```
 *
 * ROW LOCKING:
 * For operations that modify funds or sensitive state, use SELECT FOR UPDATE:
 * ```typescript
 * await withTransaction(async (tx) => {
 *   // Lock the row to prevent concurrent modifications
 *   const [settlement] = await tx.execute(sql`
 *     SELECT * FROM settlements WHERE id = ${settlementId} FOR UPDATE
 *   `);
 *
 *   // Now safe to modify - other transactions will wait
 *   await tx.update(settlements).set({ ... }).where(...);
 * });
 * ```
 *
 * @param callback - Function to execute within the transaction
 * @returns The result of the callback function
 * @throws TransactionError if the transaction fails
 */
export async function withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
  try {
    return await db.transaction(callback);
  } catch (error) {
    // Log the full error for debugging (but don't expose to users)
    console.error('[Transaction] Failed:', error);

    // Wrap in TransactionError with sanitized message
    if (error instanceof TransactionError) {
      throw error;
    }

    // Check for specific PostgreSQL error codes
    const pgError = error as { code?: string; constraint?: string };

    if (pgError.code === '23505') {
      // Unique constraint violation
      throw new TransactionError(
        'Operation conflicts with existing data',
        'CONSTRAINT_VIOLATION',
        error instanceof Error ? error : undefined
      );
    }

    if (pgError.code === '40001') {
      // Serialization failure (concurrent transaction conflict)
      throw new TransactionError(
        'Operation was interrupted by a concurrent update. Please retry.',
        'CONCURRENT_UPDATE',
        error instanceof Error ? error : undefined
      );
    }

    if (pgError.code === '40P01') {
      // Deadlock detected
      throw new TransactionError(
        'Operation was interrupted. Please retry.',
        'DEADLOCK',
        error instanceof Error ? error : undefined
      );
    }

    // Generic transaction failure
    throw new TransactionError(
      'Operation failed. Please try again.',
      'TRANSACTION_FAILED',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Execute a function with retry logic for transient failures.
 *
 * Some transaction failures (like deadlocks or serialization failures)
 * can be safely retried. This wrapper handles that automatically.
 *
 * @param callback - Function to execute within the transaction
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns The result of the callback function
 * @throws TransactionError if all retries fail
 */
export async function withRetryableTransaction<T>(
  callback: TransactionCallback<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: TransactionError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTransaction(callback);
    } catch (error) {
      if (!(error instanceof TransactionError)) {
        throw error;
      }

      lastError = error;

      // Only retry for specific transient errors
      const retryableCodes = ['CONCURRENT_UPDATE', 'DEADLOCK'];
      if (!retryableCodes.includes(error.code)) {
        throw error;
      }

      // Log retry attempt
      console.warn(
        `[Transaction] Retry attempt ${attempt}/${maxRetries} after ${error.code}`
      );

      // Exponential backoff: 50ms, 100ms, 200ms...
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw lastError || new TransactionError('Transaction failed after retries', 'RETRY_EXHAUSTED');
}
