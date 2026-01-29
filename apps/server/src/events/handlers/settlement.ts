/**
 * Settlement Event Handler
 * ========================
 *
 * Connects the settlement service to the game event system.
 * When a game ends, this handler triggers settlement processing.
 *
 * WHY THIS EXISTS:
 * The game.ts endGame() function handles immediate fund transfers, but
 * we also need to track settlements for anti-cheat integration. This handler:
 * 1. Creates a settlement record for audit/tracking
 * 2. Evaluates the game for cheating
 * 3. Creates overwatch cases if suspicion is detected
 *
 * DESIGN DECISIONS:
 * - NON-BLOCKING: Settlement processing runs after the game ends.
 *   Players see their results immediately; settlement happens in background.
 * - LOW PRIORITY: Runs after persistence and broadcast (priority 85).
 * - FIRE-AND-FORGET: Errors are logged but don't break the game flow.
 *
 * NOTE ON FUND FLOW:
 * Currently, endGame() in game.ts handles the actual fund transfer
 * (walletService.awardWinnings). The settlement service TRACKS this
 * but doesn't duplicate it. When we add blockchain integration, the
 * settlement service will take over fund distribution.
 *
 * For now, this handler focuses on:
 * - Creating settlement records for auditing
 * - Detecting suspicious games and creating overwatch cases
 * - Sending notifications about game status
 */

import type { GameEventEmitter } from '../GameEventEmitter';
import {
  processSettlement,
  notifyUnderReview,
} from '../../services/settlement';
// Future use: notifyWinner, getSettlementByGame - will be used when blockchain settlement is integrated

// ---------------------------------------------------------------------------
// Handler Registration
// ---------------------------------------------------------------------------

/**
 * Register settlement event handlers.
 *
 * @param events - The game event emitter
 */
export function registerSettlementHandlers(events: GameEventEmitter): void {
  // ---------------------------------------------------------------------------
  // Game Ended Handler
  // ---------------------------------------------------------------------------
  //
  // When a game ends, we create a settlement record and evaluate it.
  // This runs after persistence (priority 10) and most feature handlers (50).

  events.on(
    'game:ended',
    async (payload) => {
      try {
        // Determine winner and loser IDs
        const winnerId = payload.winnerId;
        let loserId: string | null = null;

        if (winnerId) {
          loserId = winnerId === payload.whitePlayerId
            ? payload.blackPlayerId
            : payload.whitePlayerId;
        }

        // Calculate total pot from wager
        // Note: payload.wagerAmount is per player, so total pot is 2x
        const totalPot = payload.wagerAmount * 2;

        // Process the settlement
        // This creates the record, evaluates suspicion, and takes action
        const settlement = await processSettlement(
          payload.gameId,
          winnerId,
          loserId,
          totalPot
        );

        // Send appropriate notifications based on settlement status
        if (settlement.status === 'settled' && winnerId) {
          // Clean game - notify winner (fund transfer already happened in game.ts)
          // This is informational since funds were already transferred
          // await notifyWinner(winnerId, settlement.winnerPayout!, payload.gameId);
          // Commented out: game.ts already handles winner notification through betting service
        } else if (settlement.status === 'disputed') {
          // Suspicious game - notify both players about review
          await notifyUnderReview(
            [payload.whitePlayerId, payload.blackPlayerId],
            payload.gameId
          );

          console.log(
            `[Settlement:Handler] Game ${payload.gameId} flagged for review ` +
            `(suspect: ${settlement.flaggedPlayerId}, score: ${settlement.suspicionScore})`
          );
        }

        console.log(
          `[Settlement:Handler] Processed settlement for game ${payload.gameId} ` +
          `(status: ${settlement.status})`
        );
      } catch (error) {
        // Log but don't throw - settlement errors shouldn't break game flow
        // The game already ended and funds were transferred in game.ts
        console.error(
          `[Settlement:Handler] Failed to process settlement for game ${payload.gameId}:`,
          error instanceof Error ? error.message : error
        );
      }
    },
    {
      priority: 85, // After persistence (10), broadcast (50), achievements (50)
      nonBlocking: true, // Don't block the game end
      label: 'settlement:game_ended',
    }
  );

  console.log('[Settlement] Event handlers registered');
}
