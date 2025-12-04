# วิธีอัปโหลดรูปภาพไปยัง Supabase Storage

## ภาพรวม

คุณสามารถอัปโหลดรูปภาพไปยัง Supabase Storage ได้ 2 วิธี:
1. **อัปโหลดผ่านเว็บ Supabase Dashboard** (ง่ายที่สุด - ไม่ต้องเขียนโค้ด)
2. **อัปโหลดผ่านโค้ด** (ใช้ฟังก์ชัน `uploadPassAsset`)

## วิธีที่ 1: อัปโหลดผ่านเว็บ Supabase Dashboard (แนะนำ)

### ขั้นตอนการอัปโหลดรูปภาพผ่านเว็บ

1. **เข้าสู่ Supabase Dashboard**
   - ไปที่ [https://app.supabase.com](https://app.supabase.com)
   - เข้าสู่ระบบและเลือกโปรเจกต์ของคุณ

2. **ไปที่หน้า Storage**
   - คลิก **Storage** ในเมนูด้านซ้าย
   - ถ้ายังไม่มี bucket `pass_assets` ให้สร้างก่อน (ดูวิธีสร้างด้านล่าง)

3. **เปิด Bucket**
   - คลิกที่ bucket ชื่อ `pass_assets`
   - คุณจะเห็นไฟล์ที่อัปโหลดไว้แล้ว (ถ้ามี)

4. **อัปโหลดรูปภาพ**
   - คลิกปุ่ม **Upload file** หรือ **Upload** ด้านบน
   - เลือกรูปภาพที่ต้องการอัปโหลด (สามารถเลือกหลายไฟล์ได้)
   - รอให้อัปโหลดเสร็จ

5. **คัดลอก URL ของรูปภาพ**
   - หลังจากอัปโหลดเสร็จ ให้คลิกที่ชื่อไฟล์
   - จะเห็น URL ของไฟล์ ให้คลิกปุ่ม **Copy URL** หรือคัดลอก URL ด้วยตนเอง
   - URL จะมีรูปแบบ: 
     ```
     https://[project-id].supabase.co/storage/v1/object/public/pass_assets/[filename]
     ```
   - ตัวอย่าง:
     ```
     https://abcdefghijklmnop.supabase.co/storage/v1/object/public/pass_assets/logo.png
     ```

6. **ใช้ URL ในโค้ดหรือ config**
   - นำ URL ที่คัดลอกมาไปใช้ในโค้ดหรือตั้งค่า config ได้เลย
   - สามารถนำไปใช้ใน Wallet Config, HTML img tag, หรือที่อื่นๆ ได้ทันที
   - **ตัวอย่าง**: ถ้าใช้ใน Wallet Config ให้วาง URL นี้ในช่อง Logo URL หรือ Hero Image URL

### ข้อดีของการอัปโหลดผ่านเว็บ
- ✅ ไม่ต้องเขียนโค้ด
- ✅ เห็นรูปภาพได้ทันทีหลังอัปโหลด
- ✅ จัดการไฟล์ได้ง่าย (ลบ, เปลี่ยนชื่อ, ดูรายละเอียด)
- ✅ เหมาะสำหรับการอัปโหลดครั้งเดียวหรือไม่บ่อย
- ✅ เหมาะสำหรับการอัปโหลดรูป logo, hero image ที่ไม่ค่อยเปลี่ยน

### เมื่อไหร่ควรอัปโหลดผ่านเว็บ?
- อัปโหลดรูป logo, hero image, หรือ asset ที่ใช้ร่วมกัน
- อัปโหลดครั้งเดียวหรือไม่บ่อย
- ต้องการดูหรือจัดการไฟล์ผ่าน UI
- ไม่ต้องการเขียนโค้ดเพิ่ม

### เมื่อไหร่ควรอัปโหลดผ่านโค้ด?
- ผู้ใช้ในระบบต้องการอัปโหลดรูปภาพเอง
- อัปโหลดหลายไฟล์พร้อมกัน
- ต้องการให้ระบบจัดการอัปโหลดแบบอัตโนมัติ

### การจัดการไฟล์ใน Supabase Dashboard

หลังจากอัปโหลดไฟล์แล้ว คุณสามารถ:

1. **ดูไฟล์**: คลิกที่ชื่อไฟล์เพื่อดูรายละเอียด
2. **คัดลอก URL**: คลิกที่ชื่อไฟล์ แล้วคลิก **Copy URL**
3. **ดาวน์โหลด**: คลิกที่ชื่อไฟล์ แล้วคลิก **Download**
4. **ลบไฟล์**: คลิกที่ชื่อไฟล์ แล้วคลิก **Delete** (ระวัง: ไม่สามารถย้อนกลับได้)
5. **เปลี่ยนชื่อ**: คลิกที่ชื่อไฟล์ แล้วคลิก **Rename**

### หมายเหตุสำคัญ
- ไฟล์ที่อัปโหลดแล้วจะอยู่ใน bucket `pass_assets` ถาวร
- ถ้า bucket เป็น **Public** รูปภาพจะเข้าถึงได้ผ่าน URL โดยไม่ต้อง Authentication
- ถ้า bucket เป็น **Private** จะต้องใช้ Signed URL หรือ Service Role Key เพื่อเข้าถึง

## ขั้นตอนการตั้งค่า

### 1. สร้าง Storage Bucket ใน Supabase Dashboard (ทำครั้งแรกเท่านั้น)

**หมายเหตุ**: ถ้ามี bucket `pass_assets` อยู่แล้ว สามารถข้ามขั้นตอนนี้ได้

1. เข้าสู่ [Supabase Dashboard](https://app.supabase.com)
2. เลือกโปรเจกต์ของคุณ
3. ไปที่ **Storage** ในเมนูด้านซ้าย
4. คลิกปุ่ม **New bucket** (มักอยู่มุมบนขวาหรือกลางหน้า)
5. ตั้งค่า:
   - **Name**: `pass_assets` (ต้องใช้ชื่อนี้ตรงกับโค้ด)
   - **Public bucket**: ✅ เปิดใช้งาน (เพื่อให้สามารถเข้าถึงรูปภาพได้โดยตรงผ่าน URL)
   - **File size limit**: ตามต้องการ (เช่น 50MB)
   - **Allowed MIME types**: `image/*` หรือเว้นว่างไว้ (ถ้าต้องการให้อัปโหลดได้ทุกประเภท)
6. คลิก **Create bucket**

**หลังจากสร้างแล้ว**: Bucket จะแสดงในรายการ Storage และพร้อมใช้งานทันที

### 2. ตั้งค่า Storage Policy (ถ้ายังไม่ได้ตั้งค่า)

1. ไปที่ **Storage** > **Policies**
2. เลือก bucket `pass_assets`
3. เพิ่ม Policy ใหม่:
   - **Policy name**: Allow authenticated uploads
   - **Allowed operation**: INSERT, SELECT, UPDATE
   - **Policy definition**: 
     ```sql
     -- สำหรับการอัปโหลด
     (bucket_id = 'pass_assets'::text) AND (auth.role() = 'authenticated'::text)
     ```

หรือใช้ Policy แบบ Public:
```sql
-- Public access (ถ้า bucket เป็น public)
(bucket_id = 'pass_assets'::text)
```

## วิธีที่ 2: อัปโหลดผ่านโค้ด (Programmatic Upload)

สำหรับกรณีที่ต้องการให้ผู้ใช้หรือระบบอัปโหลดรูปภาพผ่านแอปพลิเคชัน

### ตัวอย่างที่ 1: การใช้งานพื้นฐาน

```typescript
import { uploadPassAsset } from '../services/supabaseService';

const handleImageUpload = async (file: File) => {
  try {
    const result = await uploadPassAsset(file);
    
    if (result.data) {
      // result.data คือ Public URL ของรูปภาพ
      console.log('Uploaded image URL:', result.data);
      // ใช้ URL นี้เพื่อแสดงรูปภาพหรือบันทึกในฐานข้อมูล
      return result.data;
    } else {
      console.error('Upload failed:', result.error);
      alert(`การอัปโหลดล้มเหลว: ${result.error}`);
    }
  } catch (error) {
    console.error('Error uploading image:', error);
  }
};
```

### ตัวอย่างที่ 2: ใช้งานกับ Input File

```typescript
import React, { useState } from 'react';
import { uploadPassAsset } from '../services/supabaseService';

const ImageUploadComponent: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ตรวจสอบประเภทไฟล์
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    // ตรวจสอบขนาดไฟล์ (เช่น ไม่เกิน 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์ไม่ควรเกิน 5MB');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadPassAsset(file);
      
      if (result.data) {
        setImageUrl(result.data);
        alert('อัปโหลดสำเร็จ!');
      } else {
        alert(`อัปโหลดล้มเหลว: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('เกิดข้อผิดพลาดในการอัปโหลด');
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <p>กำลังอัปโหลด...</p>}
      {imageUrl && (
        <div>
          <p>รูปภาพที่อัปโหลด:</p>
          <img src={imageUrl} alt="Uploaded" style={{ maxWidth: '300px' }} />
        </div>
      )}
    </div>
  );
};

export default ImageUploadComponent;
```

### ตัวอย่างที่ 3: ใช้กับ Drag & Drop

```typescript
import React, { useState, useCallback } from 'react';
import { uploadPassAsset } from '../services/supabaseService';

const DragDropImageUpload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadPassAsset(file);
      if (result.data) {
        setImageUrl(result.data);
      } else {
        alert(`อัปโหลดล้มเหลว: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('เกิดข้อผิดพลาดในการอัปโหลด');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  }, []);

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      style={{
        border: dragActive ? '2px dashed blue' : '2px dashed gray',
        padding: '20px',
        textAlign: 'center',
        minHeight: '200px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {uploading ? (
        <p>กำลังอัปโหลด...</p>
      ) : (
        <>
          <p>ลากและวางรูปภาพที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            style={{ marginTop: '10px' }}
          />
        </>
      )}
      {imageUrl && (
        <div style={{ marginTop: '20px' }}>
          <img src={imageUrl} alt="Uploaded" style={{ maxWidth: '300px' }} />
        </div>
      )}
    </div>
  );
};

export default DragDropImageUpload;
```

## ข้อมูลเพิ่มเติม

### ฟังก์ชัน `uploadPassAsset` ทำอะไรบ้าง?

1. **Sanitize filename**: ทำความสะอาดชื่อไฟล์ โดย:
   - ลบอักขระพิเศษ
   - แทนที่ช่องว่างด้วย underscore
   - เพิ่ม timestamp เพื่อป้องกันชื่อไฟล์ซ้ำ

2. **Upload to bucket**: อัปโหลดไฟล์ไปยัง bucket `pass_assets`

3. **Return Public URL**: คืนค่า Public URL ของรูปภาพที่อัปโหลดแล้ว

### Bucket ที่ใช้

- **Bucket name**: `pass_assets`
- **Location**: ระบุในบรรทัด 318 ของ `services/supabaseService.ts`

### ข้อควรระวัง

1. ตรวจสอบให้แน่ใจว่า bucket `pass_assets` ถูกสร้างใน Supabase Dashboard
2. ตั้งค่า Storage Policy ให้ถูกต้องเพื่อให้สามารถอัปโหลดได้
3. ถ้า bucket เป็น Public รูปภาพจะเข้าถึงได้โดยตรงผ่าน URL
4. ตรวจสอบขนาดไฟล์ก่อนอัปโหลด (แนะนำไม่เกิน 5-10MB)

### การแก้ไขปัญหา

#### ปัญหา: Upload failed - "new row violates row-level security policy"
**วิธีแก้**: ตั้งค่า Storage Policy ให้ถูกต้องใน Supabase Dashboard

#### ปัญหา: Upload failed - "Bucket not found"
**วิธีแก้**: ตรวจสอบว่าสร้าง bucket `pass_assets` ใน Supabase Dashboard แล้วหรือยัง

#### ปัญหา: รูปภาพไม่แสดง
**วิธีแก้**: 
- ตรวจสอบว่า bucket เป็น Public bucket
- ตรวจสอบ Storage Policy ว่าอนุญาต SELECT หรือไม่
 123
