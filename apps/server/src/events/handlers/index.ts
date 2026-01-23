import type { GameEventEmitter } from '../GameEventEmitter';
import type { BroadcastService } from '../../websocket/BroadcastService';
import { registerBroadcastHandlers } from './broadcast';
import { registerPersistenceHandlers } from './persistence';
import { registerAchievementHandlers } from './achievements';
import { registerOddsHandlers } from './odds';
import { registerPredictionHandlers } from './predictions';

/**
 * Register all event handlers with the game event emitter.
 * Call this once at server startup.
 */
export function registerAllHandlers(events: GameEventEmitter, broadcast: BroadcastService) {
  registerPersistenceHandlers(events);
  registerBroadcastHandlers(events, broadcast);
  registerOddsHandlers(events, broadcast);
  registerAchievementHandlers(events);
  registerPredictionHandlers(events);
}
