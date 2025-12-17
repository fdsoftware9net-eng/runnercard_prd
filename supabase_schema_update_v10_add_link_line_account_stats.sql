-- ============================================
-- RPC Functions Update: เพิ่ม LINE Account Statistics
-- ============================================
-- This file updates RPC functions to include link_line_account statistics
-- ⚠️ IMPORTANT: DROP FUNCTION does NOT delete data in tables
-- It only removes the function definition. All data in user_activity_logs is safe.

-- ============================================
-- STEP 1: Drop old functions (if they exist)
-- ============================================
-- This is safe - it only removes function definitions, NOT data

DROP FUNCTION IF EXISTS get_activity_statistics(INTEGER);
DROP FUNCTION IF EXISTS get_daily_statistics(INTEGER);

-- ============================================
-- STEP 2: Create updated functions with LINE Account statistics
-- ============================================

-- ============================================
-- Function: get_activity_statistics
-- ============================================
-- Returns aggregated statistics for lookups, downloads, wallet downloads, and LINE Account
-- Parameters:
--   days_back: Number of days to look back (default: 30)
-- Returns: Statistics object with lookup, download, wallet, and LINE Account metrics

CREATE OR REPLACE FUNCTION get_activity_statistics(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    total_lookups BIGINT,
    successful_lookups BIGINT,
    failed_lookups BIGINT,
    lookup_success_rate NUMERIC,
    total_downloads BIGINT,
    successful_downloads BIGINT,
    failed_downloads BIGINT,
    download_success_rate NUMERIC,
    -- ✅ Google Wallet Statistics
    total_google_wallet BIGINT,
    successful_google_wallet BIGINT,
    failed_google_wallet BIGINT,
    google_wallet_success_rate NUMERIC,
    -- ✅ Apple Wallet Statistics
    total_apple_wallet BIGINT,
    successful_apple_wallet BIGINT,
    failed_apple_wallet BIGINT,
    apple_wallet_success_rate NUMERIC,
    -- ✅ เพิ่ม: LINE Account Statistics
    total_link_line_account BIGINT,
    successful_link_line_account BIGINT,
    failed_link_line_account BIGINT,
    link_line_account_success_rate NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    start_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate start date
    start_date := NOW() - (days_back || ' days')::INTERVAL;
    
    -- Return query result
    RETURN QUERY
    SELECT 
        -- Lookup Statistics
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'lookup' 
         AND created_at >= start_date) as total_lookups,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'lookup' 
         AND success = true
         AND created_at >= start_date) as successful_lookups,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'lookup' 
         AND success = false
         AND created_at >= start_date) as failed_lookups,
        
        -- Lookup Success Rate
        CASE 
            WHEN (SELECT COUNT(*) FROM user_activity_logs 
                  WHERE activity_type = 'lookup' 
                  AND created_at >= start_date) > 0
            THEN ROUND(
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'lookup' AND success = true
                 AND created_at >= start_date) /
                NULLIF(
                    (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                     WHERE activity_type = 'lookup'
                     AND created_at >= start_date),
                    0
                ) * 100,
                2
            )
            ELSE 0
        END as lookup_success_rate,
        
        -- Download Statistics
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'save_image' 
         AND created_at >= start_date) as total_downloads,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'save_image' 
         AND success = true
         AND created_at >= start_date) as successful_downloads,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'save_image' 
         AND success = false
         AND created_at >= start_date) as failed_downloads,
        
        -- Download Success Rate
        CASE 
            WHEN (SELECT COUNT(*) FROM user_activity_logs 
                  WHERE activity_type = 'save_image' 
                  AND created_at >= start_date) > 0
            THEN ROUND(
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'save_image' AND success = true
                 AND created_at >= start_date) /
                NULLIF(
                    (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                     WHERE activity_type = 'save_image'
                     AND created_at >= start_date),
                    0
                ) * 100,
                2
            )
            ELSE 0
        END as download_success_rate,
        
        -- ✅ Google Wallet Statistics
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'add_google_wallet' 
         AND created_at >= start_date) as total_google_wallet,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'add_google_wallet' 
         AND success = true
         AND created_at >= start_date) as successful_google_wallet,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'add_google_wallet' 
         AND success = false
         AND created_at >= start_date) as failed_google_wallet,
        
        -- Google Wallet Success Rate
        CASE 
            WHEN (SELECT COUNT(*) FROM user_activity_logs 
                  WHERE activity_type = 'add_google_wallet' 
                  AND created_at >= start_date) > 0
            THEN ROUND(
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'add_google_wallet' AND success = true
                 AND created_at >= start_date) /
                NULLIF(
                    (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                     WHERE activity_type = 'add_google_wallet'
                     AND created_at >= start_date),
                    0
                ) * 100,
                2
            )
            ELSE 0
        END as google_wallet_success_rate,
        
        -- ✅ Apple Wallet Statistics
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'add_apple_wallet' 
         AND created_at >= start_date) as total_apple_wallet,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'add_apple_wallet' 
         AND success = true
         AND created_at >= start_date) as successful_apple_wallet,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'add_apple_wallet' 
         AND success = false
         AND created_at >= start_date) as failed_apple_wallet,
        
        -- Apple Wallet Success Rate
        CASE 
            WHEN (SELECT COUNT(*) FROM user_activity_logs 
                  WHERE activity_type = 'add_apple_wallet' 
                  AND created_at >= start_date) > 0
            THEN ROUND(
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'add_apple_wallet' AND success = true
                 AND created_at >= start_date) /
                NULLIF(
                    (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                     WHERE activity_type = 'add_apple_wallet'
                     AND created_at >= start_date),
                    0
                ) * 100,
                2
            )
            ELSE 0
        END as apple_wallet_success_rate,
        
        -- ✅ เพิ่ม: LINE Account Statistics
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'link_line_account' 
         AND created_at >= start_date) as total_link_line_account,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'link_line_account' 
         AND success = true
         AND created_at >= start_date) as successful_link_line_account,
        
        (SELECT COUNT(*)::BIGINT 
         FROM user_activity_logs 
         WHERE activity_type = 'link_line_account' 
         AND success = false
         AND created_at >= start_date) as failed_link_line_account,
        
        -- LINE Account Success Rate
        CASE 
            WHEN (SELECT COUNT(*) FROM user_activity_logs 
                  WHERE activity_type = 'link_line_account' 
                  AND created_at >= start_date) > 0
            THEN ROUND(
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'link_line_account' AND success = true
                 AND created_at >= start_date) /
                NULLIF(
                    (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                     WHERE activity_type = 'link_line_account'
                     AND created_at >= start_date),
                    0
                ) * 100,
                2
            )
            ELSE 0
        END as link_line_account_success_rate;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_activity_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_statistics(INTEGER) TO anon;

-- Add comment
COMMENT ON FUNCTION get_activity_statistics(INTEGER) IS 
'Returns activity statistics (lookups, downloads, wallet downloads, and LINE Account) for the specified number of days';

-- ============================================
-- Function: get_daily_statistics
-- ============================================
-- Returns daily statistics grouped by date
-- Parameters:
--   days_back: Number of days to look back (default: 30)
-- Returns: Array of daily statistics

CREATE OR REPLACE FUNCTION get_daily_statistics(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    date DATE,
    lookups BIGINT,
    downloads BIGINT,
    -- ✅ Wallet Downloads
    google_wallet BIGINT,
    apple_wallet BIGINT,
    -- ✅ เพิ่ม: LINE Account
    link_line_account BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    start_date TIMESTAMP WITH TIME ZONE;
BEGIN
    start_date := NOW() - (days_back || ' days')::INTERVAL;
    
    RETURN QUERY
    SELECT 
        DATE(ual.created_at) as date,
        COUNT(*) FILTER (WHERE ual.activity_type = 'lookup')::BIGINT as lookups,
        COUNT(*) FILTER (WHERE ual.activity_type = 'save_image')::BIGINT as downloads,
        -- ✅ Wallet Downloads
        COUNT(*) FILTER (WHERE ual.activity_type = 'add_google_wallet')::BIGINT as google_wallet,
        COUNT(*) FILTER (WHERE ual.activity_type = 'add_apple_wallet')::BIGINT as apple_wallet,
        -- ✅ เพิ่ม: LINE Account
        COUNT(*) FILTER (WHERE ual.activity_type = 'link_line_account')::BIGINT as link_line_account
    FROM user_activity_logs ual
    WHERE ual.activity_type IN ('lookup', 'save_image', 'add_google_wallet', 'add_apple_wallet', 'link_line_account')
        AND ual.created_at >= start_date
    GROUP BY DATE(ual.created_at)
    ORDER BY date DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_daily_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_statistics(INTEGER) TO anon;

-- Add comment
COMMENT ON FUNCTION get_daily_statistics(INTEGER) IS 
'Returns daily statistics (lookups, downloads, wallet downloads, and LINE Account) for the specified number of days';

-- ============================================
-- STEP 3: Verify functions (optional)
-- ============================================
-- ทดสอบว่า functions ทำงานถูกต้อง

-- SELECT * FROM get_activity_statistics(30);
-- SELECT * FROM get_daily_statistics(30);

