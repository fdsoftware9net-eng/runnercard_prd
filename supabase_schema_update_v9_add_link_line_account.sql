-- ============================================
-- Fix: Update CHECK constraint for activity_type
-- เพิ่ม 'link_line_account' สำหรับปุ่ม "กดรับผลวิ่งอัตโนมัติ"
-- ============================================
-- This file updates the CHECK constraint to include 'link_line_account'
-- Run this in Supabase SQL Editor

-- ============================================
-- Step 1: Drop old CHECK constraint
-- ============================================
-- ⚠️ หมายเหตุ: การ DROP constraint ไม่ได้ลบข้อมูลในตาราง
-- แค่ลบ constraint ที่จำกัดค่า activity_type เท่านั้น

ALTER TABLE user_activity_logs
DROP CONSTRAINT IF EXISTS user_activity_logs_activity_type_check;

-- ============================================
-- Step 2: Add new CHECK constraint with 'link_line_account'
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
  'link_line_account'  -- ✅ เพิ่ม: สำหรับปุ่ม "กดรับผลวิ่งอัตโนมัติ"
));

-- ============================================
-- Step 3: Verify constraint
-- ============================================
-- ทดสอบว่า constraint ทำงานถูกต้อง

-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name = 'user_activity_logs_activity_type_check';

-- ============================================
-- Step 4: Test insert (optional)
-- ============================================
-- ทดสอบว่า insert log ใหม่ได้หรือไม่

-- INSERT INTO user_activity_logs (activity_type, success)
-- VALUES ('link_line_account', true)
-- RETURNING id, activity_type, created_at;

