# Neon PostgreSQL Database

## Connection Details

| Variable | Purpose | Format |
|----------|---------|--------|
| `DATABASE_URL` | App connections (pooled via PgBouncer) | `postgresql://...@<endpoint>-pooler.<region>.aws.neon.tech/chess_game?sslmode=require` |
| `DATABASE_URL_DIRECT` | Migrations & DDL (direct connection) | `postgresql://...@<endpoint>.<region>.aws.neon.tech/chess_game?sslmode=require` |

---

## Tables (14 total)

### users
Core user accounts. Stores auth credentials, ELO ratings, game stats, and wallet balance.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | nanoid |
| email | `text` UNIQUE | |
| username | `text` UNIQUE | |
| password_hash | `text` | nullable (OAuth users) |
| google_id | `text` UNIQUE | OAuth |
| github_id | `text` UNIQUE | OAuth |
| elo_rating | `integer` | default 1200 |
| peak_elo_rating | `integer` | default 1200 |
| games_played | `integer` | default 0 |
| games_won | `integer` | default 0 |
| games_lost | `integer` | default 0 |
| games_draw | `integer` | default 0 |
| balance | `numeric(12,2)` | default 1000 (in-app currency) |
| total_wagered | `numeric(12,2)` | lifetime total |
| total_won | `numeric(12,2)` | lifetime total |
| failed_login_attempts | `integer` | account lockout |
| locked_until | `timestamptz` | account lockout |
| last_failed_login_at | `timestamptz` | account lockout |
| created_at | `timestamptz` | |
| updated_at | `timestamptz` | |

---

### games
Active and completed chess games between two players.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | UUID |
| white_player_id | `text` FK→users | |
| black_player_id | `text` FK→users | |
| winner_id | `text` FK→users | nullable (draw/ongoing) |
| status | `text` | pending, active, completed |
| result | `text` | white_wins, black_wins, draw, timeout, resignation, abandonment |
| game_mode | `text` | standard, chess960 |
| starting_fen | `text` | initial board position |
| current_fen | `text` | live board state |
| pgn | `text` | portable game notation |
| moves | `jsonb` | array of Move objects |
| time_control_initial | `integer` | seconds |
| time_control_increment | `integer` | seconds per move |
| white_time_remaining | `integer` | milliseconds |
| black_time_remaining | `integer` | milliseconds |
| stake_amount | `numeric(12,2)` | per-player stake |
| total_pot | `numeric(12,2)` | stake_amount * 2 |
| white_elo_at_start | `integer` | snapshot |
| black_elo_at_start | `integer` | snapshot |
| elo_change | `integer` | absolute change on completion |
| created_at | `timestamptz` | |
| updated_at | `timestamptz` | |
| started_at | `timestamptz` | |
| ended_at | `timestamptz` | |

---

### bets
Spectator bets on active games.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | |
| game_id | `text` FK→games | |
| user_id | `text` FK→users | bettor |
| bet_on_player_id | `text` FK→users | who they bet on |
| amount | `numeric(12,2)` | |
| odds | `numeric(8,4)` | at time of bet |
| potential_payout | `numeric(12,2)` | amount * odds |
| status | `text` | pending, won, lost |
| fen_at_bet | `text` | board state when bet placed |
| move_number_at_bet | `integer` | |
| created_at | `timestamptz` | |
| settled_at | `timestamptz` | |

---

### transactions
Wallet transaction ledger for all financial activity.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | nanoid |
| user_id | `text` FK→users | |
| type | `text` | game_stake, game_win, bet_placed, bet_won, deposit, withdrawal |
| amount | `numeric(12,2)` | negative for debits |
| balance_after | `numeric(12,2)` | running balance |
| reference_id | `text` | game/bet ID |
| description | `text` | |
| created_at | `timestamptz` | |

---

### matchmaking_queue
Players currently searching for opponents.

| Column | Type | Notes |
|--------|------|-------|
| user_id | `text` PK FK→users | one entry per player |
| elo_rating | `integer` | snapshot at queue time |
| stake_amount | `numeric(12,2)` | |
| time_control_initial | `integer` | |
| time_control_increment | `integer` | |
| min_elo | `integer` | nullable preference |
| max_elo | `integer` | nullable preference |
| joined_at | `timestamptz` | |

---

### sessions
Active user sessions (JWT token tracking).

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | |
| user_id | `text` FK→users | |
| expires_at | `timestamptz` | |
| ip_address | `text` | security tracking |
| user_agent | `text` | security tracking |
| created_at | `timestamptz` | |

---

### challenges
Marketplace challenges (open invitations to play).

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | UUID |
| creator_id | `text` FK→users | |
| game_mode | `text` | standard, chess960 |
| time_control_key | `text` | e.g. "blitz_3_2" |
| time_control_initial | `integer` | |
| time_control_increment | `integer` | |
| stake_amount | `numeric(12,2)` | |
| min_elo | `integer` | nullable restriction |
| max_elo | `integer` | nullable restriction |
| status | `text` | open, accepted, confirmed, cancelled, expired |
| accepted_by_id | `text` FK→users | |
| creator_confirmed | `boolean` | default false |
| acceptor_confirmed | `boolean` | default false |
| created_at | `timestamptz` | |
| expires_at | `timestamptz` | |

---

### spectator_predictions
Peer-to-peer predictions between spectators on game outcomes.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | UUID |
| game_id | `text` FK→games | |
| creator_id | `text` FK→users | |
| acceptor_id | `text` FK→users | nullable until matched |
| predicted_winner_id | `text` FK→users | |
| amount | `numeric(12,2)` | |
| status | `text` | open, matched, settled |
| created_at | `timestamptz` | |
| settled_at | `timestamptz` | |

---

### spectator_chat
Chat messages during live games.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | |
| game_id | `text` FK→games | |
| user_id | `text` FK→users | |
| message | `text` | |
| created_at | `timestamptz` | |

---

### user_achievements
Unlocked achievements per user.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | nanoid |
| user_id | `text` FK→users | |
| achievement_id | `text` | references shared constants |
| category | `text` | games, elo, streaks, special_moves, milestones |
| unlocked_at | `timestamptz` | |

**Constraint:** UNIQUE(user_id, achievement_id)

---

### user_profiles
Extended profile stats and preferences.

| Column | Type | Notes |
|--------|------|-------|
| user_id | `text` PK FK→users | |
| is_public | `boolean` | default true |
| current_streak | `integer` | resets on loss |
| longest_streak | `integer` | all-time best |
| total_checkmates | `integer` | |
| quickest_win | `integer` | fewest moves |
| biggest_stake_win | `numeric(12,2)` | |
| updated_at | `timestamptz` | |

---

### security_audit_log
Security event tracking for auth and account actions.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | nanoid |
| event_type | `text` | login_failed, login_success, account_locked, etc. |
| user_id | `text` FK→users | nullable (failed logins) |
| ip_address | `text` | |
| user_agent | `text` | |
| details | `jsonb` | structured event data |
| created_at | `timestamptz` | |

---

### feature_flags
Runtime feature toggles.

| Column | Type | Notes |
|--------|------|-------|
| id | `text` PK | e.g. "betting_enabled" |
| name | `text` | human-readable name |
| description | `text` | |
| enabled | `boolean` | default false |
| metadata | `jsonb` | extensibility |
| created_at | `timestamptz` | |
| updated_at | `timestamptz` | |

---

## Type Conventions

| PostgreSQL Type | Used For | Drizzle Read Type | Insert Format |
|-----------------|----------|-------------------|---------------|
| `numeric(12,2)` | Money/financial values | `string` | `amount.toString()` |
| `timestamptz` | All dates/times | `Date` | `new Date()` |
| `jsonb` | Structured data (moves, details) | Typed object | Object/array |
| `boolean` | True/false flags | `boolean` | `true`/`false` |
| `text` | IDs, strings, enums | `string` | string literal |
| `integer` | Counts, ratings, time | `number` | number literal |

---

## Schema File

Defined in: `apps/server/src/drizzle/pg-schema.ts`

Managed with Drizzle Kit:
```bash
pnpm db:push     # Sync schema to Neon (dev)
pnpm db:generate # Generate SQL migration files
pnpm db:migrate  # Run pending migrations
pnpm db:studio   # Visual database browser
```
