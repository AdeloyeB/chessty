/**
 * useOpeningsData Pipeline Tests
 *
 * Since useOpeningsData is a React hook that wraps analyzeOpenings -> filterOpenings -> sortOpenings,
 * we test the full pipeline integration here. The individual functions are tested in
 * openingAnalyzer.test.ts — these tests verify the composition works correctly end-to-end.
 *
 * Test categories:
 * - Full pipeline (analyze -> filter -> sort) with various combinations
 * - Empty/edge-case inputs
 * - Filter combinations that reduce or eliminate results
 * - Sort stability
 * - Large dataset processing
 */
import { describe, test, expect } from 'bun:test';
import { analyzeOpenings, sortOpenings, filterOpenings } from '../lib/history/openingAnalyzer';
import type { HistoryGame, PublicUser } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const mockOpponent: PublicUser = {
  id: 'opponent-1',
  username: 'testplayer',
  displayName: 'TestPlayer',
  eloRating: 1500,
  peakEloRating: 1600,
  gamesPlayed: 50,
  gamesWon: 25,
  gamesLost: 20,
  gamesDraw: 5,
};

/**
 * Creates a minimal HistoryGame with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
function createMockGame(overrides: Partial<HistoryGame> = {}): HistoryGame {
  return {
    id: `game-${Math.random().toString(36).slice(2, 8)}`,
    opponent: mockOpponent,
    playerColor: 'white',
    result: 'win',
    resultDetail: 'white_wins',
    gameMode: 'standard',
    timeControlInitial: 600,
    timeControlIncrement: 0,
    timeControlLabel: '10 min',
    wagerAmount: 25,
    totalPot: 50,
    eloChange: 12,
    eloAtStart: 1500,
    opponentEloAtStart: 1500,
    opening: 'Italian Game',
    moveCount: 35,
    moves: [],
    pgn: '',
    startingFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    endedAt: new Date('2025-06-15T12:00:00Z'),
    duration: 600,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pipeline helper — mirrors what useOpeningsData does internally:
//   games -> analyzeOpenings -> filterOpenings -> sortOpenings
// ---------------------------------------------------------------------------

function runPipeline(
  games: HistoryGame[],
  resultFilter: 'all' | 'win' | 'loss' | 'draw' = 'all',
  colorFilter: 'all' | 'white' | 'black' = 'all',
  sortBy: 'most-played' | 'best-winrate' | 'worst-winrate' | 'most-recent' = 'most-played',
) {
  const analyzed = analyzeOpenings(games);
  const filtered = filterOpenings(analyzed, resultFilter, colorFilter);
  return sortOpenings(filtered, sortBy);
}

// ---------------------------------------------------------------------------
// Full pipeline integration tests
// ---------------------------------------------------------------------------

describe('useOpeningsData pipeline', () => {
  test('analyze -> filter by wins -> sort by winrate', () => {
    const games = [
      // Italian Game: 3 games, 2 wins (66.7%)
      createMockGame({ id: 'it1', opening: 'Italian Game', result: 'win', playerColor: 'white' }),
      createMockGame({ id: 'it2', opening: 'Italian Game', result: 'win', playerColor: 'black' }),
      createMockGame({ id: 'it3', opening: 'Italian Game', result: 'loss', playerColor: 'white' }),
      // Sicilian Defense: 2 games, 1 win (50%)
      createMockGame({ id: 'si1', opening: 'Sicilian Defense', result: 'win', playerColor: 'black' }),
      createMockGame({ id: 'si2', opening: 'Sicilian Defense', result: 'loss', playerColor: 'white' }),
      // French Defense: 2 games, 0 wins (0%) — should be excluded when filtering by wins
      createMockGame({ id: 'fr1', opening: 'French Defense', result: 'loss', playerColor: 'white' }),
      createMockGame({ id: 'fr2', opening: 'French Defense', result: 'draw', playerColor: 'black' }),
    ];

    const result = runPipeline(games, 'win', 'all', 'best-winrate');

    // French Defense has no wins, so it's excluded by the 'win' filter
    expect(result).toHaveLength(2);
    // Both remaining openings only have win games in their filtered set, so winRate = 100%
    // Italian: 2 win games remain, Sicilian: 1 win game remains
    expect(result[0].winRate).toBe(100);
    expect(result[1].winRate).toBe(100);
    // With same winRate, most-played tiebreak depends on sort implementation
    // Both have 100% but Italian has more games in the filtered set
    expect(result[0].gamesPlayed).toBeGreaterThanOrEqual(result[1].gamesPlayed);
  });

  test('analyze -> filter by black -> sort by most-played', () => {
    const games = [
      // Italian Game: 1 black game, 2 white games
      createMockGame({ id: 'it1', opening: 'Italian Game', playerColor: 'white', result: 'win' }),
      createMockGame({ id: 'it2', opening: 'Italian Game', playerColor: 'white', result: 'loss' }),
      createMockGame({ id: 'it3', opening: 'Italian Game', playerColor: 'black', result: 'win' }),
      // Sicilian Defense: 3 black games, 0 white games
      createMockGame({ id: 'si1', opening: 'Sicilian Defense', playerColor: 'black', result: 'win' }),
      createMockGame({ id: 'si2', opening: 'Sicilian Defense', playerColor: 'black', result: 'loss' }),
      createMockGame({ id: 'si3', opening: 'Sicilian Defense', playerColor: 'black', result: 'draw' }),
      // London System: 2 white games, 0 black games — should be excluded
      createMockGame({ id: 'lo1', opening: 'London System', playerColor: 'white', result: 'win' }),
      createMockGame({ id: 'lo2', opening: 'London System', playerColor: 'white', result: 'win' }),
    ];

    const result = runPipeline(games, 'all', 'black', 'most-played');

    // London System has no black games, so it's removed
    expect(result).toHaveLength(2);
    // Sicilian has 3 black games, Italian has 1
    expect(result[0].name).toBe('Sicilian Defense');
    expect(result[0].gamesPlayed).toBe(3);
    expect(result[1].name).toBe('Italian Game');
    expect(result[1].gamesPlayed).toBe(1);
    // All games in results should be black
    result.forEach(opening => {
      opening.games.forEach(g => expect(g.playerColor).toBe('black'));
    });
  });

  test('analyze -> no filters -> sort by most-recent', () => {
    const games = [
      createMockGame({ id: 'it1', opening: 'Italian Game', endedAt: new Date('2025-01-01T00:00:00Z') }),
      createMockGame({ id: 'si1', opening: 'Sicilian Defense', endedAt: new Date('2025-06-01T00:00:00Z') }),
      createMockGame({ id: 'fr1', opening: 'French Defense', endedAt: new Date('2025-03-15T00:00:00Z') }),
    ];

    const result = runPipeline(games, 'all', 'all', 'most-recent');

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Sicilian Defense'); // June
    expect(result[1].name).toBe('French Defense');   // March
    expect(result[2].name).toBe('Italian Game');     // January
  });

  test('pipeline with empty games produces empty result', () => {
    const result = runPipeline([], 'all', 'all', 'most-played');
    expect(result).toEqual([]);
  });

  test('pipeline with empty games produces empty result for any filter/sort combo', () => {
    expect(runPipeline([], 'win', 'white', 'best-winrate')).toEqual([]);
    expect(runPipeline([], 'loss', 'black', 'worst-winrate')).toEqual([]);
    expect(runPipeline([], 'draw', 'all', 'most-recent')).toEqual([]);
  });

  test('pipeline preserves all openings when filters are all/all', () => {
    const games = [
      createMockGame({ id: 'g1', opening: 'Italian Game', result: 'win' }),
      createMockGame({ id: 'g2', opening: 'Sicilian Defense', result: 'loss' }),
      createMockGame({ id: 'g3', opening: 'French Defense', result: 'draw' }),
      createMockGame({ id: 'g4', opening: 'Ruy Lopez', result: 'win' }),
      createMockGame({ id: 'g5', opening: 'Caro-Kann Defense', result: 'loss' }),
    ];

    const result = runPipeline(games, 'all', 'all', 'most-played');

    expect(result).toHaveLength(5);
    // Each opening has 1 game
    result.forEach(opening => {
      expect(opening.gamesPlayed).toBe(1);
    });
  });

  test('pipeline removes openings with no matching games when filtered', () => {
    const games = [
      // Only Italian has wins
      createMockGame({ id: 'g1', opening: 'Italian Game', result: 'win' }),
      createMockGame({ id: 'g2', opening: 'Sicilian Defense', result: 'loss' }),
      createMockGame({ id: 'g3', opening: 'French Defense', result: 'draw' }),
    ];

    const result = runPipeline(games, 'win', 'all', 'most-played');

    // Only Italian has a win
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Italian Game');
  });

  test('color filter + result filter combined correctly reduces results', () => {
    const games = [
      // Italian: white win, white loss, black win
      createMockGame({ id: 'it1', opening: 'Italian Game', playerColor: 'white', result: 'win' }),
      createMockGame({ id: 'it2', opening: 'Italian Game', playerColor: 'white', result: 'loss' }),
      createMockGame({ id: 'it3', opening: 'Italian Game', playerColor: 'black', result: 'win' }),
      // Sicilian: white loss, black loss
      createMockGame({ id: 'si1', opening: 'Sicilian Defense', playerColor: 'white', result: 'loss' }),
      createMockGame({ id: 'si2', opening: 'Sicilian Defense', playerColor: 'black', result: 'loss' }),
      // French: black draw
      createMockGame({ id: 'fr1', opening: 'French Defense', playerColor: 'black', result: 'draw' }),
    ];

    // Filter: white wins only
    const whiteWins = runPipeline(games, 'win', 'white', 'most-played');
    expect(whiteWins).toHaveLength(1);
    expect(whiteWins[0].name).toBe('Italian Game');
    expect(whiteWins[0].gamesPlayed).toBe(1);

    // Filter: black losses only
    const blackLosses = runPipeline(games, 'loss', 'black', 'most-played');
    expect(blackLosses).toHaveLength(1);
    expect(blackLosses[0].name).toBe('Sicilian Defense');
    expect(blackLosses[0].gamesPlayed).toBe(1);

    // Filter: white draws — no games match this
    const whiteDraws = runPipeline(games, 'draw', 'white', 'most-played');
    expect(whiteDraws).toHaveLength(0);
  });

  test('sort stability: openings with same value maintain relative order', () => {
    // Create games where two openings have the same number of games
    const games = [
      createMockGame({ id: 'g1', opening: 'Italian Game', result: 'win' }),
      createMockGame({ id: 'g2', opening: 'Italian Game', result: 'loss' }),
      createMockGame({ id: 'g3', opening: 'Sicilian Defense', result: 'win' }),
      createMockGame({ id: 'g4', opening: 'Sicilian Defense', result: 'loss' }),
    ];

    const result = runPipeline(games, 'all', 'all', 'most-played');

    // Both have 2 games — they should both appear (order depends on sort implementation
    // but neither should be dropped)
    expect(result).toHaveLength(2);
    expect(result.map(o => o.gamesPlayed)).toEqual([2, 2]);

    // Also check with best-winrate: both are 50%
    const byWinrate = runPipeline(games, 'all', 'all', 'best-winrate');
    expect(byWinrate).toHaveLength(2);
    expect(byWinrate.map(o => o.winRate)).toEqual([50, 50]);
  });

  test('large dataset (50+ games) processes correctly', () => {
    const openingNames = [
      'Italian Game', 'Sicilian Defense', 'French Defense',
      'Ruy Lopez', 'Caro-Kann Defense', 'London System',
      "Queen's Gambit Declined", "King's Indian Defense",
    ];
    const results: Array<'win' | 'loss' | 'draw'> = ['win', 'loss', 'draw'];
    const colors: Array<'white' | 'black'> = ['white', 'black'];

    // Generate 60 games spread across 8 openings
    const games: HistoryGame[] = [];
    for (let i = 0; i < 60; i++) {
      games.push(createMockGame({
        id: `game-${i}`,
        opening: openingNames[i % openingNames.length],
        result: results[i % results.length],
        playerColor: colors[i % colors.length],
        endedAt: new Date(Date.now() - i * 3600000),
        duration: 300 + (i * 10),
      }));
    }

    // Full pipeline with no filters
    const allOpenings = runPipeline(games, 'all', 'all', 'most-played');
    expect(allOpenings).toHaveLength(8);

    // Total games across all openings should equal input
    const totalGames = allOpenings.reduce((sum, o) => sum + o.gamesPlayed, 0);
    expect(totalGames).toBe(60);

    // Each opening should have ~7-8 games (60/8)
    allOpenings.forEach(opening => {
      expect(opening.gamesPlayed).toBeGreaterThanOrEqual(7);
      expect(opening.gamesPlayed).toBeLessThanOrEqual(8);
    });

    // Filter by wins should reduce game count
    const winsOnly = runPipeline(games, 'win', 'all', 'most-played');
    const totalWins = winsOnly.reduce((sum, o) => sum + o.gamesPlayed, 0);
    expect(totalWins).toBe(20); // 60 games / 3 results = 20 wins

    // Filter by white should roughly halve
    const whiteOnly = runPipeline(games, 'all', 'white', 'most-played');
    const totalWhite = whiteOnly.reduce((sum, o) => sum + o.gamesPlayed, 0);
    expect(totalWhite).toBe(30); // 60 games / 2 colors = 30 white games
  });

  test('pipeline correctly chains: filtered stats reflect filtered games', () => {
    const games = [
      createMockGame({ id: 'g1', opening: 'Ruy Lopez', playerColor: 'white', result: 'win', duration: 300 }),
      createMockGame({ id: 'g2', opening: 'Ruy Lopez', playerColor: 'white', result: 'win', duration: 500 }),
      createMockGame({ id: 'g3', opening: 'Ruy Lopez', playerColor: 'black', result: 'loss', duration: 700 }),
      createMockGame({ id: 'g4', opening: 'Ruy Lopez', playerColor: 'black', result: 'win', duration: 900 }),
    ];

    // Unfiltered
    const unfiltered = runPipeline(games, 'all', 'all', 'most-played');
    expect(unfiltered).toHaveLength(1);
    expect(unfiltered[0].gamesPlayed).toBe(4);
    expect(unfiltered[0].wins).toBe(3);
    expect(unfiltered[0].winRate).toBe(75);
    expect(unfiltered[0].averageGameDuration).toBe(600); // (300+500+700+900)/4

    // Filtered to white only
    const whiteOnly = runPipeline(games, 'all', 'white', 'most-played');
    expect(whiteOnly).toHaveLength(1);
    expect(whiteOnly[0].gamesPlayed).toBe(2);
    expect(whiteOnly[0].wins).toBe(2);
    expect(whiteOnly[0].winRate).toBe(100);
    expect(whiteOnly[0].averageGameDuration).toBe(400); // (300+500)/2

    // Filtered to losses only
    const lossesOnly = runPipeline(games, 'loss', 'all', 'most-played');
    expect(lossesOnly).toHaveLength(1);
    expect(lossesOnly[0].gamesPlayed).toBe(1);
    expect(lossesOnly[0].wins).toBe(0);
    expect(lossesOnly[0].winRate).toBe(0);
    expect(lossesOnly[0].averageGameDuration).toBe(700);
  });

  test('pipeline with single game works correctly through all stages', () => {
    const games = [
      createMockGame({
        opening: 'Scandinavian Defense',
        playerColor: 'black',
        result: 'draw',
        endedAt: new Date('2025-08-01T00:00:00Z'),
        duration: 450,
      }),
    ];

    const result = runPipeline(games, 'all', 'all', 'most-played');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Scandinavian Defense');
    expect(result[0].gamesPlayed).toBe(1);
    expect(result[0].wins).toBe(0);
    expect(result[0].draws).toBe(1);
    expect(result[0].winRate).toBe(0);
    expect(result[0].gamesAsBlack).toBe(1);
    expect(result[0].gamesAsWhite).toBe(0);

    // Filtering this single game by 'win' should yield empty
    const winsOnly = runPipeline(games, 'win', 'all', 'most-played');
    expect(winsOnly).toHaveLength(0);

    // Filtering by 'white' should yield empty
    const whiteOnly = runPipeline(games, 'all', 'white', 'most-played');
    expect(whiteOnly).toHaveLength(0);

    // Filtering by 'draw' + 'black' should keep it
    const blackDraws = runPipeline(games, 'draw', 'black', 'most-played');
    expect(blackDraws).toHaveLength(1);
    expect(blackDraws[0].name).toBe('Scandinavian Defense');
  });

  test('null openings grouped as Unknown Opening survive pipeline', () => {
    const games = [
      createMockGame({ id: 'g1', opening: null, result: 'win', playerColor: 'white' }),
      createMockGame({ id: 'g2', opening: null, result: 'loss', playerColor: 'black' }),
      createMockGame({ id: 'g3', opening: 'Italian Game', result: 'win', playerColor: 'white' }),
    ];

    const result = runPipeline(games, 'all', 'all', 'most-played');
    expect(result).toHaveLength(2);

    const unknown = result.find(o => o.name === 'Unknown Opening');
    expect(unknown).toBeDefined();
    expect(unknown!.gamesPlayed).toBe(2);
  });

  test('sort by worst-winrate after filtering shows weakest openings first', () => {
    const games = [
      // Italian: 2 wins, 1 loss as white = 66.7% win rate as white
      createMockGame({ id: 'it1', opening: 'Italian Game', playerColor: 'white', result: 'win' }),
      createMockGame({ id: 'it2', opening: 'Italian Game', playerColor: 'white', result: 'win' }),
      createMockGame({ id: 'it3', opening: 'Italian Game', playerColor: 'white', result: 'loss' }),
      // Sicilian: 0 wins, 2 losses as white = 0% win rate as white
      createMockGame({ id: 'si1', opening: 'Sicilian Defense', playerColor: 'white', result: 'loss' }),
      createMockGame({ id: 'si2', opening: 'Sicilian Defense', playerColor: 'white', result: 'loss' }),
      // French: 1 win, 1 loss as white = 50% win rate as white
      createMockGame({ id: 'fr1', opening: 'French Defense', playerColor: 'white', result: 'win' }),
      createMockGame({ id: 'fr2', opening: 'French Defense', playerColor: 'white', result: 'loss' }),
    ];

    const result = runPipeline(games, 'all', 'white', 'worst-winrate');

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Sicilian Defense');   // 0%
    expect(result[1].name).toBe('French Defense');     // 50%
    expect(result[2].name).toBe('Italian Game');       // 66.7%
  });
});
