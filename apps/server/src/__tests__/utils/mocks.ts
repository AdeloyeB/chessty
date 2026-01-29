/**
 * Mock utilities for testing
 */
import { mock } from 'bun:test';

export function createMockRedis() {
  return {
    get: mock(() => Promise.resolve(null)),
    set: mock(() => Promise.resolve('OK')),
    hget: mock(() => Promise.resolve(null)),
    hset: mock(() => Promise.resolve(1)),
    hgetall: mock(() => Promise.resolve({})),
    del: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
    hsetnx: mock(() => Promise.resolve(1)),
    evalsha: mock(() => Promise.resolve(['300', '300', '0'])),
    script: mock(() => Promise.resolve('abc123')),
    ping: mock(() => Promise.resolve('PONG')),
  };
}

export function createMockWebSocket() {
  return {
    send: mock(() => {}),
    close: mock(() => {}),
    readyState: 1,
    data: { userId: 'test-user-1' },
  };
}

export function createMockBroadcastService() {
  return {
    sendToUser: mock(() => {}),
    sendToRoom: mock(() => {}),
    sendToGame: mock(() => {}),
  };
}

// ---------------------------------------------------------------------------
// Wallet Service Mock
// ---------------------------------------------------------------------------

export function createMockWalletService() {
  return {
    awardWinnings: mock(() => Promise.resolve(100)),
    getBalance: mock(() => Promise.resolve(1000)),
    deductBalance: mock(() => Promise.resolve({ success: true })),
    refundWager: mock(() => Promise.resolve({ success: true })),
    processDeposit: mock(() => Promise.resolve({ success: true })),
    processWithdrawal: mock(() => Promise.resolve({ success: true })),
  };
}

// ---------------------------------------------------------------------------
// Anti-Cheat Service Mock
// ---------------------------------------------------------------------------

export function createMockAnticheatService() {
  return {
    getPlayerSuspicionScore: mock(() => 0),
    getPlayerFlags: mock(() => []),
    startGameMonitoring: mock(() => {}),
    monitorMove: mock(() => {}),
    endGameMonitoring: mock(() => {}),
    analyzeEngineCorrelation: mock(() => Promise.resolve({
      gameId: 'test-game-1',
      overallScore: 0.15,
      avgCentipawnLoss: 25,
      topMoveRate: 0.35,
      criticalAccuracy: 0.40,
      phases: {},
    })),
    analyzeTimingAnomaly: mock(() => ({
      isAnomaly: false,
      score: 0.1,
      description: 'Normal timing',
    })),
    analyzeMousePattern: mock(() => ({
      isAnomaly: false,
      score: 0.05,
      pathLinearity: 0.3,
      accelerationNormal: true,
      hasMicroCorrections: true,
    })),
  };
}

// ---------------------------------------------------------------------------
// Jury Service Mock
// ---------------------------------------------------------------------------

export function createMockJuryService() {
  return {
    submitVerdict: mock(() => Promise.resolve({ success: true, verdict: {} })),
    aggregateVerdicts: mock(() => Promise.resolve({
      shouldResolve: false,
      categoryScores: {
        engineAssistance: 0,
        inputAutomation: 0,
        externalAssistance: 0,
      },
      overallGuiltyPercentage: 0,
      verdictCount: 0,
      expectedVerdicts: 5,
    })),
    resolveCase: mock(() => Promise.resolve()),
    assignJurors: mock(() => Promise.resolve({ assigned: 5 })),
    checkEligibility: mock(() => Promise.resolve({ eligible: true })),
  };
}

// ---------------------------------------------------------------------------
// Settlement Service Mock
// ---------------------------------------------------------------------------

export function createMockSettlementService() {
  return {
    createSettlement: mock(() => Promise.resolve({
      id: 'test-settlement-1',
      gameId: 'test-game-1',
      status: 'pending',
    })),
    evaluateGame: mock(() => Promise.resolve({
      gameId: 'test-game-1',
      suspicionScore: 50,
      flags: [],
      suspiciousPlayerId: null,
      recommendedAction: 'auto_settle',
    })),
    decideSettlement: mock(() => ({
      shouldHold: false,
      reason: 'auto_cleared',
      priority: 'normal',
    })),
    settleGame: mock(() => Promise.resolve()),
    holdForReview: mock(() => Promise.resolve('jury-case-1')),
    resolveDispute: mock(() => Promise.resolve()),
    handleTimeout: mock(() => Promise.resolve()),
    processSettlement: mock(() => Promise.resolve({
      id: 'test-settlement-1',
      status: 'settled',
    })),
  };
}

// ---------------------------------------------------------------------------
// Notification Service Mock
// ---------------------------------------------------------------------------

export function createMockNotificationService() {
  return {
    notifyPlayerHeldForReview: mock(() => Promise.resolve()),
    notifyJuryCaseAssigned: mock(() => Promise.resolve()),
    notifyVerdictResult: mock(() => Promise.resolve()),
    notifySettlementComplete: mock(() => Promise.resolve()),
  };
}

// ---------------------------------------------------------------------------
// Event Emitter Mock
// ---------------------------------------------------------------------------

export function createMockEventEmitter() {
  const handlers: Map<string, Array<(payload: unknown) => Promise<void>>> = new Map();

  return {
    on: mock((event: string, handler: (payload: unknown) => Promise<void>) => {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event)!.push(handler);
    }),
    emit: mock(async (event: string, payload: unknown) => {
      const eventHandlers = handlers.get(event) || [];
      for (const handler of eventHandlers) {
        await handler(payload);
      }
    }),
    off: mock((event: string, handler: (payload: unknown) => Promise<void>) => {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        const index = eventHandlers.indexOf(handler);
        if (index > -1) {
          eventHandlers.splice(index, 1);
        }
      }
    }),
    _handlers: handlers,
  };
}
