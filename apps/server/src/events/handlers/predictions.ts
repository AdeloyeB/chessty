import type { GameEventEmitter } from '../GameEventEmitter';
import * as spectatorPredictionService from '../../services/spectatorPrediction';

/**
 * Predictions handler - priority 100, nonBlocking
 * Settles spectator predictions when a game ends.
 */
export function registerPredictionHandlers(events: GameEventEmitter) {
  events.on(
    'game:ended',
    async (payload) => {
      await spectatorPredictionService.settlePredictionsForGame(
        payload.gameId,
        payload.winnerId
      );
    },
    { priority: 100, nonBlocking: true, label: 'predictions:game_ended' }
  );
}
