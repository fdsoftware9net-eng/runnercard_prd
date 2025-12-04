-- Create user_activity_logs table for tracking all user activities
-- This table stores logs for lookup, save image, add wallet, and other pass-related actions

CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Activity type: 'lookup', 'save_image', 'add_google_wallet', 'add_apple_wallet', 'view_pass'
    activity_type TEXT NOT NULL CHECK (activity_type IN ('lookup', 'save_image', 'add_google_wallet', 'add_apple_wallet', 'view_pass')),
    
    -- Runner ID (nullable for failed lookups)
    runner_id UUID REFERENCES runners(id) ON DELETE SET NULL,
    
    -- Search-related fields (nullable, only for 'lookup' activity)
    search_method TEXT CHECK (search_method IN ('name', 'id_card') OR search_method IS NULL),
    search_input_hash TEXT, -- SHA-256 hash of search input for privacy
    
    -- Result of the activity
    success BOOLEAN NOT NULL DEFAULT false,
    
    -- Optional: IP address and user agent for analytics
    ip_address INET,
    user_agent TEXT,
    
    -- Error message if activity failed (nullable)
    error_message TEXT,
    
    -- Metadata for additional information (JSONB for flexibility)
    -- For save_image: { image_format, image_dimensions, file_name }
    -- For wallet actions: { wallet_type, pass_url }
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_runner_id ON user_activity_logs(runner_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_success ON user_activity_logs(success);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_search_method ON user_activity_logs(search_method) WHERE search_method IS NOT NULL;

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_runner_activity ON user_activity_logs(runner_id, activity_type, created_at DESC) WHERE runner_id IS NOT NULL;

-- Add comments to table and columns
COMMENT ON TABLE user_activity_logs IS 'Logs for tracking all user activities: lookup, save image, add wallet, and other pass-related actions';
COMMENT ON COLUMN user_activity_logs.search_input_hash IS 'SHA-256 hash of search input for privacy protection (only for lookup activities)';
COMMENT ON COLUMN user_activity_logs.metadata IS 'JSONB field for storing additional activity-specific information';

-- Enable Row Level Security (RLS)
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow INSERT for anonymous users (so frontend can log activities)
-- This allows the frontend to create log entries using the anon key
CREATE POLICY "Allow anonymous insert on user_activity_logs"
ON user_activity_logs
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow INSERT for authenticated users (admin can also log)
CREATE POLICY "Allow authenticated insert on user_activity_logs"
ON user_activity_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow SELECT only for authenticated users (admin can view logs)
-- This prevents public access to logs while allowing admin to view them
CREATE POLICY "Allow authenticated select on user_activity_logs"
ON user_activity_logs
FOR SELECT
TO authenticated
USING (true);

-- Note: No UPDATE or DELETE policies - logs should be immutable for audit purposes
