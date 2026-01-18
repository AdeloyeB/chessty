import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './sqlite-schema';

// Use SQLite for development/testing
const sqlite = new Database('chess_game.db');
export const db = drizzle(sqlite, { schema });

// Create tables if they don't exist
const createTablesSql = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    github_id TEXT UNIQUE,
    elo_rating INTEGER NOT NULL DEFAULT 1200,
    peak_elo_rating INTEGER NOT NULL DEFAULT 1200,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0,
    games_lost INTEGER NOT NULL DEFAULT 0,
    games_draw INTEGER NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 1000,
    total_wagered REAL NOT NULL DEFAULT 0,
    total_won REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    white_player_id TEXT NOT NULL REFERENCES users(id),
    black_player_id TEXT NOT NULL REFERENCES users(id),
    winner_id TEXT REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    game_mode TEXT NOT NULL DEFAULT 'standard',
    starting_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    current_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn TEXT NOT NULL DEFAULT '',
    moves TEXT NOT NULL DEFAULT '[]',
    time_control_initial INTEGER NOT NULL,
    time_control_increment INTEGER NOT NULL DEFAULT 0,
    white_time_remaining INTEGER NOT NULL,
    black_time_remaining INTEGER NOT NULL,
    stake_amount REAL NOT NULL,
    total_pot REAL NOT NULL,
    white_elo_at_start INTEGER NOT NULL,
    black_elo_at_start INTEGER NOT NULL,
    elo_change INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    started_at INTEGER,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    bet_on_player_id TEXT NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    odds REAL NOT NULL,
    potential_payout REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    fen_at_bet TEXT NOT NULL,
    move_number_at_bet INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    settled_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    reference_id TEXT,
    description TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matchmaking_queue (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    elo_rating INTEGER NOT NULL,
    stake_amount REAL NOT NULL,
    time_control_initial INTEGER NOT NULL,
    time_control_increment INTEGER NOT NULL DEFAULT 0,
    min_elo INTEGER,
    max_elo INTEGER,
    joined_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL REFERENCES users(id),
    game_mode TEXT NOT NULL DEFAULT 'standard',
    time_control_key TEXT NOT NULL,
    time_control_initial INTEGER NOT NULL,
    time_control_increment INTEGER NOT NULL DEFAULT 0,
    stake_amount REAL NOT NULL,
    min_elo INTEGER,
    max_elo INTEGER,
    status TEXT NOT NULL DEFAULT 'open',
    accepted_by_id TEXT REFERENCES users(id),
    creator_confirmed INTEGER NOT NULL DEFAULT 0,
    acceptor_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS spectator_predictions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    creator_id TEXT NOT NULL REFERENCES users(id),
    acceptor_id TEXT REFERENCES users(id),
    predicted_winner_id TEXT NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    settled_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS spectator_chat (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

sqlite.run(createTablesSql);

export * from './sqlite-schema';
