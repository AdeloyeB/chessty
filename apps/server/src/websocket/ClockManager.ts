import { CLOCK_SYNC_INTERVAL } from '@chess-game/shared';
import type { GameEventEmitter } from '../events/GameEventEmitter';

export interface ClockState {
  whiteTime: number;
  blackTime: number;
  lastUpdate: number;
  isWhiteTurn: boolean;
}

/**
 * Manages clock intervals and clock state for active games.
 * Emits clock:tick and game:timeout events.
 */
export class ClockManager {
  // Map of gameId -> clock state
  private gameClocks = new Map<string, ClockState>();
  // Map of gameId -> interval timer
  private clockIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private events: GameEventEmitter) {}

  /**
   * Initialize clock state for a game.
   */
  initializeClock(gameId: string, whiteTime: number, blackTime: number, isWhiteTurn: boolean): void {
    this.gameClocks.set(gameId, {
      whiteTime,
      blackTime,
      lastUpdate: Date.now(),
      isWhiteTurn,
    });
  }

  /**
   * Start the clock interval for a game.
   * Emits clock:tick every CLOCK_SYNC_INTERVAL and game:timeout if time runs out.
   */
  startClock(gameId: string, increment: number, getWinnerId: (gameId: string, losingColor: 'white' | 'black') => Promise<string | null>): void {
    this.events.emit('clock:started', { gameId, increment });

    const interval = setInterval(async () => {
      const clock = this.gameClocks.get(gameId);
      if (!clock) {
        clearInterval(interval);
        return;
      }

      const now = Date.now();
      const elapsed = (now - clock.lastUpdate) / 1000;

      if (clock.isWhiteTurn) {
        clock.whiteTime = Math.max(0, clock.whiteTime - elapsed);
      } else {
        clock.blackTime = Math.max(0, clock.blackTime - elapsed);
      }
      clock.lastUpdate = now;

      // Check for timeout
      if (clock.whiteTime <= 0 || clock.blackTime <= 0) {
        // Stop interval immediately to prevent multiple timeout emissions
        clearInterval(interval);
        this.clockIntervals.delete(gameId);

        const losingColor: 'white' | 'black' = clock.whiteTime <= 0 ? 'white' : 'black';
        const winnerId = await getWinnerId(gameId, losingColor);
        if (winnerId) {
          await this.events.emit('game:timeout', { gameId, losingColor, winnerId });
        }
        return;
      }

      // Emit clock tick
      this.events.emit('clock:tick', {
        gameId,
        whiteTime: clock.whiteTime,
        blackTime: clock.blackTime,
      });
    }, CLOCK_SYNC_INTERVAL);

    this.clockIntervals.set(gameId, interval);
  }

  /**
   * Stop the clock for a game.
   */
  stopClock(gameId: string): void {
    const interval = this.clockIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.clockIntervals.delete(gameId);
    }
    this.events.emit('clock:stopped', { gameId });
  }

  /**
   * Add increment to the player who just moved and switch turn.
   */
  switchTurn(gameId: string, increment: number): void {
    const clock = this.gameClocks.get(gameId);
    if (!clock) return;

    // Add increment to the player who just moved
    if (clock.isWhiteTurn) {
      clock.whiteTime += increment;
    } else {
      clock.blackTime += increment;
    }

    clock.isWhiteTurn = !clock.isWhiteTurn;
    clock.lastUpdate = Date.now();
  }

  /**
   * Get the current clock state for a game.
   */
  getClockState(gameId: string): ClockState | undefined {
    return this.gameClocks.get(gameId);
  }

  /**
   * Clean up clock state for a game.
   */
  cleanup(gameId: string): void {
    this.stopClock(gameId);
    this.gameClocks.delete(gameId);
  }
}
