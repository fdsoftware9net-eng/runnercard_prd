-- ============================================
-- Fix: Update CHECK constraint for activity_type
-- ============================================
-- This file updates the CHECK constraint to include 'update_runner'
-- Run this in Supabase SQL Editor

-- ============================================
-- Step 1: Drop old CHECK constraint
-- ============================================
-- ⚠️ หมายเหตุ: การ DROP constraint ไม่ได้ลบข้อมูลในตาราง
-- แค่ลบ constraint ที่จำกัดค่า activity_type เท่านั้น

ALTER TABLE user_activity_logs
DROP CONSTRAINT IF EXISTS user_activity_logs_activity_type_check;

-- ============================================
-- Step 2: Add new CHECK constraint with 'update_runner'
-- ============================================

ALTER TABLE user_activity_logs
ADD CONSTRAINT user_activity_logs_activity_type_check
CHECK (activity_type IN (
  'lookup',
  'save_image',
  'add_google_wallet',
  'add_apple_wallet',
  'view_pass',
  'update_runner'  -- ✅ เพิ่ม: สำหรับการแก้ไข runner
));

-- ============================================
-- Step 3: Verify constraint
-- ============================================
-- ทดสอบว่า constraint ทำงานถูกต้อง

-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name = 'user_activity_logs_activity_type_check';

