/**
 * Wallet Authentication Route Tests
 *
 * Tests for the wallet authentication HTTP endpoints including:
 * - Nonce generation (POST /api/auth/wallet/nonce)
 * - Signature verification (POST /api/auth/wallet/verify)
 * - Wallet linking (POST /api/auth/wallet/link)
 * - Display name management (POST /api/auth/wallet/display-name)
 * - Display name availability check (GET /api/auth/wallet/display-name/check)
 *
 * IMPORTANT: These tests require isolation due to Bun's module caching.
 * Run with: `bun test src/routes/walletAuth.routes.test.ts`
 *
 * When running the full test suite (`bun test`), these tests are SKIPPED
 * to avoid mock interference with other test files.
 */

// ============================================================================
// ISOLATION CHECK: Skip when running full test suite
// ============================================================================
import { describe as bunDescribe, test, expect, mock, beforeEach } from 'bun:test';

const ISOLATED_RUN = process.argv.some(arg => arg.includes('walletAuth.routes.test.ts'));
const describe = ISOLATED_RUN ? bunDescribe : bunDescribe.skip;

if (!ISOLATED_RUN) {
  console.log('[walletAuth.routes.test.ts] Skipped in full suite - run: bun test src/routes/walletAuth.routes.test.ts');
}

// ============================================================================
// IMPORTANT: Mock modules BEFORE importing the route handlers
// ============================================================================

// ============================================================================
// Mock Setup - MUST come BEFORE importing route handlers
// ============================================================================

// Mock the wallet auth service
const mockGenerateWalletNonce = mock(() => 'test-nonce-12345');
const mockValidateWalletNonce = mock(() => true);
const mockExtractNonceFromMessage = mock(() => 'test-nonce-12345');
const mockExtractAddressFromMessage = mock(() => '0x1234567890123456789012345678901234567890');
const mockVerifySiweSignature = mock(() => Promise.resolve(true));
const mockFindOrCreateWalletUser = mock(() =>
  Promise.resolve({
    user: {
      id: 'user-1',
      username: 'wallet_123456',
      displayName: 'TestUser',
      email: null,
      walletAddress: '0x1234567890123456789012345678901234567890',
      balance: '1000',
      eloRating: 1200,
      peakEloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDraw: 0,
    },
    token: 'jwt-token-12345',
    isNewUser: false,
  })
);
const mockLinkWalletToUser = mock(() =>
  Promise.resolve({
    id: 'user-1',
    username: 'testuser',
    displayName: 'TestUser',
    email: 'test@example.com',
    walletAddress: '0x1234567890123456789012345678901234567890',
    balance: '1000',
    eloRating: 1200,
    peakEloRating: 1200,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDraw: 0,
  })
);
const mockSetDisplayName = mock(() =>
  Promise.resolve({
    id: 'user-1',
    username: 'wallet_123456',
    displayName: 'NewDisplayName',
    email: null,
    walletAddress: '0x1234567890123456789012345678901234567890',
    balance: '1000',
    eloRating: 1200,
    peakEloRating: 1200,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDraw: 0,
  })
);
const mockIsDisplayNameAvailable = mock(() => Promise.resolve(true));

mock.module('../services/walletAuth', () => ({
  generateWalletNonce: mockGenerateWalletNonce,
  validateWalletNonce: mockValidateWalletNonce,
  extractNonceFromMessage: mockExtractNonceFromMessage,
  extractAddressFromMessage: mockExtractAddressFromMessage,
  verifySiweSignature: mockVerifySiweSignature,
  findOrCreateWalletUser: mockFindOrCreateWalletUser,
  linkWalletToUser: mockLinkWalletToUser,
  setDisplayName: mockSetDisplayName,
  isDisplayNameAvailable: mockIsDisplayNameAvailable,
}));

// Mock the auth service
const mockGenerateTempToken = mock(() => Promise.resolve('temp-token-12345'));
const mockVerifyToken = mock(() => Promise.resolve({ userId: 'user-1', sessionId: 'session-1' }));
const mockToPublicUser = mock((user: any) => ({
  id: user.id,
  username: user.username,
  eloRating: user.eloRating,
  peakEloRating: user.peakEloRating,
  gamesPlayed: user.gamesPlayed,
  gamesWon: user.gamesWon,
  gamesLost: user.gamesLost,
  gamesDraw: user.gamesDraw,
}));

mock.module('../services/auth', () => ({
  generateTempToken: mockGenerateTempToken,
  verifyToken: mockVerifyToken,
  toPublicUser: mockToPublicUser,
}));

// Mock MFA service
const mockHasMFAEnabled = mock(() => Promise.resolve(false));

mock.module('../services/mfa', () => ({
  hasMFAEnabled: mockHasMFAEnabled,
}));

// Mock rate limiter
const mockLoginLimiter = {
  consume: mock(() => ({ allowed: true, remainingPoints: 5 })),
  reset: mock(() => {}),
};

mock.module('../services/rateLimit', () => ({
  loginLimiter: mockLoginLimiter,
  getClientIp: mock(() => '127.0.0.1'),
}));

// NOW import the route handlers after mocks are set up
import {
  handleWalletNonce,
  handleWalletVerify,
  handleWalletLink,
  handleSetDisplayName,
  handleCheckDisplayName,
} from './walletAuth';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock Request object with JSON body
 */
function createRequest(
  body: object | null,
  options: { method?: string; headers?: Record<string, string>; url?: string } = {}
): Request {
  const { method = 'POST', headers = {}, url = 'http://localhost:3001/api/auth/wallet/nonce' } = options;

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Parse JSON response body
 */
async function parseResponse(response: Response): Promise<any> {
  return response.json();
}

// ============================================================================
// Tests: POST /api/auth/wallet/nonce
// ============================================================================

describe('Wallet Auth Routes - POST /api/auth/wallet/nonce', () => {
  beforeEach(() => {
    // Reset mocks
    mockGenerateWalletNonce.mockClear();
    mockGenerateWalletNonce.mockImplementation(() => 'test-nonce-12345');
  });

  test('should return a nonce for valid address', async () => {
    const req = createRequest({ address: '0x1234567890123456789012345678901234567890' });

    const response = await handleWalletNonce(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.nonce).toBe('test-nonce-12345');
    expect(mockGenerateWalletNonce).toHaveBeenCalled();
  });

  test('should return 400 for missing address', async () => {
    const req = createRequest({});

    const response = await handleWalletNonce(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('Address is required');
  });

  test('should return 400 for invalid address format (non-string)', async () => {
    const req = createRequest({ address: 12345 });

    const response = await handleWalletNonce(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  test('should return 400 for null body', async () => {
    const req = new Request('http://localhost:3001/api/auth/wallet/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json',
    });

    const response = await handleWalletNonce(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
});

// ============================================================================
// Tests: POST /api/auth/wallet/verify
// ============================================================================

describe('Wallet Auth Routes - POST /api/auth/wallet/verify', () => {
  beforeEach(() => {
    // Reset mocks to default successful behavior
    mockLoginLimiter.consume.mockClear();
    mockLoginLimiter.consume.mockImplementation(() => ({ allowed: true, remainingPoints: 5 }));
    mockLoginLimiter.reset.mockClear();
    mockValidateWalletNonce.mockClear();
    mockValidateWalletNonce.mockImplementation(() => true);
    mockExtractNonceFromMessage.mockClear();
    mockExtractNonceFromMessage.mockImplementation(() => 'test-nonce-12345');
    mockExtractAddressFromMessage.mockClear();
    mockExtractAddressFromMessage.mockImplementation(() => '0x1234567890123456789012345678901234567890');
    mockVerifySiweSignature.mockClear();
    mockVerifySiweSignature.mockImplementation(() => Promise.resolve(true));
    mockFindOrCreateWalletUser.mockClear();
    mockFindOrCreateWalletUser.mockImplementation(() =>
      Promise.resolve({
        user: {
          id: 'user-1',
          username: 'wallet_123456',
          displayName: 'TestUser',
          email: null,
          walletAddress: '0x1234567890123456789012345678901234567890',
          balance: '1000',
          eloRating: 1200,
          peakEloRating: 1200,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesLost: 0,
          gamesDraw: 0,
        },
        token: 'jwt-token-12345',
        isNewUser: false,
      })
    );
    mockHasMFAEnabled.mockClear();
    mockHasMFAEnabled.mockImplementation(() => Promise.resolve(false));
  });

  test('should verify valid signature and return JWT', async () => {
    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-token-12345');
    expect(body.data.user).toBeDefined();
    expect(body.data.isNewUser).toBe(false);
    expect(body.data.needsDisplayName).toBe(false);
    expect(mockLoginLimiter.reset).toHaveBeenCalled();
  });

  test('should return isNewUser: true for new wallet', async () => {
    // Update the mock to return the new wallet address from the message
    mockExtractAddressFromMessage.mockImplementation(() => '0xABCDEF1234567890123456789012345678901234');
    mockFindOrCreateWalletUser.mockImplementation(() =>
      Promise.resolve({
        user: {
          id: 'user-new',
          username: 'wallet_abcdef',
          displayName: null,
          email: null,
          walletAddress: '0xABCDEF1234567890123456789012345678901234',
          balance: '0',
          eloRating: 1200,
          peakEloRating: 1200,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesLost: 0,
          gamesDraw: 0,
        },
        token: 'jwt-token-new',
        isNewUser: true,
      })
    );

    const req = createRequest({
      message: 'example.com wants you to sign in\n0xABCDEF1234567890123456789012345678901234\n\nNonce: test-nonce-12345',
      signature: '0xabcdef1234567890',
      address: '0xABCDEF1234567890123456789012345678901234',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.isNewUser).toBe(true);
    expect(body.data.needsDisplayName).toBe(true);
  });

  test('should return isNewUser: false for existing wallet', async () => {
    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.isNewUser).toBe(false);
  });

  test('should return 401 for invalid signature', async () => {
    mockVerifySiweSignature.mockImplementation(() => Promise.resolve(false));

    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
      signature: '0xinvalid',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_SIGNATURE');
  });

  test('should return 400 for expired nonce', async () => {
    mockValidateWalletNonce.mockImplementation(() => false);

    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: expired-nonce',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_NONCE');
    expect(body.error.message).toBe('Nonce is invalid or expired');
  });

  test('should handle MFA-enabled accounts', async () => {
    mockHasMFAEnabled.mockImplementation(() => Promise.resolve(true));

    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.requiresMfa).toBe(true);
    expect(body.data.tempToken).toBeDefined();
  });

  test('should return 429 when rate limited', async () => {
    mockLoginLimiter.consume.mockImplementation(() => ({
      allowed: false,
      remainingPoints: 0,
      retryAfter: 300,
    }));

    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  test('should return 400 for missing message', async () => {
    const req = createRequest({
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  test('should return 400 for missing signature', async () => {
    const req = createRequest({
      message: 'example.com wants you to sign in',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  test('should return 400 for missing address', async () => {
    const req = createRequest({
      message: 'example.com wants you to sign in',
      signature: '0xabcdef1234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  test('should return 400 when nonce cannot be extracted from message', async () => {
    mockExtractNonceFromMessage.mockImplementation(() => null);

    const req = createRequest({
      message: 'invalid message without nonce',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_MESSAGE');
  });

  test('should return 400 when address cannot be extracted from message', async () => {
    mockExtractAddressFromMessage.mockImplementation(() => null);

    const req = createRequest({
      message: 'example.com wants you to sign in\ninvalid-address\n\nNonce: test-nonce-12345',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_MESSAGE');
  });

  test('should normalize signature without 0x prefix', async () => {
    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
      signature: 'abcdef1234567890', // No 0x prefix
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletVerify(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ============================================================================
// Tests: POST /api/auth/wallet/link
// ============================================================================

describe('Wallet Auth Routes - POST /api/auth/wallet/link', () => {
  beforeEach(() => {
    // Reset mocks
    mockVerifyToken.mockClear();
    mockVerifyToken.mockImplementation(() => Promise.resolve({ userId: 'user-1', sessionId: 'session-1' }));
    mockValidateWalletNonce.mockClear();
    mockValidateWalletNonce.mockImplementation(() => true);
    mockExtractNonceFromMessage.mockClear();
    mockExtractNonceFromMessage.mockImplementation(() => 'test-nonce-12345');
    mockVerifySiweSignature.mockClear();
    mockVerifySiweSignature.mockImplementation(() => Promise.resolve(true));
    mockLinkWalletToUser.mockClear();
    mockLinkWalletToUser.mockImplementation(() =>
      Promise.resolve({
        id: 'user-1',
        username: 'testuser',
        displayName: 'TestUser',
        email: 'test@example.com',
        walletAddress: '0x1234567890123456789012345678901234567890',
        balance: '1000',
        eloRating: 1200,
        peakEloRating: 1200,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDraw: 0,
      })
    );
  });

  test('should link wallet to authenticated user', async () => {
    const req = createRequest(
      {
        message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
        signature: '0xabcdef1234567890',
        address: '0x1234567890123456789012345678901234567890',
      },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user).toBeDefined();
    expect(body.data.user.walletAddress).toBe('0x1234567890123456789012345678901234567890');
  });

  test('should return 401 if not authenticated (no token)', async () => {
    const req = createRequest({
      message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
      signature: '0xabcdef1234567890',
      address: '0x1234567890123456789012345678901234567890',
    });

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Authentication required');
  });

  test('should return 401 if token is invalid', async () => {
    mockVerifyToken.mockImplementation(() => Promise.resolve(null));

    const req = createRequest(
      {
        message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
        signature: '0xabcdef1234567890',
        address: '0x1234567890123456789012345678901234567890',
      },
      {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      }
    );

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid or expired token');
  });

  test('should return 400 if wallet already linked to another account', async () => {
    mockLinkWalletToUser.mockImplementation(() => {
      throw new Error('This wallet is already linked to another account');
    });

    const req = createRequest(
      {
        message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
        signature: '0xabcdef1234567890',
        address: '0x1234567890123456789012345678901234567890',
      },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('WALLET_ALREADY_LINKED');
  });

  test('should return 400 if wallet already linked to same account', async () => {
    mockLinkWalletToUser.mockImplementation(() => {
      throw new Error('This wallet is already linked to your account');
    });

    const req = createRequest(
      {
        message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
        signature: '0xabcdef1234567890',
        address: '0x1234567890123456789012345678901234567890',
      },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('WALLET_ALREADY_LINKED');
  });

  test('should return 400 for invalid nonce in link request', async () => {
    mockValidateWalletNonce.mockImplementation(() => false);

    const req = createRequest(
      {
        message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: expired-nonce',
        signature: '0xabcdef1234567890',
        address: '0x1234567890123456789012345678901234567890',
      },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_NONCE');
  });

  test('should return 401 for invalid signature in link request', async () => {
    mockVerifySiweSignature.mockImplementation(() => Promise.resolve(false));

    const req = createRequest(
      {
        message: 'example.com wants you to sign in\n0x1234567890123456789012345678901234567890\n\nNonce: test-nonce-12345',
        signature: '0xinvalid',
        address: '0x1234567890123456789012345678901234567890',
      },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_SIGNATURE');
  });

  test('should return 400 for missing request body fields', async () => {
    const req = createRequest(
      {
        message: 'example.com wants you to sign in',
        // Missing signature and address
      },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleWalletLink(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
});

// ============================================================================
// Tests: POST /api/auth/wallet/display-name
// ============================================================================

describe('Wallet Auth Routes - POST /api/auth/wallet/display-name', () => {
  beforeEach(() => {
    // Reset mocks
    mockVerifyToken.mockClear();
    mockVerifyToken.mockImplementation(() => Promise.resolve({ userId: 'user-1', sessionId: 'session-1' }));
    mockSetDisplayName.mockClear();
    mockSetDisplayName.mockImplementation(() =>
      Promise.resolve({
        id: 'user-1',
        username: 'wallet_123456',
        displayName: 'NewDisplayName',
        email: null,
        walletAddress: '0x1234567890123456789012345678901234567890',
        balance: '1000',
        eloRating: 1200,
        peakEloRating: 1200,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDraw: 0,
      })
    );
  });

  test('should set display name for authenticated user', async () => {
    const req = createRequest(
      { displayName: 'NewDisplayName' },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleSetDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user).toBeDefined();
  });

  test('should return 401 if not authenticated', async () => {
    const req = createRequest({ displayName: 'NewDisplayName' });

    const response = await handleSetDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('should return 400 for taken display name', async () => {
    mockSetDisplayName.mockImplementation(() => {
      throw new Error('This display name is already taken');
    });

    const req = createRequest(
      { displayName: 'TakenName' },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleSetDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('already taken');
  });

  test('should return 400 for display name too short', async () => {
    mockSetDisplayName.mockImplementation(() => {
      throw new Error('Display name must be at least 3 characters');
    });

    const req = createRequest(
      { displayName: 'AB' },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleSetDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('at least 3');
  });

  test('should return 400 for display name too long', async () => {
    mockSetDisplayName.mockImplementation(() => {
      throw new Error('Display name must be at most 20 characters');
    });

    const req = createRequest(
      { displayName: 'ThisDisplayNameIsTooLongForTheSystem' },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleSetDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('at most 20');
  });

  test('should return 400 for invalid display name characters', async () => {
    mockSetDisplayName.mockImplementation(() => {
      throw new Error('Display name can only contain letters, numbers, underscores, and hyphens');
    });

    const req = createRequest(
      { displayName: 'Invalid Name!' },
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleSetDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('can only contain');
  });

  test('should return 400 for missing display name', async () => {
    const req = createRequest(
      {},
      {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      }
    );

    const response = await handleSetDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('Display name is required');
  });
});

// ============================================================================
// Tests: GET /api/auth/wallet/display-name/check
// ============================================================================

describe('Wallet Auth Routes - GET /api/auth/wallet/display-name/check', () => {
  beforeEach(() => {
    // Reset mocks
    mockIsDisplayNameAvailable.mockClear();
    mockIsDisplayNameAvailable.mockImplementation(() => Promise.resolve(true));
  });

  test('should return available: true for available name', async () => {
    const req = new Request('http://localhost:3001/api/auth/wallet/display-name/check?name=AvailableName', {
      method: 'GET',
    });

    const response = await handleCheckDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(true);
    expect(body.data.valid).toBe(true);
    expect(body.data.error).toBeUndefined();
  });

  test('should return available: false for taken name', async () => {
    mockIsDisplayNameAvailable.mockImplementation(() => Promise.resolve(false));

    const req = new Request('http://localhost:3001/api/auth/wallet/display-name/check?name=TakenName', {
      method: 'GET',
    });

    const response = await handleCheckDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(false);
    expect(body.data.valid).toBe(true);
  });

  test('should return valid: false for name too short', async () => {
    const req = new Request('http://localhost:3001/api/auth/wallet/display-name/check?name=AB', {
      method: 'GET',
    });

    const response = await handleCheckDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(false);
    expect(body.data.valid).toBe(false);
    expect(body.data.error).toBe('Display name must be at least 3 characters');
  });

  test('should return valid: false for name too long', async () => {
    const req = new Request(
      'http://localhost:3001/api/auth/wallet/display-name/check?name=ThisNameIsWayTooLongForTheSystem',
      {
        method: 'GET',
      }
    );

    const response = await handleCheckDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(false);
    expect(body.data.valid).toBe(false);
    expect(body.data.error).toBe('Display name must be at most 20 characters');
  });

  test('should return valid: false for invalid characters', async () => {
    const req = new Request('http://localhost:3001/api/auth/wallet/display-name/check?name=Invalid%20Name!', {
      method: 'GET',
    });

    const response = await handleCheckDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(false);
    expect(body.data.valid).toBe(false);
    expect(body.data.error).toBe('Display name can only contain letters, numbers, underscores, and hyphens');
  });

  test('should return 400 for missing name parameter', async () => {
    const req = new Request('http://localhost:3001/api/auth/wallet/display-name/check', {
      method: 'GET',
    });

    const response = await handleCheckDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('Display name is required');
  });

  test('should validate underscores and hyphens as valid characters', async () => {
    const req = new Request('http://localhost:3001/api/auth/wallet/display-name/check?name=Valid_Name-123', {
      method: 'GET',
    });

    const response = await handleCheckDisplayName(req);
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);
  });
});
