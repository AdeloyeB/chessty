/**
 * WebSocket Message Validation (C5 FIX)
 *
 * Zod schemas for all client→server WebSocket message payloads.
 * Every incoming WebSocket message is validated BEFORE being processed.
 *
 * Why this matters:
 * Without validation, handler.ts uses `as any` type casts, meaning the server
 * trusts whatever the client sends. An attacker could send malformed payloads
 * (wrong types, missing fields, SQL injection in strings) that bypass business logic.
 *
 * With Zod validation, every field is checked at runtime before reaching game logic.
 */

import { z } from 'zod';

// Common validators
const gameIdSchema = z.string().uuid('Invalid game ID format');
const userIdSchema = z.string().min(1).max(100);
const challengeIdSchema = z.string().uuid('Invalid challenge ID format');

// --- Client → Server Payloads ---

/** game:join */
export const GameJoinPayloadSchema = z.object({
  gameId: gameIdSchema,
});

/** game:move — the core chess move payload */
export const GameMovePayloadSchema = z.object({
  gameId: gameIdSchema,
  from: z.string().regex(/^[a-h][1-8]$/, 'Invalid square'),
  to: z.string().regex(/^[a-h][1-8]$/, 'Invalid square'),
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
});

/** queue:join */
export const QueueJoinPayloadSchema = z.object({
  wagerAmount: z.number().positive().max(10000),
  timeControl: z.object({
    initial: z.number().int().positive().max(10800), // max 3 hours
    increment: z.number().int().min(0).max(60),
  }),
  minElo: z.number().int().min(0).max(4000).optional(),
  maxElo: z.number().int().min(0).max(4000).optional(),
});

/** spectate:join */
export const SpectateJoinPayloadSchema = z.object({
  gameId: gameIdSchema,
});

/** spectate:leave — gameId is optional for backward compatibility */
export const SpectateLeavePayloadSchema = z.object({
  gameId: gameIdSchema.optional(),
});

/** bet:place */
export const BetPlacePayloadSchema = z.object({
  gameId: gameIdSchema,
  betOnPlayerId: userIdSchema,
  amount: z.number().positive().max(10000),
});

/** challenge:create */
export const ChallengeCreatePayloadSchema = z.object({
  gameMode: z.enum(['standard', 'chess960']),
  timeControlKey: z.string().min(1).max(50),
  wagerAmount: z.number().positive().max(10000),
  minElo: z.number().int().min(0).max(4000).optional(),
  maxElo: z.number().int().min(0).max(4000).optional(),
});

/** challenge:cancel / challenge:accept / challenge:confirm / challenge:decline */
export const ChallengeIdPayloadSchema = z.object({
  challengeId: challengeIdSchema,
});

/** spectator:chat_send */
export const SpectatorChatSendPayloadSchema = z.object({
  gameId: gameIdSchema,
  message: z.string().min(1).max(500).trim(),
});

/** spectator:prediction_create */
export const SpectatorPredictionCreatePayloadSchema = z.object({
  gameId: gameIdSchema,
  predictedWinnerId: userIdSchema,
  amount: z.number().positive().max(10000),
});

/** spectator:prediction_accept */
export const SpectatorPredictionAcceptPayloadSchema = z.object({
  predictionId: z.string().uuid('Invalid prediction ID'),
});

/**
 * Map of message type → Zod schema for its payload.
 * Messages not listed here have no payload (e.g. game:leave, queue:leave, ping).
 */
export const PAYLOAD_SCHEMAS: Partial<Record<string, z.ZodType>> = {
  'game:join': GameJoinPayloadSchema,
  'game:move': GameMovePayloadSchema,
  'queue:join': QueueJoinPayloadSchema,
  'spectate:join': SpectateJoinPayloadSchema,
  'spectate:leave': SpectateLeavePayloadSchema,
  'bet:place': BetPlacePayloadSchema,
  'challenge:create': ChallengeCreatePayloadSchema,
  'challenge:cancel': ChallengeIdPayloadSchema,
  'challenge:accept': ChallengeIdPayloadSchema,
  'challenge:confirm': ChallengeIdPayloadSchema,
  'challenge:decline': ChallengeIdPayloadSchema,
  'spectator:chat_send': SpectatorChatSendPayloadSchema,
  'spectator:prediction_create': SpectatorPredictionCreatePayloadSchema,
  'spectator:prediction_accept': SpectatorPredictionAcceptPayloadSchema,
};

/**
 * Validate a WebSocket message payload against its schema.
 * Returns the validated (cleaned) payload, or an error string.
 */
export function validatePayload(
  type: string,
  payload: unknown
): { valid: true; data: unknown } | { valid: false; error: string } {
  const schema = PAYLOAD_SCHEMAS[type];

  // No schema = no payload expected (game:leave, queue:leave, ping, etc.)
  if (!schema) {
    return { valid: true, data: payload ?? {} };
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    // Return a concise error — don't leak schema details to attackers
    const firstError = result.error.issues[0];
    return {
      valid: false,
      error: `Invalid ${type} payload: ${firstError?.path.join('.')} — ${firstError?.message}`,
    };
  }

  return { valid: true, data: result.data };
}
