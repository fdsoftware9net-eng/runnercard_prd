-- Add first_half column to runners table
-- Used to determine if a runner receives Runner Card 2
-- Values: 'Yes' = receives Card 2, 'No' or '' = does not receive Card 2
ALTER TABLE runners ADD COLUMN IF NOT EXISTS first_half TEXT DEFAULT '';
