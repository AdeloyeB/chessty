import type { Move, AchievementCategory } from '@chess-game/shared';

/**
 * Typed event map for all game events in the system.
 * Each key maps to the payload shape emitted with that event.
 */
export interface GameEventMap {
  // Game lifecycle events
  'game:started': {
    gameId: string;
    whitePlayerId: string;
    blackPlayerId: string;
    timeControlInitial: number;
    timeControlIncrement: number;
  };

  'game:move_made': {
    gameId: string;
    playerId: string;
    move: Move;
    fen: string;
    pgn: string;
    whiteTime: number;
    blackTime: number;
    isGameOver: boolean;
    isCheckmate: boolean;
    isDraw: boolean;
    isStalemate: boolean;
  };

  'game:ended': {
    gameId: string;
    result: string;
    winnerId: string | null;
    whitePlayerId: string;
    blackPlayerId: string;
    whiteEloAtStart: number;
    blackEloAtStart: number;
    moveCount: number;
    wagerAmount: number;
    eloChanges: {
      whiteChange: number;
      blackChange: number;
    };
  };

  'game:timeout': {
    gameId: string;
    losingColor: 'white' | 'black';
    winnerId: string;
  };

  // Draw events
  'game:draw_offered': {
    gameId: string;
    offeredBy: string;
    opponentId: string;
  };

  'game:draw_accepted': {
    gameId: string;
    acceptedBy: string;
  };

  'game:draw_declined': {
    gameId: string;
    declinedBy: string;
    offeredBy: string;
  };

  // Player connection events
  'player:connected': {
    userId: string;
  };

  'player:disconnected': {
    userId: string;
    gameId?: string;
    spectatingGameId?: string;
  };

  'player:joined_game': {
    userId: string;
    gameId: string;
    bothPlayersPresent: boolean;
  };

  // Spectator events
  'spectator:joined': {
    userId: string;
    gameId: string;
  };

  'spectator:left': {
    userId: string;
    gameId: string;
  };

  // Challenge events
  'challenge:created': {
    challengeId: string;
    creatorId: string;
  };

  'challenge:accepted': {
    challengeId: string;
    creatorId: string;
    acceptedById: string;
  };

  'challenge:confirmed': {
    challengeId: string;
    gameId: string;
  };

  'challenge:cancelled': {
    challengeId: string;
  };

  'challenge:expired': {
    challengeId: string;
  };

  // Clock events
  'clock:tick': {
    gameId: string;
    whiteTime: number;
    blackTime: number;
  };

  'clock:started': {
    gameId: string;
    increment: number;
  };

  'clock:stopped': {
    gameId: string;
  };

  // Achievement events
  'achievement:unlocked': {
    userId: string;
    achievements: Array<{
      id: string;
      name: string;
      description: string;
      icon: string;
      category: AchievementCategory;
      unlockedAt: Date;
    }>;
  };
}

export type GameEventName = keyof GameEventMap;
