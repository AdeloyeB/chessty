import type { ApiResponse } from '@chess-game/shared';
import * as walletService from '../services/wallet';
import { authenticateRequest } from './auth';

export async function handleGetBalance(req: Request): Promise<Response> {
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

    const balance = await walletService.getBalance(auth.userId);

    return Response.json({
      success: true,
      data: { balance },
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get balance' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetTransactions(req: Request): Promise<Response> {
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

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const transactions = await walletService.getTransactionHistory(auth.userId, limit, offset);

    return Response.json({
      success: true,
      data: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        balanceAfter: parseFloat(tx.balanceAfter),
        referenceId: tx.referenceId,
        description: tx.description,
        createdAt: tx.createdAt,
      })),
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get transactions' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
