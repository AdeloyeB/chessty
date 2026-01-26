'use client';

import { useAuthStore } from '@/store/auth';
import type {
  HistoryFilters,
  HistoryGame,
  HistoryStats,
  HistoryTransaction,
  FinancialSummary,
  DateRange,
  PaginatedResponse,
  ProfileResponse,
  PublicProfileResponse,
  UpdateProfileInput,
} from '@chess-game/shared';
import {
  USE_MOCK_DATA,
  mockDelay,
  generateMockEloLeaderboard,
  generateMockWinningsLeaderboard,
  generateMockActiveGames,
} from '@/lib/mock/mockData';
import {
  generateMockProfile,
  generateMockPublicProfile,
} from '@/lib/mock/profileMock';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions extends RequestInit {
  auth?: boolean;
}

// MFA-related response types
interface MFARequiredResponse {
  requiresMfa: true;
  tempToken: string;
}

interface MFAVerifyResponse {
  user: any;
  token: string;
}

interface MFAEnrollStartResponse {
  secret: string;
  qrCodeUri: string;
}

interface MFAEnrollCompleteResponse {
  backupCodes: string[];
}

interface MFAStatusResponse {
  enabled: boolean;
  backupCodesRemaining: number;
}

interface MFABackupCodesResponse {
  backupCodes: string[];
}

export function useApi() {
  const { token, setUser, setToken, logout, setMfaRequired, clearMfaState } = useAuthStore();

  async function fetchApi<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { auth = true, ...fetchOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };

    if (auth && token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error?.message || 'API request failed');
    }

    return data.data;
  }

  // Auth methods
  async function login(email: string, password: string) {
    // Login can return either a full auth response or an MFA-required response
    const data = await fetchApi<{ user?: any; token?: string; requiresMfa?: boolean; tempToken?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        auth: false,
      }
    );

    // Check if MFA is required
    if (data.requiresMfa && data.tempToken) {
      setMfaRequired(true, data.tempToken);
      return { requiresMfa: true as const, tempToken: data.tempToken };
    }

    // Normal login - no MFA required
    setUser(data.user);
    setToken(data.token!);
    clearMfaState();
    return { user: data.user, token: data.token! };
  }

  async function register(email: string, username: string, password: string) {
    const data = await fetchApi<{ user: any; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
      auth: false,
    });

    setUser(data.user);
    setToken(data.token);
    return data;
  }

  async function logoutUser() {
    try {
      await fetchApi('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors
    }
    logout();
  }

  async function getMe() {
    const user = await fetchApi<any>('/api/auth/me');
    setUser(user);
    return user;
  }

  // Game methods
  async function getActiveGames() {
    if (USE_MOCK_DATA) {
      await mockDelay();
      return generateMockActiveGames(8);
    }
    return fetchApi<any[]>('/api/games/active');
  }

  async function getGame(gameId: string) {
    return fetchApi<any>(`/api/games/${gameId}`);
  }

  async function getGameHistory(limit = 20, offset = 0) {
    return fetchApi<any[]>(`/api/games/history?limit=${limit}&offset=${offset}`);
  }

  async function getCurrentGame() {
    return fetchApi<any | null>('/api/games/current');
  }

  // Matchmaking methods
  async function joinMatchmaking(stakeAmount: number, timeControl: { initial: number; increment: number }) {
    return fetchApi<any>('/api/matchmaking/join', {
      method: 'POST',
      body: JSON.stringify({ stakeAmount, timeControl }),
    });
  }

  async function leaveMatchmaking() {
    return fetchApi<any>('/api/matchmaking/leave', { method: 'POST' });
  }

  async function getQueueStatus() {
    return fetchApi<any>('/api/matchmaking/status');
  }

  // Betting methods
  async function placeBet(gameId: string, betOnPlayerId: string, amount: number) {
    return fetchApi<any>('/api/betting/place', {
      method: 'POST',
      body: JSON.stringify({ gameId, betOnPlayerId, amount }),
    });
  }

  async function getGameOdds(gameId: string) {
    return fetchApi<any>(`/api/betting/odds/${gameId}`);
  }

  async function getBetHistory(limit = 50, offset = 0) {
    return fetchApi<any[]>(`/api/betting/history?limit=${limit}&offset=${offset}`);
  }

  async function getBetStats() {
    return fetchApi<any>('/api/betting/stats');
  }

  // Wallet methods
  async function getBalance() {
    return fetchApi<{ balance: number }>('/api/wallet/balance');
  }

  async function getTransactions(limit = 50, offset = 0) {
    return fetchApi<any[]>(`/api/wallet/transactions?limit=${limit}&offset=${offset}`);
  }

  // Leaderboard methods
  async function getEloLeaderboard(limit = 50) {
    if (USE_MOCK_DATA) {
      await mockDelay();
      return generateMockEloLeaderboard(limit);
    }
    return fetchApi<any[]>(`/api/leaderboard/elo?limit=${limit}`);
  }

  async function getWinningsLeaderboard(limit = 50) {
    if (USE_MOCK_DATA) {
      await mockDelay();
      return generateMockWinningsLeaderboard(limit);
    }
    return fetchApi<any[]>(`/api/leaderboard/winnings?limit=${limit}`);
  }

  // User methods
  async function getUser(userId: string) {
    return fetchApi<any>(`/api/users/${userId}`);
  }

  async function getUserStats(userId: string) {
    return fetchApi<any>(`/api/users/${userId}/stats`);
  }

  // History methods
  async function getGameHistoryFiltered(filters: HistoryFilters, limit = 20, offset = 0) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    if (filters.dateRange.start) {
      params.set('startDate', filters.dateRange.start.toISOString());
    }
    if (filters.dateRange.end) {
      params.set('endDate', filters.dateRange.end.toISOString());
    }
    if (filters.result !== 'all') {
      params.set('result', filters.result);
    }
    if (filters.timeControl !== 'all') {
      params.set('timeControl', filters.timeControl);
    }
    if (filters.gameMode !== 'all') {
      params.set('gameMode', filters.gameMode);
    }
    if (filters.minStake !== undefined) {
      params.set('minStake', String(filters.minStake));
    }
    if (filters.maxStake !== undefined) {
      params.set('maxStake', String(filters.maxStake));
    }

    return fetchApi<PaginatedResponse<HistoryGame>>(`/api/games/history/filtered?${params.toString()}`);
  }

  async function getHistoryStats(dateRange?: DateRange) {
    const params = new URLSearchParams();
    if (dateRange?.start) {
      params.set('startDate', dateRange.start.toISOString());
    }
    if (dateRange?.end) {
      params.set('endDate', dateRange.end.toISOString());
    }

    const query = params.toString();
    return fetchApi<HistoryStats>(`/api/games/history/stats${query ? '?' + query : ''}`);
  }

  async function getTransactionsFiltered(dateRange?: DateRange, limit = 50, offset = 0) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    if (dateRange?.start) {
      params.set('startDate', dateRange.start.toISOString());
    }
    if (dateRange?.end) {
      params.set('endDate', dateRange.end.toISOString());
    }

    return fetchApi<PaginatedResponse<HistoryTransaction>>(`/api/games/history/transactions?${params.toString()}`);
  }

  async function getFinancialSummary(dateRange?: DateRange) {
    const params = new URLSearchParams();
    if (dateRange?.start) {
      params.set('startDate', dateRange.start.toISOString());
    }
    if (dateRange?.end) {
      params.set('endDate', dateRange.end.toISOString());
    }

    const query = params.toString();
    return fetchApi<FinancialSummary>(`/api/games/history/financial${query ? '?' + query : ''}`);
  }

  // Profile methods
  async function getProfile(): Promise<ProfileResponse> {
    if (USE_MOCK_DATA) {
      return generateMockProfile();
    }
    return fetchApi<ProfileResponse>('/api/profile');
  }

  async function getPublicProfile(userId: string): Promise<PublicProfileResponse> {
    if (USE_MOCK_DATA) {
      return generateMockPublicProfile(userId);
    }
    return fetchApi<PublicProfileResponse>(`/api/profile/${userId}`);
  }

  async function updateProfile(data: UpdateProfileInput): Promise<{ success: boolean }> {
    if (USE_MOCK_DATA) {
      await mockDelay();
      return { success: true };
    }
    return fetchApi<{ success: boolean }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ============================================================================
  // MFA Methods
  // ============================================================================

  /**
   * Verify MFA code during login
   * Called after password verification when MFA is enabled
   *
   * @param tempToken - The temporary token received after password verification
   * @param code - The 6-digit TOTP code from the authenticator app or a backup code
   * @param isBackupCode - Whether the code is a backup code (affects server-side handling)
   */
  async function verifyMFA(tempToken: string, code: string, isBackupCode: boolean = false) {
    const data = await fetchApi<MFAVerifyResponse>('/api/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code, isBackupCode }),
      auth: false, // Using tempToken, not a regular auth token
    });

    // MFA verification successful - set the full session
    setUser(data.user);
    setToken(data.token);
    clearMfaState();
    return data;
  }

  /**
   * Start MFA enrollment - generates a TOTP secret
   * Requires authentication (user must be logged in)
   */
  async function startMFAEnrollment() {
    return fetchApi<MFAEnrollStartResponse>('/api/mfa/enroll/start', {
      method: 'POST',
    });
  }

  /**
   * Complete MFA enrollment by verifying the first TOTP code
   * Returns backup codes that the user should save
   */
  async function completeMFAEnrollment(code: string) {
    return fetchApi<MFAEnrollCompleteResponse>('/api/mfa/enroll/complete', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /**
   * Get the current user's MFA status
   */
  async function getMFAStatus() {
    return fetchApi<MFAStatusResponse>('/api/mfa/status');
  }

  /**
   * Disable MFA for the current user
   * Requires password and current TOTP code for verification
   */
  async function disableMFA(password: string, code: string) {
    return fetchApi<{ success: boolean }>('/api/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  }

  /**
   * Regenerate backup codes
   * Requires password for verification (in case authenticator is lost)
   */
  async function regenerateBackupCodes(password: string) {
    return fetchApi<MFABackupCodesResponse>('/api/mfa/backup-codes', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  return {
    // Auth
    login,
    register,
    logout: logoutUser,
    getMe,
    // MFA
    verifyMFA,
    startMFAEnrollment,
    completeMFAEnrollment,
    getMFAStatus,
    disableMFA,
    regenerateBackupCodes,
    // Games
    getActiveGames,
    getGame,
    getGameHistory,
    getCurrentGame,
    // Matchmaking
    joinMatchmaking,
    leaveMatchmaking,
    getQueueStatus,
    // Betting
    placeBet,
    getGameOdds,
    getBetHistory,
    getBetStats,
    // Wallet
    getBalance,
    getTransactions,
    // Leaderboard
    getEloLeaderboard,
    getWinningsLeaderboard,
    // Users
    getUser,
    getUserStats,
    // History
    getGameHistoryFiltered,
    getHistoryStats,
    getTransactionsFiltered,
    getFinancialSummary,
    // Profile
    getProfile,
    getPublicProfile,
    updateProfile,
  };
}
