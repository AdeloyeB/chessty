/**
 * Game Service Tests
 *
 * Tests for the game lifecycle management including:
 * - Game retrieval
 * - Making moves
 * - Ending games (win/loss/draw)
 * - Canceling pending games
 * - Player color and turn detection
 */
import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test';
import * as gameService from './game';
import * as eloService from './elo';
import * as bettingService from './betting';
import * as settlementService from './settlement';
import { db } from '../drizzle';

// Mock the drizzle database
mock.module('../drizzle', () => ({
  db: {
    query: {
      games: {
        findFirst: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
      },
      users: {
        findFirst: mock(() => Promise.resolve(null)),
      },
      transactions: {
        findMany: mock(() => Promise.resolve([])),
      },
      spectatorPredictions: {
        findMany: mock(() => Promise.resolve([])),
      },
    },
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(() => Promise.resolve([{}])),
        })),
      })),
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([{ count: 0 }])),
      })),
    })),
  },
  games: { id: 'id' },
  users: { id: 'id' },
  transactions: { userId: 'userId', createdAt: 'createdAt' },
}));

// Mock dependent services
mock.module('./wallet', () => ({
  awardWinnings: mock(() => Promise.resolve(100)),
}));

mock.module('./elo', () => ({
  updateEloRatings: mock(() =>
    Promise.resolve({
      whiteChange: 10,
      blackChange: -10,
      whiteNewElo: 1210,
      blackNewElo: 1190,
    })
  ),
}));

mock.module('./betting', () => ({
  settleBetsForGame: mock(() => Promise.resolve()),
}));

// Mock settlement service (game.ts now delegates fund distribution to settlement)
mock.module('./settlement', () => ({
  processSettlement: mock(() => Promise.resolve()),
}));

// Mock spectator prediction service
mock.module('./spectatorPrediction', () => ({
  settlePredictionsForGame: mock(() => Promise.resolve()),
}));

describe('Game Service', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mock.restore();
  });

  describe('getGame', () => {
    test('should return null when game not found', async () => {
      // The mock already returns null by default
      const result = await gameService.getGame('non-existent-game');
      expect(result).toBeNull();
    });

    test('should return game when found', async () => {
      const mockGame = {
        id: 'test-game-1',
        whitePlayerId: 'user-1',
        blackPlayerId: 'user-2',
        status: 'active',
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        moves: [],
        wagerAmount: '10',
        totalPot: '20',
      };

      // Override the mock for this specific test
      const findFirstMock = mock(() => Promise.resolve(mockGame));
      (db.query.games.findFirst as any) = findFirstMock;

      const result = await gameService.getGame('test-game-1');
      expect(result).toEqual(mockGame);
    });
  });

  describe('getActiveGames', () => {
    test('should return only active games', async () => {
      const mockActiveGames = [
        { id: 'game-1', status: 'active' },
        { id: 'game-2', status: 'active' },
      ];

      const findManyMock = mock(() => Promise.resolve(mockActiveGames));
      (db.query.games.findMany as any) = findManyMock;

      const result = await gameService.getActiveGames();
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('active');
    });

    test('should return empty array when no active games', async () => {
      const findManyMock = mock(() => Promise.resolve([]));
      (db.query.games.findMany as any) = findManyMock;

      const result = await gameService.getActiveGames();
      expect(result).toEqual([]);
    });
  });

  describe('isPlayerInGame', () => {
    const mockGame = {
      id: 'test-game',
      whitePlayerId: 'user-white',
      blackPlayerId: 'user-black',
      status: 'active',
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    };

    test('should return true for white player', () => {
      expect(gameService.isPlayerInGame(mockGame as any, 'user-white')).toBe(true);
    });

    test('should return true for black player', () => {
      expect(gameService.isPlayerInGame(mockGame as any, 'user-black')).toBe(true);
    });

    test('should return false for spectator', () => {
      expect(gameService.isPlayerInGame(mockGame as any, 'user-spectator')).toBe(false);
    });
  });

  describe('getPlayerColor', () => {
    const mockGame = {
      id: 'test-game',
      whitePlayerId: 'user-white',
      blackPlayerId: 'user-black',
      status: 'active',
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    };

    test('should return "white" for white player', () => {
      expect(gameService.getPlayerColor(mockGame as any, 'user-white')).toBe('white');
    });

    test('should return "black" for black player', () => {
      expect(gameService.getPlayerColor(mockGame as any, 'user-black')).toBe('black');
    });

    test('should return null for non-player', () => {
      expect(gameService.getPlayerColor(mockGame as any, 'user-other')).toBeNull();
    });
  });

  describe('isPlayerTurn', () => {
    test('should return true when it is white turn and user is white', () => {
      const mockGame = {
        id: 'test-game',
        whitePlayerId: 'user-white',
        blackPlayerId: 'user-black',
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      };

      expect(gameService.isPlayerTurn(mockGame as any, 'user-white')).toBe(true);
    });

    test('should return false when it is white turn but user is black', () => {
      const mockGame = {
        id: 'test-game',
        whitePlayerId: 'user-white',
        blackPlayerId: 'user-black',
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      };

      expect(gameService.isPlayerTurn(mockGame as any, 'user-black')).toBe(false);
    });

    test('should return true when it is black turn and user is black', () => {
      // FEN after 1. e4 - now black's turn
      const mockGame = {
        id: 'test-game',
        whitePlayerId: 'user-white',
        blackPlayerId: 'user-black',
        currentFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      };

      expect(gameService.isPlayerTurn(mockGame as any, 'user-black')).toBe(true);
    });

    test('should return false for non-player', () => {
      const mockGame = {
        id: 'test-game',
        whitePlayerId: 'user-white',
        blackPlayerId: 'user-black',
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      };

      expect(gameService.isPlayerTurn(mockGame as any, 'user-spectator')).toBe(false);
    });
  });
});

describe('Game Service - endGame', () => {
  test('should throw error when game not found', async () => {
    // Mock getGame to return null
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.games.findFirst as any) = findFirstMock;

    await expect(gameService.endGame('non-existent', 'white_wins', 'user-1')).rejects.toThrow(
      'Game not found'
    );
  });

  test('should award winnings to winner on checkmate', async () => {
    const mockGame = {
      id: 'test-game-1',
      whitePlayerId: 'user-white',
      blackPlayerId: 'user-black',
      status: 'active',
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      wagerAmount: '50',
      totalPot: '100',
      whiteEloAtStart: 1200,
      blackEloAtStart: 1200,
    };

    const findFirstMock = mock(() => Promise.resolve(mockGame));
    (db.query.games.findFirst as any) = findFirstMock;

    // Track if settlement service was called (fund distribution now delegated to settlement)
    const processSettlementSpy = spyOn(settlementService, 'processSettlement').mockResolvedValue(undefined);
    const updateEloSpy = spyOn(eloService, 'updateEloRatings').mockResolvedValue({
      whiteChange: 10,
      blackChange: -10,
      whiteNewElo: 1210,
      blackNewElo: 1190,
    });
    const settleBetsSpy = spyOn(bettingService, 'settleBetsForGame').mockResolvedValue(undefined);

    // Mock the update chain
    const returningMock = mock(() =>
      Promise.resolve([
        {
          ...mockGame,
          status: 'completed',
          result: 'white_wins',
          winnerId: 'user-white',
        },
      ])
    );
    const whereMock = mock(() => ({ returning: returningMock }));
    const setMock = mock(() => ({ where: whereMock }));
    (db.update as any) = mock(() => ({ set: setMock }));

    const _result = await gameService.endGame('test-game-1', 'white_wins', 'user-white');

    // Verify settlement service was called to handle fund distribution
    // (previously wallet service was called directly, now delegated to settlement for anti-cheat evaluation)
    expect(processSettlementSpy).toHaveBeenCalledWith('test-game-1', 'user-white', 'user-black', 100);

    // Verify ELO was updated
    expect(updateEloSpy).toHaveBeenCalled();

    // Verify bets were settled
    expect(settleBetsSpy).toHaveBeenCalledWith('test-game-1', 'user-white');
  });

  test('should delegate draw handling to settlement service', async () => {
    const mockGame = {
      id: 'test-game-1',
      whitePlayerId: 'user-white',
      blackPlayerId: 'user-black',
      status: 'active',
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      wagerAmount: '50',
      totalPot: '100',
      whiteEloAtStart: 1200,
      blackEloAtStart: 1200,
    };

    const findFirstMock = mock(() => Promise.resolve(mockGame));
    (db.query.games.findFirst as any) = findFirstMock;

    // Settlement service handles draw refunds (fund distribution delegated to settlement)
    const processSettlementSpy = spyOn(settlementService, 'processSettlement').mockResolvedValue(undefined);

    spyOn(eloService, 'updateEloRatings').mockResolvedValue({
      whiteChange: 0,
      blackChange: 0,
      whiteNewElo: 1200,
      blackNewElo: 1200,
    });
    spyOn(bettingService, 'settleBetsForGame').mockResolvedValue(undefined);

    // Mock the update chain
    const returningMock = mock(() =>
      Promise.resolve([
        {
          ...mockGame,
          status: 'completed',
          result: 'draw',
          winnerId: null,
        },
      ])
    );
    const whereMock = mock(() => ({ returning: returningMock }));
    const setMock = mock(() => ({ where: whereMock }));
    (db.update as any) = mock(() => ({ set: setMock }));

    await gameService.endGame('test-game-1', 'draw', null);

    // Settlement service should be called with null winnerId and loserId for draws
    // The settlement service handles refunding both players
    expect(processSettlementSpy).toHaveBeenCalledWith('test-game-1', null, null, 100);
  });
});

describe('Game Service - cancelGame', () => {
  test('should throw error when game not found', async () => {
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.games.findFirst as any) = findFirstMock;

    await expect(gameService.cancelGame('non-existent')).rejects.toThrow('Game not found');
  });

  test('should throw error when game is not pending', async () => {
    const mockGame = {
      id: 'test-game-1',
      status: 'active', // Not pending
    };

    const findFirstMock = mock(() => Promise.resolve(mockGame));
    (db.query.games.findFirst as any) = findFirstMock;

    await expect(gameService.cancelGame('test-game-1')).rejects.toThrow(
      'Can only cancel pending games'
    );
  });

  test('should cancel pending game and set status to cancelled', async () => {
    const mockGame = {
      id: 'test-game-1',
      status: 'pending',
      whitePlayerId: 'user-white',
      blackPlayerId: 'user-black',
    };

    const findFirstMock = mock(() => Promise.resolve(mockGame));
    (db.query.games.findFirst as any) = findFirstMock;

    const cancelledGame = {
      ...mockGame,
      status: 'cancelled',
      endedAt: new Date(),
    };

    const returningMock = mock(() => Promise.resolve([cancelledGame]));
    const whereMock = mock(() => ({ returning: returningMock }));
    const setMock = mock(() => ({ where: whereMock }));
    (db.update as any) = mock(() => ({ set: setMock }));

    const result = await gameService.cancelGame('test-game-1');

    expect(result.status).toBe('cancelled');
  });
});

describe('Game Service - makeMove', () => {
  test('should throw error when game not found', async () => {
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.games.findFirst as any) = findFirstMock;

    await expect(
      gameService.makeMove(
        'non-existent',
        { from: 'e2', to: 'e4' },
        'new-fen',
        'new-pgn',
        300,
        300
      )
    ).rejects.toThrow('Game not found');
  });

  test('should update game with new move data', async () => {
    const mockGame = {
      id: 'test-game-1',
      status: 'active',
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      pgn: '',
      moves: [],
      whiteTimeRemaining: 300,
      blackTimeRemaining: 300,
    };

    const findFirstMock = mock(() => Promise.resolve(mockGame));
    (db.query.games.findFirst as any) = findFirstMock;

    const newMove = { from: 'e2', to: 'e4' };
    const newFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const newPgn = '1. e4';

    const updatedGame = {
      ...mockGame,
      currentFen: newFen,
      pgn: newPgn,
      moves: [newMove],
      whiteTimeRemaining: 295,
      blackTimeRemaining: 300,
    };

    const returningMock = mock(() => Promise.resolve([updatedGame]));
    const whereMock = mock(() => ({ returning: returningMock }));
    const setMock = mock(() => ({ where: whereMock }));
    (db.update as any) = mock(() => ({ set: setMock }));

    const result = await gameService.makeMove('test-game-1', newMove, newFen, newPgn, 295, 300);

    expect(result.currentFen).toBe(newFen);
    expect(result.pgn).toBe(newPgn);
    expect(result.moves).toHaveLength(1);
    expect(result.whiteTimeRemaining).toBe(295);
  });
});
