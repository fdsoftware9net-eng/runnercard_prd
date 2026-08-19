-- ============================================
-- Add activity_type values for the runner-supplied bib pass background
-- 'change_background' -> runner uploaded their own image over the card artwork
-- 'reset_background'  -> runner put the event artwork back
-- ============================================
-- Run this in Supabase SQL Editor, together with
-- supabase_schema_update_v13_add_runner_custom_background.sql.

-- ============================================
-- Step 1: Drop old CHECK constraint
-- ============================================
-- ⚠️ หมายเหตุ: การ DROP constraint ไม่ได้ลบข้อมูลในตาราง
-- แค่ลบ constraint ที่จำกัดค่า activity_type เท่านั้น

ALTER TABLE user_activity_logs
DROP CONSTRAINT IF EXISTS user_activity_logs_activity_type_check;

-- ============================================
-- Step 2: Add new CHECK constraint with the background activity types
-- ============================================

ALTER TABLE user_activity_logs
ADD CONSTRAINT user_activity_logs_activity_type_check
CHECK (activity_type IN (
  'lookup',
  'save_image',
  'add_google_wallet',
  'add_apple_wallet',
  'view_pass',
  'update_runner',
  'link_line_account',
  'liff_register',
  'liff_send_image',
  'change_background',  -- ✅ เพิ่ม: นักวิ่งอัพโหลดรูปพื้นหลังของตัวเอง
  'reset_background'    -- ✅ เพิ่ม: นักวิ่งคืนค่าพื้นหลังกลับเป็นอาร์ตเวิร์คของงาน
));

-- ============================================
-- Step 3: Verify constraint (optional)
-- ============================================

-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name = 'user_activity_logs_activity_type_check';
