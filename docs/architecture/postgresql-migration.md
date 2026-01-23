# PostgreSQL Migration Guide

> This document preserves the production database design from `apps/server/src/drizzle/schema.ts` and provides a step-by-step guide for migrating from SQLite to PostgreSQL.

---

## Why Migrate to PostgreSQL?

| SQLite (what you have now) | PostgreSQL (where you're going) |
|---|---|
| Single file on disk (`chess_game.db`) | Dedicated server process |
| One write at a time (no concurrent writes) | Many concurrent readers AND writers |
| No user authentication | Built-in user/role system |
| Data lives on your machine | Can be hosted anywhere (cloud, VPS) |
| Perfect for development | Production-grade for real users |

**When to migrate**: Before you launch to real users. SQLite works fine for local dev and testing, but once you have multiple people playing games simultaneously, you need PostgreSQL's concurrent write support.

---

## Cheapest PostgreSQL Providers (Solo Dev Budget)

| Provider | Free Tier | Paid Starter | Notes |
|----------|-----------|--------------|-------|
| **[Neon](https://neon.tech)** | 0.5 GB storage, unlimited projects | ~$19/mo (16 GB) | Serverless, scales to zero when idle. Best for intermittent traffic. |
| **[Supabase](https://supabase.com)** | 500 MB, 2 projects | $25/mo (8 GB) | Includes auth, storage, realtime. Extra features you might use. |
| **[Railway](https://railway.app)** | $5 free credit/mo | ~$5-15/mo usage-based | Simple deploy, pay only for what you use. |
| **[Render](https://render.com)** | 256 MB (90-day expiry) | $7/mo (1 GB) | Easy setup, auto-backups. |
| **[Fly.io](https://fly.io)** | 1 shared CPU, 256 MB | ~$3-7/mo | Run your own Postgres in a container. More control, more setup. |
| **[Aiven](https://aiven.io)** | Hobbyist plan free | $19/mo | Managed, multi-cloud. |

**My recommendation for you**: Start with **Neon** (free tier). It's serverless, meaning it automatically pauses when nobody is playing and wakes up when someone connects. You pay nothing during development and barely anything during low-traffic periods. When you scale up, you just upgrade the plan.

### Local Development (Free, on Your Machine)

You can also run PostgreSQL locally using Docker:

```bash
# Pull and run PostgreSQL in Docker
docker run --name chess-postgres \
  -e POSTGRES_USER=chess \
  -e POSTGRES_PASSWORD=chess_dev_123 \
  -e POSTGRES_DB=chess_game \
  -p 5432:5432 \
  -d postgres:16

# Your connection URL will be:
# postgresql://chess:chess_dev_123@localhost:5432/chess_game
```

Or install directly:
- **Mac**: `brew install postgresql@16 && brew services start postgresql@16`
- **Linux**: `sudo apt install postgresql-16`

---

## Migration Steps

### Step 1: Install PostgreSQL Driver

```bash
cd apps/server
pnpm add postgres
```

The `postgres` package is a PostgreSQL client for Node.js/Bun. It's what lets your server code talk to the PostgreSQL database.

### Step 2: Add Environment Variable

Create/update `.env` in `apps/server/`:

```env
DATABASE_URL=postgresql://chess:chess_dev_123@localhost:5432/chess_game
```

For Neon/Supabase, they give you a connection string in their dashboard.

### Step 3: Update Database Connection

Replace `apps/server/src/drizzle/index.ts` with:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Create postgres connection
const client = postgres(connectionString);

// Create drizzle instance
export const db = drizzle(client, { schema });

// Re-export all schema tables and types
export * from './schema';
```

### Step 4: Update drizzle.config.ts

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/drizzle/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Step 5: Run Migrations

```bash
# Generate migration SQL from your schema
pnpm db:generate

# Apply migrations to the database
pnpm db:push
```

This reads your schema file and creates all the tables, indexes, and enums in PostgreSQL.

### Step 6: Remove SQLite References

- Delete `apps/server/src/drizzle/sqlite-schema.ts`
- Delete `chess_game.db` (your SQLite file)
- Remove `bun:sqlite` imports

---

## Production Database Schema (Your Blueprint)

This is the schema that was in `schema.ts`. It defines all your tables with proper PostgreSQL types.

### Enums (Custom Types)

PostgreSQL lets you define custom types (like a dropdown menu of valid values). SQLite doesn't have this — it just stores text.

```sql
-- Game status values
CREATE TYPE game_status AS ENUM ('pending', 'active', 'completed', 'abandoned', 'draw');

-- How a game ended
CREATE TYPE game_result AS ENUM ('white_wins', 'black_wins', 'draw', 'stalemate', 'timeout', 'resignation', 'abandonment');

-- Bet status
CREATE TYPE bet_status AS ENUM ('pending', 'won', 'lost', 'refunded', 'draw');

-- Transaction types (money movement reasons)
CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'bet_placed', 'bet_won', 'bet_lost', 'bet_refunded', 'game_stake', 'game_win', 'bonus');

-- Game variants
CREATE TYPE game_mode AS ENUM ('standard', 'chess960');

-- Challenge lifecycle
CREATE TYPE challenge_status AS ENUM ('open', 'accepted', 'confirmed', 'cancelled', 'expired');

-- Spectator prediction lifecycle
CREATE TYPE spectator_prediction_status AS ENUM ('open', 'matched', 'settled', 'cancelled');

-- Achievement categories
CREATE TYPE achievement_category AS ENUM ('games', 'elo', 'streaks', 'special_moves', 'milestones');
```

### Tables

#### users
The core user table. Every player has one row here.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid (21 chars) |
| email | TEXT UNIQUE | Login identifier |
| username | TEXT UNIQUE | Display name |
| password_hash | TEXT | bcrypt hash (nullable for OAuth) |
| google_id | TEXT UNIQUE | OAuth: Google login |
| github_id | TEXT UNIQUE | OAuth: GitHub login |
| elo_rating | INTEGER (default 1200) | Current skill rating |
| peak_elo_rating | INTEGER (default 1200) | Highest ever achieved |
| games_played | INTEGER (default 0) | Total games |
| games_won | INTEGER (default 0) | Wins |
| games_lost | INTEGER (default 0) | Losses |
| games_draw | INTEGER (default 0) | Draws |
| balance | DECIMAL(12,2) (default 1000) | Wallet balance |
| total_wagered | DECIMAL(12,2) (default 0) | Lifetime bet total |
| total_won | DECIMAL(12,2) (default 0) | Lifetime winnings |
| created_at | TIMESTAMP | Account creation |
| updated_at | TIMESTAMP | Last modification |

**Indexes**: email (unique), username (unique), elo_rating (for leaderboard queries)

#### games
One row per chess game played.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| white_player_id | TEXT FK→users | White side player |
| black_player_id | TEXT FK→users | Black side player |
| winner_id | TEXT FK→users | Who won (null = draw/ongoing) |
| status | game_status | pending/active/completed/etc |
| result | game_result | How it ended |
| game_mode | game_mode | standard or chess960 |
| starting_fen | TEXT | Initial board position |
| current_fen | TEXT | Current board position |
| pgn | TEXT | Move history in PGN format |
| moves | JSONB | Structured move array |
| time_control_initial | INTEGER | Starting time (seconds) |
| time_control_increment | INTEGER | Time added per move |
| white_time_remaining | INTEGER | White's clock (seconds) |
| black_time_remaining | INTEGER | Black's clock (seconds) |
| stake_amount | DECIMAL(12,2) | How much each player wagered |
| total_pot | DECIMAL(12,2) | Combined stake |
| white_elo_at_start | INTEGER | ELO snapshot when game started |
| black_elo_at_start | INTEGER | ELO snapshot when game started |
| elo_change | INTEGER | How much ELO shifted |
| created_at | TIMESTAMP | Game creation |
| started_at | TIMESTAMP | First move timestamp |
| ended_at | TIMESTAMP | Game end timestamp |

**Indexes**: white_player_id, black_player_id, status, created_at

#### bets
Spectator bets on game outcomes.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| game_id | TEXT FK→games | Which game |
| user_id | TEXT FK→users | Who placed the bet |
| bet_on_player_id | TEXT FK→users | Who they bet on winning |
| amount | DECIMAL(12,2) | Bet size |
| odds | DECIMAL(6,2) | Odds at time of bet |
| potential_payout | DECIMAL(12,2) | What they'd win |
| status | bet_status | pending/won/lost/refunded |
| fen_at_bet | TEXT | Board state when bet was placed |
| move_number_at_bet | INTEGER | Move number when placed |
| created_at | TIMESTAMP | |
| settled_at | TIMESTAMP | When bet was resolved |

**Indexes**: game_id, user_id, status

#### transactions
Every money movement (deposits, bets, winnings, etc).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| user_id | TEXT FK→users | Whose wallet |
| type | transaction_type | Why money moved |
| amount | DECIMAL(12,2) | How much (negative = debit) |
| balance_after | DECIMAL(12,2) | Balance after this transaction |
| reference_id | TEXT | Related game/bet ID |
| description | TEXT | Human-readable note |
| created_at | TIMESTAMP | |

**Indexes**: user_id, type, created_at

#### matchmaking_queue
Players waiting for a match. Rows are temporary — deleted when matched.

| Column | Type | Notes |
|--------|------|-------|
| user_id | TEXT PK FK→users | One entry per user |
| elo_rating | INTEGER | Their ELO (for matching) |
| stake_amount | DECIMAL(12,2) | How much they want to bet |
| time_control_initial | INTEGER | Preferred time control |
| time_control_increment | INTEGER | Preferred increment |
| min_elo | INTEGER | Minimum opponent ELO |
| max_elo | INTEGER | Maximum opponent ELO |
| joined_at | TIMESTAMP | When they entered queue |

#### sessions
Active login sessions (for token validation).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Session token |
| user_id | TEXT FK→users | Who's logged in |
| expires_at | TIMESTAMP | When session expires |
| created_at | TIMESTAMP | Login time |

#### challenges
Open challenges in the marketplace.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| creator_id | TEXT FK→users | Who created it |
| game_mode | game_mode | standard/chess960 |
| time_control_key | TEXT | Display label (e.g., "5+3") |
| time_control_initial | INTEGER | Time in seconds |
| time_control_increment | INTEGER | Increment in seconds |
| stake_amount | DECIMAL(12,2) | Wager amount |
| min_elo / max_elo | INTEGER | ELO restrictions |
| status | challenge_status | open/accepted/confirmed/etc |
| accepted_by_id | TEXT FK→users | Who accepted |
| creator_confirmed | INTEGER | 1 = creator ready |
| acceptor_confirmed | INTEGER | 1 = acceptor ready |
| created_at | TIMESTAMP | |
| expires_at | TIMESTAMP | Auto-cancel time |

#### spectator_predictions
P2P bets between spectators watching a game.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| game_id | TEXT FK→games | Which game |
| creator_id | TEXT FK→users | Who created the prediction |
| acceptor_id | TEXT FK→users | Who matched it |
| predicted_winner_id | TEXT FK→users | Who they think wins |
| amount | DECIMAL(12,2) | Stake amount |
| status | spectator_prediction_status | open/matched/settled |
| created_at | TIMESTAMP | |
| settled_at | TIMESTAMP | |

#### user_achievements (NOT in SQLite yet)
Tracks which achievements each user has unlocked.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| user_id | TEXT FK→users | Who earned it |
| achievement_id | TEXT | Which achievement (maps to ACHIEVEMENTS constant) |
| category | achievement_category | games/elo/streaks/etc |
| unlocked_at | TIMESTAMP | When earned |

**Unique constraint**: (user_id, achievement_id) — can't unlock same achievement twice

#### user_profiles (NOT in SQLite yet)
Extended profile data (stats beyond win/loss).

| Column | Type | Notes |
|--------|------|-------|
| user_id | TEXT PK FK→users | One profile per user |
| is_public | INTEGER (default 1) | Profile visibility |
| current_streak | INTEGER (default 0) | Current win streak |
| longest_streak | INTEGER (default 0) | Best ever streak |
| total_checkmates | INTEGER (default 0) | Games won by checkmate |
| quickest_win | INTEGER | Fewest moves to win |
| biggest_stake_win | DECIMAL(12,2) | Biggest single game win |
| updated_at | TIMESTAMP | |

#### spectator_chat
Messages sent in game spectator chat.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| game_id | TEXT FK→games | Which game's chat |
| user_id | TEXT FK→users | Who sent it |
| message | TEXT | The message content |
| created_at | TIMESTAMP | |

#### feature_flags
Toggle features on/off without code changes.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Flag key (e.g., "betting_enabled") |
| name | TEXT | Display name |
| description | TEXT | What it controls |
| enabled | INTEGER (0/1) | On or off |
| metadata | JSONB | Future: rollout %, user segments |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Drizzle ORM Schema (Copy-Paste Ready)

When you're ready to migrate, this is the Drizzle schema to use at `apps/server/src/drizzle/schema.ts`:

```typescript
import { pgTable, text, timestamp, integer, decimal, jsonb, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const gameStatusEnum = pgEnum('game_status', ['pending', 'active', 'completed', 'abandoned', 'draw']);
export const gameResultEnum = pgEnum('game_result', ['white_wins', 'black_wins', 'draw', 'stalemate', 'timeout', 'resignation', 'abandonment']);
export const betStatusEnum = pgEnum('bet_status', ['pending', 'won', 'lost', 'refunded', 'draw']);
export const transactionTypeEnum = pgEnum('transaction_type', ['deposit', 'withdrawal', 'bet_placed', 'bet_won', 'bet_lost', 'bet_refunded', 'game_stake', 'game_win', 'bonus']);
export const gameModeEnum = pgEnum('game_mode', ['standard', 'chess960']);
export const challengeStatusEnum = pgEnum('challenge_status', ['open', 'accepted', 'confirmed', 'cancelled', 'expired']);
export const spectatorPredictionStatusEnum = pgEnum('spectator_prediction_status', ['open', 'matched', 'settled', 'cancelled']);
export const achievementCategoryEnum = pgEnum('achievement_category', ['games', 'elo', 'streaks', 'special_moves', 'milestones']);

// ... (full table definitions are in the current schema.ts file)
// Copy the existing schema.ts content here when ready to migrate
```

---

## Differences Between Your SQLite and PostgreSQL Schemas

| Feature | SQLite (current) | PostgreSQL (target) |
|---------|-----------------|-------------------|
| Money columns | `REAL` (floating point, imprecise) | `DECIMAL(12,2)` (exact, 2 decimal places) |
| Timestamps | `INTEGER` (Unix epoch) | `TIMESTAMP` (proper date type) |
| Enums | Plain `TEXT` (no validation) | Custom ENUM types (DB enforces valid values) |
| JSON storage | `TEXT` (manual JSON.parse) | `JSONB` (queryable, indexed) |
| Indexes | None defined | Strategic indexes on commonly queried columns |
| Achievements table | Missing | Fully defined |
| User profiles table | Missing | Fully defined |
| Security audit log | Exists (basic) | Not in PG schema yet (add it) |

---

## Data Migration (SQLite → PostgreSQL)

When you're ready to move existing data:

```bash
# 1. Export SQLite data
sqlite3 chess_game.db ".dump" > sqlite_dump.sql

# 2. Use a migration script (we'll write this together when the time comes)
# The script will:
#   - Read each SQLite table
#   - Transform data types (INTEGER timestamps → TIMESTAMP, REAL → DECIMAL)
#   - Insert into PostgreSQL

# 3. Verify counts
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

---

*Keep this file as reference. When you're ready to migrate, we'll work through it step by step.*
