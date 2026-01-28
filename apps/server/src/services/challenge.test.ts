/**
 * Challenge Service Tests
 *
 * Tests for the challenge system including:
 * - Creating challenges
 * - Accepting challenges
 * - Confirming challenges (with idempotency)
 * - Canceling and declining challenges
 * - Creating games from confirmed challenges
 */
import { describe, test, expect, mock, spyOn } from 'bun:test';
import * as challengeService from './challenge';
import * as walletService from './wallet';
import { db } from '../drizzle';

// Mock the drizzle database
mock.module('../drizzle', () => ({
  db: {
    query: {
      users: {
        findFirst: mock(() => Promise.resolve(null)),
      },
      challenges: {
        findFirst: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
      },
      games: {
        findFirst: mock(() => Promise.resolve(null)),
      },
    },
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{}])),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(() => Promise.resolve([{}])),
        })),
      })),
    })),
    transaction: mock(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        query: {
          challenges: {
            findFirst: mock(() => Promise.resolve(null)),
          },
        },
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() => Promise.resolve([{}])),
            })),
          })),
        })),
      };
      return await fn(mockTx);
    }),
  },
  challenges: {
    id: 'id',
    creatorId: 'creatorId',
    status: 'status',
    creatorConfirmed: 'creatorConfirmed',
    acceptorConfirmed: 'acceptorConfirmed',
  },
  users: {
    id: 'id',
    balance: 'balance',
  },
  games: {
    id: 'id',
  },
}));

// Mock wallet service
mock.module('./wallet', () => ({
  deductWager: mock(() => Promise.resolve(90)),
  refundWager: mock(() => Promise.resolve(100)),
}));

// Mock chess960 service
mock.module('./chess960', () => ({
  generateChess960Position: mock(() => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
}));

// Mock shared module
mock.module('@chess-game/shared', () => ({
  CHALLENGE_TIME_CONTROLS: {
    '5+0': { initial: 300, increment: 0 },
    '5+3': { initial: 300, increment: 3 },
    '10+0': { initial: 600, increment: 0 },
    '15+10': { initial: 900, increment: 10 },
  },
  CHALLENGE_EXPIRATION: 3600000, // 1 hour
  STARTING_FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
}));

describe('Challenge Service - createChallenge', () => {
  test('should throw error when user not found', async () => {
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(
      challengeService.createChallenge('non-existent', 'standard', '5+0', 10)
    ).rejects.toThrow('User not found');
  });

  test('should throw error for invalid time control', async () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      balance: '1000',
      eloRating: 1200,
    };

    const findFirstMock = mock(() => Promise.resolve(mockUser));
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(
      challengeService.createChallenge('user-1', 'standard', 'invalid', 10)
    ).rejects.toThrow('Invalid time control');
  });

  test('should throw error when user has insufficient balance', async () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      balance: '5', // Only 5, need 10
      eloRating: 1200,
    };

    const findFirstMock = mock(() => Promise.resolve(mockUser));
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(
      challengeService.createChallenge('user-1', 'standard', '5+0', 10)
    ).rejects.toThrow('Insufficient balance');
  });

  test('should throw error when user already has open challenge', async () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      balance: '1000',
      eloRating: 1200,
    };

    let userFindCount = 0;
    const findFirstMock = mock(() => {
      userFindCount++;
      if (userFindCount === 1) {
        return Promise.resolve(mockUser);
      }
      // Second call is for challenge check
      return Promise.resolve({
        id: 'existing-challenge',
        creatorId: 'user-1',
        status: 'open',
      });
    });
    (db.query.users.findFirst as any) = findFirstMock;
    (db.query.challenges.findFirst as any) = mock(() =>
      Promise.resolve({
        id: 'existing-challenge',
        creatorId: 'user-1',
        status: 'open',
      })
    );

    await expect(
      challengeService.createChallenge('user-1', 'standard', '5+0', 10)
    ).rejects.toThrow('You already have an open challenge');
  });

  test('should successfully create challenge and deduct wager', async () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      balance: '1000',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const findFirstMock = mock(() => Promise.resolve(mockUser));
    (db.query.users.findFirst as any) = findFirstMock;
    (db.query.challenges.findFirst as any) = mock(() => Promise.resolve(null));

    // Track deductWager call
    const deductWagerSpy = spyOn(walletService, 'deductWager').mockResolvedValue(990);

    // Mock challenge insert
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      gameMode: 'standard',
      timeControlKey: '5+0',
      timeControlInitial: 300,
      timeControlIncrement: 0,
      wagerAmount: '10',
      minElo: null,
      maxElo: null,
      status: 'open',
      acceptedById: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    };

    const insertReturningMock = mock(() => Promise.resolve([mockChallenge]));
    const insertValuesMock = mock(() => ({ returning: insertReturningMock }));
    (db.insert as any) = mock(() => ({ values: insertValuesMock }));

    const result = await challengeService.createChallenge('user-1', 'standard', '5+0', 10);

    // Verify wager was deducted
    expect(deductWagerSpy).toHaveBeenCalledWith('user-1', 10, 'challenge-pending');

    // Verify challenge was created
    expect(result.id).toBeDefined();
    expect(result.creatorId).toBe('user-1');
    expect(result.wagerAmount).toBe(10);
    expect(result.status).toBe('open');
  });

  test('should create challenge with ELO restrictions', async () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      balance: '1000',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const findFirstMock = mock(() => Promise.resolve(mockUser));
    (db.query.users.findFirst as any) = findFirstMock;
    (db.query.challenges.findFirst as any) = mock(() => Promise.resolve(null));

    spyOn(walletService, 'deductWager').mockResolvedValue(990);

    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      gameMode: 'standard',
      timeControlKey: '5+0',
      timeControlInitial: 300,
      timeControlIncrement: 0,
      wagerAmount: '10',
      minElo: 1000,
      maxElo: 1400,
      status: 'open',
      acceptedById: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    };

    const insertReturningMock = mock(() => Promise.resolve([mockChallenge]));
    const insertValuesMock = mock(() => ({ returning: insertReturningMock }));
    (db.insert as any) = mock(() => ({ values: insertValuesMock }));

    const result = await challengeService.createChallenge('user-1', 'standard', '5+0', 10, 1000, 1400);

    expect(result.minElo).toBe(1000);
    expect(result.maxElo).toBe(1400);
  });
});

describe('Challenge Service - acceptChallenge', () => {
  test('should throw error when challenge not found', async () => {
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.challenges.findFirst as any) = findFirstMock;

    await expect(challengeService.acceptChallenge('non-existent', 'user-2')).rejects.toThrow(
      'Challenge not found'
    );
  });

  test('should throw error when challenge is not open', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      status: 'accepted', // Already accepted
      wagerAmount: '10',
      minElo: null,
      maxElo: null,
      expiresAt: new Date(Date.now() + 3600000),
      creator: { id: 'user-1', username: 'creator' },
    };

    const findFirstMock = mock(() => Promise.resolve(mockChallenge));
    (db.query.challenges.findFirst as any) = findFirstMock;

    // Mock acceptor user lookup
    const mockAcceptor = {
      id: 'user-2',
      username: 'acceptor',
      balance: '1000',
      eloRating: 1200,
    };
    (db.query.users.findFirst as any) = mock(() => Promise.resolve(mockAcceptor));

    // Mock db.update to return empty array (simulating atomic update failure
    // because WHERE status='open' doesn't match when status='accepted')
    const updateReturningMock = mock(() => Promise.resolve([]));
    const updateWhereMock = mock(() => ({ returning: updateReturningMock }));
    const updateSetMock = mock(() => ({ where: updateWhereMock }));
    (db.update as any) = mock(() => ({ set: updateSetMock }));

    await expect(challengeService.acceptChallenge('challenge-1', 'user-2')).rejects.toThrow(
      'Challenge is no longer available'
    );
  });

  test('should throw error when trying to accept own challenge', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      status: 'open',
      expiresAt: new Date(Date.now() + 3600000),
      creator: { id: 'user-1', username: 'creator' },
    };

    const findFirstMock = mock(() => Promise.resolve(mockChallenge));
    (db.query.challenges.findFirst as any) = findFirstMock;

    await expect(challengeService.acceptChallenge('challenge-1', 'user-1')).rejects.toThrow(
      'Cannot accept your own challenge'
    );
  });

  test('should throw error when acceptor ELO is below minimum', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      status: 'open',
      minElo: 1500,
      maxElo: null,
      expiresAt: new Date(Date.now() + 3600000),
      creator: { id: 'user-1', username: 'creator' },
    };

    (db.query.challenges.findFirst as any) = mock(() => Promise.resolve(mockChallenge));

    const mockAcceptor = {
      id: 'user-2',
      username: 'acceptor',
      balance: '1000',
      eloRating: 1200, // Below min of 1500
    };

    (db.query.users.findFirst as any) = mock(() => Promise.resolve(mockAcceptor));

    await expect(challengeService.acceptChallenge('challenge-1', 'user-2')).rejects.toThrow(
      'Your ELO is below the minimum required'
    );
  });

  test('should throw error when acceptor has insufficient balance', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      status: 'open',
      wagerAmount: '100',
      minElo: null,
      maxElo: null,
      expiresAt: new Date(Date.now() + 3600000),
      creator: { id: 'user-1', username: 'creator' },
    };

    (db.query.challenges.findFirst as any) = mock(() => Promise.resolve(mockChallenge));

    const mockAcceptor = {
      id: 'user-2',
      username: 'acceptor',
      balance: '50', // Only 50, need 100
      eloRating: 1200,
    };

    (db.query.users.findFirst as any) = mock(() => Promise.resolve(mockAcceptor));

    await expect(challengeService.acceptChallenge('challenge-1', 'user-2')).rejects.toThrow(
      'Insufficient balance'
    );
  });

  test('should successfully accept challenge and deduct wager from acceptor', async () => {
    const mockCreator = {
      id: 'user-1',
      username: 'creator',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const mockAcceptor = {
      id: 'user-2',
      username: 'acceptor',
      balance: '1000',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      gameMode: 'standard',
      timeControlKey: '5+0',
      timeControlInitial: 300,
      timeControlIncrement: 0,
      status: 'open',
      wagerAmount: '10',
      minElo: null,
      maxElo: null,
      expiresAt: new Date(Date.now() + 3600000),
      creator: mockCreator,
    };

    (db.query.challenges.findFirst as any) = mock(() => Promise.resolve(mockChallenge));
    (db.query.users.findFirst as any) = mock(() => Promise.resolve(mockAcceptor));

    // Track deductWager call
    const deductWagerSpy = spyOn(walletService, 'deductWager').mockResolvedValue(990);

    // Mock challenge update
    const updatedChallenge = {
      ...mockChallenge,
      status: 'accepted',
      acceptedById: 'user-2',
    };

    const updateReturningMock = mock(() => Promise.resolve([updatedChallenge]));
    const updateWhereMock = mock(() => ({ returning: updateReturningMock }));
    const updateSetMock = mock(() => ({ where: updateWhereMock }));
    (db.update as any) = mock(() => ({ set: updateSetMock }));

    const result = await challengeService.acceptChallenge('challenge-1', 'user-2');

    // Verify wager was deducted from acceptor
    expect(deductWagerSpy).toHaveBeenCalledWith('user-2', 10, 'challenge-challenge-1');

    // Verify challenge was accepted
    expect(result.status).toBe('accepted');
    expect(result.acceptedById).toBe('user-2');
  });
});

/**
 * Helper to create a mock transaction that supports Drizzle's SELECT FOR UPDATE pattern
 */
function createMockTx(challengeRow: any, users: { creator: any; acceptor?: any }) {
  return {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          for: mock(() => Promise.resolve(challengeRow ? [challengeRow] : [])),
        })),
      })),
    })),
    query: {
      users: {
        findFirst: mock(({ where: _where }: any) => {
          // Return creator or acceptor based on what's being queried
          if (users.acceptor) {
            // For simplicity, return creator first, then acceptor
            return Promise.resolve(users.creator);
          }
          return Promise.resolve(users.creator);
        }),
      },
    },
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(() => Promise.resolve([challengeRow])),
        })),
      })),
    })),
  };
}

describe('Challenge Service - confirmChallenge', () => {
  test('should throw error when challenge not found', async () => {
    // Mock transaction with SELECT FOR UPDATE returning empty array
    (db.transaction as any) = mock(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = createMockTx(null, { creator: null });
      return await fn(mockTx);
    });

    await expect(challengeService.confirmChallenge('non-existent', 'user-1')).rejects.toThrow(
      'Challenge not found'
    );
  });

  test('should throw error when challenge is not in accepted state', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      acceptedById: 'user-2',
      status: 'open', // Not accepted
      creatorConfirmed: false,
      acceptorConfirmed: false,
    };

    (db.transaction as any) = mock(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = createMockTx(mockChallenge, {
        creator: { id: 'user-1', username: 'creator' },
      });
      return await fn(mockTx);
    });

    await expect(challengeService.confirmChallenge('challenge-1', 'user-1')).rejects.toThrow(
      'Challenge is not in accepted state'
    );
  });

  test('should be idempotent - safe to call twice by same user', async () => {
    const mockCreator = {
      id: 'user-1',
      username: 'creator',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const mockAcceptor = {
      id: 'user-2',
      username: 'acceptor',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    // Challenge already confirmed by creator
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      acceptedById: 'user-2',
      gameMode: 'standard',
      timeControlKey: '5+0',
      timeControlInitial: 300,
      timeControlIncrement: 0,
      wagerAmount: '10',
      status: 'accepted',
      creatorConfirmed: true, // Already confirmed!
      acceptorConfirmed: false,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      minElo: null,
      maxElo: null,
    };

    let userQueryCount = 0;
    (db.transaction as any) = mock(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              for: mock(() => Promise.resolve([mockChallenge])),
            })),
          })),
        })),
        query: {
          users: {
            findFirst: mock(() => {
              userQueryCount++;
              if (userQueryCount === 1) return Promise.resolve(mockCreator);
              return Promise.resolve(mockAcceptor);
            }),
          },
        },
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() => Promise.resolve([mockChallenge])),
            })),
          })),
        })),
      };
      return await fn(mockTx);
    });

    // Creator confirms again - should be idempotent
    const result = await challengeService.confirmChallenge('challenge-1', 'user-1');

    // Should not throw and should return current state
    expect(result.confirmed).toBe(false); // bothConfirmed is false since acceptor hasn't confirmed
    expect(result.challenge).toBeDefined();
  });

  test('should return bothConfirmed=true when both players have confirmed', async () => {
    const mockCreator = {
      id: 'user-1',
      username: 'creator',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const mockAcceptor = {
      id: 'user-2',
      username: 'acceptor',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    // Creator has already confirmed
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      acceptedById: 'user-2',
      gameMode: 'standard',
      timeControlKey: '5+0',
      timeControlInitial: 300,
      timeControlIncrement: 0,
      wagerAmount: '10',
      status: 'accepted',
      creatorConfirmed: true, // Creator confirmed
      acceptorConfirmed: false, // Acceptor not yet confirmed
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      minElo: null,
      maxElo: null,
    };

    const updatedChallenge = {
      ...mockChallenge,
      acceptorConfirmed: true,
    };

    let userQueryCount = 0;
    (db.transaction as any) = mock(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              for: mock(() => Promise.resolve([mockChallenge])),
            })),
          })),
        })),
        query: {
          users: {
            findFirst: mock(() => {
              userQueryCount++;
              if (userQueryCount === 1) return Promise.resolve(mockCreator);
              return Promise.resolve(mockAcceptor);
            }),
          },
        },
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() => Promise.resolve([updatedChallenge])),
            })),
          })),
        })),
      };
      return await fn(mockTx);
    });

    // Acceptor confirms
    const result = await challengeService.confirmChallenge('challenge-1', 'user-2');

    expect(result.confirmed).toBe(true);
    expect(result.challenge).toBeDefined();
  });

  test('should return bothConfirmed=false when only one player has confirmed', async () => {
    const mockCreator = {
      id: 'user-1',
      username: 'creator',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const mockAcceptor = {
      id: 'user-2',
      username: 'acceptor',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    // Neither has confirmed yet
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      acceptedById: 'user-2',
      gameMode: 'standard',
      timeControlKey: '5+0',
      timeControlInitial: 300,
      timeControlIncrement: 0,
      wagerAmount: '10',
      status: 'accepted',
      creatorConfirmed: false,
      acceptorConfirmed: false,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      minElo: null,
      maxElo: null,
    };

    const updatedChallenge = {
      ...mockChallenge,
      creatorConfirmed: true,
    };

    let userQueryCount = 0;
    (db.transaction as any) = mock(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              for: mock(() => Promise.resolve([mockChallenge])),
            })),
          })),
        })),
        query: {
          users: {
            findFirst: mock(() => {
              userQueryCount++;
              if (userQueryCount === 1) return Promise.resolve(mockCreator);
              return Promise.resolve(mockAcceptor);
            }),
          },
        },
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(() => Promise.resolve([updatedChallenge])),
            })),
          })),
        })),
      };
      return await fn(mockTx);
    });

    // Creator confirms first
    const result = await challengeService.confirmChallenge('challenge-1', 'user-1');

    expect(result.confirmed).toBe(false); // Acceptor hasn't confirmed yet
    expect(result.challenge).toBeDefined();
  });
});

describe('Challenge Service - cancelChallenge', () => {
  test('should throw error when challenge not found', async () => {
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.challenges.findFirst as any) = findFirstMock;

    await expect(challengeService.cancelChallenge('non-existent', 'user-1')).rejects.toThrow(
      'Challenge not found'
    );
  });

  test('should throw error when user is not the creator', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      status: 'open',
    };

    const findFirstMock = mock(() => Promise.resolve(mockChallenge));
    (db.query.challenges.findFirst as any) = findFirstMock;

    await expect(challengeService.cancelChallenge('challenge-1', 'user-2')).rejects.toThrow(
      'Not authorized'
    );
  });

  test('should throw error when challenge is not open', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      status: 'accepted', // Not open
    };

    const findFirstMock = mock(() => Promise.resolve(mockChallenge));
    (db.query.challenges.findFirst as any) = findFirstMock;

    await expect(challengeService.cancelChallenge('challenge-1', 'user-1')).rejects.toThrow(
      'Challenge cannot be cancelled'
    );
  });

  test('should refund wager when challenge is cancelled', async () => {
    const mockChallenge = {
      id: 'challenge-1',
      creatorId: 'user-1',
      status: 'open',
      wagerAmount: '10',
    };

    const findFirstMock = mock(() => Promise.resolve(mockChallenge));
    (db.query.challenges.findFirst as any) = findFirstMock;

    const refundWagerSpy = spyOn(walletService, 'refundWager').mockResolvedValue(1010);

    const updateReturningMock = mock(() => Promise.resolve([{ ...mockChallenge, status: 'cancelled' }]));
    const updateWhereMock = mock(() => ({ returning: updateReturningMock }));
    const updateSetMock = mock(() => ({ where: updateWhereMock }));
    (db.update as any) = mock(() => ({ set: updateSetMock }));

    await challengeService.cancelChallenge('challenge-1', 'user-1');

    expect(refundWagerSpy).toHaveBeenCalledWith('user-1', 10, 'challenge-1');
  });
});

describe('Challenge Service - getOpenChallenges', () => {
  test('should return empty array when no challenges exist', async () => {
    const findManyMock = mock(() => Promise.resolve([]));
    (db.query.challenges.findMany as any) = findManyMock;

    const result = await challengeService.getOpenChallenges();

    expect(result).toEqual([]);
  });

  test('should return only non-expired open challenges', async () => {
    const mockCreator = {
      id: 'user-1',
      username: 'creator',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    };

    const mockChallenges = [
      {
        id: 'challenge-1',
        creatorId: 'user-1',
        gameMode: 'standard',
        timeControlKey: '5+0',
        timeControlInitial: 300,
        timeControlIncrement: 0,
        wagerAmount: '10',
        status: 'open',
        minElo: null,
        maxElo: null,
        acceptedById: null,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        creator: mockCreator,
      },
    ];

    const findManyMock = mock(() => Promise.resolve(mockChallenges));
    (db.query.challenges.findMany as any) = findManyMock;

    const result = await challengeService.getOpenChallenges();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('open');
  });
});
