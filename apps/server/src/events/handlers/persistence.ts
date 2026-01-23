import type { GameEventEmitter } from '../GameEventEmitter';
import * as gameService from '../../services/game';

/**
 * Persistence handler - priority 10, blocking
 * Ensures database writes happen before broadcasts.
 */
export function registerPersistenceHandlers(events: GameEventEmitter) {
  // game:move_made -> persist move to database
  events.on(
    'game:move_made',
    async (payload) => {
      await gameService.makeMove(
        payload.gameId,
        payload.move,
        payload.fen,
        payload.pgn,
        Math.floor(payload.whiteTime),
        Math.floor(payload.blackTime)
      );
    },
    { priority: 10, nonBlocking: false, label: 'persistence:move_made' }
  );

  // game:ended is already handled by GameCoordinator calling gameService.endGame()
  // so no persistence handler needed here for that event.
}
