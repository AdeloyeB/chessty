/**
 * Discord Service Tests
 *
 * Tests for the Discord integration business logic.
 * These tests mock the database to test the service layer in isolation.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Mock the database module before importing the service
const mockDb = {
  insert: mock(() => ({
    values: mock(() => Promise.resolve()),
  })),
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([])),
      })),
      leftJoin: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([])),
        })),
      })),
      orderBy: mock(() => ({
        limit: mock(() => Promise.resolve([])),
      })),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([])),
      })),
    })),
  })),
  delete: mock(() => ({
    where: mock(() => ({
      returning: mock(() => Promise.resolve([])),
    })),
  })),
  transaction: mock((fn: (tx: any) => Promise<any>) => fn(mockDb)),
};

mock.module('../drizzle', () => ({
  db: mockDb,
  users: {},
  userProfiles: {},
  discordChallenges: {},
  discordLinkTokens: {},
}));

// Now import the service (after mocking)
import {
  createLinkToken,
  isAccountLinked,
  getStatsByDiscordId,
  getEloLeaderboard,
  getWinningsLeaderboard,
} from './discord';

describe('Discord Service', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mock.restore();
  });

  describe('createLinkToken', () => {
    it('should create a link token with correct properties', async () => {
      const discordId = '123456789012345678';
      const discordUsername = 'testuser';
      const discordAvatar = 'abc123';

      const token = await createLinkToken(discordId, discordUsername, discordAvatar);

      expect(token.discordId).toBe(discordId);
      expect(token.discordUsername).toBe(discordUsername);
      expect(token.discordAvatar).toBe(discordAvatar);
      expect(token.token).toHaveLength(32); // nanoid(32)
      expect(token.used).toBe(false);
      expect(token.expiresAt).toBeInstanceOf(Date);
      expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should create token with null avatar', async () => {
      const token = await createLinkToken('123', 'user', null);
      expect(token.discordAvatar).toBeNull();
    });
  });

  describe('isAccountLinked', () => {
    it('should return false when no user found', async () => {
      // Mock returns empty array (no user found)
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }));

      const result = await isAccountLinked('nonexistent');
      expect(result).toBe(false);
    });

    it('should return true when user found', async () => {
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 'user-123' }]),
          }),
        }),
      }));

      const result = await isAccountLinked('existing-discord-id');
      expect(result).toBe(true);
    });
  });

  describe('getStatsByDiscordId', () => {
    it('should return null when user not found', async () => {
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        }),
      }));

      const stats = await getStatsByDiscordId('nonexistent');
      expect(stats).toBeNull();
    });

    it('should return formatted stats when user found', async () => {
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    username: 'testuser',
                    displayName: 'Test User',
                    eloRating: 1500,
                    peakEloRating: 1600,
                    gamesPlayed: 100,
                    gamesWon: 60,
                    gamesLost: 35,
                    gamesDraw: 5,
                    currentStreak: 3,
                  },
                ]),
            }),
          }),
        }),
      }));

      const stats = await getStatsByDiscordId('discord-123');

      expect(stats).not.toBeNull();
      expect(stats!.username).toBe('testuser');
      expect(stats!.displayName).toBe('Test User');
      expect(stats!.eloRating).toBe(1500);
      expect(stats!.winRate).toBe(60); // 60/100 = 60%
      expect(stats!.currentStreak).toBe(3);
    });

    it('should calculate win rate as 0 when no games played', async () => {
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    username: 'newuser',
                    displayName: null,
                    eloRating: 1200,
                    peakEloRating: 1200,
                    gamesPlayed: 0,
                    gamesWon: 0,
                    gamesLost: 0,
                    gamesDraw: 0,
                    currentStreak: 0,
                  },
                ]),
            }),
          }),
        }),
      }));

      const stats = await getStatsByDiscordId('discord-new');
      expect(stats!.winRate).toBe(0);
    });
  });

  describe('getEloLeaderboard', () => {
    it('should return empty array when no players', async () => {
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        }),
      }));

      const leaderboard = await getEloLeaderboard(10);
      expect(leaderboard).toEqual([]);
    });

    it('should return ranked entries', async () => {
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () =>
                Promise.resolve([
                  { username: 'player1', displayName: 'Player One', eloRating: 2000 },
                  { username: 'player2', displayName: null, eloRating: 1800 },
                  { username: 'player3', displayName: 'Player Three', eloRating: 1600 },
                ]),
            }),
          }),
        }),
      }));

      const leaderboard = await getEloLeaderboard(10);

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].username).toBe('player1');
      expect(leaderboard[0].value).toBe(2000);
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[2].rank).toBe(3);
    });
  });

  describe('getWinningsLeaderboard', () => {
    it('should parse totalWon as float', async () => {
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () =>
                Promise.resolve([
                  { username: 'whale', displayName: 'Whale', totalWon: '10000.50' },
                ]),
            }),
          }),
        }),
      }));

      const leaderboard = await getWinningsLeaderboard(10);

      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].value).toBe(10000.50);
    });
  });
});

describe('Discord Service - Challenge Flow', () => {
  // Import challenge-related functions for testing
  let createChallenge: typeof import('./discord').createChallenge;
  let acceptChallenge: typeof import('./discord').acceptChallenge;
  let declineChallenge: typeof import('./discord').declineChallenge;
  let completeChallenge: typeof import('./discord').completeChallenge;
  let expireChallenges: typeof import('./discord').expireChallenges;

  beforeEach(async () => {
    // Re-import to get fresh module with mocks
    const discordModule = await import('./discord');
    createChallenge = discordModule.createChallenge;
    acceptChallenge = discordModule.acceptChallenge;
    declineChallenge = discordModule.declineChallenge;
    completeChallenge = discordModule.completeChallenge;
    expireChallenges = discordModule.expireChallenges;
  });

  // Mock challenge data for realistic test scenarios
  const mockChallengeData = {
    id: 'challenge-123',
    challengerId: 'user-1',
    challengerDiscordId: '123456789',
    opponentDiscordId: '987654321',
    opponentId: null,
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: null,
    status: 'pending' as const,
    gameId: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
  };

  it('createChallenge should fail if challenger not linked', async () => {
    // Mock: getUserByDiscordId returns null for challenger (not linked)
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]), // No user found - challenger not linked
        }),
      }),
    }));

    const result = await createChallenge(
      'unlinked-discord-id',
      '987654321',
      'guild-1',
      'channel-1'
    );

    expect(result.error).toBe('CHALLENGER_NOT_LINKED');
    expect(result.challenge).toBeNull();
  });

  it('createChallenge should succeed even if opponent not linked', async () => {
    let callCount = 0;

    // Mock sequence:
    // 1st call: getUserByDiscordId for challenger (returns user)
    // 2nd call: getUserByDiscordId for opponent (returns null - not linked)
    // 3rd call: check for existing pending challenge (returns empty)
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            callCount++;
            if (callCount === 1) {
              // Challenger is linked
              return Promise.resolve([{ id: 'user-1' }]);
            } else if (callCount === 2) {
              // Opponent is NOT linked
              return Promise.resolve([]);
            } else {
              // No existing pending challenge
              return Promise.resolve([]);
            }
          },
        }),
      }),
    }));

    mockDb.insert.mockImplementation(() => ({
      values: () => Promise.resolve(),
    }));

    const result = await createChallenge(
      '123456789',
      '987654321',
      'guild-1',
      'channel-1'
    );

    expect(result.error).toBeUndefined();
    expect(result.challenge).toBeDefined();
    expect(result.challenge.challengerDiscordId).toBe('123456789');
    expect(result.challenge.opponentDiscordId).toBe('987654321');
    expect(result.challenge.opponentId).toBeNull(); // Opponent not linked
    expect(result.challenge.status).toBe('pending');
  });

  it('createChallenge should prevent duplicate pending challenges', async () => {
    let callCount = 0;

    // Mock sequence:
    // 1st call: challenger is linked
    // 2nd call: opponent check (can be linked or not)
    // 3rd call: existing pending challenge found
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: 'user-1' }]); // Challenger linked
            } else if (callCount === 2) {
              return Promise.resolve([]); // Opponent not linked
            } else {
              // Existing pending challenge found!
              return Promise.resolve([mockChallengeData]);
            }
          },
        }),
      }),
    }));

    const result = await createChallenge(
      '123456789',
      '987654321',
      'guild-1',
      'channel-1'
    );

    expect(result.error).toBe('CHALLENGE_ALREADY_EXISTS');
    expect(result.challenge).toBeNull();
  });

  it('acceptChallenge should update status to accepted', async () => {
    const acceptedChallenge = {
      ...mockChallengeData,
      status: 'accepted' as const,
      opponentId: 'user-2',
    };

    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([acceptedChallenge]),
        }),
      }),
    }));

    const result = await acceptChallenge('challenge-123', 'user-2');

    expect(result).toBe(true);
  });

  it('acceptChallenge should return false if challenge not pending', async () => {
    // Challenge is already accepted/declined/expired - no rows updated
    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]), // No rows affected
        }),
      }),
    }));

    const result = await acceptChallenge('challenge-123', 'user-2');

    expect(result).toBe(false);
  });

  it('declineChallenge should update status to declined', async () => {
    const declinedChallenge = {
      ...mockChallengeData,
      status: 'declined' as const,
    };

    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([declinedChallenge]),
        }),
      }),
    }));

    const result = await declineChallenge('challenge-123');

    expect(result).toBe(true);
  });

  it('declineChallenge should return false if challenge not pending', async () => {
    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]), // No rows affected
        }),
      }),
    }));

    const result = await declineChallenge('challenge-123');

    expect(result).toBe(false);
  });

  it('completeChallenge should set gameId and status', async () => {
    const completedChallenge = {
      ...mockChallengeData,
      status: 'completed' as const,
      gameId: 'game-abc123',
    };

    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([completedChallenge]),
        }),
      }),
    }));

    const result = await completeChallenge('challenge-123', 'game-abc123');

    expect(result).toBe(true);
  });

  it('completeChallenge should return false if challenge not in accepted status', async () => {
    // Only challenges with status 'accepted' can be completed
    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]), // No rows affected (not accepted)
        }),
      }),
    }));

    const result = await completeChallenge('challenge-123', 'game-abc123');

    expect(result).toBe(false);
  });

  it('expireChallenges should expire old pending challenges', async () => {
    // Simulate 3 challenges being expired
    const expiredChallenges = [
      { ...mockChallengeData, id: 'challenge-1', status: 'expired' as const },
      { ...mockChallengeData, id: 'challenge-2', status: 'expired' as const },
      { ...mockChallengeData, id: 'challenge-3', status: 'expired' as const },
    ];

    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(expiredChallenges),
        }),
      }),
    }));

    const count = await expireChallenges();

    expect(count).toBe(3);
  });

  it('expireChallenges should return 0 when no challenges to expire', async () => {
    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]), // No expired challenges
        }),
      }),
    }));

    const count = await expireChallenges();

    expect(count).toBe(0);
  });
});

describe('Discord Service - Link Token Flow', () => {
  let verifyLinkToken: typeof import('./discord').verifyLinkToken;
  let cleanupExpiredLinkTokens: typeof import('./discord').cleanupExpiredLinkTokens;

  beforeEach(async () => {
    const discordModule = await import('./discord');
    verifyLinkToken = discordModule.verifyLinkToken;
    cleanupExpiredLinkTokens = discordModule.cleanupExpiredLinkTokens;
  });

  // Mock link token data
  const mockLinkToken = {
    token: 'abc123def456ghi789jkl012mno345pq',
    discordId: '123456789012345678',
    discordUsername: 'testuser#1234',
    discordAvatar: 'avatar-hash-123',
    expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
    used: false,
  };

  it('verifyLinkToken should return null for expired token', async () => {
    // Query returns empty because token is expired (WHERE expiresAt > NOW() fails)
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]), // No token found (expired)
        }),
      }),
    }));

    const result = await verifyLinkToken('expired-token', 'user-123');

    expect(result).toBeNull();
  });

  it('verifyLinkToken should return null for used token', async () => {
    // Query returns empty because token is already used (WHERE used = false fails)
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]), // No token found (already used)
        }),
      }),
    }));

    const result = await verifyLinkToken('used-token', 'user-123');

    expect(result).toBeNull();
  });

  it('verifyLinkToken should return null if Discord already linked to different user', async () => {
    let callCount = 0;

    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            callCount++;
            if (callCount === 1) {
              // Token is valid
              return Promise.resolve([mockLinkToken]);
            } else {
              // Discord ID is already linked to a DIFFERENT user
              return Promise.resolve([{ id: 'different-user-456' }]);
            }
          },
        }),
      }),
    }));

    // User trying to link: 'user-123'
    // But Discord ID is already linked to: 'different-user-456'
    const result = await verifyLinkToken(mockLinkToken.token, 'user-123');

    expect(result).toBeNull();
  });

  it('verifyLinkToken should link Discord ID and mark token used', async () => {
    let selectCallCount = 0;

    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // Token is valid
              return Promise.resolve([mockLinkToken]);
            } else {
              // Discord ID not linked to any user yet
              return Promise.resolve([]);
            }
          },
        }),
      }),
    }));

    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => {
          return Promise.resolve();
        },
      }),
    }));

    // Mock the transaction to actually execute the callback
    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      // Create a mock transaction object that behaves like the real db
      const txMock = {
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      };
      return fn(txMock);
    });

    const result = await verifyLinkToken(mockLinkToken.token, 'user-123');

    expect(result).not.toBeNull();
    expect(result?.discordId).toBe(mockLinkToken.discordId);
    expect(result?.discordUsername).toBe(mockLinkToken.discordUsername);
  });

  it('verifyLinkToken should allow relinking same Discord ID to same user', async () => {
    let selectCallCount = 0;

    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // Token is valid
              return Promise.resolve([mockLinkToken]);
            } else {
              // Discord ID is already linked to the SAME user (re-linking is OK)
              return Promise.resolve([{ id: 'user-123' }]);
            }
          },
        }),
      }),
    }));

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const txMock = {
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      };
      return fn(txMock);
    });

    // Same user relinking their Discord account
    const result = await verifyLinkToken(mockLinkToken.token, 'user-123');

    expect(result).not.toBeNull();
    expect(result?.discordId).toBe(mockLinkToken.discordId);
  });

  it('cleanupExpiredLinkTokens should delete expired tokens', async () => {
    // Simulate 5 expired tokens being deleted
    const deletedTokens = [
      { ...mockLinkToken, token: 'token-1' },
      { ...mockLinkToken, token: 'token-2' },
      { ...mockLinkToken, token: 'token-3' },
      { ...mockLinkToken, token: 'token-4' },
      { ...mockLinkToken, token: 'token-5' },
    ];

    mockDb.delete.mockImplementation(() => ({
      where: () => ({
        returning: () => Promise.resolve(deletedTokens),
      }),
    }));

    const count = await cleanupExpiredLinkTokens();

    expect(count).toBe(5);
  });

  it('cleanupExpiredLinkTokens should return 0 when no tokens to delete', async () => {
    mockDb.delete.mockImplementation(() => ({
      where: () => ({
        returning: () => Promise.resolve([]), // No expired tokens
      }),
    }));

    const count = await cleanupExpiredLinkTokens();

    expect(count).toBe(0);
  });
});
