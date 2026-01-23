import type { GameEventEmitter } from '../GameEventEmitter';
import * as achievementService from '../../services/achievements';

/**
 * Achievements handler - priority 100, nonBlocking
 * Updates profile stats and checks achievements after games end.
 */
export function registerAchievementHandlers(events: GameEventEmitter) {
  events.on(
    'game:ended',
    async (payload) => {
      const {
        result,
        winnerId,
        whitePlayerId,
        blackPlayerId,
        whiteEloAtStart,
        blackEloAtStart,
        moveCount,
        stakeAmount,
        eloChanges,
      } = payload;

      const isCheckmate = result === 'white_wins' || result === 'black_wins';

      // Update profile stats and check game achievements for white player
      const whiteWon = winnerId === whitePlayerId;
      await achievementService.updateProfileStats(
        whitePlayerId,
        whiteWon,
        whiteWon && isCheckmate,
        moveCount,
        stakeAmount
      );
      await achievementService.checkGameAchievements(
        whitePlayerId,
        whiteWon,
        whiteWon && isCheckmate,
        moveCount,
        stakeAmount
      );

      // Check ELO achievements for white player
      if (eloChanges.whiteChange > 0) {
        const whiteNewElo = whiteEloAtStart + eloChanges.whiteChange;
        await achievementService.checkEloAchievements(whitePlayerId, whiteNewElo);
      }

      // Update profile stats and check game achievements for black player
      const blackWon = winnerId === blackPlayerId;
      await achievementService.updateProfileStats(
        blackPlayerId,
        blackWon,
        blackWon && isCheckmate,
        moveCount,
        stakeAmount
      );
      await achievementService.checkGameAchievements(
        blackPlayerId,
        blackWon,
        blackWon && isCheckmate,
        moveCount,
        stakeAmount
      );

      // Check ELO achievements for black player
      if (eloChanges.blackChange > 0) {
        const blackNewElo = blackEloAtStart + eloChanges.blackChange;
        await achievementService.checkEloAchievements(blackPlayerId, blackNewElo);
      }
    },
    { priority: 100, nonBlocking: true, label: 'achievements:game_ended' }
  );
}
