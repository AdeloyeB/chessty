/**
 * Tests for broadcast.ts event handlers
 *
 * These tests verify that the broadcast handlers correctly send WebSocket
 * messages to players and spectators in response to game events.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { GameEventEmitter } from '../GameEventEmitter';
import { registerBroadcastHandlers } from './broadcast';
import type { BroadcastService } from '../../websocket/BroadcastService';
import type { Move, AchievementCategory } from '@chess-game/shared';

// Create a mock BroadcastService
function createMockBroadcastService(): BroadcastService & {
  calls: {
    broadcastToGame: Array<{ gameId: string; event: string; payload: unknown }>;
    broadcastToSpectators: Array<{ gameId: string; event: string; payload: unknown }>;
    sendToUser: Array<{ userId: string; event: string; payload: unknown }>;
    broadcastChallengeList: number;
  };
} {
  const calls = {
    broadcastToGame: [] as Array<{ gameId: string; event: string; payload: unknown }>,
    broadcastToSpectators: [] as Array<{ gameId: string; event: string; payload: unknown }>,
    sendToUser: [] as Array<{ userId: string; event: string; payload: unknown }>,
    broadcastChallengeList: 0,
  };

  return {
    calls,
    broadcastToGame: (gameId: string, event: string, payload: unknown) => {
      calls.broadcastToGame.push({ gameId, event, payload });
    },
    broadcastToSpectators: (gameId: string, event: string, payload: unknown) => {
      calls.broadcastToSpectators.push({ gameId, event, payload });
    },
    sendToUser: (userId: string, event: string, payload: unknown) => {
      calls.sendToUser.push({ userId, event, payload });
    },
    broadcastChallengeList: () => {
      calls.broadcastChallengeList++;
    },
  } as any;
}

// Helper to create a valid Move object
function createMove(overrides: Partial<Move> = {}): Move {
  return {
    from: 'e2',
    to: 'e4',
    san: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('broadcast.ts event handlers', () => {
  let events: GameEventEmitter;
  let broadcast: ReturnType<typeof createMockBroadcastService>;

  beforeEach(() => {
    events = new GameEventEmitter();
    broadcast = createMockBroadcastService();
    registerBroadcastHandlers(events, broadcast);
  });

  describe('game:move_made', () => {
    const testMove = createMove();

    const movePayload = {
      gameId: 'game-123',
      playerId: 'player-1',
      move: testMove,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      pgn: '1. e4',
      whiteTime: 295.5,
      blackTime: 300,
      isGameOver: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
    };

    test('should broadcast to both players', async () => {
      await events.emit('game:move_made', movePayload);

      expect(broadcast.calls.broadcastToGame.length).toBe(1);
      expect(broadcast.calls.broadcastToGame[0].gameId).toBe('game-123');
      expect(broadcast.calls.broadcastToGame[0].event).toBe('game:move_made');
    });

    test('should broadcast to spectators', async () => {
      await events.emit('game:move_made', movePayload);

      expect(broadcast.calls.broadcastToSpectators.length).toBe(1);
      expect(broadcast.calls.broadcastToSpectators[0].gameId).toBe('game-123');
      expect(broadcast.calls.broadcastToSpectators[0].event).toBe('game:move_made');
    });

    test('should include correct move payload with floored times', async () => {
      await events.emit('game:move_made', movePayload);

      const sentPayload = broadcast.calls.broadcastToGame[0].payload as any;
      expect(sentPayload.gameId).toBe('game-123');
      expect(sentPayload.move).toEqual(testMove);
      // Times should be floored to integers
      expect(sentPayload.whiteTimeRemaining).toBe(295);
      expect(sentPayload.blackTimeRemaining).toBe(300);
    });
  });

  describe('game:ended', () => {
    const endPayload = {
      gameId: 'game-123',
      result: 'checkmate',
      winnerId: 'player-1',
      whitePlayerId: 'player-1',
      blackPlayerId: 'player-2',
      whiteEloAtStart: 1200,
      blackEloAtStart: 1180,
      moveCount: 35,
      wagerAmount: 10,
      eloChanges: {
        whiteChange: 15,
        blackChange: -15,
      },
    };

    test('should broadcast final result to all participants', async () => {
      await events.emit('game:ended', endPayload);

      expect(broadcast.calls.broadcastToGame.length).toBe(1);
      expect(broadcast.calls.broadcastToSpectators.length).toBe(1);
    });

    test('should include ELO changes in payload', async () => {
      await events.emit('game:ended', endPayload);

      const sentPayload = broadcast.calls.broadcastToGame[0].payload as any;
      expect(sentPayload.whiteEloChange).toBe(15);
      expect(sentPayload.blackEloChange).toBe(-15);
      expect(sentPayload.winnerId).toBe('player-1');
    });
  });

  describe('clock:tick', () => {
    test('should broadcast clock updates to game and spectators', async () => {
      const clockPayload = {
        gameId: 'game-123',
        whiteTime: 280.3,
        blackTime: 295.7,
      };

      await events.emit('clock:tick', clockPayload);

      expect(broadcast.calls.broadcastToGame.length).toBe(1);
      expect(broadcast.calls.broadcastToSpectators.length).toBe(1);

      const sentPayload = broadcast.calls.broadcastToGame[0].payload as any;
      expect(sentPayload.gameId).toBe('game-123');
      // Times should be floored
      expect(sentPayload.whiteTimeRemaining).toBe(280);
      expect(sentPayload.blackTimeRemaining).toBe(295);
    });
  });

  describe('game:draw_offered', () => {
    test('should send draw offer to opponent only', async () => {
      await events.emit('game:draw_offered', {
        gameId: 'game-123',
        offeredBy: 'player-1',
        opponentId: 'player-2',
      });

      expect(broadcast.calls.sendToUser.length).toBe(1);
      expect(broadcast.calls.sendToUser[0].userId).toBe('player-2');
      expect(broadcast.calls.sendToUser[0].event).toBe('game:draw_offered');
    });
  });

  describe('game:draw_declined', () => {
    test('should notify the player who offered the draw', async () => {
      await events.emit('game:draw_declined', {
        gameId: 'game-123',
        declinedBy: 'player-2',
        offeredBy: 'player-1',
      });

      expect(broadcast.calls.sendToUser.length).toBe(1);
      expect(broadcast.calls.sendToUser[0].userId).toBe('player-1');
      expect(broadcast.calls.sendToUser[0].event).toBe('game:draw_declined');
    });
  });

  describe('challenge events', () => {
    test('challenge:created should broadcast challenge list', async () => {
      await events.emit('challenge:created', {
        challengeId: 'challenge-1',
        creatorId: 'player-1',
      });

      expect(broadcast.calls.broadcastChallengeList).toBe(1);
    });

    test('challenge:accepted should broadcast challenge list', async () => {
      await events.emit('challenge:accepted', {
        challengeId: 'challenge-1',
        creatorId: 'player-1',
        acceptedById: 'player-2',
      });

      expect(broadcast.calls.broadcastChallengeList).toBe(1);
    });

    test('challenge:cancelled should broadcast challenge list', async () => {
      await events.emit('challenge:cancelled', {
        challengeId: 'challenge-1',
      });

      expect(broadcast.calls.broadcastChallengeList).toBe(1);
    });

    test('challenge:expired should broadcast challenge list', async () => {
      await events.emit('challenge:expired', {
        challengeId: 'challenge-1',
      });

      expect(broadcast.calls.broadcastChallengeList).toBe(1);
    });
  });

  describe('achievement:unlocked', () => {
    test('should normalize Date to ISO string', async () => {
      const testDate = new Date('2024-01-15T10:30:00Z');

      await events.emit('achievement:unlocked', {
        userId: 'player-1',
        achievements: [
          {
            id: 'first_win',
            name: 'First Win',
            description: 'Win your first game',
            icon: 'trophy',
            category: 'games' as AchievementCategory,
            unlockedAt: testDate,
          },
        ],
      });

      expect(broadcast.calls.sendToUser.length).toBe(1);
      const payload = broadcast.calls.sendToUser[0].payload as any;
      expect(payload.achievements[0].unlockedAt).toBe('2024-01-15T10:30:00.000Z');
    });

    test('should pass through ISO string unchanged', async () => {
      const isoString = '2024-01-15T10:30:00.000Z';

      await events.emit('achievement:unlocked', {
        userId: 'player-1',
        achievements: [
          {
            id: 'first_win',
            name: 'First Win',
            description: 'Win your first game',
            icon: 'trophy',
            category: 'games' as AchievementCategory,
            unlockedAt: isoString as any, // Simulating string from DB
          },
        ],
      });

      const payload = broadcast.calls.sendToUser[0].payload as any;
      expect(payload.achievements[0].unlockedAt).toBe(isoString);
    });

    test('should send to correct user', async () => {
      await events.emit('achievement:unlocked', {
        userId: 'player-42',
        achievements: [
          {
            id: 'streak_3',
            name: 'Hot Streak',
            description: 'Win 3 games in a row',
            icon: 'fire',
            category: 'streaks' as AchievementCategory,
            unlockedAt: new Date(),
          },
        ],
      });

      expect(broadcast.calls.sendToUser[0].userId).toBe('player-42');
      expect(broadcast.calls.sendToUser[0].event).toBe('achievement:unlocked');
    });

    test('should handle multiple achievements at once', async () => {
      await events.emit('achievement:unlocked', {
        userId: 'player-1',
        achievements: [
          {
            id: 'first_win',
            name: 'First Win',
            description: 'Win your first game',
            icon: 'trophy',
            category: 'games' as AchievementCategory,
            unlockedAt: new Date(),
          },
          {
            id: 'first_checkmate',
            name: 'Checkmate!',
            description: 'Win by checkmate',
            icon: 'crown',
            category: 'games' as AchievementCategory,
            unlockedAt: new Date(),
          },
        ],
      });

      const payload = broadcast.calls.sendToUser[0].payload as any;
      expect(payload.achievements.length).toBe(2);
    });
  });
});
