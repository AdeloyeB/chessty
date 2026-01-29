-- Migration: Add Anti-Cheat Database Schema
-- This migration creates all tables for the anti-cheat system.
-- See docs/ANTI_CHEAT_PLAN.md section 13 (Data Architecture) for the full design.
--
-- PREREQUISITES:
-- - Migration 0000 (initial schema with users and games tables) must be applied
-- - Migration 0001 (move_analysis and games analysis columns) must be applied
--
-- Tables created:
-- - cheat_flags: Stores suspicion flags per player/game
-- - game_analyses: Stores engine correlation analysis results (anti-cheat specific)
-- - player_behavior_profiles: Stores behavioral baselines per player
-- - review_tasks: Human review queue
-- - player_sanctions: Warnings, bans, appeals
-- - game_network_activity: Network traffic analysis per game
-- - move_input_validations: Input physics validation per move
-- - detected_skill_shifts: Mid-game skill shift detections

-- ============================================================================
-- CHEAT FLAGS TABLE
-- ============================================================================
-- Stores individual suspicion flags raised against players during or after games.
-- Each flag represents one suspicious behavior or pattern detected.

CREATE TABLE "cheat_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"game_id" text,
	"flag_type" text NOT NULL,
	"severity" text NOT NULL,
	"suspicion_score" numeric(5, 4) NOT NULL,
	"details" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);

-- ============================================================================
-- GAME ANALYSES TABLE (Anti-Cheat)
-- ============================================================================
-- Stores engine correlation analysis results for cheat detection.
-- Different from move_analysis which stores per-move data for game review UI.

CREATE TABLE "game_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"engine_name" text NOT NULL,
	"engine_depth" integer NOT NULL,
	"white_top_move_rate" numeric(5, 4),
	"white_avg_cpl" numeric(6, 2),
	"black_top_move_rate" numeric(5, 4),
	"black_avg_cpl" numeric(6, 2),
	"move_analyses" jsonb NOT NULL,
	"detected_patterns" jsonb,
	"analyzed_at" timestamp with time zone NOT NULL
);

-- ============================================================================
-- PLAYER BEHAVIOR PROFILES TABLE
-- ============================================================================
-- Stores behavioral baselines for each player (timing, mouse movement, focus).

CREATE TABLE "player_behavior_profiles" (
	"player_id" text PRIMARY KEY NOT NULL,
	"move_time_distribution" jsonb,
	"move_time_variance" numeric(8, 4),
	"avg_path_curvature" numeric(6, 4),
	"avg_unfocus_per_game" numeric(5, 2),
	"games_in_profile" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp with time zone NOT NULL
);

-- ============================================================================
-- REVIEW TASKS TABLE
-- ============================================================================
-- Human review queue for cases that need manual investigation.

CREATE TABLE "review_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"task_type" text NOT NULL,
	"priority" text NOT NULL,
	"player_id" text NOT NULL,
	"game_ids" jsonb NOT NULL,
	"reason" text NOT NULL,
	"suspicion_score" numeric(5, 4) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to" text,
	"verdict" text,
	"verdict_notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);

-- ============================================================================
-- PLAYER SANCTIONS TABLE
-- ============================================================================
-- Records all sanctions (warnings, bans) issued to players and appeals.

CREATE TABLE "player_sanctions" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"sanction_type" text NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"review_task_id" text,
	"appealed" boolean DEFAULT false NOT NULL,
	"appeal_outcome" text
);

-- ============================================================================
-- GAME NETWORK ACTIVITY TABLE
-- ============================================================================
-- Tracks network activity during games to detect external engine API calls.

CREATE TABLE "game_network_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	"total_requests" integer NOT NULL,
	"suspicious_request_count" integer NOT NULL,
	"suspicious_request_timestamps" jsonb NOT NULL,
	"correlated_with_moves" integer DEFAULT 0 NOT NULL,
	"suspicion_score" numeric(5, 4) NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);

-- ============================================================================
-- MOVE INPUT VALIDATIONS TABLE
-- ============================================================================
-- Validates that mouse/touch inputs for each move follow realistic physics.

CREATE TABLE "move_input_validations" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"move_index" integer NOT NULL,
	"physics_valid" boolean NOT NULL,
	"physics_violations" jsonb,
	"consistency_valid" boolean NOT NULL,
	"consistency_issues" jsonb,
	"synthetic_score" numeric(5, 4) NOT NULL,
	"synthetic_reasons" jsonb,
	"validated_at" timestamp with time zone NOT NULL
);

-- ============================================================================
-- DETECTED SKILL SHIFTS TABLE
-- ============================================================================
-- Records instances where a player's skill level suddenly changed mid-game.

CREATE TABLE "detected_skill_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	"move_index" integer NOT NULL,
	"before_window_cpl" numeric(6, 2) NOT NULL,
	"after_window_cpl" numeric(6, 2) NOT NULL,
	"shift_magnitude" numeric(6, 2) NOT NULL,
	"coincident_events" jsonb,
	"severity" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL
);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================
-- All foreign keys reference existing tables (users, games) or other anti-cheat tables.
-- Note: review_tasks_id FK in player_sanctions is self-referential within anti-cheat.

-- cheat_flags foreign keys
ALTER TABLE "cheat_flags" ADD CONSTRAINT "cheat_flags_player_id_users_id_fk"
  FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cheat_flags" ADD CONSTRAINT "cheat_flags_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cheat_flags" ADD CONSTRAINT "cheat_flags_reviewed_by_users_id_fk"
  FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- game_analyses foreign keys
ALTER TABLE "game_analyses" ADD CONSTRAINT "game_analyses_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;

-- player_behavior_profiles foreign keys
ALTER TABLE "player_behavior_profiles" ADD CONSTRAINT "player_behavior_profiles_player_id_users_id_fk"
  FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- review_tasks foreign keys
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_player_id_users_id_fk"
  FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_assigned_to_users_id_fk"
  FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- player_sanctions foreign keys
ALTER TABLE "player_sanctions" ADD CONSTRAINT "player_sanctions_player_id_users_id_fk"
  FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "player_sanctions" ADD CONSTRAINT "player_sanctions_review_task_id_review_tasks_id_fk"
  FOREIGN KEY ("review_task_id") REFERENCES "public"."review_tasks"("id") ON DELETE no action ON UPDATE no action;

-- game_network_activity foreign keys
ALTER TABLE "game_network_activity" ADD CONSTRAINT "game_network_activity_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "game_network_activity" ADD CONSTRAINT "game_network_activity_player_id_users_id_fk"
  FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- move_input_validations foreign keys
ALTER TABLE "move_input_validations" ADD CONSTRAINT "move_input_validations_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;

-- detected_skill_shifts foreign keys
ALTER TABLE "detected_skill_shifts" ADD CONSTRAINT "detected_skill_shifts_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "detected_skill_shifts" ADD CONSTRAINT "detected_skill_shifts_player_id_users_id_fk"
  FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Performance indexes for common query patterns.

-- cheat_flags indexes
CREATE INDEX "cheat_flags_player_idx" ON "cheat_flags" USING btree ("player_id");
CREATE INDEX "cheat_flags_game_idx" ON "cheat_flags" USING btree ("game_id");
CREATE INDEX "cheat_flags_status_idx" ON "cheat_flags" USING btree ("status");
-- Additional index for finding recent high-severity flags
CREATE INDEX "cheat_flags_severity_created_idx" ON "cheat_flags" USING btree ("severity", "created_at" DESC);

-- game_analyses indexes
CREATE INDEX "game_analyses_game_idx" ON "game_analyses" USING btree ("game_id");

-- review_tasks indexes
CREATE INDEX "review_tasks_assigned_idx" ON "review_tasks" USING btree ("assigned_to");
CREATE INDEX "review_tasks_status_idx" ON "review_tasks" USING btree ("status");
CREATE INDEX "review_tasks_player_idx" ON "review_tasks" USING btree ("player_id");
-- Priority queue index for finding urgent unassigned tasks
CREATE INDEX "review_tasks_priority_status_idx" ON "review_tasks" USING btree ("priority", "status")
  WHERE "status" = 'pending';

-- player_sanctions indexes
CREATE INDEX "player_sanctions_player_idx" ON "player_sanctions" USING btree ("player_id");
CREATE INDEX "player_sanctions_active_idx" ON "player_sanctions" USING btree ("player_id", "ends_at");
-- Index for finding currently active sanctions (null ends_at = permanent)
CREATE INDEX "player_sanctions_current_idx" ON "player_sanctions" USING btree ("player_id", "starts_at")
  WHERE "ends_at" IS NULL OR "ends_at" > NOW();

-- game_network_activity indexes
CREATE INDEX "game_network_activity_game_idx" ON "game_network_activity" USING btree ("game_id");
CREATE INDEX "game_network_activity_player_idx" ON "game_network_activity" USING btree ("player_id");
-- Index for finding suspicious activity above a threshold
CREATE INDEX "game_network_activity_suspicious_idx" ON "game_network_activity" USING btree ("suspicion_score" DESC)
  WHERE "suspicion_score" > 0.5;

-- move_input_validations indexes
CREATE INDEX "move_input_validations_game_idx" ON "move_input_validations" USING btree ("game_id");
-- Index for finding invalid moves (potential bot detection)
CREATE INDEX "move_input_validations_invalid_idx" ON "move_input_validations" USING btree ("game_id")
  WHERE "physics_valid" = false OR "consistency_valid" = false;

-- detected_skill_shifts indexes
CREATE INDEX "detected_skill_shifts_game_idx" ON "detected_skill_shifts" USING btree ("game_id");
CREATE INDEX "detected_skill_shifts_player_idx" ON "detected_skill_shifts" USING btree ("player_id");
-- Index for finding high-severity skill shifts
CREATE INDEX "detected_skill_shifts_severity_idx" ON "detected_skill_shifts" USING btree ("severity", "detected_at" DESC)
  WHERE "severity" IN ('high', 'critical');
