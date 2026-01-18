import { eq } from 'drizzle-orm';
import { db, users } from '../drizzle';
import { calculateEloChanges } from '@chess-game/shared';

export interface EloUpdate {
  whiteNewElo: number;
  blackNewElo: number;
  whiteChange: number;
  blackChange: number;
}

export async function updateEloRatings(
  whitePlayerId: string,
  blackPlayerId: string,
  whiteElo: number,
  blackElo: number,
  result: 'white' | 'black' | 'draw'
): Promise<EloUpdate> {
  const { whiteChange, blackChange } = calculateEloChanges(whiteElo, blackElo, result);

  const whiteNewElo = whiteElo + whiteChange;
  const blackNewElo = blackElo + blackChange;

  // Update white player
  await db
    .update(users)
    .set({
      eloRating: whiteNewElo,
      peakEloRating: whiteNewElo > whiteElo ? whiteNewElo : undefined,
      gamesPlayed: users.gamesPlayed,
      gamesWon: result === 'white' ? users.gamesWon : undefined,
      gamesLost: result === 'black' ? users.gamesLost : undefined,
      gamesDraw: result === 'draw' ? users.gamesDraw : undefined,
      updatedAt: new Date(),
    })
    .where(eq(users.id, whitePlayerId));

  // Update stats separately with raw SQL increment
  const whiteUser = await db.query.users.findFirst({ where: eq(users.id, whitePlayerId) });
  if (whiteUser) {
    await db
      .update(users)
      .set({
        eloRating: whiteNewElo,
        peakEloRating: Math.max(whiteUser.peakEloRating, whiteNewElo),
        gamesPlayed: whiteUser.gamesPlayed + 1,
        gamesWon: result === 'white' ? whiteUser.gamesWon + 1 : whiteUser.gamesWon,
        gamesLost: result === 'black' ? whiteUser.gamesLost + 1 : whiteUser.gamesLost,
        gamesDraw: result === 'draw' ? whiteUser.gamesDraw + 1 : whiteUser.gamesDraw,
        updatedAt: new Date(),
      })
      .where(eq(users.id, whitePlayerId));
  }

  // Update black player
  const blackUser = await db.query.users.findFirst({ where: eq(users.id, blackPlayerId) });
  if (blackUser) {
    await db
      .update(users)
      .set({
        eloRating: blackNewElo,
        peakEloRating: Math.max(blackUser.peakEloRating, blackNewElo),
        gamesPlayed: blackUser.gamesPlayed + 1,
        gamesWon: result === 'black' ? blackUser.gamesWon + 1 : blackUser.gamesWon,
        gamesLost: result === 'white' ? blackUser.gamesLost + 1 : blackUser.gamesLost,
        gamesDraw: result === 'draw' ? blackUser.gamesDraw + 1 : blackUser.gamesDraw,
        updatedAt: new Date(),
      })
      .where(eq(users.id, blackPlayerId));
  }

  return {
    whiteNewElo,
    blackNewElo,
    whiteChange,
    blackChange,
  };
}

export function getEloTier(elo: number): string {
  if (elo < 1000) return 'Beginner';
  if (elo < 1200) return 'Novice';
  if (elo < 1400) return 'Intermediate';
  if (elo < 1600) return 'Advanced';
  if (elo < 1800) return 'Expert';
  if (elo < 2000) return 'Master';
  if (elo < 2200) return 'Grandmaster';
  return 'Legend';
}
