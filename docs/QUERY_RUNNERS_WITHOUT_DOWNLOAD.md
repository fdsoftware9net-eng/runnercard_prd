# คู่มือ: Query ดึงข้อมูล Runners ที่ไม่ได้กด Download Image

## 📋 ภาพรวม

เอกสารนี้อธิบายวิธีการ query ข้อมูล runners ที่ไม่ได้กด download image (ไม่มี activity `save_image`) จากตาราง `runners` และ `user_activity_logs`

## 🔍 ความเข้าใจเบื้องต้น

### ตารางที่เกี่ยวข้อง

1. **`runners`** - ข้อมูลนักวิ่ง
   - `id` (Primary Key)
   - `bib` - หมายเลข BIB
   - `first_name`, `last_name` - ชื่อ-นามสกุล
   - และข้อมูลอื่นๆ

2. **`user_activity_logs`** - Log กิจกรรมของผู้ใช้
   - `id` (Primary Key)
   - `runner_id` (Foreign Key → `runners.id`)
   - `activity_type` - ประเภทกิจกรรม (`'save_image'`, `'lookup'`, `'add_google_wallet'`, etc.)
   - `success` - สถานะสำเร็จ/ล้มเหลว
   - `created_at` - วันที่สร้าง log

### Activity Types

- `'lookup'` - การค้นหาข้อมูล
- `'save_image'` - การ download image (ที่เราต้องการหา)
- `'add_google_wallet'` - เพิ่ม Google Wallet
- `'add_apple_wallet'` - เพิ่ม Apple Wallet
- `'view_pass'` - ดู pass
- `'update_runner'` - อัปเดตข้อมูล runner

## 📝 Queries ที่แนะนำ

### Query 1: แบบพื้นฐาน (แนะนำ)

```sql
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
```

**ใช้เมื่อ**: ต้องการข้อมูล runners ที่ไม่มี `save_image` activity ที่สำเร็จ

**ผลลัพธ์**: รายชื่อ runners ทั้งหมดที่ไม่มี `save_image` activity (รวมทั้งที่ไม่มี activity log เลย)

---

### Query 2: พร้อมข้อมูล Activity Log

```sql
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
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type IS NOT NULL) as total_activities,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'lookup') as lookup_count,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'save_image') as save_image_count,
    MAX(ual.created_at) FILTER (WHERE ual.activity_type IS NOT NULL) as last_activity_date
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
         r.gender, r.nationality, r.age_category, r.created_at
ORDER BY r.bib;
```

**ใช้เมื่อ**: ต้องการดูข้อมูล activity log อื่นๆ ของ runners ที่ไม่ได้ download

**ผลลัพธ์**: รายชื่อ runners พร้อมจำนวน activity แต่ละประเภท

---

### Query 3: เฉพาะ Runners ที่มี Activity แต่ไม่ Download

```sql
SELECT 
    r.id,
    r.bib,
    r.first_name,
    r.last_name,
    r.name_on_bib,
    r.gender,
    r.nationality,
    r.age_category,
    COUNT(DISTINCT ual.id) as total_activities,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'lookup') as lookup_count,
    MAX(ual.created_at) as last_activity_date
FROM runners r
INNER JOIN user_activity_logs ual ON r.id = ual.runner_id
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
```

**ใช้เมื่อ**: ต้องการหาเฉพาะ runners ที่มี activity log แต่ไม่ download

**ผลลัพธ์**: ไม่รวม runners ที่ไม่มี activity log เลย

---

### Query 4: สรุปจำนวน

```sql
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
```

**ใช้เมื่อ**: ต้องการดูสรุปจำนวนเท่านั้น

**ผลลัพธ์**: 
- `total_runners_without_download` - จำนวน runners ที่ไม่ได้ download ทั้งหมด
- `runners_with_other_activities` - จำนวนที่มี activity อื่นๆ
- `runners_without_any_activity` - จำนวนที่ไม่มี activity เลย

---

### Query 5: Export เป็น CSV Format

```sql
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
```

**ใช้เมื่อ**: ต้องการ export ข้อมูลเป็น CSV

**ผลลัพธ์**: ข้อมูลพร้อม header ที่เหมาะสมสำหรับ export

---

## 🎯 วิธีเลือก Query

| ต้องการ | Query ที่แนะนำ |
|---------|---------------|
| ข้อมูลพื้นฐานของ runners ที่ไม่ได้ download | Query 1 |
| ข้อมูลพร้อม activity log | Query 2 |
| เฉพาะ runners ที่มี activity แต่ไม่ download | Query 3 |
| ดูจำนวนสรุป | Query 4 |
| Export เป็น CSV | Query 5 |

---

## ⚠️ ข้อควรระวัง

### 1. ความแตกต่างระหว่าง NOT EXISTS และ LEFT JOIN

- **NOT EXISTS**: หา runners ที่ไม่มี `save_image` activity (รวมทั้งที่ไม่มี activity log เลย)
- **INNER JOIN**: หาเฉพาะ runners ที่มี activity log อย่างน้อย 1 ครั้ง

### 2. การนับ success = true

- Query ส่วนใหญ่จะนับเฉพาะ `save_image` ที่ `success = true`
- ถ้าต้องการนับทุก `save_image` activity (รวมทั้งที่ fail) ให้ลบเงื่อนไข `AND ual.success = true`

### 3. Performance

- Query ที่ใช้ `NOT EXISTS` จะเร็วกว่า `LEFT JOIN ... WHERE ... IS NULL`
- ถ้าข้อมูลเยอะมาก อาจต้องเพิ่ม index:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_user_activity_logs_runner_activity 
  ON user_activity_logs(runner_id, activity_type, success);
  ```

---

## 📊 ตัวอย่างการใช้งาน

### 1. ดูจำนวน runners ที่ไม่ได้ download

```sql
-- ใช้ Query 4
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
```

### 2. Export ข้อมูลเป็น CSV

1. ใช้ Query 5 ใน Supabase SQL Editor
2. คลิก "Download CSV" หรือ "Export"
3. เปิดไฟล์ CSV ใน Excel หรือ Google Sheets

### 3. หา runners ที่มี lookup แต่ไม่ download

```sql
SELECT 
    r.bib,
    r.first_name,
    r.last_name,
    COUNT(DISTINCT ual.id) FILTER (WHERE ual.activity_type = 'lookup') as lookup_count
FROM runners r
LEFT JOIN user_activity_logs ual ON r.id = ual.runner_id
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual2 
    WHERE ual2.runner_id = r.id 
    AND ual2.activity_type = 'save_image' 
    AND ual2.success = true
)
AND EXISTS (
    SELECT 1 
    FROM user_activity_logs ual3 
    WHERE ual3.runner_id = r.id 
    AND ual3.activity_type = 'lookup'
)
GROUP BY r.id, r.bib, r.first_name, r.last_name
ORDER BY lookup_count DESC;
```

---

## 🔧 Customization

### เพิ่มเงื่อนไขตามวันที่

```sql
-- หา runners ที่ไม่ได้ download ในช่วง 30 วันที่ผ่านมา
SELECT 
    r.bib,
    r.first_name,
    r.last_name
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'save_image' 
    AND ual.success = true
    AND ual.created_at >= NOW() - INTERVAL '30 days'
)
ORDER BY r.bib;
```

### เพิ่มเงื่อนไขตาม BIB

```sql
-- หา runners ที่ไม่ได้ download และ BIB อยู่ในช่วงที่กำหนด
SELECT 
    r.bib,
    r.first_name,
    r.last_name
FROM runners r
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_activity_logs ual 
    WHERE ual.runner_id = r.id 
    AND ual.activity_type = 'save_image' 
    AND ual.success = true
)
AND r.bib BETWEEN '001' AND '100'
ORDER BY r.bib;
```

---

## 📞 ต้องการความช่วยเหลือ?

ถ้ามีปัญหา:
1. ตรวจสอบว่า table names และ column names ถูกต้อง
2. ตรวจสอบว่า foreign key relationship ถูกต้อง (`runner_id` → `runners.id`)
3. ทดสอบ query ด้วยข้อมูลเล็กน้อยก่อน

