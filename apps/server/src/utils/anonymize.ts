/**
 * Player Anonymization Utility
 * ============================
 * Generates irreversible but deterministic anonymous player IDs.
 *
 * WHY THIS EXISTS:
 * Jurors reviewing cases should not be able to identify players.
 * The anonymized ID must be:
 * 1. Deterministic - same input always produces same output
 * 2. Irreversible - cannot derive original player ID from anonymous ID
 * 3. Unique per case - same player has different IDs in different cases
 */

import { createHmac } from 'crypto';

/**
 * Get the anonymization secret from environment.
 * This should be a long, random string stored securely.
 */
function getAnonymizationSecret(): string {
  const secret = process.env.ANONYMIZATION_SECRET;

  if (!secret) {
    // In development, use a fallback (but warn)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Anonymize] ANONYMIZATION_SECRET not set, using insecure fallback');
      return 'dev-fallback-secret-do-not-use-in-production';
    }
    throw new Error('ANONYMIZATION_SECRET environment variable is required');
  }

  if (secret.length < 32) {
    console.warn('[Anonymize] ANONYMIZATION_SECRET should be at least 32 characters');
  }

  return secret;
}

/**
 * Generate an irreversible anonymous player ID.
 *
 * The ID is deterministic for a given (caseId, playerId) pair,
 * allowing consistent references within a case review, but cannot
 * be reversed to obtain the original player ID.
 *
 * @param caseId - The jury case ID
 * @param playerId - The real player ID to anonymize
 * @returns Anonymous ID like "Player_a3f8c2d1"
 *
 * @example
 * const anonId = anonymizePlayerId('case-123', 'user-456');
 * // Returns: "Player_a3f8c2d1" (consistent for same inputs)
 */
export function anonymizePlayerId(caseId: string, playerId: string): string {
  const secret = getAnonymizationSecret();

  // HMAC-SHA256 produces a cryptographically secure hash
  // that cannot be reversed without knowing the secret
  const hash = createHmac('sha256', secret)
    .update(`${caseId}:${playerId}`)
    .digest('hex')
    .slice(0, 8); // Take first 8 chars for readability

  return `Player_${hash}`;
}

/**
 * Generate anonymous IDs for multiple players in a case.
 * Useful when anonymizing both players in a game.
 *
 * @param caseId - The jury case ID
 * @param playerIds - Array of player IDs to anonymize
 * @returns Map of original ID to anonymous ID
 */
export function anonymizePlayers(
  caseId: string,
  playerIds: string[]
): Map<string, string> {
  const result = new Map<string, string>();

  for (const playerId of playerIds) {
    result.set(playerId, anonymizePlayerId(caseId, playerId));
  }

  return result;
}

/**
 * Check if an ID looks like an anonymized player ID.
 * Useful for validation.
 *
 * @param id - ID to check
 * @returns Whether it matches the anonymous ID format
 */
export function isAnonymizedId(id: string): boolean {
  return /^Player_[a-f0-9]{8}$/.test(id);
}

/**
 * Generate a hash for any sensitive data that needs to be compared
 * but not stored in plain text.
 *
 * @param data - Data to hash
 * @param salt - Optional additional salt
 * @returns Hex hash string
 */
export function hashSensitiveData(data: string, salt?: string): string {
  const secret = getAnonymizationSecret();
  const input = salt ? `${salt}:${data}` : data;

  return createHmac('sha256', secret)
    .update(input)
    .digest('hex');
}
