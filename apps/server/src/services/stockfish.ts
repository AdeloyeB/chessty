/**
 * Stockfish Engine Service
 * =========================
 *
 * This module provides server-side Stockfish chess engine integration for the
 * anti-cheat analysis system. It spawns and manages Stockfish as a child process,
 * communicating via the UCI (Universal Chess Interface) protocol.
 *
 * WHY SERVER-SIDE STOCKFISH?
 * --------------------------
 * The desktop app has its own Stockfish via Tauri sidecar for user-facing analysis.
 * But the server needs its own Stockfish for:
 * 1. Anti-cheat analysis - comparing player moves to engine recommendations
 * 2. Consistent analysis - same engine version/settings for all games
 * 3. Background processing - analyze games without user's device
 *
 * HOW IT WORKS:
 * -------------
 * 1. Spawn Stockfish as a child process (configurable via STOCKFISH_PATH env var)
 * 2. Send UCI commands via stdin (e.g., "position fen ...", "go depth 20")
 * 3. Parse output from stdout (e.g., "bestmove e2e4", "info score cp 32")
 * 4. Return structured evaluation data to the caller
 *
 * UCI PROTOCOL BASICS:
 * -------------------
 * - "uci" -> Engine responds with "uciok" when ready
 * - "isready" -> Engine responds "readyok" when ready for commands
 * - "position fen <fen>" -> Set up the board position
 * - "go depth <N>" -> Start analysis to depth N
 * - "setoption name MultiPV value <N>" -> Return top N moves instead of just 1
 * - "stop" -> Stop current analysis and return best move found so far
 *
 * WORKER POOL:
 * ------------
 * For high-throughput analysis (batch game analysis, anti-cheat scans), we use
 * a pool of Stockfish workers to process positions in parallel. Each worker is
 * an independent Stockfish process.
 */

import type { StockfishAnalyzer, StockfishEvaluation } from './anticheat/types';
import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface as ReadlineInterface } from 'readline';

// ---------------------------------------------------------------------------
// Configuration Constants
// ---------------------------------------------------------------------------

/**
 * Default path to the Stockfish binary.
 * Override with STOCKFISH_PATH environment variable.
 *
 * Common paths:
 * - macOS Homebrew: /opt/homebrew/bin/stockfish
 * - Linux apt: /usr/games/stockfish or /usr/bin/stockfish
 * - Windows: C:\stockfish\stockfish.exe
 */
const DEFAULT_STOCKFISH_PATH = process.env.STOCKFISH_PATH || 'stockfish';

/**
 * Default analysis depth. Higher = more accurate but slower.
 * Depth 20 is a good balance for anti-cheat analysis (~1-3 seconds per position).
 */
const DEFAULT_DEPTH = 20;

/**
 * How many top moves to analyze (MultiPV setting).
 * For anti-cheat, we need multiple moves to calculate centipawn loss
 * and check if the played move was in the top N.
 */
const DEFAULT_MULTI_PV = 5;

/**
 * Timeout for waiting for UCI responses (milliseconds).
 * Stockfish should respond within this time; if not, something is wrong.
 */
const UCI_TIMEOUT_MS = 30000;

/**
 * Number of workers in the pool for parallel analysis.
 * Adjust based on server CPU cores and memory.
 */
const DEFAULT_POOL_SIZE = Number(process.env.STOCKFISH_POOL_SIZE) || 2;

/**
 * Number of threads per Stockfish instance.
 * Each worker uses this many CPU threads.
 */
const THREADS_PER_WORKER = Number(process.env.STOCKFISH_THREADS) || 2;

/**
 * Hash table size per worker in MB.
 * Higher = better move caching, but more memory.
 */
const HASH_MB_PER_WORKER = Number(process.env.STOCKFISH_HASH_MB) || 128;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for creating a Stockfish worker.
 */
interface StockfishWorkerOptions {
  /** Path to Stockfish binary */
  stockfishPath?: string;
  /** Number of threads for this worker */
  threads?: number;
  /** Hash table size in MB */
  hashMb?: number;
  /** Number of top moves to analyze */
  multiPv?: number;
}

/**
 * Internal state of a Stockfish worker.
 */
interface WorkerState {
  /** Child process handle */
  process: ChildProcess;
  /** Readline interface for parsing stdout */
  reader: ReadlineInterface;
  /** Engine name from UCI handshake */
  name: string;
  /** Whether the engine is currently analyzing */
  busy: boolean;
  /** Promise to wait for when worker is busy */
  busyPromise: Promise<void> | null;
}

// ---------------------------------------------------------------------------
// Stockfish Worker Class
// ---------------------------------------------------------------------------

/**
 * A single Stockfish worker that manages one engine process.
 *
 * This class handles:
 * - Spawning the Stockfish process
 * - UCI handshake and configuration
 * - Sending analysis commands
 * - Parsing engine output into structured data
 */
export class StockfishWorker implements StockfishAnalyzer {
  private state: WorkerState | null = null;
  private options: Required<StockfishWorkerOptions>;
  private lineBuffer: string[] = [];
  private lineResolvers: Array<(line: string) => void> = [];

  constructor(options: StockfishWorkerOptions = {}) {
    this.options = {
      stockfishPath: options.stockfishPath || DEFAULT_STOCKFISH_PATH,
      threads: options.threads || THREADS_PER_WORKER,
      hashMb: options.hashMb || HASH_MB_PER_WORKER,
      multiPv: options.multiPv || DEFAULT_MULTI_PV,
    };
  }

  /**
   * Initialize the Stockfish process.
   * Must be called before any analysis.
   */
  async initialize(): Promise<void> {
    if (this.state) {
      return; // Already initialized
    }

    // Spawn the Stockfish process
    const proc = spawn(this.options.stockfishPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create readline interface to parse stdout line by line
    const reader = createInterface({
      input: proc.stdout!,
      crlfDelay: Infinity,
    });

    // Handle each line from Stockfish
    reader.on('line', (line: string) => {
      // If someone is waiting for a line, give it to them
      const resolver = this.lineResolvers.shift();
      if (resolver) {
        resolver(line);
      } else {
        // Otherwise, buffer it for later
        this.lineBuffer.push(line);
      }
    });

    // Handle errors
    proc.on('error', (err) => {
      console.error('[Stockfish] Process error:', err);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.warn('[Stockfish] stderr:', msg);
      }
    });

    this.state = {
      process: proc,
      reader,
      name: 'Unknown',
      busy: false,
      busyPromise: null,
    };

    // Perform UCI handshake
    await this.uciHandshake();

    // Configure engine settings
    await this.configure();
  }

  /**
   * Perform the UCI handshake.
   * This tells Stockfish we want to communicate via UCI protocol.
   */
  private async uciHandshake(): Promise<void> {
    this.sendCommand('uci');

    // Read until we get "uciok"
    while (true) {
      const line = await this.readLine();
      if (line.startsWith('id name ')) {
        this.state!.name = line.substring(8);
      } else if (line === 'uciok') {
        break;
      }
    }

    // Wait for engine to be ready
    await this.waitReady();
  }

  /**
   * Configure engine settings (threads, hash, MultiPV).
   */
  private async configure(): Promise<void> {
    // Set number of threads
    this.sendCommand(`setoption name Threads value ${this.options.threads}`);

    // Set hash table size
    this.sendCommand(`setoption name Hash value ${this.options.hashMb}`);

    // Set MultiPV (number of top moves to return)
    this.sendCommand(`setoption name MultiPV value ${this.options.multiPv}`);

    // Wait for settings to be applied
    await this.waitReady();
  }

  /**
   * Wait for the engine to be ready.
   */
  private async waitReady(): Promise<void> {
    this.sendCommand('isready');

    while (true) {
      const line = await this.readLine();
      if (line === 'readyok') {
        break;
      }
    }
  }

  /**
   * Send a command to Stockfish via stdin.
   */
  private sendCommand(cmd: string): void {
    if (!this.state) {
      throw new Error('Stockfish not initialized');
    }
    this.state.process.stdin!.write(cmd + '\n');
  }

  /**
   * Read the next line from Stockfish stdout.
   * Returns buffered line if available, otherwise waits.
   */
  private readLine(): Promise<string> {
    // Check if we have a buffered line
    const buffered = this.lineBuffer.shift();
    if (buffered !== undefined) {
      return Promise.resolve(buffered);
    }

    // Wait for the next line with timeout
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.lineResolvers.indexOf(resolve);
        if (idx >= 0) {
          this.lineResolvers.splice(idx, 1);
        }
        reject(new Error('Stockfish response timeout'));
      }, UCI_TIMEOUT_MS);

      this.lineResolvers.push((line: string) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  /**
   * Analyze a single chess position.
   *
   * @param fen - Position in FEN notation
   * @param depth - Analysis depth (default: 20)
   * @returns Structured evaluation with best moves and scores
   */
  async analyzePosition(fen: string, depth: number = DEFAULT_DEPTH): Promise<StockfishEvaluation> {
    if (!this.state) {
      throw new Error('Stockfish not initialized. Call initialize() first.');
    }

    // Wait if worker is busy
    if (this.state.busy && this.state.busyPromise) {
      await this.state.busyPromise;
    }

    // Mark as busy
    let releaseBusy: () => void = () => {};
    this.state.busy = true;
    this.state.busyPromise = new Promise<void>((resolve) => {
      releaseBusy = resolve;
    });

    try {
      // Set position
      this.sendCommand(`position fen ${fen}`);

      // Start analysis
      this.sendCommand(`go depth ${depth}`);

      // Collect analysis results
      // MultiPV means we get multiple "info" lines with different PV indices
      const pvResults: Map<
        number,
        {
          score: number;
          scoreMate: number | null;
          pv: string[];
          depth: number;
          nodes?: number;
          timeMs?: number;
        }
      > = new Map();

      let bestMove = '';
      let nodes = 0;
      let timeMs = 0;
      let actualDepth = 0;

      // Read output until we get "bestmove"
      while (true) {
        const line = await this.readLine();

        if (line.startsWith('info ') && line.includes(' pv ')) {
          const parsed = this.parseInfoLine(line);
          if (parsed && parsed.depth >= actualDepth) {
            // Only keep the highest depth results
            if (parsed.depth > actualDepth) {
              pvResults.clear();
              actualDepth = parsed.depth;
            }
            pvResults.set(parsed.multipv, {
              score: parsed.scoreCp,
              scoreMate: parsed.scoreMate,
              pv: parsed.pv,
              depth: parsed.depth,
              nodes: parsed.nodes,
              timeMs: parsed.timeMs,
            });
            if (parsed.nodes) nodes = parsed.nodes;
            if (parsed.timeMs) timeMs = parsed.timeMs;
          }
        } else if (line.startsWith('bestmove ')) {
          bestMove = this.parseBestMove(line);
          break;
        }
      }

      // Build the moves array from PV results
      const moves: Array<{ move: string; score: number; isTactical?: boolean }> = [];
      const sortedPvs = Array.from(pvResults.entries()).sort((a, b) => a[0] - b[0]);

      for (const [, pvData] of sortedPvs) {
        const firstMove = pvData.pv[0];
        if (firstMove) {
          moves.push({
            move: firstMove,
            score: pvData.score,
            isTactical: this.isTacticalMove(pvData.pv),
          });
        }
      }

      // If we didn't get MultiPV results, use bestmove
      if (moves.length === 0 && bestMove) {
        const topPv = pvResults.get(1);
        moves.push({
          move: bestMove,
          score: topPv?.score ?? 0,
          isTactical: false,
        });
      }

      // Get the top PV for the main evaluation
      const topPv = sortedPvs[0]?.[1];

      return {
        fen,
        bestMove,
        scoreCp: topPv?.score ?? 0,
        scoreMate: topPv?.scoreMate ?? null,
        depth: actualDepth,
        moves,
        pv: topPv?.pv ?? [],
        nodes,
        timeMs,
      };
    } finally {
      // Release busy lock
      this.state.busy = false;
      releaseBusy();
    }
  }

  /**
   * Analyze multiple positions (batch analysis).
   * Positions are analyzed sequentially on this worker.
   */
  async analyzeBatch(positions: string[], depth: number = DEFAULT_DEPTH): Promise<StockfishEvaluation[]> {
    const results: StockfishEvaluation[] = [];
    for (const fen of positions) {
      results.push(await this.analyzePosition(fen, depth));
    }
    return results;
  }

  /**
   * Check if the engine is ready.
   */
  async isReady(): Promise<boolean> {
    if (!this.state) {
      return false;
    }

    try {
      await this.waitReady();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop current analysis.
   */
  async stop(): Promise<void> {
    if (this.state) {
      this.sendCommand('stop');
    }
  }

  /**
   * Gracefully shut down the engine.
   */
  async quit(): Promise<void> {
    if (this.state) {
      this.sendCommand('quit');
      this.state.reader.close();
      this.state.process.kill();
      this.state = null;
    }
  }

  /**
   * Get engine name.
   */
  getEngineName(): string {
    return this.state?.name ?? 'Unknown';
  }

  // -------------------------------------------------------------------------
  // Parsing Helpers
  // -------------------------------------------------------------------------

  /**
   * Parse an "info" line from Stockfish.
   * Example: "info depth 20 seldepth 25 multipv 1 score cp 32 nodes 1234567 time 1000 pv e2e4 e7e5"
   */
  private parseInfoLine(line: string): {
    depth: number;
    multipv: number;
    scoreCp: number;
    scoreMate: number | null;
    nodes?: number;
    timeMs?: number;
    pv: string[];
  } | null {
    const parts = line.split(' ');
    let depth = 0;
    let multipv = 1;
    let scoreCp = 0;
    let scoreMate: number | null = null;
    let nodes: number | undefined;
    let timeMs: number | undefined;
    let pv: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      switch (parts[i]) {
        case 'depth':
          depth = parseInt(parts[i + 1], 10);
          i++;
          break;
        case 'multipv':
          multipv = parseInt(parts[i + 1], 10);
          i++;
          break;
        case 'score':
          if (parts[i + 1] === 'cp') {
            scoreCp = parseInt(parts[i + 2], 10);
            i += 2;
          } else if (parts[i + 1] === 'mate') {
            scoreMate = parseInt(parts[i + 2], 10);
            // Set scoreCp to a very high/low value for mate
            scoreCp = scoreMate > 0 ? 30000 - scoreMate * 100 : -30000 - scoreMate * 100;
            i += 2;
          }
          break;
        case 'nodes':
          nodes = parseInt(parts[i + 1], 10);
          i++;
          break;
        case 'time':
          timeMs = parseInt(parts[i + 1], 10);
          i++;
          break;
        case 'pv':
          // Everything after 'pv' is the principal variation
          pv = this.parsePvMoves(parts.slice(i + 1));
          i = parts.length; // Exit loop
          break;
      }
    }

    if (depth === 0 || pv.length === 0) {
      return null;
    }

    return { depth, multipv, scoreCp, scoreMate, nodes, timeMs, pv };
  }

  /**
   * Parse PV moves, filtering out any non-move tokens.
   */
  private parsePvMoves(tokens: string[]): string[] {
    const uciKeywords = new Set([
      'depth', 'seldepth', 'multipv', 'score', 'nodes', 'nps', 'hashfull',
      'tbhits', 'time', 'pv', 'currmove', 'currmovenumber', 'string',
      'refutation', 'bmc', 'cpuload', 'sbhits', 'wdl',
    ]);

    const moves: string[] = [];
    for (const token of tokens) {
      // Stop if we hit a UCI keyword
      if (uciKeywords.has(token)) {
        break;
      }
      // Validate move format: 4-5 characters, alphanumeric
      if (token.length >= 4 && token.length <= 5 && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) {
        moves.push(token);
      } else {
        break;
      }
    }
    return moves;
  }

  /**
   * Parse a "bestmove" line.
   * Example: "bestmove e2e4 ponder e7e5"
   */
  private parseBestMove(line: string): string {
    const parts = line.split(' ');
    if (parts.length >= 2 && parts[0] === 'bestmove') {
      const move = parts[1];
      if (move !== '(none)') {
        return move;
      }
    }
    return '';
  }

  /**
   * Determine if a move is tactical based on the PV.
   * A move is considered tactical if it involves captures, checks, or sacrifices.
   * For now, we use a simple heuristic based on PV length (deep lines often indicate tactics).
   */
  private isTacticalMove(pv: string[]): boolean {
    // If the PV is very long (deep calculation required), likely tactical
    if (pv.length > 8) {
      return true;
    }
    // We could add more sophisticated detection (checking for captures, etc.)
    // but that requires a chess library to analyze the moves
    return false;
  }
}

// ---------------------------------------------------------------------------
// Worker Pool
// ---------------------------------------------------------------------------

/**
 * A pool of Stockfish workers for parallel position analysis.
 *
 * The pool manages multiple Stockfish processes and distributes
 * analysis requests across them. This is useful for:
 * - Batch game analysis (analyze many positions)
 * - Anti-cheat scanning (process multiple games concurrently)
 */
export class StockfishWorkerPool implements StockfishAnalyzer {
  private workers: StockfishWorker[] = [];
  private poolSize: number;
  private initialized = false;
  private options: StockfishWorkerOptions;
  private currentWorkerIndex = 0;

  constructor(poolSize: number = DEFAULT_POOL_SIZE, options: StockfishWorkerOptions = {}) {
    this.poolSize = poolSize;
    this.options = options;
  }

  /**
   * Initialize all workers in the pool.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log(`[Stockfish] Initializing worker pool with ${this.poolSize} workers...`);

    // Create workers
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new StockfishWorker(this.options);
      await worker.initialize();
      this.workers.push(worker);
      console.log(`[Stockfish] Worker ${i + 1}/${this.poolSize} initialized: ${worker.getEngineName()}`);
    }

    this.initialized = true;
    console.log(`[Stockfish] Worker pool ready`);
  }

  /**
   * Get the next available worker (round-robin).
   */
  private getNextWorker(): StockfishWorker {
    if (this.workers.length === 0) {
      throw new Error('Worker pool not initialized');
    }
    const worker = this.workers[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  /**
   * Analyze a single position.
   * Routes to the next available worker.
   */
  async analyzePosition(fen: string, depth: number = DEFAULT_DEPTH): Promise<StockfishEvaluation> {
    if (!this.initialized) {
      throw new Error('Worker pool not initialized. Call initialize() first.');
    }
    const worker = this.getNextWorker();
    return worker.analyzePosition(fen, depth);
  }

  /**
   * Analyze multiple positions in parallel across workers.
   */
  async analyzeBatch(positions: string[], depth: number = DEFAULT_DEPTH): Promise<StockfishEvaluation[]> {
    if (!this.initialized) {
      throw new Error('Worker pool not initialized. Call initialize() first.');
    }

    // Distribute positions across workers
    const chunks: string[][] = [];
    for (let i = 0; i < positions.length; i++) {
      const chunkIndex = i % this.poolSize;
      if (!chunks[chunkIndex]) {
        chunks[chunkIndex] = [];
      }
      chunks[chunkIndex].push(positions[i]);
    }

    // Run analysis in parallel
    const chunkResults = await Promise.all(
      chunks.map((chunk, i) => this.workers[i].analyzeBatch(chunk, depth))
    );

    // Merge results back in original order
    const results: StockfishEvaluation[] = [];
    for (let i = 0; i < positions.length; i++) {
      const chunkIndex = i % this.poolSize;
      const positionInChunk = Math.floor(i / this.poolSize);
      results.push(chunkResults[chunkIndex][positionInChunk]);
    }

    return results;
  }

  /**
   * Check if the pool is ready.
   */
  async isReady(): Promise<boolean> {
    if (!this.initialized || this.workers.length === 0) {
      return false;
    }
    // Check if at least one worker is ready
    for (const worker of this.workers) {
      if (await worker.isReady()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Stop all workers.
   */
  async stop(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.stop()));
  }

  /**
   * Shut down all workers.
   */
  async shutdown(): Promise<void> {
    console.log('[Stockfish] Shutting down worker pool...');
    await Promise.all(this.workers.map((w) => w.quit()));
    this.workers = [];
    this.initialized = false;
    console.log('[Stockfish] Worker pool shut down');
  }
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Global worker pool instance for the anti-cheat service.
 */
let globalWorkerPool: StockfishWorkerPool | null = null;

/**
 * Get or create the global Stockfish worker pool.
 *
 * This is used by the anti-cheat service to analyze positions.
 * The pool is initialized lazily on first use.
 */
export async function getStockfishPool(): Promise<StockfishWorkerPool> {
  if (!globalWorkerPool) {
    globalWorkerPool = new StockfishWorkerPool();
    await globalWorkerPool.initialize();
  }
  return globalWorkerPool;
}

/**
 * Shut down the global worker pool.
 * Should be called during server shutdown.
 */
export async function shutdownStockfishPool(): Promise<void> {
  if (globalWorkerPool) {
    await globalWorkerPool.shutdown();
    globalWorkerPool = null;
  }
}

/**
 * Create a single Stockfish worker (for simple use cases).
 * The caller is responsible for calling initialize() and quit().
 */
export function createStockfishWorker(options?: StockfishWorkerOptions): StockfishWorker {
  return new StockfishWorker(options);
}

// ---------------------------------------------------------------------------
// Convenience Functions for Anti-Cheat
// ---------------------------------------------------------------------------

/**
 * Calculate the centipawn loss for a played move.
 *
 * Centipawn loss = (best move score) - (played move score)
 * A positive value means the played move was worse than the best.
 *
 * @param evaluation - Engine evaluation of the position
 * @param playedMove - The move that was actually played (UCI format)
 * @returns Centipawn loss (0 if the move was best, positive if worse)
 */
export function calculateCentipawnLoss(
  evaluation: StockfishEvaluation,
  playedMove: string
): number {
  const bestScore = evaluation.moves[0]?.score ?? 0;
  const playedMoveData = evaluation.moves.find((m) => m.move === playedMove);

  if (!playedMoveData) {
    // If the played move isn't in the top N, assume it's significantly worse
    // Use a default penalty (500 cp = 5 pawns worth)
    return 500;
  }

  return Math.max(0, bestScore - playedMoveData.score);
}

/**
 * Get the rank of a played move in the engine's evaluation.
 *
 * @param evaluation - Engine evaluation of the position
 * @param playedMove - The move that was actually played (UCI format)
 * @returns Rank (1 = best, 99 = not in top moves)
 */
export function getMoveRank(evaluation: StockfishEvaluation, playedMove: string): number {
  const index = evaluation.moves.findIndex((m) => m.move === playedMove);
  return index === -1 ? 99 : index + 1;
}

/**
 * Check if a position is critical (big gap between best and second-best move).
 *
 * Critical positions are important for anti-cheat because:
 * - Strong humans may miss the best move in complex positions
 * - Engine users will almost always find it
 *
 * @param evaluation - Engine evaluation of the position
 * @param threshold - Minimum gap in centipawns to consider critical (default: 100)
 * @returns true if the position is critical
 */
export function isPositionCritical(
  evaluation: StockfishEvaluation,
  threshold: number = 100
): boolean {
  if (evaluation.moves.length < 2) {
    return false;
  }

  const bestScore = evaluation.moves[0].score;
  const secondScore = evaluation.moves[1].score;
  const gap = bestScore - secondScore;

  return gap > threshold;
}
