import { getAllFlags, getFlag, updateFlag } from '../services/featureFlags';
import type { FeatureFlagsResponse } from '@chess-game/shared';

// ============================================================================
// FEATURE FLAGS ROUTES
// ============================================================================

/**
 * GET /api/flags
 * Get all feature flags for the current context
 * Public endpoint - no auth required
 */
export async function handleGetFlags(): Promise<Response> {
  const flags = getAllFlags();

  const response: { success: boolean; data: FeatureFlagsResponse } = {
    success: true,
    data: {
      flags,
      fetchedAt: Date.now(),
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/flags/:id
 * Get a single feature flag by ID
 * Public endpoint - no auth required
 */
export async function handleGetFlag(flagId: string): Promise<Response> {
  const flag = await getFlag(flagId);

  if (!flag) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'FLAG_NOT_FOUND', message: `Feature flag '${flagId}' not found` },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        id: flag.id,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled,
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * PATCH /api/flags/:id
 * Update a feature flag
 * Admin only endpoint (TODO: add auth check)
 */
export async function handleUpdateFlag(flagId: string, body: unknown): Promise<Response> {
  // TODO: Add admin authentication check here
  // For now, this endpoint exists but should be protected in production

  if (!body || typeof body !== 'object') {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'INVALID_BODY', message: 'Request body is required' },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const updates = body as { enabled?: boolean; name?: string; description?: string };

  // Validate updates
  if (updates.enabled !== undefined && typeof updates.enabled !== 'boolean') {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'INVALID_ENABLED', message: 'enabled must be a boolean' },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const success = await updateFlag(flagId, updates);

  if (!success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'FLAG_NOT_FOUND', message: `Feature flag '${flagId}' not found` },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const updatedFlag = await getFlag(flagId);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        id: updatedFlag!.id,
        name: updatedFlag!.name,
        description: updatedFlag!.description,
        enabled: updatedFlag!.enabled,
        createdAt: updatedFlag!.createdAt,
        updatedAt: updatedFlag!.updatedAt,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
