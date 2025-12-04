# User Activity Logs - เอกสารอธิบายตาราง user_activity_logs

## 📋 สารบัญ
- [ภาพรวม](#ภาพรวม)
- [โครงสร้างตาราง](#โครงสร้างตาราง)
- [ความสัมพันธ์กับตารางอื่น](#ความสัมพันธ์กับตารางอื่น)
- [ประเภทกิจกรรมที่บันทึก](#ประเภทกิจกรรมที่บันทึก)
- [การใช้งานในโค้ด](#การใช้งานในโค้ด)
- [Row Level Security (RLS)](#row-level-security-rls)
- [ตัวอย่างการ Query](#ตัวอย่างการ-query)

---

## ภาพรวม

ตาราง `user_activity_logs` ใช้สำหรับบันทึกกิจกรรมของผู้ใช้ทั้งหมดในระบบ Runner Bib Pass เพื่อ:
- **Analytics**: วิเคราะห์พฤติกรรมการใช้งาน (จำนวนการค้นหา, อัตราสำเร็จ, วิธีค้นหาที่นิยม)
- **Security**: ตรวจจับการใช้งานผิดปกติ (เช่น brute force attacks)
- **Debugging**: ตรวจสอบปัญหาการใช้งานระบบ
- **Audit Trail**: ติดตามการใช้งานระบบเพื่อการตรวจสอบ

---

## โครงสร้างตาราง

### Schema

```sql
CREATE TABLE user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activity_type TEXT NOT NULL,
    runner_id UUID REFERENCES runners(id) ON DELETE SET NULL,
    search_method TEXT,
    search_input_hash TEXT,
    success BOOLEAN NOT NULL DEFAULT false,
    ip_address INET,
    user_agent TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

### คำอธิบายคอลัมน์

| คอลัมน์ | ประเภท | คำอธิบาย |
|---------|--------|----------|
| `id` | UUID | Primary Key, สร้างอัตโนมัติ |
| `created_at` | TIMESTAMP | เวลาที่บันทึก log (อัตโนมัติ) |
| `activity_type` | TEXT | ประเภทกิจกรรม (ดูรายละเอียดด้านล่าง) |
| `runner_id` | UUID | Foreign Key ไปยังตาราง `runners` (nullable สำหรับ lookup ที่ไม่สำเร็จ) |
| `search_method` | TEXT | วิธีค้นหา: `'name'` หรือ `'id_card'` (เฉพาะ lookup) |
| `search_input_hash` | TEXT | SHA-256 hash ของข้อมูลค้นหา (เพื่อความเป็นส่วนตัว) |
| `success` | BOOLEAN | ผลลัพธ์: `true` = สำเร็จ, `false` = ล้มเหลว |
| `ip_address` | INET | IP address ของผู้ใช้ (optional) |
| `user_agent` | TEXT | User agent ของ browser (optional) |
| `error_message` | TEXT | ข้อความ error (ถ้ามี) |
| `metadata` | JSONB | ข้อมูลเพิ่มเติมตามประเภทกิจกรรม (ดูรายละเอียดด้านล่าง) |

---

## ความสัมพันธ์กับตารางอื่น

### Foreign Key: `runners` table

```sql
runner_id UUID REFERENCES runners(id) ON DELETE SET NULL
```

- **ความสัมพันธ์**: Many-to-One (หลาย log สามารถอ้างอิง runner คนเดียวกันได้)
- **ON DELETE**: SET NULL (ถ้า runner ถูกลบ, runner_id จะเป็น NULL แทนที่จะลบ log)
- **เหตุผล**: เก็บ log ไว้เพื่อ audit trail แม้ว่า runner จะถูกลบไปแล้ว

### ตัวอย่างความสัมพันธ์

```
runners table:
┌────┬─────────────┬─────────────┐
│ id │ first_name  │ last_name    │
├────┼─────────────┼─────────────┤
│ 1  │ John        │ Doe          │
│ 2  │ Jane        │ Smith        │
└────┴─────────────┴─────────────┘

user_activity_logs table:
┌────┬──────────────┬─────────────┬──────────────┐
│ id │ activity_type│ runner_id   │ success      │
├────┼──────────────┼─────────────┼──────────────┤
│ 1  │ lookup       │ 1           │ true         │
│ 2  │ save_image   │ 1           │ true         │
│ 3  │ lookup       │ NULL        │ false        │
│ 4  │ save_image   │ 2           │ true         │
└────┴──────────────┴─────────────┴──────────────┘
```

---

## ประเภทกิจกรรมที่บันทึก

### 1. `lookup` - การค้นหา Runner Pass

**เมื่อไหร่**: เมื่อผู้ใช้ค้นหาข้อมูลตัวเองในหน้า Runner Lookup Page

**ข้อมูลที่บันทึก**:
```json
{
  "activity_type": "lookup",
  "search_method": "name" | "id_card",
  "search_input_hash": "sha256_hash_of_search_input",
  "runner_id": "uuid_or_null",
  "success": true | false,
  "error_message": "error_message_if_failed"
}
```

**ตัวอย่าง Metadata**:
- ไม่มี metadata สำหรับ lookup

**ความปลอดภัย**:
- ข้อมูลส่วนตัว (ชื่อ-นามสกุล, เลขบัตรประชาชน) ถูก hash ด้วย SHA-256 ก่อนบันทึก
- สำหรับ ID Card: ใช้ hash เดียวกับ `runners.id_card_hash`
- สำหรับ Name: hash ของ `"firstName|lastName"` (normalized)

---

### 2. `save_image` - การบันทึกรูปภาพ Pass

**เมื่อไหร่**: เมื่อผู้ใช้กดปุ่ม "Save as Image" ในหน้า Bib Pass Display

**ข้อมูลที่บันทึก**:
```json
{
  "activity_type": "save_image",
  "runner_id": "uuid",
  "success": true | false,
  "metadata": {
    "image_format": "png",
    "image_dimensions": {
      "width": 800,
      "height": 600
    },
    "file_name": "RunnerPass_BIB123.png"
  },
  "error_message": "error_message_if_failed"
}
```

**ตัวอย่าง Metadata**:
```json
{
  "image_format": "png",
  "image_dimensions": {
    "width": 800,
    "height": 600
  },
  "file_name": "RunnerPass_BIB123.png"
}
```

---

### 3. `add_google_wallet` - การเพิ่ม Pass ไปยัง Google Wallet

**เมื่อไหร่**: เมื่อผู้ใช้กดปุ่ม "Add to Google Wallet"

**ข้อมูลที่บันทึก**:
```json
{
  "activity_type": "add_google_wallet",
  "runner_id": "uuid",
  "success": true | false,
  "metadata": {
    "wallet_type": "google",
    "pass_url": "https://..."
  },
  "error_message": "error_message_if_failed"
}
```

---

### 4. `add_apple_wallet` - การเพิ่ม Pass ไปยัง Apple Wallet

**เมื่อไหร่**: เมื่อผู้ใช้กดปุ่ม "Add to Apple Wallet"

**ข้อมูลที่บันทึก**:
```json
{
  "activity_type": "add_apple_wallet",
  "runner_id": "uuid",
  "success": true | false,
  "metadata": {
    "wallet_type": "apple",
    "pass_url": "https://..."
  },
  "error_message": "error_message_if_failed"
}
```

---

### 5. `view_pass` - การดู Pass (สำหรับอนาคต)

**เมื่อไหร่**: เมื่อผู้ใช้เข้าดู Pass (สามารถเพิ่มในอนาคต)

**ข้อมูลที่บันทึก**:
```json
{
  "activity_type": "view_pass",
  "runner_id": "uuid",
  "success": true,
  "metadata": {}
}
```

---

## การใช้งานในโค้ด

### Service Function

**ไฟล์**: `services/supabaseService.ts`

```typescript
import { logUserActivity } from '../services/supabaseService';

// ตัวอย่างการใช้งาน
await logUserActivity({
  activity_type: 'lookup',
  search_method: 'name',
  search_input_hash: hashedInput,
  runner_id: runner?.id || null,
  success: !!runner,
  error_message: error || null,
});
```

**คุณสมบัติ**:
- **Non-blocking**: ไม่กระทบ UX ถ้า log ล้มเหลว
- **Fail silently**: Error จะถูก log ใน console แต่ไม่ throw exception
- **Async**: ทำงานแบบ asynchronous

---

### ตัวอย่างการใช้งานใน Components

#### 1. RunnerLookupPage.tsx

```typescript
// เมื่อผู้ใช้ค้นหา
const result = await findRunnerByDetails({...});

// บันทึก log
logUserActivity({
  activity_type: 'lookup',
  search_method: isIdFilled ? 'id_card' : 'name',
  search_input_hash: await hashSearchInput(searchInput),
  runner_id: result.data?.id || null,
  success: !!result.data,
  error_message: result.error || null,
}).catch(err => console.warn('Failed to log:', err));
```

#### 2. BibPassDisplay.tsx

```typescript
// เมื่อผู้ใช้ save image
logUserActivity({
  activity_type: 'save_image',
  runner_id: runner.id,
  success: true,
  metadata: {
    image_format: 'png',
    image_dimensions: { width, height },
    file_name: fileName,
  },
}).catch(err => console.warn('Failed to log:', err));
```

---

## Row Level Security (RLS)

### Policies

ตาราง `user_activity_logs` มี RLS เปิดอยู่เพื่อความปลอดภัย:

#### 1. INSERT Policies

**Anonymous Users (anon)**:
- ✅ สามารถ INSERT ได้ → Frontend บันทึก log ได้

**Authenticated Users (authenticated)**:
- ✅ สามารถ INSERT ได้ → Admin บันทึก log ได้

#### 2. SELECT Policy

**Authenticated Users (authenticated)**:
- ✅ สามารถ SELECT ได้ → Admin อ่าน log ได้

**Anonymous Users (anon)**:
- ❌ ไม่สามารถ SELECT ได้ → ป้องกันการเข้าถึงจากภายนอก

#### 3. UPDATE/DELETE

- ❌ ไม่มี policy → Log เป็น immutable (ไม่สามารถแก้ไขหรือลบได้)

### สรุป RLS Policies

| Role | INSERT | SELECT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| `anon` | ✅ | ❌ | ❌ | ❌ |
| `authenticated` | ✅ | ✅ | ❌ | ❌ |

---

## ตัวอย่างการ Query

### 1. ดูจำนวนการค้นหาต่อวัน

```sql
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_lookups,
    COUNT(*) FILTER (WHERE success = true) as successful_lookups,
    COUNT(*) FILTER (WHERE success = false) as failed_lookups
FROM user_activity_logs
WHERE activity_type = 'lookup'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 2. ดูวิธีค้นหาที่นิยม

```sql
SELECT 
    search_method,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE success = true) as successful
FROM user_activity_logs
WHERE activity_type = 'lookup'
    AND search_method IS NOT NULL
GROUP BY search_method
ORDER BY count DESC;
```

### 3. ดูกิจกรรมของ Runner คนหนึ่ง

```sql
SELECT 
    activity_type,
    created_at,
    success,
    metadata
FROM user_activity_logs
WHERE runner_id = 'runner-uuid-here'
ORDER BY created_at DESC;
```

### 4. ดูจำนวนการ Save Image

```sql
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_saves,
    COUNT(*) FILTER (WHERE success = true) as successful_saves
FROM user_activity_logs
WHERE activity_type = 'save_image'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 5. ดู Error Logs

```sql
SELECT 
    activity_type,
    created_at,
    error_message,
    runner_id
FROM user_activity_logs
WHERE success = false
    AND error_message IS NOT NULL
ORDER BY created_at DESC
LIMIT 100;
```

### 6. Analytics Dashboard Query

```sql
SELECT 
    activity_type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed,
    ROUND(
        COUNT(*) FILTER (WHERE success = true)::numeric / 
        NULLIF(COUNT(*), 0) * 100, 
        2
    ) as success_rate_percent
FROM user_activity_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY activity_type
ORDER BY total DESC;
```

---

## ข้อควรระวัง

### 1. Privacy & Security
- ✅ ข้อมูลส่วนตัวถูก hash ก่อนบันทึก
- ✅ ไม่เก็บข้อมูลส่วนตัวแบบ plain text
- ✅ RLS ป้องกันการเข้าถึงจากภายนอก

### 2. Performance
- ⚠️ Logging เป็น async/non-blocking เพื่อไม่กระทบ UX
- ⚠️ ควรมี index สำหรับ query ที่ใช้บ่อย
- ⚠️ พิจารณา partition table ตามเดือน/ปี หากข้อมูลเยอะ

### 3. Data Retention
- 💡 ควรกำหนด policy ลบ log เก่า (เช่น เก็บ 1-2 ปี)
- 💡 สามารถใช้ Supabase Edge Function หรือ cron job สำหรับ cleanup

### 4. Error Handling
- ✅ Function `logUserActivity` fail silently เพื่อไม่กระทบ UX
- ✅ Error จะถูก log ใน console สำหรับ debugging

---

## สรุป

ตาราง `user_activity_logs` เป็นส่วนสำคัญของระบบสำหรับ:
- 📊 **Analytics**: วิเคราะห์พฤติกรรมการใช้งาน
- 🔒 **Security**: ตรวจจับการใช้งานผิดปกติ
- 🐛 **Debugging**: ตรวจสอบปัญหา
- 📝 **Audit Trail**: ติดตามการใช้งาน

ข้อมูลถูกเก็บอย่างปลอดภัยด้วย:
- 🔐 Hash ข้อมูลส่วนตัว
- 🛡️ RLS policies
- 🔒 Immutable logs (ไม่สามารถแก้ไข/ลบ)

---

**อัปเดตล่าสุด**: 2024
**ผู้ดูแล**: Development Team

