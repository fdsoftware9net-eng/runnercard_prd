-- ============================================
-- Fix: Create RPC Function for Logging User Activity
-- ============================================
-- ปัญหา: RLS policy ไม่ยอมให้ anonymous users insert ข้อมูล
-- วิธีแก้: สร้าง RPC function ที่ใช้ SECURITY DEFINER เพื่อ bypass RLS
-- วิธีนี้จะทำงานได้แน่นอนแม้ว่า RLS policy จะมีปัญหา
-- Run this in Supabase SQL Editor

-- ============================================
-- Step 1: Create RPC Function
-- ============================================

CREATE OR REPLACE FUNCTION log_user_activity(
    p_activity_type TEXT,
    p_runner_id UUID DEFAULT NULL,
    p_search_method TEXT DEFAULT NULL,
    p_search_input_hash TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT false,
    p_error_message TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypass RLS by running as function owner
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    -- Insert log entry
    INSERT INTO user_activity_logs (
        activity_type,
        runner_id,
        search_method,
        search_input_hash,
        success,
        error_message,
        user_agent,
        ip_address,
        metadata
    ) VALUES (
        p_activity_type,
        p_runner_id,
        p_search_method,
        p_search_input_hash,
        p_success,
        p_error_message,
        p_user_agent,
        p_ip_address,
        p_metadata
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- ============================================
-- Step 2: Grant execute permission
-- ============================================

-- Grant execute permission to public (anonymous users)
GRANT EXECUTE ON FUNCTION log_user_activity TO public;
GRANT EXECUTE ON FUNCTION log_user_activity TO authenticated;

-- ============================================
-- Step 3: Add comment
-- ============================================

COMMENT ON FUNCTION log_user_activity IS 'Log user activity to user_activity_logs table. Bypasses RLS using SECURITY DEFINER.';

-- ============================================
-- Step 4: Verify function
-- ============================================
-- ทดสอบว่า function ทำงานถูกต้อง

-- SELECT 
--     routine_name,
--     routine_type,
--     security_type
-- FROM information_schema.routines
-- WHERE routine_name = 'log_user_activity';

