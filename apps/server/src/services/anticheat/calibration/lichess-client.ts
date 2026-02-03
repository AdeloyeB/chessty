/**
 * Lichess API Client for Calibration Data
 * ========================================
 *
 * This module fetches game data from Lichess for anti-cheat calibration.
 * It handles:
 * - User status checks (cheater/clean)
 * - Game exports with clock times and evaluations
 * - Rate limiting to avoid API bans
 * - NDJSON streaming for large exports
 *
 * IMPORTANT: Respect Lichess rate limits!
 * - Anonymous: 15 requests/second
 * - With token: 60 requests/second
 * - Be a good citizen - add delays between requests
 */

import type {
  LichessUser,
  LichessGame,
  LichessFetchOptions,
  CalibrationGame,
} from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LICHESS_API_BASE = 'https://lichess.org/api';

// Rate limiting: 1 request per 100ms (10/second) to be safe
const REQUEST_DELAY_MS = 100;

// Default options for game fetching
const DEFAULT_FETCH_OPTIONS: LichessFetchOptions = {
  max: 100,
  clocks: true,
  evals: true,
  rated: true,
};

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

/**
 * Wait to respect rate limits before making a request
 */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise(resolve =>
      setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch a Lichess user's profile to check their status
 *
 * @param username - Lichess username
 * @returns User object with tosViolation field
 */
export async function fetchUser(username: string): Promise<LichessUser | null> {
  await rateLimit();

  try {
    const response = await fetch(`${LICHESS_API_BASE}/user/${username}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // User not found
      }
      throw new Error(`Lichess API error: ${response.status}`);
    }

    return await response.json() as LichessUser;
  } catch (error) {
    console.error(`[Lichess] Failed to fetch user ${username}:`, error);
    return null;
  }
}

/**
 * Check if a user has been banned for cheating
 *
 * @param username - Lichess username
 * @returns true if banned, false if clean, null if user not found
 */
export async function isUserCheater(username: string): Promise<boolean | null> {
  const user = await fetchUser(username);

  if (!user) {
    return null;
  }

  // tosViolation is true for banned cheaters
  return user.tosViolation === true;
}

/**
 * Fetch games for a user in NDJSON format
 *
 * Games are streamed as newline-delimited JSON, which is efficient
 * for large exports. We parse each line as a separate game object.
 *
 * @param username - Lichess username
 * @param options - Fetch options (max games, time control, etc.)
 * @returns Array of game objects
 */
export async function fetchUserGames(
  username: string,
  options: LichessFetchOptions = {}
): Promise<LichessGame[]> {
  await rateLimit();

  const opts = { ...DEFAULT_FETCH_OPTIONS, ...options };

  // Build query parameters
  const params = new URLSearchParams();
  if (opts.max) params.set('max', opts.max.toString());
  if (opts.perfType) params.set('perfType', opts.perfType);
  if (opts.clocks) params.set('clocks', 'true');
  if (opts.evals) params.set('evals', 'true');
  if (opts.rated) params.set('rated', 'true');
  if (opts.since) params.set('since', opts.since.toString());
  if (opts.until) params.set('until', opts.until.toString());

  const url = `${LICHESS_API_BASE}/games/user/${username}?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/x-ndjson',
      },
    });

    if (!response.ok) {
      throw new Error(`Lichess API error: ${response.status}`);
    }

    // Parse NDJSON (newline-delimited JSON)
    const text = await response.text();
    const lines = text.trim().split('\n').filter(line => line.length > 0);

    return lines.map(line => JSON.parse(line) as LichessGame);
  } catch (error) {
    console.error(`[Lichess] Failed to fetch games for ${username}:`, error);
    return [];
  }
}

/**
 * Convert a Lichess game to our CalibrationGame format
 *
 * @param game - Lichess game object
 * @param isCheater - Whether the player is a confirmed cheater
 * @param playerColor - Which color to analyze ('white' or 'black')
 * @returns CalibrationGame ready for analysis, or null if invalid
 */
export function convertToCalibrationGame(
  game: LichessGame,
  isCheater: boolean,
  playerColor: 'white' | 'black'
): CalibrationGame | null {
  // Skip games without moves
  if (!game.moves) {
    return null;
  }

  // Skip non-standard variants
  if (game.variant !== 'standard') {
    return null;
  }

  // Get player info
  const playerInfo = game.players[playerColor];
  if (!playerInfo.rating) {
    return null;
  }

  // Parse moves
  const moves = game.moves.split(' ');
  if (moves.length < 10) {
    return null; // Skip very short games
  }

  // Convert clock times from centiseconds to seconds
  let clockTimes: number[] | undefined;
  if (game.clocks) {
    // Clocks alternate between white and black
    // Extract only the relevant player's clock times
    clockTimes = [];
    for (let i = playerColor === 'white' ? 0 : 1; i < game.clocks.length; i += 2) {
      clockTimes.push(game.clocks[i] / 100); // Convert centiseconds to seconds
    }
  }

  // Extract evaluations for ALL plies (both players)
  // We preserve the full sequence so CPL calculations in calibrator.ts
  // can correctly compare consecutive positions. The calibrator will
  // select the appropriate indices based on playerColor (evens for white,
  // odds for black) when computing centipawn loss.
  let evaluations: number[] | undefined;
  if (game.analysis) {
    evaluations = [];
    for (let i = 0; i < game.analysis.length; i++) {
      const analysis = game.analysis[i];
      if (analysis?.eval !== undefined) {
        evaluations.push(analysis.eval);
      } else if (analysis?.mate !== undefined) {
        // Convert mate to a large centipawn value
        evaluations.push(analysis.mate > 0 ? 10000 : -10000);
      } else {
        // Push 0 as placeholder for missing evaluations to maintain alignment
        evaluations.push(0);
      }
    }
  }

  // Map speed to time control
  const timeControl = game.speed === 'correspondence' ? 'classical' : game.speed;

  return {
    gameId: game.id,
    isCheater,
    playerRating: playerInfo.rating,
    timeControl,
    playerColor,
    moves,
    clockTimes,
    evaluations,
  };
}

// ---------------------------------------------------------------------------
// Dataset Collection
// ---------------------------------------------------------------------------

/**
 * Fetch a balanced dataset of cheater and clean games
 *
 * This function:
 * 1. Takes a list of known cheater usernames
 * 2. Takes a list of clean player usernames at similar ratings
 * 3. Fetches games from both groups
 * 4. Returns a balanced dataset for calibration
 *
 * @param cheaterUsernames - Array of confirmed cheater usernames
 * @param cleanUsernames - Array of verified clean player usernames
 * @param gamesPerPlayer - Number of games to fetch per player
 * @param options - Additional fetch options
 * @returns Array of CalibrationGame objects
 */
export async function fetchCalibrationDataset(
  cheaterUsernames: string[],
  cleanUsernames: string[],
  gamesPerPlayer: number = 50,
  options: LichessFetchOptions = {}
): Promise<CalibrationGame[]> {
  const dataset: CalibrationGame[] = [];
  const fetchOpts = { ...options, max: gamesPerPlayer };

  console.log(`[Calibration] Fetching games from ${cheaterUsernames.length} cheaters...`);

  // Fetch cheater games
  for (const username of cheaterUsernames) {
    const games = await fetchUserGames(username, fetchOpts);

    for (const game of games) {
      // Determine which color the cheater was playing
      const isWhite = game.players.white.user?.name?.toLowerCase() === username.toLowerCase();
      const playerColor = isWhite ? 'white' : 'black';

      const calibrationGame = convertToCalibrationGame(game, true, playerColor);
      if (calibrationGame) {
        dataset.push(calibrationGame);
      }
    }

    console.log(`[Calibration] Fetched ${games.length} games from cheater: ${username}`);
  }

  console.log(`[Calibration] Fetching games from ${cleanUsernames.length} clean players...`);

  // Fetch clean player games
  for (const username of cleanUsernames) {
    const games = await fetchUserGames(username, fetchOpts);

    for (const game of games) {
      const isWhite = game.players.white.user?.name?.toLowerCase() === username.toLowerCase();
      const playerColor = isWhite ? 'white' : 'black';

      const calibrationGame = convertToCalibrationGame(game, false, playerColor);
      if (calibrationGame) {
        dataset.push(calibrationGame);
      }
    }

    console.log(`[Calibration] Fetched ${games.length} games from clean player: ${username}`);
  }

  console.log(`[Calibration] Total dataset size: ${dataset.length} games`);
  console.log(`[Calibration] Cheater games: ${dataset.filter(g => g.isCheater).length}`);
  console.log(`[Calibration] Clean games: ${dataset.filter(g => !g.isCheater).length}`);

  return dataset;
}

/**
 * Find players who were recently banned on Lichess
 *
 * This is a helper function that searches for banned players
 * by checking the leaderboard periodically for accounts that
 * suddenly become disabled/banned.
 *
 * NOTE: This is a simplified version. In production, you'd want
 * to use Lichess's data exports or community-maintained lists.
 *
 * @param count - Number of cheater usernames to find
 * @returns Array of confirmed cheater usernames
 */
export async function findRecentCheaters(_count: number): Promise<string[]> {
  // In a real implementation, this would:
  // 1. Query Lichess API for recently closed accounts
  // 2. Filter for those with tosViolation: true
  // 3. Verify they have enough games for analysis
  //
  // For now, this is a placeholder that would need to be
  // populated with known cheater accounts from:
  // - Lichess database dumps (mark games where player was later banned)
  // - Community reports
  // - Manual curation

  console.warn('[Calibration] findRecentCheaters is a placeholder - populate with known cheaters');

  // Return empty array - caller should provide usernames manually
  return [];
}
