-- Add template_assignment_rules column to wallet_config table
-- This stores the rules for automatically assigning templates to runners
ALTER TABLE wallet_config
ADD COLUMN IF NOT EXISTS template_assignment_rules JSONB DEFAULT '[]'::jsonb;

-- Ensure other columns exist (idempotent checks)
ALTER TABLE wallet_config
ADD COLUMN IF NOT EXISTS web_pass_templates JSONB DEFAULT '[]'::jsonb;

ALTER TABLE runners
ADD COLUMN IF NOT EXISTS web_pass_template_id TEXT;
