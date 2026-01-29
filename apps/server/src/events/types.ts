import type { Move, AchievementCategory, CheatFlag, CheatFlagSeverity } from '@chess-game/shared';

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
    spectatingGameIds?: string[];  // All games the user was spectating
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

  // ---------------------------------------------------------------------------
  // Anti-Cheat Events
  // ---------------------------------------------------------------------------
  //
  // These events are emitted by the anti-cheat system during real-time game
  // monitoring. They allow other systems to react to suspicious activity
  // without blocking move processing.

  /**
   * Emitted when a suspicion flag is raised for a player during a game.
   * A single flag doesn't mean cheating - flags accumulate to build a score.
   *
   * Listeners might:
   * - Log the flag for later analysis
   * - Update a real-time monitoring dashboard
   * - Trigger additional monitoring on the game
   */
  'anticheat:suspicion_flag': {
    gameId: string;
    playerId: string;
    flag: CheatFlag;
    /** Current accumulated suspicion score for this player in this game (0-100) */
    currentScore: number;
    /** Move number where this was detected (if applicable) */
    moveNumber?: number;
  };

  /**
   * Emitted when a game's accumulated suspicion score exceeds the threshold
   * for deep analysis. This queues the game for post-game engine correlation
   * analysis with Stockfish.
   *
   * Listeners might:
   * - Add the game to a review queue in the database
   * - Notify moderators via webhook
   * - Log for audit purposes
   */
  'anticheat:game_flagged': {
    gameId: string;
    playerId: string;
    /** The accumulated suspicion score that triggered this (0-100) */
    score: number;
    /** Why this game was flagged */
    reason: string;
    /** All flags that contributed to this decision */
    flags: CheatFlag[];
    /** Recommended action based on severity */
    recommendedAction: 'monitor' | 'restrict_stakes' | 'flag_for_review' | 'suspend_pending_review';
  };

  /**
   * Emitted when the anti-cheat system determines human review is needed.
   * This happens when:
   * - Suspicion score is very high (>80)
   * - Multiple critical severity flags detected
   * - Unusual patterns that automated systems can't confidently classify
   *
   * Listeners might:
   * - Create a review ticket in an admin dashboard
   * - Send a notification to moderators
   * - Temporarily restrict the player's ability to play high-stakes games
   */
  'anticheat:review_required': {
    gameId: string;
    playerId: string;
    /** The suspicion score that triggered review (0-100) */
    score: number;
    /** Severity level of the most serious flag */
    highestSeverity: CheatFlagSeverity;
    /** Summary of what was detected */
    summary: string;
    /** All flags for the reviewer to examine */
    flags: CheatFlag[];
    /** Additional metadata for the review (timing data, behavior shifts, etc.) */
    metadata: Record<string, unknown>;
  };
}

export type GameEventName = keyof GameEventMap;
