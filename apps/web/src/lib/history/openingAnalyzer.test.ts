/**
 * Opening Analyzer Tests
 *
 * Tests for the opening analysis module including:
 * - Grouping games by opening
 * - Calculating win/loss/draw stats
 * - Color-aware statistics (as white / as black)
 * - Sorting by various criteria
 * - Filtering by result and color
 * - Edge cases (empty arrays, unknown openings, etc.)
 */
import { describe, test, expect } from 'bun:test';
import { analyzeOpenings, sortOpenings, filterOpenings } from './openingAnalyzer';
import type { HistoryGame, PublicUser } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const mockOpponent: PublicUser = {
  id: 'opponent-1',
  username: 'opponent',
  displayName: 'Opponent',
  eloRating: 1200,
  peakEloRating: 1300,
  gamesPlayed: 10,
  gamesWon: 5,
  gamesLost: 3,
  gamesDraw: 2,
};

/**
 * Creates a mock HistoryGame with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
function createMockHistoryGame(overrides: Partial<HistoryGame> = {}): HistoryGame {
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
    wagerAmount: 10,
    totalPot: 20,
    eloChange: 15,
    eloAtStart: 1200,
    opponentEloAtStart: 1200,
    opening: 'Italian Game',
    moveCount: 30,
    moves: [],
    pgn: '',
    startingFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    endedAt: new Date('2025-06-15T12:00:00Z'),
    duration: 600,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// analyzeOpenings
// ---------------------------------------------------------------------------

describe('analyzeOpenings', () => {
  test('returns empty array for empty games list', () => {
    const result = analyzeOpenings([]);
    expect(result).toEqual([]);
  });

  test('single game produces correct stats', () => {
    const game = createMockHistoryGame({
      opening: 'Sicilian Defense',
      result: 'win',
      playerColor: 'white',
      duration: 900,
    });
    const result = analyzeOpenings([game]);

    expect(result).toHaveLength(1);
    const stats = result[0];
    expect(stats.name).toBe('Sicilian Defense');
    expect(stats.gamesPlayed).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
    expect(stats.draws).toBe(0);
    expect(stats.winRate).toBe(100);
    expect(stats.gamesAsWhite).toBe(1);
    expect(stats.winsAsWhite).toBe(1);
    expect(stats.gamesAsBlack).toBe(0);
    expect(stats.winsAsBlack).toBe(0);
    expect(stats.winRateAsWhite).toBe(100);
    expect(stats.winRateAsBlack).toBe(0);
    expect(stats.averageGameDuration).toBe(900);
  });

  test('multiple games with same opening grouped correctly', () => {
    const games = [
      createMockHistoryGame({ id: 'g1', opening: 'Ruy Lopez', result: 'win' }),
      createMockHistoryGame({ id: 'g2', opening: 'Ruy Lopez', result: 'loss' }),
      createMockHistoryGame({ id: 'g3', opening: 'Ruy Lopez', result: 'draw' }),
    ];
    const result = analyzeOpenings(games);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Ruy Lopez');
    expect(result[0].gamesPlayed).toBe(3);
    expect(result[0].games).toHaveLength(3);
  });

  test('win/loss/draw counts calculated correctly', () => {
    const games = [
      createMockHistoryGame({ id: 'g1', opening: 'French Defense', result: 'win' }),
      createMockHistoryGame({ id: 'g2', opening: 'French Defense', result: 'win' }),
      createMockHistoryGame({ id: 'g3', opening: 'French Defense', result: 'loss' }),
      createMockHistoryGame({ id: 'g4', opening: 'French Defense', result: 'draw' }),
      createMockHistoryGame({ id: 'g5', opening: 'French Defense', result: 'draw' }),
    ];
    const result = analyzeOpenings(games);

    expect(result[0].wins).toBe(2);
    expect(result[0].losses).toBe(1);
    expect(result[0].draws).toBe(2);
  });

  test('win rate percentage calculated correctly', () => {
    const games = [
      createMockHistoryGame({ id: 'g1', opening: 'Caro-Kann Defense', result: 'win' }),
      createMockHistoryGame({ id: 'g2', opening: 'Caro-Kann Defense', result: 'win' }),
      createMockHistoryGame({ id: 'g3', opening: 'Caro-Kann Defense', result: 'loss' }),
      createMockHistoryGame({ id: 'g4', opening: 'Caro-Kann Defense', result: 'loss' }),
    ];
    const result = analyzeOpenings(games);

    expect(result[0].winRate).toBe(50);
  });

  test('color-aware stats calculated correctly', () => {
    const games = [
      createMockHistoryGame({ id: 'g1', opening: 'Italian Game', playerColor: 'white', result: 'win' }),
      createMockHistoryGame({ id: 'g2', opening: 'Italian Game', playerColor: 'white', result: 'loss' }),
      createMockHistoryGame({ id: 'g3', opening: 'Italian Game', playerColor: 'black', result: 'win' }),
      createMockHistoryGame({ id: 'g4', opening: 'Italian Game', playerColor: 'black', result: 'win' }),
      createMockHistoryGame({ id: 'g5', opening: 'Italian Game', playerColor: 'black', result: 'loss' }),
    ];
    const result = analyzeOpenings(games);

    const stats = result[0];
    expect(stats.gamesAsWhite).toBe(2);
    expect(stats.winsAsWhite).toBe(1);
    expect(stats.winRateAsWhite).toBe(50);
    expect(stats.gamesAsBlack).toBe(3);
    expect(stats.winsAsBlack).toBe(2);
    // 2/3 * 100 = 66.66...
    expect(stats.winRateAsBlack).toBeCloseTo(66.67, 1);
  });

  test('games with null opening grouped as Unknown Opening', () => {
    const games = [
      createMockHistoryGame({ id: 'g1', opening: null, result: 'win' }),
      createMockHistoryGame({ id: 'g2', opening: null, result: 'loss' }),
    ];
    const result = analyzeOpenings(games);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Unknown Opening');
    expect(result[0].gamesPlayed).toBe(2);
  });

  test('ECO code mapping works for known openings', () => {
    const games = [
      createMockHistoryGame({ opening: 'Italian Game' }),
      createMockHistoryGame({ opening: 'Sicilian Defense' }),
    ];
    const result = analyzeOpenings(games);

    const italian = result.find(o => o.name === 'Italian Game');
    const sicilian = result.find(o => o.name === 'Sicilian Defense');

    expect(italian?.ecoCode).toBe('C50');
    expect(sicilian?.ecoCode).toBe('B20');
  });

  test('ECO code returns null for unknown openings', () => {
    const games = [
      createMockHistoryGame({ opening: 'Bongcloud Attack' }),
    ];
    const result = analyzeOpenings(games);

    expect(result[0].ecoCode).toBeNull();
  });

  test('lastPlayed is the most recent game date', () => {
    const games = [
      createMockHistoryGame({ id: 'g1', opening: 'Ruy Lopez', endedAt: new Date('2025-01-01T00:00:00Z') }),
      createMockHistoryGame({ id: 'g2', opening: 'Ruy Lopez', endedAt: new Date('2025-06-15T00:00:00Z') }),
      createMockHistoryGame({ id: 'g3', opening: 'Ruy Lopez', endedAt: new Date('2025-03-10T00:00:00Z') }),
    ];
    const result = analyzeOpenings(games);

    expect(result[0].lastPlayed.getTime()).toBe(new Date('2025-06-15T00:00:00Z').getTime());
  });

  test('averageGameDuration calculated correctly', () => {
    const games = [
      createMockHistoryGame({ id: 'g1', opening: 'London System', duration: 300 }),
      createMockHistoryGame({ id: 'g2', opening: 'London System', duration: 600 }),
      createMockHistoryGame({ id: 'g3', opening: 'London System', duration: 900 }),
    ];
    const result = analyzeOpenings(games);

    expect(result[0].averageGameDuration).toBe(600);
  });

  test('all games same opening produces single entry', () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      createMockHistoryGame({ id: `g${i}`, opening: 'Scotch Game', result: i % 2 === 0 ? 'win' : 'loss' }),
    );
    const result = analyzeOpenings(games);

    expect(result).toHaveLength(1);
    expect(result[0].gamesPlayed).toBe(5);
    expect(result[0].wins).toBe(3);
    expect(result[0].losses).toBe(2);
  });

  test('all games different openings produces one entry per opening', () => {
    const openings = ['Italian Game', 'Ruy Lopez', 'Sicilian Defense', 'French Defense', 'Caro-Kann Defense'];
    const games = openings.map((opening, i) =>
      createMockHistoryGame({ id: `g${i}`, opening, result: 'win' }),
    );
    const result = analyzeOpenings(games);

    expect(result).toHaveLength(5);
    result.forEach(stats => {
      expect(stats.gamesPlayed).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// sortOpenings
// ---------------------------------------------------------------------------

describe('sortOpenings', () => {
  // Build a reusable set of opening stats for sort tests
  function buildOpeningStats(): ReturnType<typeof analyzeOpenings> {
    const games = [
      // Italian Game: 4 games, 3 wins (75%), most recent 2025-06-15
      createMockHistoryGame({ id: 'it1', opening: 'Italian Game', result: 'win', endedAt: new Date('2025-06-15T00:00:00Z') }),
      createMockHistoryGame({ id: 'it2', opening: 'Italian Game', result: 'win', endedAt: new Date('2025-05-01T00:00:00Z') }),
      createMockHistoryGame({ id: 'it3', opening: 'Italian Game', result: 'win', endedAt: new Date('2025-04-01T00:00:00Z') }),
      createMockHistoryGame({ id: 'it4', opening: 'Italian Game', result: 'loss', endedAt: new Date('2025-03-01T00:00:00Z') }),

      // Sicilian Defense: 2 games, 0 wins (0%), most recent 2025-07-01
      createMockHistoryGame({ id: 'si1', opening: 'Sicilian Defense', result: 'loss', endedAt: new Date('2025-07-01T00:00:00Z') }),
      createMockHistoryGame({ id: 'si2', opening: 'Sicilian Defense', result: 'loss', endedAt: new Date('2025-01-01T00:00:00Z') }),

      // French Defense: 3 games, 1 win (33.3%), most recent 2025-02-01
      createMockHistoryGame({ id: 'fr1', opening: 'French Defense', result: 'win', endedAt: new Date('2025-02-01T00:00:00Z') }),
      createMockHistoryGame({ id: 'fr2', opening: 'French Defense', result: 'loss', endedAt: new Date('2025-01-15T00:00:00Z') }),
      createMockHistoryGame({ id: 'fr3', opening: 'French Defense', result: 'draw', endedAt: new Date('2025-01-10T00:00:00Z') }),
    ];

    return analyzeOpenings(games);
  }

  test('sort by most-played puts highest game count first', () => {
    const openings = buildOpeningStats();
    const sorted = sortOpenings(openings, 'most-played');

    expect(sorted[0].name).toBe('Italian Game'); // 4 games
    expect(sorted[1].name).toBe('French Defense'); // 3 games
    expect(sorted[2].name).toBe('Sicilian Defense'); // 2 games
  });

  test('sort by best-winrate puts highest win rate first', () => {
    const openings = buildOpeningStats();
    const sorted = sortOpenings(openings, 'best-winrate');

    expect(sorted[0].name).toBe('Italian Game'); // 75%
    expect(sorted[1].name).toBe('French Defense'); // 33.3%
    expect(sorted[2].name).toBe('Sicilian Defense'); // 0%
  });

  test('sort by worst-winrate puts lowest win rate first', () => {
    const openings = buildOpeningStats();
    const sorted = sortOpenings(openings, 'worst-winrate');

    expect(sorted[0].name).toBe('Sicilian Defense'); // 0%
    expect(sorted[1].name).toBe('French Defense'); // 33.3%
    expect(sorted[2].name).toBe('Italian Game'); // 75%
  });

  test('sort by most-recent puts most recent lastPlayed first', () => {
    const openings = buildOpeningStats();
    const sorted = sortOpenings(openings, 'most-recent');

    expect(sorted[0].name).toBe('Sicilian Defense'); // 2025-07-01
    expect(sorted[1].name).toBe('Italian Game'); // 2025-06-15
    expect(sorted[2].name).toBe('French Defense'); // 2025-02-01
  });

  test('sort does not mutate original array', () => {
    const openings = buildOpeningStats();
    const originalFirst = openings[0].name;
    sortOpenings(openings, 'worst-winrate');
    expect(openings[0].name).toBe(originalFirst);
  });
});

// ---------------------------------------------------------------------------
// filterOpenings
// ---------------------------------------------------------------------------

describe('filterOpenings', () => {
  function buildFilterableStats(): ReturnType<typeof analyzeOpenings> {
    const games = [
      // Italian Game: white wins, black losses, white draw
      createMockHistoryGame({ id: 'it1', opening: 'Italian Game', playerColor: 'white', result: 'win', endedAt: new Date('2025-06-01T00:00:00Z'), duration: 300 }),
      createMockHistoryGame({ id: 'it2', opening: 'Italian Game', playerColor: 'black', result: 'loss', endedAt: new Date('2025-05-01T00:00:00Z'), duration: 600 }),
      createMockHistoryGame({ id: 'it3', opening: 'Italian Game', playerColor: 'white', result: 'draw', endedAt: new Date('2025-04-01T00:00:00Z'), duration: 900 }),

      // Sicilian Defense: only black games, 1 win 1 loss
      createMockHistoryGame({ id: 'si1', opening: 'Sicilian Defense', playerColor: 'black', result: 'win', endedAt: new Date('2025-03-01T00:00:00Z'), duration: 400 }),
      createMockHistoryGame({ id: 'si2', opening: 'Sicilian Defense', playerColor: 'black', result: 'loss', endedAt: new Date('2025-02-01T00:00:00Z'), duration: 800 }),
    ];

    return analyzeOpenings(games);
  }

  test('filter by result=win keeps only openings with wins', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'win', 'all');

    // Both openings have at least one win
    expect(filtered).toHaveLength(2);
    filtered.forEach(o => {
      expect(o.wins).toBeGreaterThan(0);
      // All filtered games should be wins
      o.games.forEach(g => expect(g.result).toBe('win'));
    });
  });

  test('filter by result=loss keeps only openings with losses', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'loss', 'all');

    expect(filtered).toHaveLength(2);
    filtered.forEach(o => {
      o.games.forEach(g => expect(g.result).toBe('loss'));
    });
  });

  test('filter by result=draw keeps only openings with draws', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'draw', 'all');

    // Only Italian Game has a draw
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Italian Game');
    expect(filtered[0].gamesPlayed).toBe(1);
    expect(filtered[0].draws).toBe(1);
  });

  test('filter by color=white keeps only white games', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'all', 'white');

    // Sicilian has no white games, should be removed
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Italian Game');
    expect(filtered[0].gamesPlayed).toBe(2); // 2 white games in Italian
    filtered[0].games.forEach(g => expect(g.playerColor).toBe('white'));
  });

  test('filter by color=black keeps only black games', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'all', 'black');

    // Both openings have black games
    expect(filtered).toHaveLength(2);
    filtered.forEach(o => {
      o.games.forEach(g => expect(g.playerColor).toBe('black'));
    });
  });

  test('combined filter: color=white + result=win', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'win', 'white');

    // Only Italian Game has a white win
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Italian Game');
    expect(filtered[0].gamesPlayed).toBe(1);
    expect(filtered[0].winRate).toBe(100);
  });

  test('combined filter that matches nothing returns empty', () => {
    const openings = buildFilterableStats();
    // Sicilian has no white games at all
    const filtered = filterOpenings(openings, 'win', 'white');

    const sicilian = filtered.find(o => o.name === 'Sicilian Defense');
    expect(sicilian).toBeUndefined();
  });

  test('filter recalculates stats from filtered games', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'all', 'white');

    const italian = filtered.find(o => o.name === 'Italian Game')!;
    // White games: 1 win, 1 draw => 2 games, 50% win rate
    expect(italian.gamesPlayed).toBe(2);
    expect(italian.wins).toBe(1);
    expect(italian.draws).toBe(1);
    expect(italian.losses).toBe(0);
    expect(italian.winRate).toBe(50);
    expect(italian.gamesAsWhite).toBe(2);
    expect(italian.gamesAsBlack).toBe(0);
  });

  test('filter recalculates averageGameDuration from filtered games', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'all', 'white');

    const italian = filtered.find(o => o.name === 'Italian Game')!;
    // White games durations: 300, 900 => avg 600
    expect(italian.averageGameDuration).toBe(600);
  });

  test('filter with all/all returns all openings unchanged', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'all', 'all');

    expect(filtered).toHaveLength(openings.length);
    expect(filtered[0].gamesPlayed).toBe(openings[0].gamesPlayed);
    expect(filtered[1].gamesPlayed).toBe(openings[1].gamesPlayed);
  });

  test('filter recalculates lastPlayed from filtered games', () => {
    const openings = buildFilterableStats();
    const filtered = filterOpenings(openings, 'all', 'white');

    const italian = filtered.find(o => o.name === 'Italian Game')!;
    // White games: 2025-06-01, 2025-04-01 => lastPlayed = 2025-06-01
    expect(italian.lastPlayed.getTime()).toBe(new Date('2025-06-01T00:00:00Z').getTime());
  });
});
