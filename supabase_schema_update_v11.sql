-- Add first_half column to runners table
-- Used to determine if a runner receives Runner Card 2
-- Values: 'Yes' = receives Card 2, 'No' or '' = does not receive Card 2
ALTER TABLE runners ADD COLUMN IF NOT EXISTS first_half TEXT DEFAULT '';

-- Add Runner Card 2 template columns to wallet_config
ALTER TABLE wallet_config ADD COLUMN IF NOT EXISTS web_bib_templates_2 JSONB DEFAULT '[]'::jsonb;
ALTER TABLE wallet_config ADD COLUMN IF NOT EXISTS template_assignment_rules_bib_2 JSONB DEFAULT '[]'::jsonb;
