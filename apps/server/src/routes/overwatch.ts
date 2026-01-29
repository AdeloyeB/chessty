/**
 * Arbiter Overwatch API Routes
 * =============================
 *
 * HTTP endpoints for the Arbiter Overwatch community review system.
 *
 * ENDPOINTS:
 * - GET /api/overwatch/eligibility - Check if current user can be an arbiter
 * - POST /api/overwatch/enroll - Enroll as an arbiter
 * - GET /api/overwatch/cases - Get available cases for this arbiter
 * - GET /api/overwatch/cases/:id - Get case details (anonymized)
 * - POST /api/overwatch/cases/:id/verdict - Submit verdict
 * - GET /api/overwatch/stats - Get arbiter's stats and score
 *
 * AUTHENTICATION:
 * All endpoints require authentication. Users must be logged in.
 *
 * AUTHORIZATION:
 * - Eligibility/enroll: Any authenticated user
 * - Cases/verdict: Must be an enrolled, active arbiter
 * - Stats: Must be an enrolled arbiter
 */

import { z } from 'zod';
import type { ApiResponse } from '@chess-game/shared';
import { authenticateRequest } from './auth';
import {
  checkEligibility,
  enrollAsArbiter,
  getArbiterProfile,
  getArbiterCases,
  getCaseForReview,
  submitVerdict,
  getArbiterStats,
} from '../services/overwatch';
import type { VerdictOption } from '../drizzle/overwatch-schema';
import { OVERWATCH_RATE_LIMITERS, rateLimitResponse } from '../middleware/rate-limiter';
import { sanitizeText } from '../utils/sanitize';

// ---------------------------------------------------------------------------
// Security Helpers
// ---------------------------------------------------------------------------

/**
 * Randomize a timestamp to prevent test case detection via timing analysis.
 * Returns a random timestamp within the last N days.
 *
 * WHY: Test cases are injected into the overwatch system to calibrate arbiter accuracy.
 * If arbiters could identify test cases by their timestamps (e.g., "this game was
 * created exactly when I enrolled"), they could game the system. This function
 * makes all timestamps look like random recent games.
 */
function randomizeTimestamp(maxDaysAgo: number = 30): Date {
  const now = Date.now();
  const randomOffset = Math.random() * maxDaysAgo * 24 * 60 * 60 * 1000;
  return new Date(now - randomOffset);
}

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const VerdictSchema = z.object({
  engineAssistance: z.enum(['insufficient', 'guilty']),
  inputAutomation: z.enum(['insufficient', 'guilty']),
  externalAssistance: z.enum(['insufficient', 'guilty']),
  // Sanitize at entry point for defense-in-depth
  // This removes XSS vectors, script tags, and dangerous patterns before they enter the system
  notes: z.string().max(2000).optional()
    .transform(val => val ? sanitizeText(val, 2000) : undefined),
  confidence: z.number().min(1).max(5).optional(),
});

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/overwatch/eligibility
 *
 * Check if the current user is eligible to be an arbiter.
 * Returns eligibility status and reasons if not eligible.
 */
export async function handleGetEligibility(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    const eligibility = await checkEligibility(auth.userId);

    return Response.json({
      success: true,
      data: eligibility,
    } satisfies ApiResponse<typeof eligibility>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check eligibility';
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * POST /api/overwatch/enroll
 *
 * Enroll the current user as an arbiter.
 * User must meet eligibility requirements.
 */
export async function handleEnroll(req: Request): Promise<Response> {
  try {
    // Rate limit by IP FIRST (before auth) to prevent exhaustion attacks
    // WHY: If we rate-limit after auth, an attacker can make many requests with
    // invalid tokens to exhaust the rate limit bucket for a legitimate user's IP.
    // By rate-limiting the IP first, we block abuse before any expensive auth work.
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    const ipRateResult = OVERWATCH_RATE_LIMITERS.enroll.check(`ip:${clientIp}`);
    if (!ipRateResult.allowed) {
      return rateLimitResponse(ipRateResult);
    }

    // Now authenticate
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // Also rate limit by user ID (defense in depth)
    const rateResult = OVERWATCH_RATE_LIMITERS.enroll.check(auth.userId);
    if (!rateResult.allowed) {
      return rateLimitResponse(rateResult);
    }

    const result = await enrollAsArbiter(auth.userId);

    if (!result.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'ENROLLMENT_FAILED', message: result.error || 'Failed to enroll' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      data: {
        message: 'Successfully enrolled as arbiter',
        arbiter: {
          userId: result.arbiter!.userId,
          score: parseFloat(result.arbiter!.investigatorScore),
          casesReviewed: result.arbiter!.casesReviewed,
          isActive: result.arbiter!.isActive,
        },
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enroll';
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * GET /api/overwatch/cases
 *
 * Get all cases assigned to the current arbiter.
 * Optional query param: status=pending|in_progress|completed
 */
export async function handleGetCases(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // Rate limit check
    const rateResult = OVERWATCH_RATE_LIMITERS.getCases.check(auth.userId);
    if (!rateResult.allowed) {
      return rateLimitResponse(rateResult);
    }

    // Check if user is an arbiter
    const arbiter = await getArbiterProfile(auth.userId);
    if (!arbiter) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_ARBITER', message: 'You are not enrolled as an arbiter' },
        } satisfies ApiResponse<never>,
        { status: 403 }
      );
    }

    // Parse optional status filter
    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam === 'pending' || statusParam === 'in_progress' || statusParam === 'completed'
      ? statusParam
      : undefined;

    const cases = await getArbiterCases(auth.userId, status);

    // Format response with minimal info (cases are anonymized)
    const formattedCases = cases.map(assignment => ({
      assignmentId: assignment.id,
      caseId: assignment.caseId,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      deadline: assignment.case.deadline,
      priority: assignment.case.priority,
      caseStatus: assignment.case.status,
      // Don't expose game ID or player info until they open the case
    }));

    return Response.json({
      success: true,
      data: {
        cases: formattedCases,
        total: formattedCases.length,
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get cases';
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * GET /api/overwatch/cases/:id
 *
 * Get detailed case information for review.
 * Case data is anonymized (player identities hidden).
 */
export async function handleGetCase(req: Request, caseId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // Rate limit check
    const rateResult = OVERWATCH_RATE_LIMITERS.getCase.check(auth.userId);
    if (!rateResult.allowed) {
      return rateLimitResponse(rateResult);
    }

    // Get case for review (this also checks assignment and marks as in_progress)
    const reviewData = await getCaseForReview(caseId, auth.userId);

    if (!reviewData) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Case not found or you are not assigned to it' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    // Format anonymized case data
    const { case: overwatchCase, game, anonymizedPlayerId } = reviewData;

    // Determine which player is the suspect
    const suspectIsWhite = overwatchCase.suspectPlayerId === game.whitePlayerId;

    // Sanitize metadata to strip test case identifying info
    // This prevents arbiters from identifying test cases injected for calibration
    const sanitizedMetadata = overwatchCase.anticheatMetadata ? {
      ...overwatchCase.anticheatMetadata,
      // Strip fields that could identify test cases
      testCaseReason: undefined,
      insertedAt: undefined,
      source: undefined,
    } : undefined;

    // Normalize timestamps to prevent test case detection via timing analysis
    // WHY: Test cases might have timestamps that correlate with arbiter enrollment,
    // or be from the future, or have other timing patterns that reveal them.
    // By randomizing all timestamps to look like recent games, we make test cases
    // indistinguishable from real cases.
    const normalizedGame = {
      id: game.id,
      pgn: game.pgn,
      moves: game.moves,
      result: game.result,
      timeControlInitial: game.timeControlInitial,
      timeControlIncrement: game.timeControlIncrement,

      // Randomized timestamps - all games appear to be from the last 30 days
      createdAt: randomizeTimestamp(30),
      updatedAt: randomizeTimestamp(30),

      // Anonymized player references
      suspectColor: suspectIsWhite ? 'white' : 'black',
      suspectPlayerId: anonymizedPlayerId, // Anonymous ID like "Player_ABC123"

      // Accuracy data (if available)
      whiteAccuracy: game.whiteAccuracy,
      blackAccuracy: game.blackAccuracy,
      whiteBlunders: game.whiteBlunders,
      blackBlunders: game.blackBlunders,
      whiteMistakes: game.whiteMistakes,
      blackMistakes: game.blackMistakes,
    };

    return Response.json({
      success: true,
      data: {
        caseId: overwatchCase.id,
        priority: overwatchCase.priority,
        deadline: overwatchCase.deadline,
        status: overwatchCase.status,

        // Anonymized game data with normalized timestamps
        game: normalizedGame,

        // Anti-cheat metadata (what flagged this game) - sanitized
        anticheatMetadata: sanitizedMetadata,

        // Review instructions
        instructions: {
          categories: [
            {
              name: 'Engine Assistance',
              description: 'Did the suspect use a chess engine to suggest moves?',
              signs: [
                'Very high accuracy compared to their normal play',
                'Plays engine top moves consistently',
                'Unusual move choices that are computer-recommended',
              ],
            },
            {
              name: 'Input Automation',
              description: 'Did the suspect use bots or scripts to play moves?',
              signs: [
                'Inhuman mouse movement patterns',
                'Perfect or near-perfect timing precision',
                'Synthetic input physics',
              ],
            },
            {
              name: 'External Assistance',
              description: 'Did the suspect get help from another person or resource?',
              signs: [
                'Long pauses followed by perfect moves',
                'Alt-tabbing during critical moments',
                'Pattern of unfocusing during complex positions',
              ],
            },
          ],
          threshold: 'Only vote "guilty" if you are confident the evidence strongly supports cheating.',
        },
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get case';
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * POST /api/overwatch/cases/:id/verdict
 *
 * Submit a verdict for a case.
 * Arbiter must vote on all three cheat categories.
 */
export async function handleSubmitVerdict(req: Request, caseId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // Rate limit check
    const rateResult = OVERWATCH_RATE_LIMITERS.verdict.check(auth.userId);
    if (!rateResult.allowed) {
      return rateLimitResponse(rateResult);
    }

    const body = await req.json();
    const parsed = VerdictSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    const result = await submitVerdict({
      caseId,
      investigatorId: auth.userId,
      engineAssistance: parsed.data.engineAssistance as VerdictOption,
      inputAutomation: parsed.data.inputAutomation as VerdictOption,
      externalAssistance: parsed.data.externalAssistance as VerdictOption,
      notes: parsed.data.notes,
      confidence: parsed.data.confidence,
    });

    if (!result.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VERDICT_FAILED', message: result.error || 'Failed to submit verdict' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      data: {
        message: 'Verdict submitted successfully',
        verdictId: result.verdict!.id,
        caseResolved: result.caseResolved,
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit verdict';
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * GET /api/overwatch/stats
 *
 * Get the current arbiter's statistics and score.
 */
export async function handleGetStats(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    const stats = await getArbiterStats(auth.userId);

    if (!stats) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_ARBITER', message: 'You are not enrolled as an arbiter' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: stats,
    } satisfies ApiResponse<typeof stats>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
