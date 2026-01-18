-- Add non-negative balance constraint to users table
-- This prevents the balance from going below zero at the database level
ALTER TABLE users ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);

-- Add non-negative constraint to other monetary fields
ALTER TABLE users ADD CONSTRAINT total_wagered_non_negative CHECK (total_wagered >= 0);
ALTER TABLE users ADD CONSTRAINT total_won_non_negative CHECK (total_won >= 0);

-- Add non-negative constraint to bets table
ALTER TABLE bets ADD CONSTRAINT bet_amount_positive CHECK (amount > 0);
ALTER TABLE bets ADD CONSTRAINT bet_odds_positive CHECK (odds > 0);
ALTER TABLE bets ADD CONSTRAINT bet_payout_non_negative CHECK (potential_payout >= 0);

-- Add non-negative constraint to games table
ALTER TABLE games ADD CONSTRAINT stake_amount_non_negative CHECK (stake_amount >= 0);
ALTER TABLE games ADD CONSTRAINT total_pot_non_negative CHECK (total_pot >= 0);
ALTER TABLE games ADD CONSTRAINT time_remaining_non_negative CHECK (white_time_remaining >= 0 AND black_time_remaining >= 0);

-- Add non-negative constraint to transactions table
ALTER TABLE transactions ADD CONSTRAINT balance_after_non_negative CHECK (balance_after >= 0);
