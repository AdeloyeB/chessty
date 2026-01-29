import type { GameEventEmitter } from '../GameEventEmitter';
import type { BroadcastService } from '../../websocket/BroadcastService';
import { registerBroadcastHandlers } from './broadcast';
import { registerPersistenceHandlers } from './persistence';
import { registerAchievementHandlers } from './achievements';
import { registerOddsHandlers } from './odds';
import { registerPredictionHandlers } from './predictions';
import { registerAnticheatHandlers } from './anticheat';

/**
 * Register all event handlers with the game event emitter.
 * Call this once at server startup.
 *
 * Handler priority order (lower runs first):
 * 1. Persistence (10) - Database writes must complete first
 * 2. Broadcast (50) - Send updates to players and spectators
 * 3. Odds (50) - Update betting odds
 * 4. Achievements (50) - Check for achievement unlocks
 * 5. Predictions (50) - Handle spectator predictions
 * 6. Anti-cheat (90) - Behavioral analysis (non-blocking)
 */
export function registerAllHandlers(events: GameEventEmitter, broadcast: BroadcastService) {
  // Core handlers - blocking, must complete
  registerPersistenceHandlers(events);

  // Feature handlers - mostly non-blocking
  registerBroadcastHandlers(events, broadcast);
  registerOddsHandlers(events, broadcast);
  registerAchievementHandlers(events);
  registerPredictionHandlers(events);

  // Anti-cheat - non-blocking, runs last
  registerAnticheatHandlers(events);
}
