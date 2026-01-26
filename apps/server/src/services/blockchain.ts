/**
 * Blockchain Service Stub
 *
 * This module will handle on-chain settlement via ChessEscrow.sol and
 * game result recording via GameRegistry.sol.
 *
 * Currently a stub - implement when smart contracts are deployed to Polygon.
 *
 * Architecture (from CLAUDE.md):
 * - ChessEscrow.sol: Holds user USDC, locks stakes, settles games, enforces rate limits
 * - GameRegistry.sol: Immutable record of game results for dispute resolution
 * - Gnosis Safe (2-of-3 multi-sig): Owns all platform contracts
 *
 * Settlement Flow:
 * 1. Game ends (checkmate, resign, timeout, draw)
 * 2. Server calls settleGameOnChain() -> ChessEscrow.settleGame()
 * 3. Contract calculates: winner payout = (stake x 2) - platform fee
 * 4. Contract updates winner's on-chain balance
 * 5. Server calls recordGameResult() -> GameRegistry.recordResult()
 * 6. Stores gameId, winner, finalFenHash, moveHistoryHash, timestamp
 */

export interface SettlementResult {
  /** Transaction hash of the settlement */
  txHash: string;
  /** Block number where settlement was confirmed */
  blockNumber: number;
  /** Gas used for the transaction */
  gasUsed: string;
}

export interface GameRegistryResult {
  /** Transaction hash of the registry record */
  txHash: string;
}

/**
 * Settle a game on-chain via ChessEscrow contract.
 * Transfers wager to winner and records platform fee.
 *
 * @param gameId - The game ID to settle
 * @param winnerId - The user ID of the winner (null for draw)
 * @param wagerAmount - The wager amount in USDC (total pot will be 2x this)
 * @returns Settlement transaction details
 * @throws Error if settlement fails (game should NOT be marked complete in DB)
 */
export async function settleGameOnChain(
  gameId: string,
  winnerId: string | null,
  wagerAmount: number
): Promise<SettlementResult> {
  // TODO: Implement when ChessEscrow.sol is deployed
  // For now, log and return mock result for development
  console.log(
    `[Blockchain] STUB: settleGameOnChain(${gameId}, winner=${winnerId}, wager=${wagerAmount})`
  );

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'On-chain settlement not implemented. Cannot settle games in production without smart contracts.'
    );
  }

  // Development stub - return mock transaction
  return {
    txHash: `0xstub_${gameId}_${Date.now()}`,
    blockNumber: 0,
    gasUsed: '0',
  };
}

/**
 * Record game result in GameRegistry contract for dispute resolution.
 * Stores hash of final position and move history for on-chain verification.
 *
 * @param gameId - The game ID to record
 * @param finalFenHash - Keccak256 hash of the final FEN position
 * @param moveHistoryHash - Keccak256 hash of the complete move history (PGN)
 * @returns Registry transaction details
 * @throws Error if recording fails in production
 */
export async function recordGameResult(
  gameId: string,
  finalFenHash: string,
  moveHistoryHash: string
): Promise<GameRegistryResult> {
  console.log(
    `[Blockchain] STUB: recordGameResult(${gameId}, fen=${finalFenHash.slice(0, 10)}..., moves=${moveHistoryHash.slice(0, 10)}...)`
  );

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Game registry not implemented. Cannot record results in production without smart contracts.'
    );
  }

  return {
    txHash: `0xregistry_${gameId}_${Date.now()}`,
  };
}

/**
 * Check if blockchain service is available.
 * In production, this checks contract deployment and RPC connection.
 * In development, returns true to allow mock settlements.
 *
 * @returns true if blockchain operations can proceed
 */
export function isBlockchainAvailable(): boolean {
  // In production, this would check:
  // 1. Contract addresses are configured
  // 2. RPC provider is connected
  // 3. Server wallet has sufficient balance for gas
  return process.env.NODE_ENV !== 'production';
}

/**
 * Get the platform fee percentage.
 * This matches the fee configured in ChessEscrow.sol.
 *
 * @returns Fee percentage (e.g., 0.025 for 2.5%)
 */
export function getPlatformFeePercentage(): number {
  // TODO: Read from contract or environment
  return 0.025; // 2.5% platform fee
}

/**
 * Calculate the winner's payout after platform fee.
 *
 * @param totalPot - Total pot (both players' wagers combined)
 * @returns Amount the winner receives
 */
export function calculateWinnerPayout(totalPot: number): number {
  const feePercentage = getPlatformFeePercentage();
  const fee = totalPot * feePercentage;
  return totalPot - fee;
}

/**
 * Hash a string for on-chain storage using keccak256.
 * Used for storing FEN and PGN hashes in GameRegistry.
 *
 * @param data - String data to hash
 * @returns Hex-encoded keccak256 hash
 */
export function hashForChain(data: string): string {
  // TODO: Use ethers.js or viem keccak256 when implementing
  // For now, return a stub hash
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Hash function not implemented for production');
  }

  // Development stub - create a pseudo-hash
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  let hash = 0;
  for (const byte of bytes) {
    hash = ((hash << 5) - hash) + byte;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
}
