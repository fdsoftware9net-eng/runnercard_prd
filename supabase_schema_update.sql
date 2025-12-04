-- Add web_pass_templates column to wallet_config table
-- This stores the array of pass templates
ALTER TABLE wallet_config
ADD COLUMN web_pass_templates JSONB DEFAULT '[]'::jsonb;

-- Add web_pass_template_id column to runners table
-- This links a runner to a specific template ID
ALTER TABLE runners
ADD COLUMN web_pass_template_id TEXT;
