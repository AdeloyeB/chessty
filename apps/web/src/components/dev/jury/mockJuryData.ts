/**
 * Mock data for the Jury System dev tools
 *
 * WHAT THIS FILE IS FOR:
 * Provides realistic mock cases and jury statistics for testing the
 * jury review interface in dev mode. These data structures mirror what
 * the actual anti-cheat system would provide.
 */

import type { Move } from '@chess-game/shared';
import { MOCK_PLAYERS } from '@/lib/mock/mockData';

// ---------------------------------------------------------------------------
// Types for Jury System
// ---------------------------------------------------------------------------

/**
 * Verdict options for each charge type.
 * 'insufficient' = not enough evidence to conclude cheating
 * 'evident' = clear evidence beyond reasonable doubt
 */
export type VerdictOption = 'insufficient' | 'evident';

/**
 * The three types of cheating the jury evaluates.
 * Each has different detection patterns and evidence types.
 */
export type ChargeType = 'engine_assistance' | 'input_automation' | 'external_assistance';

/**
 * A juror's verdict on a case.
 */
export interface JuryVerdict {
  caseId: string;
  jurorId: string;
  engineAssistance: VerdictOption;
  inputAutomation: VerdictOption;
  externalAssistance: VerdictOption;
  submittedAt: Date;
}

/**
 * Statistical analysis for a suspected game.
 * These are the metrics jurors review to determine if cheating occurred.
 */
export interface CaseStatistics {
  // Centipawn Loss Analysis
  avgCentipawnLoss: number;
  expectedCentipawnLossForRating: number;
  criticalPositionCPL: number;
  expectedCriticalCPL: number;

  // Engine Correlation
  top1EngineCorrelation: number;
  top3EngineCorrelation: number;
  expectedTop1ForRating: number;
  expectedTop3ForRating: number;

  // Critical Position Accuracy
  criticalPositionCount: number;
  criticalPositionsCorrect: number;
  criticalAccuracy: number;
  expectedCriticalAccuracy: number;

  // Timing Analysis
  avgMoveTimeMs: number;
  moveTimeVariance: number;
  suspiciousTimingPatterns: number;
  instantMovesAfterThink: number;

  // Input Analysis
  avgMouseLinearity: number;
  microCorrectionCount: number;
  syntheticInputScore: number;
  physicsViolations: number;

  // Environment Flags
  focusLostCount: number;
  focusLostBeforeBestMove: number;
  suspiciousNetworkRequests: number;
  screenShareDetected: boolean;
}

/**
 * Priority levels for cases based on evidence strength and stakes.
 */
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * A case for jury review.
 */
export interface JuryCase {
  id: string;
  gameId: string;

  // Players
  suspectId: string;
  suspectUsername: string;
  suspectRating: number;
  opponentId: string;
  opponentUsername: string;
  opponentRating: number;

  // Game Info
  timeControl: string;
  suspectColor: 'white' | 'black';
  result: 'win' | 'loss' | 'draw';
  wagerAmount: number;
  opening: string;

  // Case metadata
  suspicionScore: number; // 0-100, higher = more suspicious
  priority: CasePriority;
  createdAt: Date;
  expiresAt: Date;

  // Stats
  statistics: CaseStatistics;

  // Game data
  moves: Move[];
  startingFen: string;
}

/**
 * Juror statistics and rank.
 */
export interface JurorStats {
  jurorId: string;
  investigatorScore: number; // 0-1, accuracy of verdicts
  casesReviewed: number;
  correctVerdicts: number;
  accuracyRate: number; // 0-100
  rank: number;
  totalJurors: number;
}

// ---------------------------------------------------------------------------
// Mock Move Data
// ---------------------------------------------------------------------------

const MOCK_ITALIAN_GAME_MOVES: Move[] = [
  { from: 'e2', to: 'e4', san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', timestamp: 1 },
  { from: 'e7', to: 'e5', san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', timestamp: 2 },
  { from: 'g1', to: 'f3', san: 'Nf3', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', timestamp: 3 },
  { from: 'b8', to: 'c6', san: 'Nc6', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', timestamp: 4 },
  { from: 'f1', to: 'c4', san: 'Bc4', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', timestamp: 5 },
  { from: 'g8', to: 'f6', san: 'Nf6', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', timestamp: 6 },
  { from: 'd2', to: 'd3', san: 'd3', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4', timestamp: 7 },
  { from: 'f8', to: 'c5', san: 'Bc5', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5', timestamp: 8 },
  { from: 'c2', to: 'c3', san: 'c3', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R b KQkq - 0 5', timestamp: 9 },
  { from: 'd7', to: 'd6', san: 'd6', fen: 'r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R w KQkq - 0 6', timestamp: 10 },
  { from: 'e1', to: 'g1', san: 'O-O', fen: 'r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 b kq - 1 6', timestamp: 11 },
  { from: 'e8', to: 'g8', san: 'O-O', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 2 7', timestamp: 12 },
  { from: 'h2', to: 'h3', san: 'h3', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N1P/PP3PP1/RNBQ1RK1 b - - 0 7', timestamp: 13 },
  { from: 'c8', to: 'e6', san: 'Be6', fen: 'r2q1rk1/ppp2ppp/2npbn2/2b1p3/2B1P3/2PP1N1P/PP3PP1/RNBQ1RK1 w - - 1 8', timestamp: 14 },
  { from: 'c4', to: 'b3', san: 'Bb3', fen: 'r2q1rk1/ppp2ppp/2npbn2/2b1p3/4P3/1BPP1N1P/PP3PP1/RNBQ1RK1 b - - 2 8', timestamp: 15 },
  { from: 'd8', to: 'd7', san: 'Qd7', fen: 'r4rk1/pppq1ppp/2npbn2/2b1p3/4P3/1BPP1N1P/PP3PP1/RNBQ1RK1 w - - 3 9', timestamp: 16 },
  { from: 'b1', to: 'a3', san: 'Na3', fen: 'r4rk1/pppq1ppp/2npbn2/2b1p3/4P3/NBPP1N1P/PP3PP1/R1BQ1RK1 b - - 4 9', timestamp: 17 },
  { from: 'a7', to: 'a6', san: 'a6', fen: 'r4rk1/1ppq1ppp/p1npbn2/2b1p3/4P3/NBPP1N1P/PP3PP1/R1BQ1RK1 w - - 0 10', timestamp: 18 },
  { from: 'a3', to: 'c2', san: 'Nc2', fen: 'r4rk1/1ppq1ppp/p1npbn2/2b1p3/4P3/1BPP1N1P/PPN2PP1/R1BQ1RK1 b - - 1 10', timestamp: 19 },
  { from: 'c5', to: 'a7', san: 'Ba7', fen: 'r4rk1/bppq1ppp/p1npbn2/4p3/4P3/1BPP1N1P/PPN2PP1/R1BQ1RK1 w - - 2 11', timestamp: 20 },
];

const MOCK_SICILIAN_MOVES: Move[] = [
  { from: 'e2', to: 'e4', san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', timestamp: 1 },
  { from: 'c7', to: 'c5', san: 'c5', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2', timestamp: 2 },
  { from: 'g1', to: 'f3', san: 'Nf3', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', timestamp: 3 },
  { from: 'd7', to: 'd6', san: 'd6', fen: 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', timestamp: 4 },
  { from: 'd2', to: 'd4', san: 'd4', fen: 'rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3', timestamp: 5 },
  { from: 'c5', to: 'd4', san: 'cxd4', fen: 'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4', timestamp: 6 },
  { from: 'f3', to: 'd4', san: 'Nxd4', fen: 'rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4', timestamp: 7 },
  { from: 'g8', to: 'f6', san: 'Nf6', fen: 'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5', timestamp: 8 },
  { from: 'b1', to: 'c3', san: 'Nc3', fen: 'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq - 2 5', timestamp: 9 },
  { from: 'a7', to: 'a6', san: 'a6', fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6', timestamp: 10 },
  { from: 'c1', to: 'e3', san: 'Be3', fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N1B3/PPP2PPP/R2QKB1R b KQkq - 1 6', timestamp: 11 },
  { from: 'e7', to: 'e5', san: 'e5', fen: 'rnbqkb1r/1p3ppp/p2p1n2/4p3/3NP3/2N1B3/PPP2PPP/R2QKB1R w KQkq e6 0 7', timestamp: 12 },
  { from: 'd4', to: 'b3', san: 'Nb3', fen: 'rnbqkb1r/1p3ppp/p2p1n2/4p3/4P3/1NN1B3/PPP2PPP/R2QKB1R b KQkq - 1 7', timestamp: 13 },
  { from: 'f8', to: 'e7', san: 'Be7', fen: 'rnbqk2r/1p2bppp/p2p1n2/4p3/4P3/1NN1B3/PPP2PPP/R2QKB1R w KQkq - 2 8', timestamp: 14 },
  { from: 'f2', to: 'f3', san: 'f3', fen: 'rnbqk2r/1p2bppp/p2p1n2/4p3/4P3/1NN1BP2/PPP3PP/R2QKB1R b KQkq - 0 8', timestamp: 15 },
  { from: 'c8', to: 'e6', san: 'Be6', fen: 'rn1qk2r/1p2bppp/p2pbn2/4p3/4P3/1NN1BP2/PPP3PP/R2QKB1R w KQkq - 1 9', timestamp: 16 },
];

// ---------------------------------------------------------------------------
// Generate Mock Cases
// ---------------------------------------------------------------------------

function generateStatistics(suspiciousLevel: 'clean' | 'moderate' | 'high'): CaseStatistics {
  const basePlayer = MOCK_PLAYERS[Math.floor(Math.random() * MOCK_PLAYERS.length)];
  const rating = basePlayer.eloRating;

  // Expected values based on rating (approximations)
  const expectedCPL = Math.max(20, 60 - (rating - 1200) * 0.02);
  const expectedTop1 = Math.min(0.45, 0.25 + (rating - 1200) * 0.00015);
  const expectedTop3 = Math.min(0.70, 0.45 + (rating - 1200) * 0.00015);
  const expectedCritical = Math.min(0.55, 0.30 + (rating - 1200) * 0.00015);

  switch (suspiciousLevel) {
    case 'clean':
      return {
        avgCentipawnLoss: expectedCPL + (Math.random() * 20 - 10),
        expectedCentipawnLossForRating: expectedCPL,
        criticalPositionCPL: expectedCPL * 1.2 + (Math.random() * 15 - 7),
        expectedCriticalCPL: expectedCPL * 1.2,

        top1EngineCorrelation: expectedTop1 + (Math.random() * 0.08 - 0.04),
        top3EngineCorrelation: expectedTop3 + (Math.random() * 0.08 - 0.04),
        expectedTop1ForRating: expectedTop1,
        expectedTop3ForRating: expectedTop3,

        criticalPositionCount: Math.floor(Math.random() * 8) + 5,
        criticalPositionsCorrect: 3,
        criticalAccuracy: expectedCritical + (Math.random() * 0.10 - 0.05),
        expectedCriticalAccuracy: expectedCritical,

        avgMoveTimeMs: 5000 + Math.random() * 10000,
        moveTimeVariance: 3000 + Math.random() * 5000,
        suspiciousTimingPatterns: Math.random() > 0.8 ? 1 : 0,
        instantMovesAfterThink: 0,

        avgMouseLinearity: 0.35 + Math.random() * 0.25,
        microCorrectionCount: Math.floor(Math.random() * 30) + 10,
        syntheticInputScore: Math.random() * 0.2,
        physicsViolations: 0,

        focusLostCount: Math.floor(Math.random() * 3),
        focusLostBeforeBestMove: 0,
        suspiciousNetworkRequests: 0,
        screenShareDetected: false,
      };

    case 'moderate':
      return {
        avgCentipawnLoss: expectedCPL - 15 - Math.random() * 10,
        expectedCentipawnLossForRating: expectedCPL,
        criticalPositionCPL: expectedCPL * 0.5 - Math.random() * 10,
        expectedCriticalCPL: expectedCPL * 1.2,

        top1EngineCorrelation: expectedTop1 + 0.15 + Math.random() * 0.1,
        top3EngineCorrelation: expectedTop3 + 0.12 + Math.random() * 0.08,
        expectedTop1ForRating: expectedTop1,
        expectedTop3ForRating: expectedTop3,

        criticalPositionCount: Math.floor(Math.random() * 10) + 8,
        criticalPositionsCorrect: Math.floor(Math.random() * 5) + 5,
        criticalAccuracy: expectedCritical + 0.20 + Math.random() * 0.10,
        expectedCriticalAccuracy: expectedCritical,

        avgMoveTimeMs: 4000 + Math.random() * 8000,
        moveTimeVariance: 2000 + Math.random() * 2000,
        suspiciousTimingPatterns: Math.floor(Math.random() * 3) + 1,
        instantMovesAfterThink: Math.floor(Math.random() * 2),

        avgMouseLinearity: 0.50 + Math.random() * 0.20,
        microCorrectionCount: Math.floor(Math.random() * 15) + 5,
        syntheticInputScore: 0.25 + Math.random() * 0.20,
        physicsViolations: Math.random() > 0.7 ? 1 : 0,

        focusLostCount: Math.floor(Math.random() * 6) + 2,
        focusLostBeforeBestMove: Math.floor(Math.random() * 2) + 1,
        suspiciousNetworkRequests: Math.floor(Math.random() * 3),
        screenShareDetected: false,
      };

    case 'high':
      return {
        avgCentipawnLoss: expectedCPL * 0.3,
        expectedCentipawnLossForRating: expectedCPL,
        criticalPositionCPL: expectedCPL * 0.2,
        expectedCriticalCPL: expectedCPL * 1.2,

        top1EngineCorrelation: 0.75 + Math.random() * 0.15,
        top3EngineCorrelation: 0.88 + Math.random() * 0.08,
        expectedTop1ForRating: expectedTop1,
        expectedTop3ForRating: expectedTop3,

        criticalPositionCount: Math.floor(Math.random() * 8) + 10,
        criticalPositionsCorrect: Math.floor(Math.random() * 3) + 8,
        criticalAccuracy: 0.82 + Math.random() * 0.12,
        expectedCriticalAccuracy: expectedCritical,

        avgMoveTimeMs: 3000 + Math.random() * 5000,
        moveTimeVariance: 800 + Math.random() * 1000,
        suspiciousTimingPatterns: Math.floor(Math.random() * 5) + 3,
        instantMovesAfterThink: Math.floor(Math.random() * 3) + 2,

        avgMouseLinearity: 0.75 + Math.random() * 0.15,
        microCorrectionCount: Math.floor(Math.random() * 8),
        syntheticInputScore: 0.55 + Math.random() * 0.25,
        physicsViolations: Math.floor(Math.random() * 3) + 1,

        focusLostCount: Math.floor(Math.random() * 10) + 5,
        focusLostBeforeBestMove: Math.floor(Math.random() * 4) + 3,
        suspiciousNetworkRequests: Math.floor(Math.random() * 8) + 2,
        screenShareDetected: Math.random() > 0.6,
      };
  }
}

/**
 * Generate mock jury cases for testing.
 */
export function generateMockCases(count: number = 5): JuryCase[] {
  const cases: JuryCase[] = [];
  const openings = ['Italian Game', 'Sicilian Najdorf', 'Ruy Lopez', 'French Defense', 'Caro-Kann'];
  const timeControls = ['3+0', '5+0', '5+3', '10+0', '15+10'];

  for (let i = 0; i < count; i++) {
    const suspiciousLevel = i % 3 === 0 ? 'high' : i % 3 === 1 ? 'moderate' : 'clean';
    const suspicionScore = suspiciousLevel === 'high' ? 75 + Math.random() * 20
                         : suspiciousLevel === 'moderate' ? 45 + Math.random() * 25
                         : 15 + Math.random() * 25;

    const priority: CasePriority = suspicionScore > 80 ? 'critical'
                                 : suspicionScore > 60 ? 'high'
                                 : suspicionScore > 40 ? 'medium'
                                 : 'low';

    const suspect = MOCK_PLAYERS[i % MOCK_PLAYERS.length];
    const opponent = MOCK_PLAYERS[(i + 5) % MOCK_PLAYERS.length];
    const wagerAmounts = [10, 25, 50, 100, 200, 500];

    cases.push({
      id: `case-${i + 1}`,
      gameId: `game-${1000 + i}`,
      suspectId: suspect.id,
      suspectUsername: suspect.username,
      suspectRating: suspect.eloRating,
      opponentId: opponent.id,
      opponentUsername: opponent.username,
      opponentRating: opponent.eloRating,
      timeControl: timeControls[i % timeControls.length],
      suspectColor: Math.random() > 0.5 ? 'white' : 'black',
      result: 'win',
      wagerAmount: wagerAmounts[i % wagerAmounts.length],
      opening: openings[i % openings.length],
      suspicionScore: Math.round(suspicionScore),
      priority,
      createdAt: new Date(Date.now() - Math.random() * 3600000 * 24),
      expiresAt: new Date(Date.now() + Math.random() * 3600000 * 48 + 3600000 * 24),
      statistics: generateStatistics(suspiciousLevel),
      moves: i % 2 === 0 ? MOCK_ITALIAN_GAME_MOVES : MOCK_SICILIAN_MOVES,
      startingFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    });
  }

  return cases.sort((a, b) => b.suspicionScore - a.suspicionScore);
}

/**
 * Generate mock juror statistics.
 */
export function generateMockJurorStats(): JurorStats {
  const casesReviewed = Math.floor(Math.random() * 50) + 10;
  const correctVerdicts = Math.floor(casesReviewed * (0.65 + Math.random() * 0.30));
  const accuracyRate = (correctVerdicts / casesReviewed) * 100;

  return {
    jurorId: 'current-user',
    investigatorScore: 0.5 + Math.random() * 0.45,
    casesReviewed,
    correctVerdicts,
    accuracyRate: Math.round(accuracyRate * 10) / 10,
    rank: Math.floor(Math.random() * 50) + 1,
    totalJurors: Math.floor(Math.random() * 100) + 100,
  };
}

/**
 * Mock available cases for the case list.
 */
export const MOCK_JURY_CASES = generateMockCases(8);

/**
 * Mock juror stats.
 */
export const MOCK_JUROR_STATS = generateMockJurorStats();
