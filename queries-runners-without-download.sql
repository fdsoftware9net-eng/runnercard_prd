-- ============================================
-- Query: ดึงข้อมูล Runners ที่ไม่ได้กด Download Image
-- ============================================
-- ไฟล์นี้มีหลาย query ให้เลือกใช้ตามความต้องการ

-- ============================================
-- Query 1: Runners ที่ไม่มี 'save_image' activity เลย
-- (รวมทั้งที่ไม่มี activity log เลย และที่มี log แต่ไม่มี save_image)
-- ============================================
-- ✅ แนะนำ: Query นี้จะได้ runners ทั้งหมดที่ไม่มี save_image activity

SELECT 
    r.id,
    r.bib,
    r.first_name,
    r.last_name,
    r.name_on_bib,
    r.gender,
    r.nationality,
    r.age_category,
    r.created_at as runner_created_at,
    -- ข้อมูล activity log (ถ้ามี)
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type IS NOT NULL) as total_activities,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'lookup') as lookup_count,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'save_image') as save_image_count,
    MAX(ual.created_at) FILTER (WHERE ual.activity_type IS NOT NULL) as last_activity_date
FROM runners r
LEFT JOIN user_activity_logs ual ON r.id = ual.runner_id
WHERE NOT EXISTS (
    -- หา runners ที่ไม่มี 'save_image' activity ที่ success = true
    SELECT 1 
    FROM user_activity_logs ual2 
    WHERE ual2.runner_id = r.id 
    AND ual2.activity_type = 'save_image' 
    AND ual2.success = true
)
GROUP BY r.id, r.bib, r.first_name, r.last_name, r.name_on_bib, 
         r.gender, r.nationality, r.age_category, r.created_at
ORDER BY r.bib;

-- ============================================
-- Query 2: Runners ที่ไม่มี 'save_image' activity เลย (แบบง่าย)
-- (ไม่แสดงข้อมูล activity log)
-- ============================================
-- ✅ แนะนำ: Query นี้จะได้เฉพาะข้อมูล runner โดยไม่แสดง activity log

SELECT 
    r.id,
    r.bib,
    r.first_name,
    r.last_name,
    r.name_on_bib,
    r.gender,
    r.nationality,
    r.age_category,
    r.created_at
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'save_image' 
    AND ual.success = true
)
ORDER BY r.bib;

-- ============================================
-- Query 3: Runners ที่มี activity log แต่ไม่มี 'save_image'
-- (ไม่รวม runners ที่ไม่มี activity log เลย และไม่รวม lookup activity)
-- ============================================
-- ✅ ใช้เมื่อต้องการหาเฉพาะ runners ที่มี activity แต่ไม่ download และไม่นับ lookup

SELECT 
    r.id,
    r.bib,
    r.first_name,
    r.last_name,
    r.gender,
    r.nationality,
    r.age_category,
    COUNT(DISTINCT ual.id) as total_activities,
    MAX(ual.created_at) as last_activity_date
FROM runners r
INNER JOIN user_activity_logs ual ON r.id = ual.runner_id
    AND ual.activity_type != 'lookup'  -- ไม่รวม lookup activity
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual2 
    WHERE ual2.runner_id = r.id 
    AND ual2.activity_type = 'save_image' 
    AND ual2.success = true
)
GROUP BY r.id, r.bib, r.first_name, r.last_name,
         r.gender, r.nationality, r.age_category
HAVING COUNT(DISTINCT ual.id) > 0  -- มี activity ที่ไม่ใช่ lookup อย่างน้อย 1 ครั้ง
ORDER BY r.bib;

-- ============================================
-- Query 4: Runners ที่ไม่มี 'save_image' activity (รวมทั้ง success = false)
-- ============================================
-- ✅ ใช้เมื่อต้องการนับว่าไม่มี save_image activity เลย (ไม่ว่าจะ success หรือไม่)

SELECT 
    r.id,
    r.bib,
    r.first_name,
    r.last_name,
    r.name_on_bib,
    r.gender,
    r.nationality,
    r.age_category,
    r.created_at
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'save_image'
    -- ไม่เช็ค success = true (นับทุก save_image activity)
)
ORDER BY r.bib;

-- ============================================
-- Query 5: สรุปจำนวน Runners ที่ไม่มี 'save_image' activity
-- ============================================
-- ✅ ใช้เพื่อดูจำนวนรวม

-- ============================================
-- Step 1: ตรวจสอบจำนวน runners ทั้งหมด
-- ============================================
SELECT 
    COUNT(*) as total_runners_in_table
FROM runners;

-- ============================================
-- Step 2: ตรวจสอบจำนวน runners ที่มี save_image activity ที่สำเร็จ
-- ============================================

-- Step 2a: นับจำนวน runners ที่ไม่ซ้ำ (ทั้งหมด - ไม่จำกัดวันที่)
SELECT 
    COUNT(DISTINCT runner_id) as runners_with_save_image_success_all_time
FROM user_activity_logs
WHERE activity_type = 'save_image' 
AND success = true;

-- Step 2b: นับจำนวน log entries (ทั้งหมด - ไม่จำกัดวันที่)
SELECT 
    COUNT(*) as total_save_image_logs_all_time,
    COUNT(*) FILTER (WHERE success = true) as successful_save_image_logs_all_time,
    COUNT(*) FILTER (WHERE success = false) as failed_save_image_logs_all_time
FROM user_activity_logs
WHERE activity_type = 'save_image';

-- Step 2c: นับจำนวน runners ที่ไม่ซ้ำ (30 วันล่าสุด - ตรงกับ Analytics)
SELECT 
    COUNT(DISTINCT runner_id) as runners_with_save_image_success_30days
FROM user_activity_logs
WHERE activity_type = 'save_image' 
AND success = true
AND created_at >= NOW() - INTERVAL '30 days';

-- Step 2d: นับจำนวน log entries (30 วันล่าสุด - ตรงกับ Analytics)
SELECT 
    COUNT(*) as total_save_image_logs_30days,
    COUNT(*) FILTER (WHERE success = true) as successful_save_image_logs_30days,
    COUNT(*) FILTER (WHERE success = false) as failed_save_image_logs_30days
FROM user_activity_logs
WHERE activity_type = 'save_image'
AND created_at >= NOW() - INTERVAL '30 days';

-- Step 2e: เปรียบเทียบทั้งหมด
SELECT 
    -- ทั้งหมด (ไม่จำกัดวันที่)
    (SELECT COUNT(DISTINCT runner_id) 
     FROM user_activity_logs 
     WHERE activity_type = 'save_image' AND success = true) as runners_with_download_all_time,
    (SELECT COUNT(*) 
     FROM user_activity_logs 
     WHERE activity_type = 'save_image' AND success = true) as download_logs_all_time,
    -- 30 วันล่าสุด
    (SELECT COUNT(DISTINCT runner_id) 
     FROM user_activity_logs 
     WHERE activity_type = 'save_image' AND success = true
     AND created_at >= NOW() - INTERVAL '30 days') as runners_with_download_30days,
    (SELECT COUNT(*) 
     FROM user_activity_logs 
     WHERE activity_type = 'save_image' AND success = true
     AND created_at >= NOW() - INTERVAL '30 days') as download_logs_30days,
    -- Analytics Dashboard (ควรตรงกับ download_logs_30days)
    (SELECT COUNT(*) 
     FROM user_activity_logs 
     WHERE activity_type = 'save_image'
     AND created_at >= NOW() - INTERVAL '30 days') as total_download_logs_30days;

-- ============================================
-- Step 3: ตรวจสอบจำนวน runners ที่ไม่มี save_image activity ที่สำเร็จ
-- ============================================
SELECT 
    COUNT(*) as total_runners_without_download
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'save_image' 
    AND ual.success = true
);

-- ============================================
-- Step 4: สรุปจำนวนทั้งหมด (รวมทั้ง 3 ส่วน)
-- ============================================
SELECT 
    (SELECT COUNT(*) FROM runners) as total_runners_in_table,
    (SELECT COUNT(DISTINCT runner_id) 
     FROM user_activity_logs 
     WHERE activity_type = 'save_image' AND success = true) as runners_with_save_image_success,
    (SELECT COUNT(*) 
     FROM runners r 
     WHERE NOT EXISTS (
         SELECT 1 
         FROM user_activity_logs ual 
         WHERE ual.runner_id = r.id 
         AND ual.activity_type = 'save_image' 
         AND ual.success = true
     )) as runners_without_download,
    (SELECT COUNT(*) FROM runners) - 
    (SELECT COUNT(DISTINCT runner_id) 
     FROM user_activity_logs 
     WHERE activity_type = 'save_image' AND success = true) as calculated_without_download,
    -- ตรวจสอบว่าตัวเลขตรงกันหรือไม่
    CASE 
        WHEN (SELECT COUNT(*) FROM runners) - 
             (SELECT COUNT(DISTINCT runner_id) 
              FROM user_activity_logs 
              WHERE activity_type = 'save_image' AND success = true) =
             (SELECT COUNT(*) 
              FROM runners r 
              WHERE NOT EXISTS (
                  SELECT 1 
                  FROM user_activity_logs ual 
                  WHERE ual.runner_id = r.id 
                  AND ual.activity_type = 'save_image' 
                  AND ual.success = true
              ))
        THEN '✅ ตัวเลขตรงกัน'
        ELSE '⚠️ ตัวเลขไม่ตรงกัน - มีปัญหา'
    END as validation_status;

-- ============================================
-- Step 5: สรุปจำนวนพร้อมแยกประเภท activity
-- ============================================
SELECT 
    COUNT(*) as total_runners_without_download,
    COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM user_activity_logs ual 
        WHERE ual.runner_id = r.id
    )) as runners_with_other_activities,
    COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM user_activity_logs ual 
        WHERE ual.runner_id = r.id
    )) as runners_without_any_activity
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'save_image' 
    AND ual.success = true
);

-- ============================================
-- Query 6: Runners ที่ไม่มี 'save_image' activity พร้อมข้อมูลเพิ่มเติม
-- (รวมข้อมูล activity log อื่นๆ)
-- ============================================
-- ✅ ใช้เมื่อต้องการดูข้อมูลครบถ้วน

SELECT 
    r.id,
    r.bib,
    r.first_name,
    r.last_name,
    r.gender,
    r.nationality,
    r.age_category,
    r.created_at as runner_created_at,
    -- Activity Statistics
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'lookup') as lookup_count,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'add_google_wallet') as google_wallet_count,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'add_apple_wallet') as apple_wallet_count,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'view_pass') as view_pass_count,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'save_image') as save_image_count,
    MAX(ual.created_at) as last_activity_date,
    -- Check if has any activity
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_activity_logs ual2 WHERE ual2.runner_id = r.id)
        THEN 'มี activity อื่นๆ'
        ELSE 'ไม่มี activity เลย'
    END as activity_status
FROM runners r
LEFT JOIN user_activity_logs ual ON r.id = ual.runner_id
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual3 
    WHERE ual3.runner_id = r.id 
    AND ual3.activity_type = 'save_image' 
    AND ual3.success = true
)
GROUP BY r.id, r.bib, r.first_name, r.last_name, r.name_on_bib, 
         r.gender, r.nationality, r.age_category, r.created_at
ORDER BY r.bib;

-- ============================================
-- Query 7: Export เป็น CSV format (พร้อม header)
-- ============================================
-- ✅ ใช้เมื่อต้องการ export ข้อมูล

SELECT 
    r.bib as "BIB",
    r.first_name as "First Name",
    r.last_name as "Last Name",
    r.name_on_bib as "Name on Bib",
    r.gender as "Gender",
    r.nationality as "Nationality",
    r.age_category as "Age Category",
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'lookup') as "Lookup Count",
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'save_image') as "Save Image Count",
    MAX(ual.created_at) as "Last Activity Date"
FROM runners r
LEFT JOIN user_activity_logs ual ON r.id = ual.runner_id
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual2 
    WHERE ual2.runner_id = r.id 
    AND ual2.activity_type = 'save_image' 
    AND ual2.success = true
)
GROUP BY r.id, r.bib, r.first_name, r.last_name, r.name_on_bib, 
         r.gender, r.nationality, r.age_category
ORDER BY r.bib;

-- ============================================
-- Query 8: Runners ที่ไม่เคย lookup เลย
-- ============================================
-- ✅ ใช้เมื่อต้องการหาคนที่ไม่เคยมี activity type = 'lookup' เลย

SELECT 
    r.id,
    r.bib,
    r.first_name,
    r.last_name,
    r.gender,
    r.nationality,
    r.age_category,
    r.created_at as runner_created_at
FROM runners r
WHERE NOT EXISTS (
    -- ไม่มี lookup activity
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'lookup'
)
ORDER BY r.bib;

-- ============================================
-- Query 9: Runners ที่ไม่เคย lookup (พร้อมสรุปจำนวน)
-- ============================================
-- ✅ ใช้เมื่อต้องการดูสรุปจำนวนคนที่ไม่เคย lookup

SELECT 
    COUNT(*) as total_runners_without_lookup,
    COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM user_activity_logs ual 
        WHERE ual.runner_id = r.id
        AND ual.activity_type != 'lookup'
    )) as runners_with_other_activities,
    COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM user_activity_logs ual 
        WHERE ual.runner_id = r.id
    )) as runners_without_any_activity
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'lookup'
);

-- ============================================
-- Query 10: สรุปจำนวน Runners แยกตามสถานะ Lookup
-- ============================================
-- ✅ ใช้เมื่อต้องการดูภาพรวมทั้งหมดเกี่ยวกับ lookup

SELECT 
    -- ทั้งหมด
    (SELECT COUNT(*) FROM runners) as total_runners,
    
    -- มี lookup
    (SELECT COUNT(DISTINCT runner_id) 
     FROM user_activity_logs 
     WHERE activity_type = 'lookup') as runners_with_lookup,
    
    -- ไม่มี lookup
    (SELECT COUNT(*)
     FROM runners r
     WHERE NOT EXISTS (
         SELECT 1 
         FROM user_activity_logs ual 
         WHERE ual.runner_id = r.id 
         AND ual.activity_type = 'lookup'
     )) as runners_without_lookup,
    
    -- ตรวจสอบว่าตัวเลขตรงกันหรือไม่
    (SELECT COUNT(*) FROM runners) - 
    (SELECT COUNT(DISTINCT runner_id) 
     FROM user_activity_logs 
     WHERE activity_type = 'lookup') as calculated_without_lookup,
    
    -- สถานะ validation
    CASE 
        WHEN (SELECT COUNT(*) FROM runners) - 
             (SELECT COUNT(DISTINCT runner_id) 
              FROM user_activity_logs 
              WHERE activity_type = 'lookup') =
             (SELECT COUNT(*)
              FROM runners r
              WHERE NOT EXISTS (
                  SELECT 1 
                  FROM user_activity_logs ual 
                  WHERE ual.runner_id = r.id 
                  AND ual.activity_type = 'lookup'
              ))
        THEN '✅ ตัวเลขตรงกัน'
        ELSE '⚠️ ตัวเลขไม่ตรงกัน'
    END as validation_status;

-- ============================================
-- หมายเหตุ:
-- ============================================
-- 1. Query 1-2: แนะนำสำหรับการใช้งานทั่วไป
-- 2. Query 3: ใช้เมื่อต้องการเฉพาะ runners ที่มี activity แต่ไม่ download (ไม่รวม lookup)
-- 3. Query 4: ใช้เมื่อต้องการนับทุก save_image activity (ไม่ว่าจะ success หรือไม่)
-- 4. Query 5: ใช้เพื่อดูสรุปจำนวน
-- 5. Query 6: ใช้เมื่อต้องการข้อมูลครบถ้วน
-- 6. Query 7: ใช้เมื่อต้องการ export เป็น CSV
-- 7. Query 8: ใช้เมื่อต้องการหาคนที่ไม่เคย lookup เลย
-- 8. Query 9: ใช้เมื่อต้องการสรุปจำนวนคนที่ไม่เคย lookup
-- 9. Query 10: ใช้เมื่อต้องการดูภาพรวมทั้งหมดเกี่ยวกับ lookup
-- 10. Query 11: ใช้เมื่อต้องการหาคนที่มี bib ไม่ตรงกับเลข bib ใน qr URL
-- 11. Query 12: ใช้เมื่อต้องการสรุปจำนวนคนที่มี bib ไม่ตรงกับ qr
-- 12. Query 13: ใช้เมื่อต้องการดูข้อมูลครบถ้วนพร้อม bib จาก qr
-- 13. Query 14: ใช้เมื่อต้องการ export ข้อมูลเป็น CSV
--
-- ⚠️  ข้อควรระวัง:
-- - Query ใช้ NOT EXISTS เพื่อหาคนที่ไม่มี activity
-- - เงื่อนไข success = true เพื่อนับเฉพาะการ download ที่สำเร็จ
-- - ถ้าต้องการนับทุก save_image activity (รวมทั้งที่ fail) ให้ใช้ Query 4

-- ============================================
-- Query 11: Runners ที่มี bib ไม่ตรงกับเลข bib ใน qr URL
-- ============================================
-- ✅ ใช้เมื่อต้องการหาคนที่ qr URL มี bib ไม่ตรงกับ bib ในตาราง
-- ตัวอย่าง: qr = 'https://runner.thai.run/BS21-2025/5590' แต่ bib = '1234'
-- รองรับ: trailing slash, query parameters, whitespace

SELECT 
    r.id,
    r.bib as bib_in_table,
    r.first_name,
    r.last_name,
    r.gender,
    r.nationality,
    r.age_category,
    r.qr,
    -- Extract bib จาก qr URL (เลขหลัง slash สุดท้าย, ลบ query params และ whitespace)
    TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) as bib_from_qr,
    -- เปรียบเทียบ (trim ทั้งสองฝั่งเพื่อเปรียบเทียบ)
    CASE 
        WHEN r.qr IS NOT NULL 
             AND r.qr != ''
             AND r.qr LIKE '%runner.thai.run%'
             AND TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) != TRIM(r.bib)
        THEN 'ไม่ตรงกัน'
        WHEN r.qr IS NOT NULL 
             AND r.qr != ''
             AND r.qr LIKE '%runner.thai.run%'
             AND TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) = TRIM(r.bib)
        THEN 'ตรงกัน'
        WHEN r.qr IS NULL OR TRIM(r.qr) = ''
        THEN 'ไม่มี qr'
        ELSE 'รูปแบบไม่ถูกต้อง'
    END as bib_match_status
FROM runners r
WHERE r.qr IS NOT NULL 
AND TRIM(r.qr) != ''
AND r.qr LIKE '%runner.thai.run%'
AND TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) != TRIM(r.bib)
ORDER BY r.bib;

-- ============================================
-- Query 12: สรุปจำนวน Runners ที่มี bib ไม่ตรงกับ qr
-- ============================================
-- ✅ ใช้เมื่อต้องการดูสรุปจำนวน

SELECT 
    COUNT(*) FILTER (WHERE qr IS NOT NULL AND TRIM(qr) != '' AND qr LIKE '%runner.thai.run%') as total_with_qr_url,
    COUNT(*) FILTER (WHERE qr IS NOT NULL 
                     AND TRIM(qr) != '' 
                     AND qr LIKE '%runner.thai.run%'
                     AND TRIM(SPLIT_PART(SPLIT_PART(qr, '/', -1), '?', 1)) = TRIM(bib)) as bib_matches_qr,
    COUNT(*) FILTER (WHERE qr IS NOT NULL 
                     AND TRIM(qr) != '' 
                     AND qr LIKE '%runner.thai.run%'
                     AND TRIM(SPLIT_PART(SPLIT_PART(qr, '/', -1), '?', 1)) != TRIM(bib)) as bib_not_matches_qr,
    COUNT(*) FILTER (WHERE qr IS NULL OR TRIM(qr) = '') as no_qr,
    COUNT(*) FILTER (WHERE qr IS NOT NULL 
                     AND TRIM(qr) != '' 
                     AND qr NOT LIKE '%runner.thai.run%') as qr_other_format
FROM runners;

-- ============================================
-- Query 13: Runners ที่มี bib ไม่ตรงกับ qr (พร้อมรายละเอียดเพิ่มเติม)
-- ============================================
-- ✅ ใช้เมื่อต้องการดูข้อมูลครบถ้วนพร้อม bib จาก qr

SELECT 
    r.id,
    r.bib as bib_in_table,
    TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) as bib_from_qr_url,
    r.first_name,
    r.last_name,
    r.qr,
    r.created_at,
    -- ตรวจสอบว่า bib จาก qr เป็นตัวเลขหรือไม่
    CASE 
        WHEN TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) ~ '^[0-9]+$'
        THEN 'เป็นตัวเลข'
        ELSE 'ไม่ใช่ตัวเลข'
    END as bib_from_qr_is_numeric
FROM runners r
WHERE r.qr IS NOT NULL 
AND TRIM(r.qr) != ''
AND r.qr LIKE '%runner.thai.run%'
AND TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) != TRIM(r.bib)
ORDER BY r.bib;

-- ============================================
-- Query 14: Export เป็น CSV format (พร้อม header)
-- ============================================
-- ✅ ใช้เมื่อต้องการ export ข้อมูล

SELECT 
    r.bib as "BIB in Table",
    TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) as "BIB from QR URL",
    r.first_name as "First Name",
    r.last_name as "Last Name",
    r.qr as "QR URL"
FROM runners r
WHERE r.qr IS NOT NULL 
AND TRIM(r.qr) != ''
AND r.qr LIKE '%runner.thai.run%'
AND TRIM(SPLIT_PART(SPLIT_PART(r.qr, '/', -1), '?', 1)) != TRIM(r.bib)
ORDER BY r.bib;
-- - Query 8-9 หาคนที่ไม่เคย lookup และไม่เคย download

