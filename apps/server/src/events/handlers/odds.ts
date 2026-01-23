import type { GameEventEmitter } from '../GameEventEmitter';
import type { BroadcastService } from '../../websocket/BroadcastService';
import * as bettingService from '../../services/betting';
import type { OddsUpdatePayload } from '@chess-game/shared';

/**
 * Odds handler - priority 100, nonBlocking
 * Recalculates and broadcasts odds to spectators after each move.
 */
export function registerOddsHandlers(events: GameEventEmitter, broadcast: BroadcastService) {
  events.on(
    'game:move_made',
    async (payload) => {
      const odds = await bettingService.getGameOdds(payload.gameId);
      const oddsPayload: OddsUpdatePayload = {
        gameId: payload.gameId,
        whiteOdds: odds.whiteOdds,
        blackOdds: odds.blackOdds,
      };

      broadcast.broadcastToSpectators(payload.gameId, 'odds:updated', oddsPayload);
    },
    { priority: 100, nonBlocking: true, label: 'odds:move_made' }
  );
}
