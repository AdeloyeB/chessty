# Polygon Blockchain Integration

> This document describes how to integrate USDC on Polygon for the chess betting platform.

## Table of Contents

1. [Why Polygon](#why-polygon)
2. [Architecture Overview](#architecture-overview)
3. [Smart Contracts](#smart-contracts)
4. [Server Integration](#server-integration)
5. [Frontend Integration](#frontend-integration)
6. [Security Setup](#security-setup)
7. [Deployment Checklist](#deployment-checklist)

---

## Why Polygon

### Payment Processor Restrictions

Traditional payment processors (Stripe, PayPal, Square) explicitly prohibit prediction markets and betting platforms. This is not a "nice to have Web3 feature" — it's the only viable payment infrastructure.

### Polygon Advantages

| Requirement | Polygon Solution |
|-------------|------------------|
| Low transaction fees | ~$0.01-0.05 per transaction |
| Fast confirmation | ~2 seconds finality |
| USDC availability | Circle's official USDC deployment |
| Battle-tested | Polymarket, Aavegotchi, major DeFi |
| EVM compatible | Standard Solidity, familiar tooling |
| No chargebacks | Blockchain transactions are final |

### Cost Estimates

| Operation | Estimated Gas | USD Cost |
|-----------|---------------|----------|
| USDC Deposit | ~65,000 | $0.01-0.02 |
| Lock Stakes | ~80,000 | $0.02-0.03 |
| Settle Game | ~60,000 | $0.01-0.02 |
| Withdrawal | ~50,000 | $0.01-0.02 |
| **Total per game** | ~200,000 | **$0.05-0.10** |

---

## Architecture Overview

### Hybrid Model

```
┌─────────────────────────────────────────────────────────────┐
│                    OFF-CHAIN (Fast)                          │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ Game Logic  │    │ Matchmaking │    │   Chat/UI   │      │
│  │  (Moves)    │    │   (Queue)   │    │  (Updates)  │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│        │                   │                  │              │
│        └───────────────────┼──────────────────┘              │
│                            │                                 │
│                     WebSocket Server                         │
│                     PostgreSQL + Redis                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ Settlement Layer
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    ON-CHAIN (Trustless)                      │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Deposit   │    │ Lock Stakes │    │   Settle    │      │
│  │    USDC     │    │  for Game   │    │    Game     │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│                            │                                 │
│                     ChessEscrow.sol                          │
│                     GameRegistry.sol                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Why Hybrid?

| Operation | Where | Why |
|-----------|-------|-----|
| Chess moves | Off-chain | Blockchain is too slow (2s vs instant) |
| Matchmaking | Off-chain | Needs fast queries and updates |
| Clock management | Off-chain | Requires millisecond precision |
| Deposit USDC | On-chain | Trustless, verifiable |
| Lock stakes | On-chain | Neither player can cheat |
| Settle game | On-chain | Automated, transparent payout |
| Withdraw | On-chain | Users control their funds |

---

## Smart Contracts

### Contract Structure

```
contracts/
├── ChessEscrow.sol      # Main escrow contract (holds funds)
├── GameRegistry.sol     # Immutable game result records
├── interfaces/
│   └── IChessEscrow.sol # Interface for external calls
└── mocks/
    └── MockUSDC.sol     # For testing
```

### ChessEscrow.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract ChessEscrow is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    IERC20 public immutable usdc;
    address public guardian;           // Can pause (hardware wallet)
    address public authorizedServer;   // Can settle games (hot wallet)
    address public treasury;           // Platform fee recipient

    uint256 public constant PLATFORM_FEE_BPS = 500; // 5%
    uint256 public constant DAILY_SETTLEMENT_LIMIT = 50000 * 1e6; // $50k
    uint256 public constant LARGE_WITHDRAWAL_THRESHOLD = 500 * 1e6; // $500
    uint256 public constant WITHDRAWAL_DELAY = 24 hours;

    uint256 public settledToday;
    uint256 public lastResetDay;

    struct Game {
        address player1;
        address player2;
        uint256 stakeAmount;
        bool settled;
        uint256 createdAt;
    }

    struct WithdrawalRequest {
        uint256 amount;
        uint256 requestedAt;
        bool executed;
    }

    mapping(bytes32 => Game) public games;
    mapping(address => uint256) public balances;
    mapping(address => WithdrawalRequest) public withdrawalRequests;

    // ============ Events ============

    event Deposited(address indexed user, uint256 amount);
    event StakesLocked(bytes32 indexed gameId, address player1, address player2, uint256 stakeAmount);
    event GameSettled(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 fee);
    event WithdrawalRequested(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event EmergencyPaused(address indexed by);

    // ============ Modifiers ============

    modifier onlyGuardian() {
        require(msg.sender == guardian, "Only guardian");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == authorizedServer, "Only authorized server");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _usdc,
        address _guardian,
        address _authorizedServer,
        address _treasury
    ) {
        usdc = IERC20(_usdc);
        guardian = _guardian;
        authorizedServer = _authorizedServer;
        treasury = _treasury;
    }

    // ============ User Functions ============

    /// @notice Deposit USDC to play
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Request withdrawal (instant for small, delayed for large)
    function requestWithdrawal(uint256 amount) external nonReentrant whenNotPaused {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        if (amount < LARGE_WITHDRAWAL_THRESHOLD) {
            // Small withdrawal: instant
            balances[msg.sender] -= amount;
            usdc.safeTransfer(msg.sender, amount);
            emit Withdrawn(msg.sender, amount);
        } else {
            // Large withdrawal: time-locked
            withdrawalRequests[msg.sender] = WithdrawalRequest({
                amount: amount,
                requestedAt: block.timestamp,
                executed: false
            });
            emit WithdrawalRequested(msg.sender, amount);
        }
    }

    /// @notice Execute a time-locked withdrawal
    function executeWithdrawal() external nonReentrant whenNotPaused {
        WithdrawalRequest storage req = withdrawalRequests[msg.sender];
        require(req.amount > 0, "No pending withdrawal");
        require(!req.executed, "Already executed");
        require(
            block.timestamp >= req.requestedAt + WITHDRAWAL_DELAY,
            "Withdrawal delay not met"
        );
        require(balances[msg.sender] >= req.amount, "Insufficient balance");

        req.executed = true;
        balances[msg.sender] -= req.amount;
        usdc.safeTransfer(msg.sender, req.amount);
        emit Withdrawn(msg.sender, req.amount);
    }

    // ============ Server Functions ============

    /// @notice Lock stakes when a game starts
    function lockStakes(
        bytes32 gameId,
        address player1,
        address player2,
        uint256 stakeAmount
    ) external onlyAuthorized whenNotPaused {
        require(games[gameId].createdAt == 0, "Game already exists");
        require(balances[player1] >= stakeAmount, "Player 1 insufficient balance");
        require(balances[player2] >= stakeAmount, "Player 2 insufficient balance");

        balances[player1] -= stakeAmount;
        balances[player2] -= stakeAmount;

        games[gameId] = Game({
            player1: player1,
            player2: player2,
            stakeAmount: stakeAmount,
            settled: false,
            createdAt: block.timestamp
        });

        emit StakesLocked(gameId, player1, player2, stakeAmount);
    }

    /// @notice Settle a game and pay the winner
    function settleGame(
        bytes32 gameId,
        address winner
    ) external onlyAuthorized whenNotPaused {
        Game storage game = games[gameId];
        require(game.createdAt > 0, "Game does not exist");
        require(!game.settled, "Game already settled");
        require(
            winner == game.player1 || winner == game.player2,
            "Winner must be a player"
        );

        // Reset daily limit if new day
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastResetDay) {
            settledToday = 0;
            lastResetDay = currentDay;
        }

        uint256 totalPot = game.stakeAmount * 2;
        require(
            settledToday + totalPot <= DAILY_SETTLEMENT_LIMIT,
            "Daily settlement limit exceeded"
        );
        settledToday += totalPot;

        // Calculate fee and payout
        uint256 fee = (totalPot * PLATFORM_FEE_BPS) / 10000;
        uint256 payout = totalPot - fee;

        game.settled = true;
        balances[winner] += payout;
        balances[treasury] += fee;

        emit GameSettled(gameId, winner, payout, fee);
    }

    /// @notice Settle a draw (refund both players)
    function settleDraw(bytes32 gameId) external onlyAuthorized whenNotPaused {
        Game storage game = games[gameId];
        require(game.createdAt > 0, "Game does not exist");
        require(!game.settled, "Game already settled");

        game.settled = true;
        balances[game.player1] += game.stakeAmount;
        balances[game.player2] += game.stakeAmount;

        emit GameSettled(gameId, address(0), 0, 0); // address(0) indicates draw
    }

    // ============ Guardian Functions ============

    /// @notice Emergency pause (guardian can trigger instantly)
    function pause() external onlyGuardian {
        _pause();
        emit EmergencyPaused(msg.sender);
    }

    // ============ View Functions ============

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    function getGame(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }
}
```

### GameRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title GameRegistry - Immutable record of game results
/// @notice Stores game results for audit and dispute resolution
contract GameRegistry {
    struct GameResult {
        bytes32 gameId;
        address winner;
        address loser;
        uint256 stakeAmount;
        bytes32 finalFenHash;      // keccak256(finalFen)
        bytes32 moveHistoryHash;   // keccak256(moveHistory)
        uint256 settledAt;
    }

    mapping(bytes32 => GameResult) public results;
    address public authorizedRecorder;

    event GameRecorded(
        bytes32 indexed gameId,
        address indexed winner,
        address indexed loser,
        uint256 stakeAmount,
        bytes32 finalFenHash,
        bytes32 moveHistoryHash
    );

    modifier onlyAuthorized() {
        require(msg.sender == authorizedRecorder, "Unauthorized");
        _;
    }

    constructor(address _authorizedRecorder) {
        authorizedRecorder = _authorizedRecorder;
    }

    function recordGame(
        bytes32 gameId,
        address winner,
        address loser,
        uint256 stakeAmount,
        string calldata finalFen,
        string calldata moveHistory
    ) external onlyAuthorized {
        require(results[gameId].settledAt == 0, "Already recorded");

        bytes32 fenHash = keccak256(abi.encodePacked(finalFen));
        bytes32 movesHash = keccak256(abi.encodePacked(moveHistory));

        results[gameId] = GameResult({
            gameId: gameId,
            winner: winner,
            loser: loser,
            stakeAmount: stakeAmount,
            finalFenHash: fenHash,
            moveHistoryHash: movesHash,
            settledAt: block.timestamp
        });

        emit GameRecorded(gameId, winner, loser, stakeAmount, fenHash, movesHash);
    }

    /// @notice Verify a game result (anyone can call)
    function verifyGame(
        bytes32 gameId,
        string calldata finalFen,
        string calldata moveHistory
    ) external view returns (bool fenMatches, bool movesMatch) {
        GameResult memory result = results[gameId];
        fenMatches = keccak256(abi.encodePacked(finalFen)) == result.finalFenHash;
        movesMatch = keccak256(abi.encodePacked(moveHistory)) == result.moveHistoryHash;
    }
}
```

---

## Server Integration

### Dependencies

```bash
pnpm add ethers @types/node
```

### Blockchain Service

```typescript
// apps/server/src/services/blockchain.ts
import { ethers } from 'ethers';

const ESCROW_ABI = [...]; // Import from compiled contract
const REGISTRY_ABI = [...];

// Initialize provider and wallets
const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
const serverWallet = new ethers.Wallet(process.env.SERVER_WALLET_PRIVATE_KEY!, provider);

const escrowContract = new ethers.Contract(
  process.env.ESCROW_CONTRACT_ADDRESS!,
  ESCROW_ABI,
  serverWallet
);

const registryContract = new ethers.Contract(
  process.env.REGISTRY_CONTRACT_ADDRESS!,
  REGISTRY_ABI,
  serverWallet
);

/**
 * Lock stakes when a game starts
 */
export async function lockGameStakes(
  gameId: string,
  player1Wallet: string,
  player2Wallet: string,
  stakeAmountUsdc: number
): Promise<string> {
  const gameIdBytes32 = ethers.id(gameId);
  const stakeAmount = ethers.parseUnits(stakeAmountUsdc.toString(), 6); // USDC has 6 decimals

  const tx = await escrowContract.lockStakes(
    gameIdBytes32,
    player1Wallet,
    player2Wallet,
    stakeAmount
  );

  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Settle a game and pay the winner
 */
export async function settleGame(
  gameId: string,
  winnerWallet: string,
  finalFen: string,
  moveHistory: string
): Promise<string> {
  const gameIdBytes32 = ethers.id(gameId);

  // Settle in escrow
  const settleTx = await escrowContract.settleGame(gameIdBytes32, winnerWallet);
  await settleTx.wait();

  // Record in registry (for audit trail)
  const loserWallet = await getLoserWallet(gameId, winnerWallet);
  const stakeAmount = await getGameStake(gameId);

  const recordTx = await registryContract.recordGame(
    gameIdBytes32,
    winnerWallet,
    loserWallet,
    stakeAmount,
    finalFen,
    moveHistory
  );

  const receipt = await recordTx.wait();
  return receipt.hash;
}

/**
 * Settle a draw (refund both players)
 */
export async function settleDraw(gameId: string): Promise<string> {
  const gameIdBytes32 = ethers.id(gameId);
  const tx = await escrowContract.settleDraw(gameIdBytes32);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Get user's on-chain balance
 */
export async function getOnChainBalance(walletAddress: string): Promise<number> {
  const balance = await escrowContract.getBalance(walletAddress);
  return parseFloat(ethers.formatUnits(balance, 6));
}
```

### Integration with Game Coordinator

```typescript
// In GameCoordinator.ts - when game ends

import { settleGame, settleDraw } from '../services/blockchain';

async function handleGameEnd(gameId: string, result: GameResult) {
  const game = await getGameById(gameId);

  // 1. Update database (existing code)
  await endGame(gameId, result.winnerId, result.reason);

  // 2. Settle on blockchain
  if (result.winnerId && result.winnerId !== 'draw') {
    const winner = await getUserById(result.winnerId);
    const loser = await getUserById(result.loserId);

    if (winner.walletAddress && loser.walletAddress) {
      try {
        const txHash = await settleGame(
          gameId,
          winner.walletAddress,
          game.finalFen,
          game.moveHistory.join(',')
        );
        console.log(`[Blockchain] Game ${gameId} settled: ${txHash}`);
      } catch (error) {
        console.error(`[Blockchain] Settlement failed for ${gameId}:`, error);
        // Queue for retry
        await queueSettlementRetry(gameId, result);
      }
    }
  } else {
    // Draw - refund both players
    const txHash = await settleDraw(gameId);
    console.log(`[Blockchain] Game ${gameId} draw settled: ${txHash}`);
  }

  // 3. Emit events for UI
  gameEventEmitter.emit('game:ended', { gameId, result });
}
```

---

## Frontend Integration

### Wallet Connection (Already Set Up)

The app already has RainbowKit/Wagmi configured. Users connect their wallet on the frontend.

### Deposit Flow

```tsx
// components/wallet/DepositButton.tsx
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

const USDC_ADDRESS = '0x...'; // Polygon USDC
const ESCROW_ADDRESS = '0x...';

export function DepositButton({ amount }: { amount: number }) {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleDeposit = async () => {
    // Step 1: Approve USDC spending
    await writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ESCROW_ADDRESS, parseUnits(amount.toString(), 6)],
    });

    // Step 2: Deposit to escrow
    await writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'deposit',
      args: [parseUnits(amount.toString(), 6)],
    });
  };

  return (
    <button onClick={handleDeposit} disabled={isLoading}>
      {isLoading ? 'Processing...' : `Deposit $${amount} USDC`}
    </button>
  );
}
```

---

## Security Setup

### Gnosis Safe Configuration

1. **Create Safe on Polygon**: https://app.safe.global
2. **Add Signers**:
   - Signer 1: Founder's Ledger address
   - Signer 2: Co-founder's Ledger address
   - Signer 3: Server operational wallet
3. **Set Threshold**: 2-of-3
4. **Transfer Ownership**: Make Safe the owner of deployed contracts

### Environment Variables

```bash
# .env.production (stored in Doppler, not in repo)

# RPC
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
POLYGON_RPC_BACKUP=https://polygon-rpc.com

# Contracts
ESCROW_CONTRACT_ADDRESS=0x...
REGISTRY_CONTRACT_ADDRESS=0x...
USDC_CONTRACT_ADDRESS=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359

# Server Wallet (hot wallet - limited funds)
SERVER_WALLET_PRIVATE_KEY=0x...

# Multi-sig (for reference, not used in code)
GNOSIS_SAFE_ADDRESS=0x...
```

---

## Deployment Checklist

### Testnet (Mumbai)

- [ ] Deploy contracts to Mumbai testnet
- [ ] Get test USDC from faucet
- [ ] Test all flows: deposit, lock, settle, withdraw
- [ ] Test time-lock withdrawals
- [ ] Test daily settlement limits
- [ ] Test emergency pause
- [ ] Run for 2+ weeks without issues

### Pre-Mainnet

- [ ] Smart contract audit completed
- [ ] Multi-sig (Gnosis Safe) set up and tested
- [ ] Bug bounty program launched (Immunefi)
- [ ] Monitoring and alerts configured
- [ ] Hot wallet funded with initial USDC for gas
- [ ] Server wallet private key in Doppler
- [ ] Backup RPC providers configured

### Mainnet Launch

- [ ] Deploy contracts to Polygon mainnet
- [ ] Transfer ownership to Gnosis Safe
- [ ] Verify contracts on PolygonScan
- [ ] Test with small amounts first ($1-10)
- [ ] Gradually increase limits
- [ ] Monitor for 72 hours before full launch
