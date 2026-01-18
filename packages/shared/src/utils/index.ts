import { ELO_K_FACTOR, ELO_DIVISOR, ELO_ODDS_WEIGHT, TIME_ODDS_WEIGHT, HOUSE_EDGE_SPECTATOR } from '../constants';

/**
 * Calculate expected score for ELO calculation
 * @param playerElo Player's current ELO
 * @param opponentElo Opponent's current ELO
 * @returns Expected score between 0 and 1
 */
export function calculateExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / ELO_DIVISOR));
}

/**
 * Calculate new ELO rating after a game
 * @param playerElo Player's current ELO
 * @param opponentElo Opponent's current ELO
 * @param actualScore 1 for win, 0.5 for draw, 0 for loss
 * @returns New ELO rating
 */
export function calculateNewElo(playerElo: number, opponentElo: number, actualScore: number): number {
  const expectedScore = calculateExpectedScore(playerElo, opponentElo);
  const newElo = playerElo + ELO_K_FACTOR * (actualScore - expectedScore);
  return Math.round(newElo);
}

/**
 * Calculate ELO change for both players
 * @param whiteElo White player's ELO
 * @param blackElo Black player's ELO
 * @param result 'white' | 'black' | 'draw'
 * @returns Object with white and black ELO changes
 */
export function calculateEloChanges(
  whiteElo: number,
  blackElo: number,
  result: 'white' | 'black' | 'draw'
): { whiteChange: number; blackChange: number } {
  const whiteScore = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
  const blackScore = result === 'black' ? 1 : result === 'draw' ? 0.5 : 0;

  const newWhiteElo = calculateNewElo(whiteElo, blackElo, whiteScore);
  const newBlackElo = calculateNewElo(blackElo, whiteElo, blackScore);

  return {
    whiteChange: newWhiteElo - whiteElo,
    blackChange: newBlackElo - blackElo,
  };
}

/**
 * Calculate betting odds based on ELO difference and time remaining
 * @param playerElo Player's ELO
 * @param opponentElo Opponent's ELO
 * @param playerTimeRemaining Player's remaining time (optional)
 * @param opponentTimeRemaining Opponent's remaining time (optional)
 * @returns Odds multiplier for the player
 */
export function calculateOdds(
  playerElo: number,
  opponentElo: number,
  playerTimeRemaining?: number,
  opponentTimeRemaining?: number
): number {
  // ELO-based probability
  const eloProb = calculateExpectedScore(playerElo, opponentElo);

  // Time-based probability adjustment (if time is provided)
  let timeProb = 0.5;
  if (playerTimeRemaining !== undefined && opponentTimeRemaining !== undefined) {
    const totalTime = playerTimeRemaining + opponentTimeRemaining;
    if (totalTime > 0) {
      timeProb = playerTimeRemaining / totalTime;
    }
  }

  // Combined probability
  const combinedProb =
    playerTimeRemaining !== undefined
      ? ELO_ODDS_WEIGHT * eloProb + TIME_ODDS_WEIGHT * timeProb
      : eloProb;

  // Convert probability to odds with house edge
  // Odds = (1 / probability) * (1 - house_edge)
  const rawOdds = 1 / Math.max(combinedProb, 0.01); // prevent division by zero
  const oddsWithHouse = rawOdds * (1 - HOUSE_EDGE_SPECTATOR);

  // Round to 2 decimal places, minimum 1.01
  return Math.max(1.01, Math.round(oddsWithHouse * 100) / 100);
}

/**
 * Calculate potential payout for a bet
 * @param amount Bet amount
 * @param odds Odds multiplier
 * @returns Potential payout
 */
export function calculatePotentialPayout(amount: number, odds: number): number {
  return Math.round(amount * odds * 100) / 100;
}

/**
 * Format time in mm:ss format
 * @param seconds Time in seconds
 * @returns Formatted time string
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time in h:mm:ss format for longer durations
 * @param seconds Time in seconds
 * @returns Formatted time string
 */
export function formatLongTime(seconds: number): string {
  if (seconds < 3600) {
    return formatTime(seconds);
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generate a random alphanumeric string
 * @param length Length of the string
 * @returns Random string
 */
export function generateId(length: number = 21): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Check if two stake amounts are compatible within tolerance
 * @param stake1 First stake amount
 * @param stake2 Second stake amount
 * @param tolerance Tolerance percentage (0-1)
 * @returns Whether stakes are compatible
 */
export function areStakesCompatible(stake1: number, stake2: number, tolerance: number = 0.2): boolean {
  const diff = Math.abs(stake1 - stake2);
  const maxAllowedDiff = Math.max(stake1, stake2) * tolerance;
  return diff <= maxAllowedDiff;
}

/**
 * Check if ELO is within range
 * @param playerElo Player's ELO
 * @param minElo Minimum ELO (null for no minimum)
 * @param maxElo Maximum ELO (null for no maximum)
 * @returns Whether ELO is within range
 */
export function isEloInRange(playerElo: number, minElo: number | null, maxElo: number | null): boolean {
  if (minElo !== null && playerElo < minElo) return false;
  if (maxElo !== null && playerElo > maxElo) return false;
  return true;
}

/**
 * Get color name from player position
 * @param isWhite Whether the player is white
 * @returns Color name
 */
export function getColorName(isWhite: boolean): 'white' | 'black' {
  return isWhite ? 'white' : 'black';
}

/**
 * Parse PGN move notation to extract move number
 * @param pgn PGN string
 * @returns Current move number
 */
export function getMoveNumber(pgn: string): number {
  const moves = pgn.trim().split(/\s+/);
  let moveNumber = 0;
  for (const part of moves) {
    if (part.includes('.')) {
      const num = parseInt(part.replace('.', ''));
      if (!isNaN(num)) {
        moveNumber = num;
      }
    }
  }
  return moveNumber;
}

/**
 * Validate email format
 * @param email Email address
 * @returns Whether email is valid
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate username format
 * @param username Username
 * @returns Whether username is valid
 */
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
  return usernameRegex.test(username);
}

/**
 * Delay execution
 * @param ms Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clamp a number between min and max
 * @param value Value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
