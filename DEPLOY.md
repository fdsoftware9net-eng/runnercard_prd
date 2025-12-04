# คู่มือการ Deploy บน Vercel  tttt

## วิธีที่ 1: Deploy ผ่าน Vercel Dashboard (แนะนำสำหรับผู้เริ่มต้น)

### ขั้นตอนที่ 1: เตรียมโปรเจกต์

1. **ตรวจสอบว่าโปรเจกต์พร้อม deploy:**
   ```bash
   npm run build
   ```
   ถ้า build สำเร็จ แสดงว่าโปรเจกต์พร้อม deploy

2. **Commit โค้ดทั้งหมด:**
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

### ขั้นตอนที่ 2: สร้างโปรเจกต์บน Vercel

1. ไปที่ [https://vercel.com](https://vercel.com)
2. สมัครสมาชิกหรือ Login (สามารถใช้ GitHub account ได้)
3. คลิก **"Add New..."** → **"Project"**
4. Import Git Repository:
   - เลือก GitHub repository ของคุณ
   - หรือเชื่อมต่อ Git provider อื่นๆ

### ขั้นตอนที่ 3: ตั้งค่า Build Configuration

Vercel จะ auto-detect Vite project โดยอัตโนมัติ แต่ให้ตรวจสอบว่า:

- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### ขั้นตอนที่ 4: ตั้งค่า Environment Variables

**สำคัญมาก!** ต้องตั้งค่า Environment Variables ก่อน deploy:

1. ในหน้า Project Settings → **Environment Variables**
2. คลิก **"Add New"** เพื่อเพิ่มตัวแปรใหม่
3. เพิ่มตัวแปรแรก:
   
   **ตัวแปรที่ 1:**
   - **Key:** `VITE_SUPABASE_URL`
   - **Value:** ใส่ URL ของ Supabase project ของคุณ (เช่น `https://xxxxx.supabase.co`)
   - **Environment:** เลือกทั้งหมด (Production, Preview, Development)
   - คลิก **Save**

4. เพิ่มตัวแปรที่สอง:
   
   **ตัวแปรที่ 2:**
   - **Key:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** ใส่ Anon Key ของ Supabase project ของคุณ (หาได้จาก Supabase Dashboard → Settings → API)
   - **Environment:** เลือกทั้งหมด (Production, Preview, Development)
   - คลิก **Save**

**ตัวอย่างการกรอก:**
```
Key: VITE_SUPABASE_URL
Value: https://abcdefghijklmnop.supabase.co

Key: VITE_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMiwiZXhwIjoxOTMxODE1MDIyfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**หมายเหตุ:** 
- **Key** = ชื่อตัวแปร (ต้องตรงกับที่ใช้ในโค้ด)
- **Value** = ค่าจริงที่ต้องการใช้
- อย่าลืมเลือก Environment ทั้งหมด (Production, Preview, Development)

### ขั้นตอนที่ 5: Deploy

1. คลิก **"Deploy"**
2. รอให้ build เสร็จ (ประมาณ 1-3 นาที)
3. เมื่อเสร็จแล้ว จะได้ลิงก์ Production URL เช่น:
   ```
   https://your-project-name.vercel.app
   ```

### ขั้นตอนที่ 6: แชร์ลิงก์ให้คนอื่นทดสอบ

1. ไปที่หน้า **Deployments** ใน Vercel Dashboard
2. คลิกที่ deployment ล่าสุด
3. Copy Production URL
4. แชร์ลิงก์นี้ให้คนอื่นทดสอบได้เลย!

---

## วิธีที่ 2: Deploy ผ่าน Vercel CLI (สำหรับผู้ที่ชอบใช้ Command Line)

### ขั้นตอนที่ 1: ติดตั้ง Vercel CLI

```bash
npm install -g vercel
```

### ขั้นตอนที่ 2: Login

```bash
vercel login
```

### ขั้นตอนที่ 3: Deploy

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### ขั้นตอนที่ 4: ตั้งค่า Environment Variables

```bash
# ตั้งค่าสำหรับ Production
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production

# ตั้งค่าสำหรับ Preview
vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_ANON_KEY preview
```

---

## สิ่งที่ต้องตรวจสอบหลัง Deploy

### ✅ ตรวจสอบว่า Environment Variables ถูกตั้งค่าแล้ว

1. ไปที่ Vercel Dashboard → Project → Settings → Environment Variables
2. ตรวจสอบว่ามี `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` อยู่

### ✅ ตรวจสอบว่า Build สำเร็จ

1. ไปที่ Deployments
2. ดูว่า deployment ล่าสุดมีสถานะ "Ready" (สีเขียว)

### ✅ ทดสอบ Application

1. เปิดลิงก์ Production URL
2. ตรวจสอบว่า:
   - หน้าเว็บโหลดได้
   - สามารถ Login ได้
   - ฟีเจอร์ต่างๆ ทำงานได้ปกติ

---

## การจัดการ Environment Variables

### สำหรับ Production
- ใช้ค่าจริงของ Supabase Production

### สำหรับ Preview (Pull Request)
- สามารถใช้ค่าเดียวกันกับ Production หรือใช้ Test Environment

### สำหรับ Development
- ใช้ค่าของ Supabase Development

---

## การอัพเดทโค้ด (Deploy ใหม่หลังจากแก้ Code)

### วิธีที่ 1: Auto Deploy (แนะนำ - ง่ายที่สุด)

ถ้าคุณเชื่อมต่อ Git repository กับ Vercel แล้ว:

1. **แก้ code ในเครื่องของคุณ**
2. **Commit และ Push ไปที่ GitHub:**
   ```bash
   git add .
   git commit -m "Update: คำอธิบายการเปลี่ยนแปลง"
   git push origin main
   ```
3. **Vercel จะ deploy อัตโนมัติ:**
   - ไปที่ Vercel Dashboard → Deployments
   - จะเห็น deployment ใหม่กำลัง build
   - รอประมาณ 1-3 นาที
   - เมื่อเสร็จแล้ว Production URL จะอัพเดทเป็นเวอร์ชันใหม่ทันที

**หมายเหตุ:**
- ถ้า push ไปที่ `main` branch → จะ deploy ไปที่ **Production** อัตโนมัติ
- ถ้า push ไปที่ branch อื่น → จะได้ **Preview URL** แยก
- ถ้าเปิด Pull Request → จะได้ **Preview URL** สำหรับ PR นั้นๆ

### วิธีที่ 2: Manual Deploy ผ่าน Vercel Dashboard

1. ไปที่ Vercel Dashboard → Project ของคุณ
2. ไปที่หน้า **Deployments**
3. คลิก **"..."** (เมนู) ที่ deployment เก่า
4. เลือก **"Redeploy"**
5. เลือก branch และ commit ที่ต้องการ
6. คลิก **"Redeploy"**

### วิธีที่ 3: Deploy ผ่าน Vercel CLI

```bash
# Deploy preview
vercel

# Deploy to production
vercel --prod
```

### วิธีที่ 4: Trigger Deploy ใหม่จาก GitHub

1. ไปที่ GitHub repository
2. เปิด **Actions** tab (ถ้ามี GitHub Actions)
3. หรือแค่ push code ใหม่ไปที่ GitHub
4. Vercel จะ detect และ deploy อัตโนมัติ

---

### สรุป: วิธีที่ง่ายที่สุด

**แค่ Push Code ไป GitHub แล้ว Vercel จะ Deploy อัตโนมัติ!**

```bash
git add .
git commit -m "Update code"
git push origin main
```

✅ **เสร็จแล้ว!** Vercel จะ deploy ให้อัตโนมัติภายใน 1-3 นาที

---

## การตั้งค่า Custom Domain (ถ้าต้องการ)

1. ไปที่ Project Settings → Domains
2. เพิ่ม domain ที่ต้องการ
3. ตั้งค่า DNS ตามที่ Vercel แนะนำ

---

## Troubleshooting

### ❌ Build ล้มเหลว

**ตรวจสอบ:**
- Environment Variables ถูกตั้งค่าครบหรือยัง
- `package.json` มี build script หรือไม่
- Dependencies ติดตั้งครบหรือไม่

### ❌ หน้าเว็บไม่โหลด

**ตรวจสอบ:**
- Environment Variables ถูกตั้งค่าหรือไม่
- Supabase URL และ Key ถูกต้องหรือไม่
- Console ใน Browser มี error อะไรหรือไม่

### ❌ Routing ไม่ทำงาน

**ตรวจสอบ:**
- `vercel.json` มี rewrites rule สำหรับ SPA หรือไม่ (มีอยู่แล้วในโปรเจกต์นี้)

---

## ลิงก์ที่เป็นประโยชน์

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html#vercel)
- [Vercel Dashboard](https://vercel.com/dashboard)

---

## หมายเหตุสำคัญ

⚠️ **อย่าลืม:**
- อย่า commit `.env` file ขึ้น Git
- ตั้งค่า Environment Variables ใน Vercel Dashboard
- ตรวจสอบว่า Supabase URL และ Key ถูกต้อง
- ทดสอบหลัง deploy ทุกครั้ง

Deploy

