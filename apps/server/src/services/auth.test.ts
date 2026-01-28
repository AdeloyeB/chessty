/**
 * Auth Service Tests
 *
 * Tests for authentication including:
 * - User registration
 * - User login
 * - Password hashing and verification
 * - JWT token generation and verification
 * - Session management
 */
import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test';
import * as authService from './auth';
import { db, users, sessions } from '../drizzle';

// Mock the drizzle database
mock.module('../drizzle', () => ({
  db: {
    query: {
      users: {
        findFirst: mock(() => Promise.resolve(null)),
      },
      sessions: {
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
    delete: mock(() => ({
      where: mock(() => Promise.resolve([])),
    })),
  },
  users: {
    id: 'id',
    email: 'email',
    username: 'username',
    googleId: 'googleId',
    githubId: 'githubId',
    twitterId: 'twitterId',
    appleId: 'appleId',
  },
  sessions: {
    id: 'id',
  },
}));

// Mock the account lockout module
mock.module('./accountLockout', () => ({
  isAccountLockedByEmail: mock(() => Promise.resolve({ locked: false, userId: null })),
  recordFailedAttempt: mock(() => Promise.resolve({ locked: false, attemptsRemaining: 5 })),
  recordSuccessfulLogin: mock(() => Promise.resolve()),
  getLockoutMessage: mock((ms: number) => `Account locked. Try again in ${Math.ceil(ms / 60000)} minutes.`),
  getAttemptsWarningMessage: mock((remaining: number) => remaining <= 3 ? `${remaining} attempts remaining` : null),
}));

describe('Auth Service - Password Hashing', () => {
  test('should hash password using Argon2id', async () => {
    const password = 'testPassword123!';
    const hash = await authService.hashPassword(password);

    // Argon2id hashes start with $argon2id$
    expect(hash).toMatch(/^\$argon2id\$/);
    // Hash should be different from plaintext
    expect(hash).not.toBe(password);
    // Hash should be sufficiently long
    expect(hash.length).toBeGreaterThan(50);
  });

  test('should produce different hashes for same password (salted)', async () => {
    const password = 'testPassword123!';
    const hash1 = await authService.hashPassword(password);
    const hash2 = await authService.hashPassword(password);

    // Two hashes of the same password should be different due to salting
    expect(hash1).not.toBe(hash2);
  });

  test('should verify correct password', async () => {
    const password = 'testPassword123!';
    const hash = await authService.hashPassword(password);

    const isValid = await authService.verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  test('should reject incorrect password', async () => {
    const password = 'testPassword123!';
    const wrongPassword = 'wrongPassword456!';
    const hash = await authService.hashPassword(password);

    const isValid = await authService.verifyPassword(wrongPassword, hash);
    expect(isValid).toBe(false);
  });

  test('should reject empty password', async () => {
    const password = 'testPassword123!';
    const hash = await authService.hashPassword(password);

    const isValid = await authService.verifyPassword('', hash);
    expect(isValid).toBe(false);
  });
});

describe('Auth Service - Token Generation', () => {
  test('should generate valid JWT token', async () => {
    // Mock session insert
    const mockSession = {
      id: 'session-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    const insertReturningMock = mock(() => Promise.resolve([mockSession]));
    const insertValuesMock = mock(() => ({ returning: insertReturningMock }));
    (db.insert as any) = mock(() => ({ values: insertValuesMock }));

    const token = await authService.generateToken('user-1', '127.0.0.1', 'Test Browser');

    // Token should be a non-empty string
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    // JWT tokens have 3 parts separated by dots
    expect(token.split('.').length).toBe(3);
  });

  test('should generate temp token for MFA', async () => {
    const token = await authService.generateTempToken('user-1');

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(token.split('.').length).toBe(3);
  });
});

describe('Auth Service - Token Verification', () => {
  test('should return null for invalid token', async () => {
    const result = await authService.verifyToken('invalid-token');
    expect(result).toBeNull();
  });

  test('should return null for expired session', async () => {
    // First generate a token to get a valid JWT structure
    const insertValuesMock = mock(() => ({
      returning: mock(() =>
        Promise.resolve([
          {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        ])
      ),
    }));
    (db.insert as any) = mock(() => ({ values: insertValuesMock }));

    const token = await authService.generateToken('user-1');

    // Now mock the session lookup to return an expired session
    const findFirstMock = mock(() =>
      Promise.resolve({
        id: 'session-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      })
    );
    (db.query.sessions.findFirst as any) = findFirstMock;

    const result = await authService.verifyToken(token);
    expect(result).toBeNull();
  });

  test('should verify valid token with active session', async () => {
    // Generate a token - the sessionId is generated by nanoid inside generateToken
    // We need to mock sessions.findFirst to return a valid session for ANY sessionId
    (db.insert as any) = mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{}])),
      })),
    }));

    const token = await authService.generateToken('user-1');

    // Mock valid session lookup - we accept any sessionId
    const findFirstMock = mock(() =>
      Promise.resolve({
        id: 'any-session-id', // The actual ID doesn't matter, we just need a valid session
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    );
    (db.query.sessions.findFirst as any) = findFirstMock;

    const result = await authService.verifyToken(token);

    expect(result).not.toBeNull();
    expect(result?.userId).toBe('user-1');
    // The sessionId is dynamically generated, so we just verify it exists
    expect(result?.sessionId).toBeDefined();
    expect(typeof result?.sessionId).toBe('string');
  });
});

describe('Auth Service - verifyTempToken', () => {
  test('should verify valid temp token', async () => {
    const tempToken = await authService.generateTempToken('user-1');

    const result = await authService.verifyTempToken(tempToken);

    expect(result).not.toBeNull();
    expect(result?.userId).toBe('user-1');
    expect(result?.type).toBe('mfa_pending');
  });

  test('should return null for invalid temp token', async () => {
    const result = await authService.verifyTempToken('invalid-token');
    expect(result).toBeNull();
  });

  test('should return null when using regular token as temp token', async () => {
    // Generate a regular auth token
    const insertValuesMock = mock(() => ({
      returning: mock(() =>
        Promise.resolve([
          {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        ])
      ),
    }));
    (db.insert as any) = mock(() => ({ values: insertValuesMock }));

    const regularToken = await authService.generateToken('user-1');

    // Should fail because regular token doesn't have type: 'mfa_pending'
    const result = await authService.verifyTempToken(regularToken);
    expect(result).toBeNull();
  });
});

describe('Auth Service - Register', () => {
  test('should throw error when email already exists', async () => {
    const existingUser = {
      id: 'existing-user',
      email: 'test@example.com',
      username: 'existinguser',
    };

    const findFirstMock = mock(() => Promise.resolve(existingUser));
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(
      authService.register('test@example.com', 'newuser', 'password123')
    ).rejects.toThrow('User with this email already exists');
  });

  test('should throw error when username already taken', async () => {
    // First call returns null (email not found), second call returns user (username taken)
    let callCount = 0;
    const findFirstMock = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(null); // Email check
      }
      return Promise.resolve({
        id: 'existing-user',
        email: 'other@example.com',
        username: 'testuser',
      }); // Username check
    });
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(
      authService.register('new@example.com', 'testuser', 'password123')
    ).rejects.toThrow('Username already taken');
  });

  test('should successfully register new user', async () => {
    // Mock both email and username checks to return null (not found)
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.users.findFirst as any) = findFirstMock;

    const newUser = {
      id: 'new-user-id',
      email: 'new@example.com',
      username: 'newuser',
      passwordHash: 'hashed',
      eloRating: 1200,
    };

    // Mock user insert
    const userInsertReturningMock = mock(() => Promise.resolve([newUser]));
    const userInsertValuesMock = mock(() => ({ returning: userInsertReturningMock }));

    // Mock session insert (for token generation)
    const sessionInsertReturningMock = mock(() =>
      Promise.resolve([
        {
          id: 'session-1',
          userId: 'new-user-id',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ])
    );
    const sessionInsertValuesMock = mock(() => ({ returning: sessionInsertReturningMock }));

    // Return different mocks based on what's being inserted
    let insertCallCount = 0;
    (db.insert as any) = mock(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return { values: userInsertValuesMock };
      }
      return { values: sessionInsertValuesMock };
    });

    const result = await authService.register('new@example.com', 'newuser', 'password123');

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe('new@example.com');
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
  });

  test('should hash password before storing', async () => {
    // This test verifies the password is hashed, not stored in plaintext
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.users.findFirst as any) = findFirstMock;

    let insertedValues: any = null;
    const userInsertValuesMock = mock((values: any) => {
      insertedValues = values;
      return {
        returning: mock(() =>
          Promise.resolve([
            {
              id: 'new-user-id',
              email: values.email,
              username: values.username,
              passwordHash: values.passwordHash,
            },
          ])
        ),
      };
    });

    const sessionInsertValuesMock = mock(() => ({
      returning: mock(() =>
        Promise.resolve([
          {
            id: 'session-1',
            userId: 'new-user-id',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        ])
      ),
    }));

    let insertCallCount = 0;
    (db.insert as any) = mock(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return { values: userInsertValuesMock };
      }
      return { values: sessionInsertValuesMock };
    });

    await authService.register('new@example.com', 'newuser', 'plaintextPassword');

    // Verify password was hashed
    expect(insertedValues).not.toBeNull();
    expect(insertedValues.passwordHash).not.toBe('plaintextPassword');
    expect(insertedValues.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe('Auth Service - Login', () => {
  test('should throw error for non-existent user', async () => {
    const findFirstMock = mock(() => Promise.resolve(null));
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(authService.login('nonexistent@example.com', 'password')).rejects.toThrow(
      'Invalid credentials'
    );
  });

  test('should throw error for wrong password', async () => {
    const hashedPassword = await authService.hashPassword('correctPassword');
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: hashedPassword,
    };

    const findFirstMock = mock(() => Promise.resolve(mockUser));
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(authService.login('test@example.com', 'wrongPassword')).rejects.toThrow(
      'Invalid credentials'
    );
  });

  test('should succeed with correct credentials', async () => {
    const hashedPassword = await authService.hashPassword('correctPassword');
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: hashedPassword,
      eloRating: 1200,
    };

    const findFirstMock = mock(() => Promise.resolve(mockUser));
    (db.query.users.findFirst as any) = findFirstMock;

    // Mock session insert
    const sessionInsertValuesMock = mock(() => ({
      returning: mock(() =>
        Promise.resolve([
          {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        ])
      ),
    }));
    (db.insert as any) = mock(() => ({ values: sessionInsertValuesMock }));

    const result = await authService.login('test@example.com', 'correctPassword');

    expect(result.user).toBeDefined();
    expect(result.user.id).toBe('user-1');
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
  });

  test('should throw error for OAuth user without password', async () => {
    // OAuth users may not have a passwordHash set
    const mockUser = {
      id: 'user-1',
      email: 'oauth@example.com',
      username: 'oauthuser',
      passwordHash: null, // No password for OAuth users
      googleId: 'google-123',
    };

    const findFirstMock = mock(() => Promise.resolve(mockUser));
    (db.query.users.findFirst as any) = findFirstMock;

    await expect(authService.login('oauth@example.com', 'anypassword')).rejects.toThrow(
      'Invalid credentials'
    );
  });
});

describe('Auth Service - sanitizeUser', () => {
  test('should remove sensitive fields from user object', () => {
    const fullUser = {
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: '$argon2id$secret',
      googleId: 'google-123',
      githubId: 'github-456',
      twitterId: 'twitter-789',
      appleId: 'apple-012',
      eloRating: 1200,
      balance: '1000',
    };

    const sanitized = authService.sanitizeUser(fullUser as any);

    // Sensitive fields should be removed
    expect('passwordHash' in sanitized).toBe(false);
    expect('googleId' in sanitized).toBe(false);
    expect('githubId' in sanitized).toBe(false);
    expect('twitterId' in sanitized).toBe(false);
    expect('appleId' in sanitized).toBe(false);

    // Non-sensitive fields should remain
    expect(sanitized.id).toBe('user-1');
    expect(sanitized.email).toBe('test@example.com');
    expect(sanitized.username).toBe('testuser');
    expect(sanitized.eloRating).toBe(1200);
  });
});

describe('Auth Service - toPublicUser', () => {
  test('should return only public-facing user fields', () => {
    const fullUser = {
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: 'secret',
      eloRating: 1200,
      peakEloRating: 1250,
      gamesPlayed: 50,
      gamesWon: 30,
      gamesLost: 15,
      gamesDraw: 5,
      balance: '1000',
    };

    const publicUser = authService.toPublicUser(fullUser as any);

    expect(publicUser).toEqual({
      id: 'user-1',
      username: 'testuser',
      eloRating: 1200,
      peakEloRating: 1250,
      gamesPlayed: 50,
      gamesWon: 30,
      gamesLost: 15,
      gamesDraw: 5,
    });

    // Sensitive fields should not be present
    expect('email' in publicUser).toBe(false);
    expect('passwordHash' in publicUser).toBe(false);
    expect('balance' in publicUser).toBe(false);
  });
});

describe('Auth Service - Session Management', () => {
  test('should invalidate session', async () => {
    const deleteMock = mock(() => ({
      where: mock(() => Promise.resolve([])),
    }));
    (db.delete as any) = deleteMock;

    await authService.invalidateSession('session-1');

    expect(deleteMock).toHaveBeenCalled();
  });
});
