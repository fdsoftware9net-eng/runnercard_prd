# Supabase RPC Function Setup Guide

## 📋 สารบัญ
- [ค่าใช้จ่าย](#ค่าใช้จ่าย)
- [ข้อดีของ RPC Function](#ข้อดีของ-rpc-function)
- [ขั้นตอนการสร้าง](#ขั้นตอนการสร้าง)
- [ตัวอย่างโค้ด](#ตัวอย่างโค้ด)
- [การทดสอบ](#การทดสอบ)
- [Troubleshooting](#troubleshooting)

---

## ค่าใช้จ่าย

### ✅ **ไม่มีค่าใช้จ่ายเพิ่มเติม**

Supabase RPC (Remote Procedure Call) Function เป็นฟีเจอร์พื้นฐานของ Supabase:
- **Free Tier**: ใช้ได้ฟรี ไม่จำกัดจำนวน function
- **Pro Tier**: ใช้ได้ฟรีเช่นกัน
- **Enterprise**: ใช้ได้ฟรีเช่นกัน

**หมายเหตุ**: 
- RPC Function ใช้ resource ของ Database (CPU, Memory)
- ถ้า query ซับซ้อนมาก อาจใช้เวลาในการประมวลผล
- แต่โดยทั่วไปไม่มีค่าใช้จ่ายเพิ่มเติม

---

## ข้อดีของ RPC Function

### 1. **Performance**
- ✅ ประมวลผลที่ Database (เร็วกว่า)
- ✅ ลด network traffic (ส่งผลลัพธ์ที่คำนวณแล้ว)
- ✅ ใช้ index ของ database อย่างมีประสิทธิภาพ

### 2. **Security**
- ✅ ใช้ `SECURITY DEFINER` เพื่อควบคุมสิทธิ์
- ✅ ป้องกัน SQL injection
- ✅ ควบคุมการเข้าถึงข้อมูล

### 3. **Maintainability**
- ✅ Logic อยู่ที่ database (centralized)
- ✅ แก้ไขได้ที่เดียว ไม่ต้อง deploy frontend
- ✅ Version control ผ่าน SQL migration

### 4. **Scalability**
- ✅ Database ประมวลผลได้เร็วกว่า client-side
- ✅ ลด load ที่ frontend

---

## ขั้นตอนการสร้าง

### Step 1: สร้าง SQL Function ใน Supabase

1. เปิด **Supabase Dashboard**
2. ไปที่ **SQL Editor** (เมนูด้านซ้าย)
3. คลิก **New Query**
4. Copy SQL code ด้านล่าง
5. คลิก **Run** หรือกด `Ctrl+Enter`

### Step 2: ตรวจสอบ Function

รัน query นี้เพื่อตรวจสอบ:

```sql
SELECT 
    routine_name, 
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'get_activity_statistics';
```

---

## ตัวอย่างโค้ด

### 1. SQL Function สำหรับ Statistics

**ไฟล์**: `supabase_schema_update_v5.sql` (สร้างใหม่)

```sql
-- ============================================
-- RPC Function: get_activity_statistics
-- ============================================
-- Function สำหรับดึงสถิติการใช้งาน (Lookup และ Download)
-- Parameters:
--   days_back: จำนวนวันที่ต้องการดึงข้อมูล (default: 30)
-- Returns: Statistics object

CREATE OR REPLACE FUNCTION get_activity_statistics(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    total_lookups BIGINT,
    successful_lookups BIGINT,
    failed_lookups BIGINT,
    lookup_success_rate NUMERIC,
    total_downloads BIGINT,
    successful_downloads BIGINT,
    failed_downloads BIGINT,
    download_success_rate NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    start_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- คำนวณวันที่เริ่มต้น
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
        END as download_success_rate;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_activity_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_statistics(INTEGER) TO anon;

-- Add comment
COMMENT ON FUNCTION get_activity_statistics(INTEGER) IS 
'Returns activity statistics (lookups and downloads) for the specified number of days';
```

### 2. SQL Function สำหรับ Daily Statistics

```sql
-- ============================================
-- RPC Function: get_daily_statistics
-- ============================================
-- Function สำหรับดึงสถิติรายวัน
-- Parameters:
--   days_back: จำนวนวันที่ต้องการดึงข้อมูล (default: 30)
-- Returns: Array of daily statistics

CREATE OR REPLACE FUNCTION get_daily_statistics(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    date DATE,
    lookups BIGINT,
    downloads BIGINT
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
        COUNT(*) FILTER (WHERE ual.activity_type = 'save_image')::BIGINT as downloads
    FROM user_activity_logs ual
    WHERE ual.activity_type IN ('lookup', 'save_image')
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
'Returns daily statistics (lookups and downloads) for the specified number of days';
```

---

## TypeScript Integration

### 1. เพิ่ม Interface ใน types.ts

```typescript
// เพิ่มใน types.ts
export interface ActivityStatistics {
  total_lookups: number;
  successful_lookups: number;
  failed_lookups: number;
  lookup_success_rate: number;
  total_downloads: number;
  successful_downloads: number;
  failed_downloads: number;
  download_success_rate: number;
}

export interface DailyStatistics {
  date: string;
  lookups: number;
  downloads: number;
}
```

### 2. เพิ่ม Service Function ใน supabaseService.ts

```typescript
// เพิ่มใน services/supabaseService.ts

/**
 * ดึงสถิติการใช้งานทั้งหมดผ่าน RPC Function
 * @param days จำนวนวันที่ต้องการดึงข้อมูล (default: 30)
 */
export const getActivityStatistics = async (
  days: number = 30
): Promise<ApiResponse<ActivityStatistics>> => {
  try {
    const supabaseClient = getSupabaseClient();
    
    const { data, error } = await supabaseClient.rpc('get_activity_statistics', {
      days_back: days,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      // Return default values if no data
      return {
        data: {
          total_lookups: 0,
          successful_lookups: 0,
          failed_lookups: 0,
          lookup_success_rate: 0,
          total_downloads: 0,
          successful_downloads: 0,
          failed_downloads: 0,
          download_success_rate: 0,
        },
      };
    }

    // RPC function returns array with one object
    const result = data[0];

    return {
      data: {
        total_lookups: Number(result.total_lookups) || 0,
        successful_lookups: Number(result.successful_lookups) || 0,
        failed_lookups: Number(result.failed_lookups) || 0,
        lookup_success_rate: Number(result.lookup_success_rate) || 0,
        total_downloads: Number(result.total_downloads) || 0,
        successful_downloads: Number(result.successful_downloads) || 0,
        failed_downloads: Number(result.failed_downloads) || 0,
        download_success_rate: Number(result.download_success_rate) || 0,
      },
    };
  } catch (error: any) {
    console.error('Error fetching activity statistics:', error);
    return { error: error.message || 'Failed to fetch statistics.' };
  }
};

/**
 * ดึงสถิติรายวันผ่าน RPC Function
 * @param days จำนวนวันที่ต้องการดึงข้อมูล (default: 30)
 */
export const getDailyStatistics = async (
  days: number = 30
): Promise<ApiResponse<DailyStatistics[]>> => {
  try {
    const supabaseClient = getSupabaseClient();
    
    const { data, error } = await supabaseClient.rpc('get_daily_statistics', {
      days_back: days,
    });

    if (error) {
      throw new Error(error.message);
    }

    // Convert date to string format
    const result = (data || []).map((item: any) => ({
      date: item.date, // Already in YYYY-MM-DD format
      lookups: Number(item.lookups) || 0,
      downloads: Number(item.downloads) || 0,
    }));

    return { data: result };
  } catch (error: any) {
    console.error('Error fetching daily statistics:', error);
    return { error: error.message || 'Failed to fetch daily statistics.' };
  }
};
```

---

## การทดสอบ

### 1. ทดสอบใน Supabase Dashboard

```sql
-- ทดสอบ get_activity_statistics
SELECT * FROM get_activity_statistics(30);

-- ทดสอบ get_daily_statistics
SELECT * FROM get_daily_statistics(30);

-- ทดสอบด้วย parameter ต่างกัน
SELECT * FROM get_activity_statistics(7);
SELECT * FROM get_daily_statistics(7);
```

### 2. ทดสอบใน TypeScript

```typescript
// ใน component หรือ console
import { getActivityStatistics, getDailyStatistics } from './services/supabaseService';

// Test
const stats = await getActivityStatistics(30);
console.log('Statistics:', stats);

const daily = await getDailyStatistics(30);
console.log('Daily Stats:', daily);
```

---

## Troubleshooting

### ปัญหา: Function not found

**Error**: `function get_activity_statistics(integer) does not exist`

**แก้ไข**:
1. ตรวจสอบว่า function ถูกสร้างแล้ว (รัน query ตรวจสอบ)
2. ตรวจสอบว่าใช้ชื่อ function ถูกต้อง
3. ตรวจสอบว่า parameter type ตรงกัน (INTEGER)

### ปัญหา: Permission denied

**Error**: `permission denied for function get_activity_statistics`

**แก้ไข**:
1. ตรวจสอบว่าได้ grant permission แล้ว:
   ```sql
   GRANT EXECUTE ON FUNCTION get_activity_statistics(INTEGER) TO authenticated;
   GRANT EXECUTE ON FUNCTION get_activity_statistics(INTEGER) TO anon;
   ```

### ปัญหา: RPC returns null

**สาเหตุ**: 
- ไม่มีข้อมูลในช่วงเวลาที่กำหนด
- Function return type ไม่ตรง

**แก้ไข**:
1. ตรวจสอบว่ามีข้อมูลใน `user_activity_logs`
2. ตรวจสอบ return type ของ function
3. ตรวจสอบว่า function return ข้อมูลจริง

### ปัญหา: Performance ช้า

**สาเหตุ**:
- Query ซับซ้อน
- ไม่มี index

**แก้ไข**:
1. ตรวจสอบว่า index ถูกสร้างแล้ว:
   ```sql
   SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE tablename = 'user_activity_logs';
   ```
2. ใช้ `EXPLAIN ANALYZE` เพื่อดู execution plan:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM get_activity_statistics(30);
   ```

---

## Best Practices

### 1. Error Handling
- ✅ ใช้ try-catch ใน TypeScript
- ✅ ตรวจสอบ error message จาก Supabase
- ✅ Return default values ถ้าไม่มีข้อมูล

### 2. Performance
- ✅ ใช้ index ที่มีอยู่แล้ว
- ✅ Limit จำนวนวันที่ query (ไม่เกิน 365 วัน)
- ✅ Cache ผลลัพธ์ถ้าเป็นไปได้

### 3. Security
- ✅ ใช้ `SECURITY DEFINER` อย่างระมัดระวัง
- ✅ Grant permission เฉพาะ role ที่จำเป็น
- ✅ ตรวจสอบ input parameters

### 4. Maintenance
- ✅ เก็บ SQL function ใน migration file
- ✅ Version control ผ่าน Git
- ✅ Document function parameters และ return type

---

## สรุป

### ขั้นตอนการทำ

1. ✅ **สร้าง SQL Function** ใน Supabase SQL Editor
2. ✅ **Grant Permissions** ให้ authenticated และ anon
3. ✅ **เพิ่ม TypeScript Interfaces** ใน types.ts
4. ✅ **เพิ่ม Service Functions** ใน supabaseService.ts
5. ✅ **ทดสอบ** ใน Supabase Dashboard และ TypeScript
6. ✅ **ใช้งาน** ใน Component

### ข้อดี

- ✅ **ไม่มีค่าใช้จ่ายเพิ่มเติม**
- ✅ **เร็วกว่า** query แบบ manual
- ✅ **ปลอดภัย** ด้วย RLS และ permissions
- ✅ **ง่ายต่อการ maintain** logic อยู่ที่ database

---

**อัปเดตล่าสุด**: 2024
**ผู้ดูแล**: Development Team

