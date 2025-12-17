-- ============================================
-- Query สำหรับตรวจสอบ Log ของปุ่ม "กดรับผลวิ่งอัตโนมัติ"
-- Activity Type: 'link_line_account'
-- ============================================

-- ============================================
-- 1. แสดง Log ทั้งหมดของ link_line_account (ล่าสุดก่อน)
-- ============================================
SELECT 
    ual.id,
    ual.created_at,
    ual.activity_type,
    ual.runner_id,
    r.bib,
    r.first_name,
    r.last_name,
    ual.success,
    ual.metadata->>'bib' as metadata_bib,
    ual.metadata->>'line_app_url' as line_app_url,
    ual.metadata->>'user_agent' as user_agent,
    ual.user_agent as user_agent_direct,
    ual.ip_address
FROM user_activity_logs ual
LEFT JOIN runners r ON ual.runner_id = r.id
WHERE ual.activity_type = 'link_line_account'
ORDER BY ual.created_at DESC;

-- ============================================
-- 2. สรุปจำนวนครั้งที่กดปุ่ม (รวมทั้งหมด)
-- ============================================
SELECT 
    COUNT(*) as total_clicks,
    COUNT(DISTINCT runner_id) as unique_runners,
    COUNT(*) FILTER (WHERE success = true) as successful_clicks,
    COUNT(*) FILTER (WHERE success = false) as failed_clicks
FROM user_activity_logs
WHERE activity_type = 'link_line_account';

-- ============================================
-- 3. สรุปจำนวนครั้งแยกตามวัน
-- ============================================
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_clicks,
    COUNT(DISTINCT runner_id) as unique_runners,
    COUNT(*) FILTER (WHERE success = true) as successful_clicks
FROM user_activity_logs
WHERE activity_type = 'link_line_account'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================
-- 4. แสดง Log พร้อมข้อมูล Runner (เฉพาะที่สำเร็จ)
-- ============================================
SELECT 
    ual.created_at,
    r.bib,
    r.first_name || ' ' || r.last_name as runner_name,
    r.nationality,
    ual.metadata->>'line_app_url' as line_app_url,
    ual.user_agent
FROM user_activity_logs ual
INNER JOIN runners r ON ual.runner_id = r.id
WHERE ual.activity_type = 'link_line_account'
    AND ual.success = true
ORDER BY ual.created_at DESC;

-- ============================================
-- 5. แสดง Runner ที่กดปุ่มมากที่สุด (Top 10)
-- ============================================
SELECT 
    r.bib,
    r.first_name || ' ' || r.last_name as runner_name,
    COUNT(*) as click_count,
    MAX(ual.created_at) as last_clicked_at
FROM user_activity_logs ual
INNER JOIN runners r ON ual.runner_id = r.id
WHERE ual.activity_type = 'link_line_account'
    AND ual.success = true
GROUP BY r.id, r.bib, r.first_name, r.last_name
ORDER BY click_count DESC
LIMIT 10;

-- ============================================
-- 6. แสดง Log ล่าสุด 20 รายการ (พร้อม Metadata)
-- ============================================
SELECT 
    ual.id,
    ual.created_at,
    r.bib,
    r.first_name || ' ' || r.last_name as runner_name,
    ual.success,
    ual.metadata,
    ual.user_agent,
    ual.ip_address
FROM user_activity_logs ual
LEFT JOIN runners r ON ual.runner_id = r.id
WHERE ual.activity_type = 'link_line_account'
ORDER BY ual.created_at DESC
LIMIT 20;

-- ============================================
-- 7. สรุปตามชั่วโมง (สำหรับวันนี้)
-- ============================================
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as clicks_per_hour,
    COUNT(DISTINCT runner_id) as unique_runners_per_hour
FROM user_activity_logs
WHERE activity_type = 'link_line_account'
    AND DATE(created_at) = CURRENT_DATE
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- ============================================
-- 8. เช็คว่า Runner ไหนยังไม่เคยกดปุ่มนี้
-- ============================================
SELECT 
    r.id,
    r.bib,
    r.first_name || ' ' || r.last_name as runner_name
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
        AND ual.activity_type = 'link_line_account'
        AND ual.success = true
)
ORDER BY r.bib;

-- ============================================
-- 9. สรุปตาม User Agent (ดูว่าใช้ Browser/Device อะไร)
-- ============================================
SELECT 
    COALESCE(ual.metadata->>'user_agent', ual.user_agent) as user_agent,
    COUNT(*) as click_count,
    COUNT(DISTINCT runner_id) as unique_runners
FROM user_activity_logs ual
WHERE ual.activity_type = 'link_line_account'
    AND ual.success = true
GROUP BY COALESCE(ual.metadata->>'user_agent', ual.user_agent)
ORDER BY click_count DESC;

-- ============================================
-- 10. แสดง Log ที่มี Error (ถ้ามี)
-- ============================================
SELECT 
    ual.id,
    ual.created_at,
    r.bib,
    r.first_name || ' ' || r.last_name as runner_name,
    ual.success,
    ual.error_message,
    ual.metadata
FROM user_activity_logs ual
LEFT JOIN runners r ON ual.runner_id = r.id
WHERE ual.activity_type = 'link_line_account'
    AND (ual.success = false OR ual.error_message IS NOT NULL)
ORDER BY ual.created_at DESC;

