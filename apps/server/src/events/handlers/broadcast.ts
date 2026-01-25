import type { GameEventEmitter } from '../GameEventEmitter';
import type { BroadcastService } from '../../websocket/BroadcastService';
import type {
  GameMovePayloadServer,
  ClockUpdatePayload,
  GameEndedPayload,
  AchievementUnlockedPayload,
} from '@chess-game/shared';

/**
 * Broadcast handler - priority 50
 * Sends WebSocket messages to players and spectators in response to game events.
 */
export function registerBroadcastHandlers(events: GameEventEmitter, broadcast: BroadcastService) {
  // game:move_made -> broadcast move to players and spectators
  events.on(
    'game:move_made',
    (payload) => {
      const movePayload: GameMovePayloadServer = {
        gameId: payload.gameId,
        move: payload.move,
        whiteTimeRemaining: Math.floor(payload.whiteTime),
        blackTimeRemaining: Math.floor(payload.blackTime),
      };

      broadcast.broadcastToGame(payload.gameId, 'game:move_made', movePayload);
      broadcast.broadcastToSpectators(payload.gameId, 'game:move_made', movePayload);
    },
    { priority: 50, label: 'broadcast:move_made' }
  );

  // game:ended -> broadcast game ended to players and spectators
  events.on(
    'game:ended',
    (payload) => {
      const endPayload: GameEndedPayload = {
        gameId: payload.gameId,
        result: payload.result as any,
        winnerId: payload.winnerId,
        whiteEloChange: payload.eloChanges.whiteChange,
        blackEloChange: payload.eloChanges.blackChange,
      };

      broadcast.broadcastToGame(payload.gameId, 'game:ended', endPayload);
      broadcast.broadcastToSpectators(payload.gameId, 'game:ended', endPayload);
    },
    { priority: 50, label: 'broadcast:game_ended' }
  );

  // clock:tick -> broadcast clock update to players and spectators
  events.on(
    'clock:tick',
    (payload) => {
      const clockPayload: ClockUpdatePayload = {
        gameId: payload.gameId,
        whiteTimeRemaining: Math.floor(payload.whiteTime),
        blackTimeRemaining: Math.floor(payload.blackTime),
      };

      broadcast.broadcastToGame(payload.gameId, 'game:clock_update', clockPayload);
      broadcast.broadcastToSpectators(payload.gameId, 'game:clock_update', clockPayload);
    },
    { priority: 50, label: 'broadcast:clock_tick' }
  );

  // game:draw_offered -> send draw offer to opponent
  events.on(
    'game:draw_offered',
    (payload) => {
      broadcast.sendToUser(payload.opponentId, 'game:draw_offered', {
        gameId: payload.gameId,
        offeredBy: payload.offeredBy,
      });
    },
    { priority: 50, label: 'broadcast:draw_offered' }
  );

  // game:draw_declined -> notify offerer
  events.on(
    'game:draw_declined',
    (payload) => {
      broadcast.sendToUser(payload.offeredBy, 'game:draw_declined', {
        gameId: payload.gameId,
      });
    },
    { priority: 50, label: 'broadcast:draw_declined' }
  );

  // Challenge events -> broadcast challenge list updates
  events.on(
    'challenge:created',
    () => {
      broadcast.broadcastChallengeList();
    },
    { priority: 50, label: 'broadcast:challenge_created' }
  );

  events.on(
    'challenge:accepted',
    () => {
      broadcast.broadcastChallengeList();
    },
    { priority: 50, label: 'broadcast:challenge_accepted' }
  );

  events.on(
    'challenge:confirmed',
    () => {
      broadcast.broadcastChallengeList();
    },
    { priority: 50, label: 'broadcast:challenge_confirmed' }
  );

  events.on(
    'challenge:cancelled',
    () => {
      broadcast.broadcastChallengeList();
    },
    { priority: 50, label: 'broadcast:challenge_cancelled' }
  );

  events.on(
    'challenge:expired',
    () => {
      broadcast.broadcastChallengeList();
    },
    { priority: 50, label: 'broadcast:challenge_expired' }
  );

  // achievement:unlocked -> send to the user who unlocked them
  events.on(
    'achievement:unlocked',
    (payload) => {
      const achievementPayload: AchievementUnlockedPayload = {
        achievements: payload.achievements.map((a) => ({
          ...a,
          unlockedAt: a.unlockedAt.toISOString(),
        })),
      };

      broadcast.sendToUser(payload.userId, 'achievement:unlocked', achievementPayload);
    },
    { priority: 50, label: 'broadcast:achievement_unlocked' }
  );
}
