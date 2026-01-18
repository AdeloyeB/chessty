/**
 * Chess opening detection from move sequences
 * Uses a simplified approach based on common opening patterns
 */

import type { Move } from '@chess-game/shared';

interface OpeningPattern {
  name: string;
  moves: string[]; // SAN notation
}

// Common opening patterns (first few moves in SAN notation)
const OPENING_PATTERNS: OpeningPattern[] = [
  // King's Pawn Openings
  { name: "Italian Game", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
  { name: "Ruy Lopez", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"] },
  { name: "Scotch Game", moves: ["e4", "e5", "Nf3", "Nc6", "d4"] },
  { name: "King's Gambit", moves: ["e4", "e5", "f4"] },
  { name: "Vienna Game", moves: ["e4", "e5", "Nc3"] },
  { name: "Philidor Defense", moves: ["e4", "e5", "Nf3", "d6"] },
  { name: "Petrov Defense", moves: ["e4", "e5", "Nf3", "Nf6"] },
  { name: "Four Knights Game", moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6"] },

  // Sicilian Defense
  { name: "Sicilian Najdorf", moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"] },
  { name: "Sicilian Dragon", moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"] },
  { name: "Sicilian Scheveningen", moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "e6"] },
  { name: "Sicilian Defense", moves: ["e4", "c5"] },

  // French Defense
  { name: "French Winawer", moves: ["e4", "e6", "d4", "d5", "Nc3", "Bb4"] },
  { name: "French Advance", moves: ["e4", "e6", "d4", "d5", "e5"] },
  { name: "French Defense", moves: ["e4", "e6"] },

  // Caro-Kann
  { name: "Caro-Kann Defense", moves: ["e4", "c6"] },

  // Queen's Pawn Openings
  { name: "Queen's Gambit Declined", moves: ["d4", "d5", "c4", "e6"] },
  { name: "Queen's Gambit Accepted", moves: ["d4", "d5", "c4", "dxc4"] },
  { name: "Slav Defense", moves: ["d4", "d5", "c4", "c6"] },
  { name: "King's Indian Defense", moves: ["d4", "Nf6", "c4", "g6"] },
  { name: "Nimzo-Indian Defense", moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"] },
  { name: "Queen's Indian Defense", moves: ["d4", "Nf6", "c4", "e6", "Nf3", "b6"] },
  { name: "Grunfeld Defense", moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5"] },
  { name: "Dutch Defense", moves: ["d4", "f5"] },
  { name: "Benoni Defense", moves: ["d4", "Nf6", "c4", "c5"] },
  { name: "Catalan Opening", moves: ["d4", "Nf6", "c4", "e6", "g3"] },

  // English Opening
  { name: "English Opening", moves: ["c4"] },

  // Flank Openings
  { name: "Reti Opening", moves: ["Nf3", "d5", "c4"] },
  { name: "Bird's Opening", moves: ["f4"] },
  { name: "Larsen's Opening", moves: ["b3"] },

  // Hypermodern
  { name: "Pirc Defense", moves: ["e4", "d6", "d4", "Nf6"] },
  { name: "Modern Defense", moves: ["e4", "g6"] },
  { name: "Alekhine's Defense", moves: ["e4", "Nf6"] },
  { name: "Scandinavian Defense", moves: ["e4", "d5"] },

  // London System
  { name: "London System", moves: ["d4", "d5", "Nf3", "Nf6", "Bf4"] },
  { name: "London System", moves: ["d4", "Nf6", "Nf3", "e6", "Bf4"] },

  // Basic openings (catch-all)
  { name: "King's Pawn Opening", moves: ["e4"] },
  { name: "Queen's Pawn Opening", moves: ["d4"] },
];

/**
 * Detect opening from a list of moves
 * Returns the most specific matching opening name
 */
export function detectOpening(moves: Move[]): string | null {
  if (moves.length === 0) return null;

  const sanMoves = moves.map(m => m.san);
  let bestMatch: string | null = null;
  let bestMatchLength = 0;

  for (const pattern of OPENING_PATTERNS) {
    const matchLength = matchesPattern(sanMoves, pattern.moves);
    if (matchLength > bestMatchLength) {
      bestMatchLength = matchLength;
      bestMatch = pattern.name;
    }
  }

  return bestMatch;
}

/**
 * Check how many moves match the pattern
 * Returns the number of matching moves (0 if pattern doesn't match)
 */
function matchesPattern(gameMoves: string[], patternMoves: string[]): number {
  if (gameMoves.length < patternMoves.length) {
    // Check if game is a partial match of the pattern
    for (let i = 0; i < gameMoves.length; i++) {
      if (!movesMatch(gameMoves[i], patternMoves[i])) {
        return 0;
      }
    }
    return gameMoves.length;
  }

  // Check full pattern match
  for (let i = 0; i < patternMoves.length; i++) {
    if (!movesMatch(gameMoves[i], patternMoves[i])) {
      return 0;
    }
  }
  return patternMoves.length;
}

/**
 * Compare two moves in SAN notation
 * Handles variations like O-O vs 0-0 and pieces with/without disambiguation
 */
function movesMatch(gameMove: string, patternMove: string): boolean {
  // Normalize moves - remove check/mate/annotation symbols and standardize castling
  const normalize = (m: string) => {
    let normalized = m.replace(/[+#!?]/g, '');
    normalized = normalized.replace(/0-0-0/g, 'O-O-O');
    normalized = normalized.replace(/0-0/g, 'O-O');
    return normalized.toLowerCase();
  };

  return normalize(gameMove) === normalize(patternMove);
}

/**
 * Detect opening from PGN string
 */
export function detectOpeningFromPGN(pgn: string): string | null {
  // Extract moves from PGN (simple extraction)
  const moveRegex = /\d+\.\s*(\S+)\s*(\S+)?/g;
  const moves: { san: string }[] = [];
  let match;

  while ((match = moveRegex.exec(pgn)) !== null) {
    if (match[1]) moves.push({ san: match[1] });
    if (match[2]) moves.push({ san: match[2] });
  }

  return detectOpening(moves as Move[]);
}

/**
 * Get opening ECO code (simplified)
 * Note: This is a very simplified version
 */
export function getOpeningECO(openingName: string | null): string | null {
  if (!openingName) return null;

  const ecoMap: Record<string, string> = {
    "Italian Game": "C50",
    "Ruy Lopez": "C60",
    "Scotch Game": "C45",
    "King's Gambit": "C30",
    "Vienna Game": "C25",
    "Sicilian Defense": "B20",
    "Sicilian Najdorf": "B90",
    "Sicilian Dragon": "B70",
    "French Defense": "C00",
    "Caro-Kann Defense": "B10",
    "Queen's Gambit Declined": "D30",
    "Queen's Gambit Accepted": "D20",
    "Slav Defense": "D10",
    "King's Indian Defense": "E60",
    "Nimzo-Indian Defense": "E20",
    "Grunfeld Defense": "D80",
    "English Opening": "A10",
    "London System": "D00",
    "King's Pawn Opening": "B00",
    "Queen's Pawn Opening": "A40",
  };

  return ecoMap[openingName] || null;
}
