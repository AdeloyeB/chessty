import type { HistoryGame, OpeningStats, OpeningSortOption, OpeningResultFilter, OpeningColorFilter } from '@chess-game/shared';
import { getOpeningECO } from './openingDetector';

/**
 * Analyze games and group by opening, calculating stats for each.
 * Includes color-aware breakdown (as white / as black).
 */
export function analyzeOpenings(games: HistoryGame[]): OpeningStats[] {
  // Group by opening name
  const grouped = new Map<string, HistoryGame[]>();
  games.forEach(game => {
    const opening = game.opening || 'Unknown Opening';
    if (!grouped.has(opening)) grouped.set(opening, []);
    grouped.get(opening)!.push(game);
  });

  // Calculate stats per opening
  return Array.from(grouped.entries()).map(([name, openingGames]) => {
    const wins = openingGames.filter(g => g.result === 'win').length;
    const losses = openingGames.filter(g => g.result === 'loss').length;
    const draws = openingGames.filter(g => g.result === 'draw').length;

    const whiteGames = openingGames.filter(g => g.playerColor === 'white');
    const blackGames = openingGames.filter(g => g.playerColor === 'black');
    const winsAsWhite = whiteGames.filter(g => g.result === 'win').length;
    const winsAsBlack = blackGames.filter(g => g.result === 'win').length;

    const totalDuration = openingGames.reduce((sum, g) => sum + g.duration, 0);

    return {
      name,
      ecoCode: getOpeningECO(name),
      gamesPlayed: openingGames.length,
      wins,
      losses,
      draws,
      winRate: openingGames.length > 0 ? (wins / openingGames.length) * 100 : 0,
      gamesAsWhite: whiteGames.length,
      winsAsWhite,
      gamesAsBlack: blackGames.length,
      winsAsBlack,
      winRateAsWhite: whiteGames.length > 0 ? (winsAsWhite / whiteGames.length) * 100 : 0,
      winRateAsBlack: blackGames.length > 0 ? (winsAsBlack / blackGames.length) * 100 : 0,
      games: openingGames,
      lastPlayed: new Date(Math.max(...openingGames.map(g => new Date(g.endedAt).getTime()))),
      averageGameDuration: openingGames.length > 0 ? totalDuration / openingGames.length : 0,
    };
  });
}

/**
 * Sort openings by the given option
 */
export function sortOpenings(openings: OpeningStats[], sortBy: OpeningSortOption): OpeningStats[] {
  return [...openings].sort((a, b) => {
    switch (sortBy) {
      case 'most-played': return b.gamesPlayed - a.gamesPlayed;
      case 'best-winrate': return b.winRate - a.winRate;
      case 'worst-winrate': return a.winRate - b.winRate;
      case 'most-recent': return b.lastPlayed.getTime() - a.lastPlayed.getTime();
      default: return b.gamesPlayed - a.gamesPlayed;
    }
  });
}

/**
 * Filter openings by result and color
 */
export function filterOpenings(
  openings: OpeningStats[],
  resultFilter: OpeningResultFilter,
  colorFilter: OpeningColorFilter,
): OpeningStats[] {
  return openings
    .map(opening => {
      // Filter the underlying games first
      let filteredGames = [...opening.games];

      if (colorFilter !== 'all') {
        filteredGames = filteredGames.filter(g => g.playerColor === colorFilter);
      }
      if (resultFilter !== 'all') {
        filteredGames = filteredGames.filter(g => g.result === resultFilter);
      }

      if (filteredGames.length === 0) return null;

      // Recalculate stats from filtered games
      const wins = filteredGames.filter(g => g.result === 'win').length;
      const losses = filteredGames.filter(g => g.result === 'loss').length;
      const draws = filteredGames.filter(g => g.result === 'draw').length;
      const whiteGames = filteredGames.filter(g => g.playerColor === 'white');
      const blackGames = filteredGames.filter(g => g.playerColor === 'black');
      const winsAsWhite = whiteGames.filter(g => g.result === 'win').length;
      const winsAsBlack = blackGames.filter(g => g.result === 'win').length;
      const totalDuration = filteredGames.reduce((sum, g) => sum + g.duration, 0);

      return {
        ...opening,
        gamesPlayed: filteredGames.length,
        wins,
        losses,
        draws,
        winRate: filteredGames.length > 0 ? (wins / filteredGames.length) * 100 : 0,
        gamesAsWhite: whiteGames.length,
        winsAsWhite,
        gamesAsBlack: blackGames.length,
        winsAsBlack,
        winRateAsWhite: whiteGames.length > 0 ? (winsAsWhite / whiteGames.length) * 100 : 0,
        winRateAsBlack: blackGames.length > 0 ? (winsAsBlack / blackGames.length) * 100 : 0,
        games: filteredGames,
        lastPlayed: new Date(Math.max(...filteredGames.map(g => new Date(g.endedAt).getTime()))),
        averageGameDuration: filteredGames.length > 0 ? totalDuration / filteredGames.length : 0,
      };
    })
    .filter((o): o is OpeningStats => o !== null);
}
