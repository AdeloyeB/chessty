-- Migration: Add chess game analysis schema
-- This migration adds columns to the games table for storing analysis aggregates
-- and creates a new move_analysis table for per-move engine evaluations.

-- ============================================================================
-- Part 1: Add analysis columns to games table
-- ============================================================================

-- Analysis metadata columns
ALTER TABLE "games" ADD COLUMN "analysis_engine" text;
ALTER TABLE "games" ADD COLUMN "analysis_depth" integer;
ALTER TABLE "games" ADD COLUMN "analysis_completed_at" timestamp with time zone;

-- Accuracy scores (percentage with 2 decimal places, e.g., 95.23%)
ALTER TABLE "games" ADD COLUMN "white_accuracy" numeric(5, 2);
ALTER TABLE "games" ADD COLUMN "black_accuracy" numeric(5, 2);

-- Blunder/mistake/inaccuracy counts per player
ALTER TABLE "games" ADD COLUMN "white_blunders" integer DEFAULT 0;
ALTER TABLE "games" ADD COLUMN "black_blunders" integer DEFAULT 0;
ALTER TABLE "games" ADD COLUMN "white_mistakes" integer DEFAULT 0;
ALTER TABLE "games" ADD COLUMN "black_mistakes" integer DEFAULT 0;
ALTER TABLE "games" ADD COLUMN "white_inaccuracies" integer DEFAULT 0;
ALTER TABLE "games" ADD COLUMN "black_inaccuracies" integer DEFAULT 0;

-- ============================================================================
-- Part 2: Create move_analysis table
-- ============================================================================

CREATE TABLE "move_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"move_number" integer NOT NULL,
	"player_color" text NOT NULL,
	"eval_before" integer,
	"eval_after" integer,
	"eval_mate_in" integer,
	"best_move" text,
	"best_move_san" text,
	"principal_variation" jsonb,
	"classification" text NOT NULL,
	"centipawn_loss" integer,
	"engine_depth" integer NOT NULL,
	"engine_name" text NOT NULL,
	"analyzed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "move_analysis_game_move" UNIQUE("game_id","move_number")
);

-- ============================================================================
-- Part 3: Add foreign key and indexes
-- ============================================================================

-- Foreign key to games table with CASCADE delete
-- When a game is deleted, all its move analyses are automatically deleted
ALTER TABLE "move_analysis" ADD CONSTRAINT "move_analysis_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id")
  ON DELETE cascade ON UPDATE no action;

-- Index for fast lookups when loading all moves for a game
CREATE INDEX "move_analysis_game_idx" ON "move_analysis" ("game_id");
