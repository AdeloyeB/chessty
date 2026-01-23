import { CHALLENGE_CONFIRM_TIMEOUT } from '@chess-game/shared';
import type {
  ChallengeCreatePayload,
  ChallengeAcceptedPayload,
  ChallengeConfirmedPayload,
  Move,
} from '@chess-game/shared';
import type { GameEventEmitter } from '../events/GameEventEmitter';
import type { BroadcastService } from './BroadcastService';
import * as challengeService from '../services/challenge';
import * as gameService from '../services/game';
import * as authService from '../services/auth';

/**
 * Manages challenge lifecycle: create, cancel, accept, confirm, decline.
 * Emits challenge events and manages confirmation timeouts.
 */
export class ChallengeCoordinator {
  private confirmTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private events: GameEventEmitter,
    private broadcast: BroadcastService
  ) {}

  async handleCreate(userId: string, payload: ChallengeCreatePayload): Promise<void> {
    try {
      const challenge = await challengeService.createChallenge(
        userId,
        payload.gameMode,
        payload.timeControlKey,
        payload.stakeAmount,
        payload.minElo,
        payload.maxElo
      );

      // Send confirmation to creator
      this.broadcast.sendToUser(userId, 'challenge:created', { challenge });

      // Emit event (triggers challenge list broadcast)
      await this.events.emit('challenge:created', {
        challengeId: challenge.id,
        creatorId: userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create challenge';
      this.broadcast.sendError(userId, 'CHALLENGE_ERROR', message);
    }
  }

  async handleCancel(userId: string, challengeId: string): Promise<void> {
    try {
      await challengeService.cancelChallenge(challengeId, userId);

      // Clear any confirmation timeout
      const timeout = this.confirmTimeouts.get(challengeId);
      if (timeout) {
        clearTimeout(timeout);
        this.confirmTimeouts.delete(challengeId);
      }

      this.broadcast.sendToUser(userId, 'challenge:cancelled', { challengeId });

      await this.events.emit('challenge:cancelled', { challengeId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel challenge';
      this.broadcast.sendError(userId, 'CHALLENGE_ERROR', message);
    }
  }

  async handleAccept(userId: string, challengeId: string): Promise<void> {
    try {
      const challenge = await challengeService.acceptChallenge(challengeId, userId);

      // Notify both players
      const acceptedPayload: ChallengeAcceptedPayload = {
        challenge,
        acceptedBy: challenge.acceptedBy!,
      };

      this.broadcast.sendToUser(challenge.creatorId, 'challenge:accepted', acceptedPayload);
      this.broadcast.sendToUser(userId, 'challenge:accepted', acceptedPayload);

      // Start confirmation timeout
      const timeout = setTimeout(async () => {
        try {
          // Check if challenge is still in 'accepted' state (not already confirmed/cancelled)
          const currentChallenge = await challengeService.getChallenge(challengeId);
          if (!currentChallenge || currentChallenge.status !== 'accepted') return;

          await challengeService.declineChallenge(challengeId, challenge.creatorId);
          this.broadcast.sendToUser(challenge.creatorId, 'challenge:expired', { challengeId });
          this.broadcast.sendToUser(userId, 'challenge:expired', { challengeId });

          await this.events.emit('challenge:expired', { challengeId });
        } catch {
          // Ignore errors during timeout handling
        }
      }, CHALLENGE_CONFIRM_TIMEOUT);

      this.confirmTimeouts.set(challengeId, timeout);

      await this.events.emit('challenge:accepted', {
        challengeId,
        creatorId: challenge.creatorId,
        acceptedById: userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept challenge';
      this.broadcast.sendError(userId, 'CHALLENGE_ERROR', message);
    }
  }

  async handleConfirm(userId: string, challengeId: string): Promise<void> {
    try {
      const { confirmed, challenge } = await challengeService.confirmChallenge(challengeId, userId);

      if (confirmed) {
        // Clear confirmation timeout
        const timeout = this.confirmTimeouts.get(challengeId);
        if (timeout) {
          clearTimeout(timeout);
          this.confirmTimeouts.delete(challengeId);
        }

        // Create the game
        const game = await challengeService.createGameFromChallenge(challengeId);
        const gameData = await gameService.getGameWithPlayers(game.id);

        if (gameData) {
          const confirmedPayload: ChallengeConfirmedPayload = {
            challenge,
            game: {
              id: game.id,
              whitePlayerId: game.whitePlayerId,
              blackPlayerId: game.blackPlayerId,
              winnerId: game.winnerId,
              status: game.status as any,
              result: game.result as any,
              currentFen: game.currentFen,
              pgn: game.pgn,
              moves: game.moves as Move[],
              timeControl: {
                initial: game.timeControlInitial,
                increment: game.timeControlIncrement,
              },
              whiteTimeRemaining: game.whiteTimeRemaining,
              blackTimeRemaining: game.blackTimeRemaining,
              stakeAmount: Number(game.stakeAmount),
              totalPot: Number(game.totalPot),
              whiteEloAtStart: game.whiteEloAtStart,
              blackEloAtStart: game.blackEloAtStart,
              eloChange: game.eloChange,
              createdAt: game.createdAt,
              updatedAt: game.updatedAt,
              startedAt: game.startedAt,
              endedAt: game.endedAt,
            },
            whitePlayer: authService.toPublicUser(gameData.whitePlayer),
            blackPlayer: authService.toPublicUser(gameData.blackPlayer),
          };

          // Notify both players
          this.broadcast.sendToUser(challenge.creatorId, 'challenge:confirmed', confirmedPayload);
          if (challenge.acceptedById) {
            this.broadcast.sendToUser(challenge.acceptedById, 'challenge:confirmed', confirmedPayload);
          }
        }

        await this.events.emit('challenge:confirmed', {
          challengeId,
          gameId: game.id,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm challenge';
      this.broadcast.sendError(userId, 'CHALLENGE_ERROR', message);
    }
  }

  async handleDecline(userId: string, challengeId: string): Promise<void> {
    try {
      const challenge = await challengeService.getChallenge(challengeId);
      if (!challenge) {
        throw new Error('Challenge not found');
      }

      await challengeService.declineChallenge(challengeId, userId);

      // Clear confirmation timeout
      const timeout = this.confirmTimeouts.get(challengeId);
      if (timeout) {
        clearTimeout(timeout);
        this.confirmTimeouts.delete(challengeId);
      }

      // Notify both players
      this.broadcast.sendToUser(challenge.creatorId, 'challenge:declined', { challengeId });
      if (challenge.acceptedById) {
        this.broadcast.sendToUser(challenge.acceptedById, 'challenge:declined', { challengeId });
      }

      // Broadcast updated list via event
      await this.events.emit('challenge:cancelled', { challengeId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decline challenge';
      this.broadcast.sendError(userId, 'CHALLENGE_ERROR', message);
    }
  }
}
