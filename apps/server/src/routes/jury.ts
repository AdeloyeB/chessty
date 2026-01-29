/**
 * Jury System API Routes
 * =======================
 *
 * HTTP endpoints for the community review (jury) system.
 *
 * ENDPOINTS:
 * - GET /api/jury/eligibility - Check if current user can be a juror
 * - POST /api/jury/enroll - Enroll as a juror
 * - GET /api/jury/cases - Get available cases for this juror
 * - GET /api/jury/cases/:id - Get case details (anonymized)
 * - POST /api/jury/cases/:id/verdict - Submit verdict
 * - GET /api/jury/stats - Get juror's stats and score
 *
 * AUTHENTICATION:
 * All endpoints require authentication. Users must be logged in.
 *
 * AUTHORIZATION:
 * - Eligibility/enroll: Any authenticated user
 * - Cases/verdict: Must be an enrolled, active juror
 * - Stats: Must be an enrolled juror
 */

import { z } from 'zod';
import type { ApiResponse } from '@chess-game/shared';
import { authenticateRequest } from './auth';
import {
  checkEligibility,
  enrollAsJuror,
  getJurorProfile,
  getJurorCases,
  getCaseForReview,
  submitVerdict,
  getJurorStats,
} from '../services/jury';
import type { VerdictOption } from '../drizzle/jury-schema';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const VerdictSchema = z.object({
  engineAssistance: z.enum(['insufficient', 'guilty']),
  inputAutomation: z.enum(['insufficient', 'guilty']),
  externalAssistance: z.enum(['insufficient', 'guilty']),
  notes: z.string().max(2000).optional(),
  confidence: z.number().min(1).max(5).optional(),
});

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/jury/eligibility
 *
 * Check if the current user is eligible to be a juror.
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
 * POST /api/jury/enroll
 *
 * Enroll the current user as a juror.
 * User must meet eligibility requirements.
 */
export async function handleEnroll(req: Request): Promise<Response> {
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

    const result = await enrollAsJuror(auth.userId);

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
        message: 'Successfully enrolled as juror',
        juror: {
          userId: result.juror!.userId,
          score: parseFloat(result.juror!.investigatorScore),
          casesReviewed: result.juror!.casesReviewed,
          isActive: result.juror!.isActive,
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
 * GET /api/jury/cases
 *
 * Get all cases assigned to the current juror.
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

    // Check if user is a juror
    const juror = await getJurorProfile(auth.userId);
    if (!juror) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_JUROR', message: 'You are not enrolled as a juror' },
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

    const cases = await getJurorCases(auth.userId, status);

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
 * GET /api/jury/cases/:id
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
    const { case: juryCase, game, anonymizedPlayerId } = reviewData;

    // Determine which player is the suspect
    const suspectIsWhite = juryCase.suspectPlayerId === game.whitePlayerId;

    return Response.json({
      success: true,
      data: {
        caseId: juryCase.id,
        priority: juryCase.priority,
        deadline: juryCase.deadline,
        status: juryCase.status,

        // Anonymized game data
        game: {
          id: game.id,
          pgn: game.pgn,
          moves: game.moves,
          result: game.result,
          timeControlInitial: game.timeControlInitial,
          timeControlIncrement: game.timeControlIncrement,

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
        },

        // Anti-cheat metadata (what flagged this game)
        anticheatMetadata: juryCase.anticheatMetadata,

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
 * POST /api/jury/cases/:id/verdict
 *
 * Submit a verdict for a case.
 * Juror must vote on all three cheat categories.
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
 * GET /api/jury/stats
 *
 * Get the current juror's statistics and score.
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

    const stats = await getJurorStats(auth.userId);

    if (!stats) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_JUROR', message: 'You are not enrolled as a juror' },
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
