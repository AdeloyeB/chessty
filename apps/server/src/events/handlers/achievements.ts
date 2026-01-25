import type { GameEventEmitter } from '../GameEventEmitter';
import * as achievementService from '../../services/achievements';
import { getAchievementById } from '@chess-game/shared';

/**
 * Achievements handler - priority 100, nonBlocking
 * Updates profile stats and checks achievements after games end.
 * Emits achievement:unlocked events when players earn new achievements.
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
      const whiteGameAchievements = await achievementService.checkGameAchievements(
        whitePlayerId,
        whiteWon,
        whiteWon && isCheckmate,
        moveCount,
        stakeAmount
      );

      // Check ELO achievements for white player
      let whiteEloAchievements: Awaited<ReturnType<typeof achievementService.checkEloAchievements>> = [];
      if (eloChanges.whiteChange > 0) {
        const whiteNewElo = whiteEloAtStart + eloChanges.whiteChange;
        whiteEloAchievements = await achievementService.checkEloAchievements(whitePlayerId, whiteNewElo);
      }

      // Emit achievement:unlocked for white player if any were unlocked
      const whiteUnlocked = [...whiteGameAchievements, ...whiteEloAchievements];
      if (whiteUnlocked.length > 0) {
        const achievements = whiteUnlocked
          .map((u) => {
            const def = getAchievementById(u.achievementId);
            if (!def) return null;
            return {
              id: u.achievementId,
              name: def.name,
              description: def.description,
              icon: def.icon,
              category: def.category,
              unlockedAt: u.unlockedAt,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null);

        if (achievements.length > 0) {
          await events.emit('achievement:unlocked', {
            userId: whitePlayerId,
            achievements,
          });
        }
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
      const blackGameAchievements = await achievementService.checkGameAchievements(
        blackPlayerId,
        blackWon,
        blackWon && isCheckmate,
        moveCount,
        stakeAmount
      );

      // Check ELO achievements for black player
      let blackEloAchievements: Awaited<ReturnType<typeof achievementService.checkEloAchievements>> = [];
      if (eloChanges.blackChange > 0) {
        const blackNewElo = blackEloAtStart + eloChanges.blackChange;
        blackEloAchievements = await achievementService.checkEloAchievements(blackPlayerId, blackNewElo);
      }

      // Emit achievement:unlocked for black player if any were unlocked
      const blackUnlocked = [...blackGameAchievements, ...blackEloAchievements];
      if (blackUnlocked.length > 0) {
        const achievements = blackUnlocked
          .map((u) => {
            const def = getAchievementById(u.achievementId);
            if (!def) return null;
            return {
              id: u.achievementId,
              name: def.name,
              description: def.description,
              icon: def.icon,
              category: def.category,
              unlockedAt: u.unlockedAt,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null);

        if (achievements.length > 0) {
          await events.emit('achievement:unlocked', {
            userId: blackPlayerId,
            achievements,
          });
        }
      }
    },
    { priority: 100, nonBlocking: true, label: 'achievements:game_ended' }
  );
}
