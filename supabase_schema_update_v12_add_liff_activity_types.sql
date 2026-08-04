-- ============================================
-- Add activity_type values for the LIFF auto-send bib pass flow
-- 'liff_register'    -> result of the event.runner.register.save call to yourqr.today
-- 'liff_send_image'  -> result of the line.user.chat.image call to yourqr.today
-- ============================================
-- Run this in Supabase SQL Editor

-- ============================================
-- Step 1: Drop old CHECK constraint
-- ============================================
-- ⚠️ หมายเหตุ: การ DROP constraint ไม่ได้ลบข้อมูลในตาราง
-- แค่ลบ constraint ที่จำกัดค่า activity_type เท่านั้น

ALTER TABLE user_activity_logs
DROP CONSTRAINT IF EXISTS user_activity_logs_activity_type_check;

-- ============================================
-- Step 2: Add new CHECK constraint with the LIFF activity types
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
  'liff_register',     -- ✅ เพิ่ม: ผลลัพธ์การลงทะเบียนผ่าน LIFF (yourqr.today register)
  'liff_send_image'    -- ✅ เพิ่ม: ผลลัพธ์การส่งรูปบัตรเข้า LINE ผ่าน LIFF (yourqr.today send image)
));

-- ============================================
-- Step 3: Verify constraint (optional)
-- ============================================

-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name = 'user_activity_logs_activity_type_check';
