#!/usr/bin/env bun
/**
 * Anti-Cheat Calibration CLI Script
 * ==================================
 *
 * This script runs the anti-cheat calibration process using
 * game data from Lichess.
 *
 * USAGE:
 *   bun run src/scripts/calibrate-anticheat.ts [options]
 *
 * OPTIONS:
 *   --cheaters <file>    JSON file with array of cheater usernames
 *   --clean <file>       JSON file with array of clean player usernames
 *   --games <number>     Games per player (default: 50)
 *   --output <file>      Output file for results (default: calibration-result.json)
 *   --time-control <tc>  Filter by time control (bullet/blitz/rapid/classical)
 *
 * EXAMPLE:
 *   bun run src/scripts/calibrate-anticheat.ts \
 *     --cheaters data/cheaters.json \
 *     --clean data/clean-players.json \
 *     --games 100 \
 *     --output calibration-2024.json
 *
 * INPUT FILE FORMAT:
 *   cheaters.json: ["username1", "username2", ...]
 *   clean-players.json: ["username1", "username2", ...]
 *
 * FINDING CHEATERS:
 *   - Lichess database dumps mark games where players were later banned
 *   - Community lists of known cheaters
 *   - Use isUserCheater() to verify a username has tosViolation: true
 */

import { parseArgs } from 'util';
import { readFile, writeFile } from 'fs/promises';
import { calibrateFromUsernames, isUserCheater } from '../services/anticheat/calibration';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    cheaters: { type: 'string', short: 'c' },
    clean: { type: 'string', short: 'l' },
    games: { type: 'string', short: 'g', default: '50' },
    output: { type: 'string', short: 'o', default: 'calibration-result.json' },
    'time-control': { type: 'string', short: 't' },
    help: { type: 'boolean', short: 'h' },
    demo: { type: 'boolean', short: 'd' },
  },
});

// ---------------------------------------------------------------------------
// Help Text
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
Anti-Cheat Calibration Script
=============================

Calibrates the anti-cheat system using game data from Lichess.

USAGE:
  bun run src/scripts/calibrate-anticheat.ts [options]

OPTIONS:
  -c, --cheaters <file>     JSON file with cheater usernames (required unless --demo)
  -l, --clean <file>        JSON file with clean player usernames (required unless --demo)
  -g, --games <number>      Games per player (default: 50)
  -o, --output <file>       Output file (default: calibration-result.json)
  -t, --time-control <tc>   Filter: bullet, blitz, rapid, or classical
  -d, --demo                Run with demo data (small sample)
  -h, --help                Show this help message

EXAMPLE:
  # Run with your own username lists
  bun run src/scripts/calibrate-anticheat.ts \\
    --cheaters cheaters.json \\
    --clean clean-players.json \\
    --games 100

  # Run demo calibration (for testing)
  bun run src/scripts/calibrate-anticheat.ts --demo

INPUT FILE FORMAT:
  JSON array of Lichess usernames:
  ["DrNykterstein", "Hikaru", "penguingm1"]
`);
}

// ---------------------------------------------------------------------------
// Demo Data
// ---------------------------------------------------------------------------

// Demo usernames for testing the calibration system
// These are well-known clean players - in a real calibration,
// you'd need actual banned cheater accounts
const DEMO_CLEAN_PLAYERS = [
  'DrNykterstein', // Magnus Carlsen
  'Hikaru',        // Hikaru Nakamura
];

// For demo, we use the same players as "cheaters" just to test the pipeline
// In reality, you'd need accounts with tosViolation: true
const DEMO_CHEATERS: string[] = [];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          Anti-Cheat Calibration System v1.0              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  let cheaterUsernames: string[];
  let cleanUsernames: string[];

  if (args.demo) {
    console.log('Running in DEMO mode with sample data...\n');
    cheaterUsernames = DEMO_CHEATERS;
    cleanUsernames = DEMO_CLEAN_PLAYERS;

    if (cheaterUsernames.length === 0) {
      console.log('⚠️  Demo mode has no cheater data - results will be incomplete.');
      console.log('    For real calibration, provide --cheaters file with banned accounts.\n');
    }
  } else {
    // Validate required arguments
    if (!args.cheaters || !args.clean) {
      console.error('Error: --cheaters and --clean are required (or use --demo)');
      console.log('Run with --help for usage information.');
      process.exit(1);
    }

    // Load username files
    try {
      const cheatersJson = await readFile(args.cheaters, 'utf-8');
      const parsedCheaters: unknown = JSON.parse(cheatersJson);

      // Validate cheaters file contains an array of strings
      if (!Array.isArray(parsedCheaters) || !parsedCheaters.every((item) => typeof item === 'string')) {
        console.error(`Error: --cheaters file "${args.cheaters}" must contain a JSON array of strings.`);
        console.log('Expected format: ["username1", "username2", ...]');
        process.exit(1);
      }
      cheaterUsernames = parsedCheaters;

      const cleanJson = await readFile(args.clean, 'utf-8');
      const parsedClean: unknown = JSON.parse(cleanJson);

      // Validate clean file contains an array of strings
      if (!Array.isArray(parsedClean) || !parsedClean.every((item) => typeof item === 'string')) {
        console.error(`Error: --clean file "${args.clean}" must contain a JSON array of strings.`);
        console.log('Expected format: ["username1", "username2", ...]');
        process.exit(1);
      }
      cleanUsernames = parsedClean;
    } catch (error) {
      console.error('Error loading username files:', error);
      process.exit(1);
    }
  }

  const gamesPerPlayer = parseInt(args.games || '50', 10);

  // Validate gamesPerPlayer is a positive finite number
  if (!Number.isFinite(gamesPerPlayer) || gamesPerPlayer <= 0) {
    console.error(`Error: --games must be a positive integer. Received: "${args.games}"`);
    process.exit(1);
  }

  // Validate time-control if provided
  const validTimeControls = ['bullet', 'blitz', 'rapid', 'classical'] as const;
  if (args['time-control'] && !validTimeControls.includes(args['time-control'] as typeof validTimeControls[number])) {
    console.error(`Error: --time-control must be one of: ${validTimeControls.join(', ')}`);
    console.error(`Received: "${args['time-control']}"`);
    process.exit(1);
  }

  const outputFile = args.output || 'calibration-result.json';

  console.log(`Configuration:`);
  console.log(`  Cheater accounts:    ${cheaterUsernames.length}`);
  console.log(`  Clean accounts:      ${cleanUsernames.length}`);
  console.log(`  Games per player:    ${gamesPerPlayer}`);
  console.log(`  Time control filter: ${args['time-control'] || 'all'}`);
  console.log(`  Output file:         ${outputFile}`);
  console.log('');

  // Verify cheater accounts actually have tosViolation
  if (cheaterUsernames.length > 0) {
    console.log('Verifying cheater accounts...');
    for (const username of cheaterUsernames.slice(0, 3)) {
      const isCheater = await isUserCheater(username);
      if (isCheater === null) {
        console.log(`  ⚠️  ${username}: User not found`);
      } else if (isCheater) {
        console.log(`  ✓  ${username}: Confirmed cheater (tosViolation: true)`);
      } else {
        console.log(`  ⚠️  ${username}: Not marked as cheater (tosViolation: false)`);
      }
    }
    console.log('');
  }

  // Run calibration
  console.log('Starting calibration...\n');

  try {
    const result = await calibrateFromUsernames(
      cheaterUsernames,
      cleanUsernames,
      gamesPerPlayer,
      args['time-control'] ? { perfType: args['time-control'] as 'bullet' | 'blitz' | 'rapid' | 'classical' } : undefined
    );

    // Save results
    await writeFile(outputFile, JSON.stringify(result, null, 2));

    // Print summary
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                   CALIBRATION COMPLETE                     ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Dataset Statistics:');
    console.log(`  Total games analyzed:  ${result.datasetStats.totalGames}`);
    console.log(`  Cheater games:         ${result.datasetStats.cheaterGames}`);
    console.log(`  Clean games:           ${result.datasetStats.cleanGames}`);
    console.log('');
    console.log('Optimized Weights:');
    console.log(`  Engine:      ${result.optimizedWeights.engine.toFixed(2)}`);
    console.log(`  Timing:      ${result.optimizedWeights.timing.toFixed(2)}`);
    console.log(`  Skill Shift: ${result.optimizedWeights.skillShift.toFixed(2)}`);
    console.log(`  Behavior:    ${result.optimizedWeights.behavior.toFixed(2)}`);
    console.log(`  Mouse:       ${result.optimizedWeights.mouse.toFixed(2)}`);
    console.log('');
    console.log('Optimized Thresholds:');
    console.log(`  Monitor:         ${result.optimizedThresholds.monitor.toFixed(3)}`);
    console.log(`  Restrict Stakes: ${result.optimizedThresholds.restrictStakes.toFixed(3)}`);
    console.log(`  Flag for Review: ${result.optimizedThresholds.flagForReview.toFixed(3)}`);
    console.log(`  Suspend:         ${result.optimizedThresholds.suspend.toFixed(3)}`);
    console.log('');
    console.log('Performance Metrics (at 5% FPR):');
    console.log(`  True Positive Rate: ${(result.metrics.at5PercentFPR.truePositiveRate * 100).toFixed(1)}%`);
    console.log(`  False Positive Rate: ${(result.metrics.at5PercentFPR.falsePositiveRate * 100).toFixed(1)}%`);
    console.log(`  Precision: ${(result.metrics.at5PercentFPR.precision * 100).toFixed(1)}%`);
    console.log(`  F1 Score: ${result.metrics.at5PercentFPR.f1Score.toFixed(3)}`);
    console.log('');
    console.log(`Results saved to: ${outputFile}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the results and validate with manual spot-checks');
    console.log('  2. Update aggregateSuspicionScore() in anticheat/index.ts');
    console.log('  3. Re-run calibration periodically as you collect more data');
    console.log('');

  } catch (error) {
    console.error('Calibration failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
