-- ============================================
-- RPC Function for Runner Updates Analytics
-- ============================================
-- This file contains SQL function for retrieving runner update statistics
-- Run this in Supabase SQL Editor

-- ============================================
-- Function: get_runner_updates
-- ============================================
-- Returns list of runners that were updated
-- Parameters:
--   days_back: Number of days to look back (default: 30)
--   limit_count: Maximum number of records to return (default: 100)
-- Returns: Array of runner update records

CREATE OR REPLACE FUNCTION get_runner_updates(
  days_back INTEGER DEFAULT 30,
  limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  runner_id UUID,
  runner_bib TEXT,
  runner_name TEXT,
  update_count BIGINT,
  last_updated_at TIMESTAMP WITH TIME ZONE,
  success_count BIGINT,
  failed_count BIGINT
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
    ual.runner_id,
    r.bib as runner_bib,
    CONCAT(r.first_name, ' ', r.last_name) as runner_name,
    COUNT(*)::BIGINT as update_count,
    MAX(ual.created_at) as last_updated_at,
    COUNT(*) FILTER (WHERE ual.success = true)::BIGINT as success_count,
    COUNT(*) FILTER (WHERE ual.success = false)::BIGINT as failed_count
  FROM user_activity_logs ual
  LEFT JOIN runners r ON r.id = ual.runner_id
  WHERE ual.activity_type = 'update_runner'
    AND ual.created_at >= start_date
    AND ual.runner_id IS NOT NULL
  GROUP BY ual.runner_id, r.bib, r.first_name, r.last_name
  ORDER BY last_updated_at DESC
  LIMIT limit_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_runner_updates(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_runner_updates(INTEGER, INTEGER) TO anon;

-- Add comment
COMMENT ON FUNCTION get_runner_updates(INTEGER, INTEGER) IS 
'Returns list of runners that were updated with update counts and statistics';

