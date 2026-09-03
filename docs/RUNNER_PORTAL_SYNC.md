# เชื่อมต่อกับ RunnerPortal — ส่งการแก้ไขข้อมูลนักวิ่ง

งานบางแสน10 ปี 2026 · endpoint `POST /v1/registrations/edits`

เมื่อผู้จัดแก้ข้อมูลนักวิ่งในหน้า Runner Management ของระบบนี้ ระบบจะส่งการแก้ไขนั้น
ไปให้ RunnerPortal ด้วย มิฉะนั้นรายชื่อผู้เข้าแข่งขันฝั่งเขาจะเก่าและหน้างาน expo จะใช้ไม่ได้

ตัวเชื่อมคือ **`event` + `year` + เลข BIB** ไม่ใช่ id ภายในของระบบเรา

---

## 1. ภาพรวม

```
admin กด Save ในหน้า Runner Management
      │
      ├─► UPDATE runners
      │        └─► [trigger] INSERT ลง runner_portal_sync_queue   ← outbox
      │
      └─► เรียก Edge Function runner-portal-sync (best-effort)
               ├─ รวมรายการที่ค้าง → แปลงฟิลด์ → สร้าง JSON ครั้งเดียว
               ├─ เซ็น HMAC-SHA256 (timestamp/nonce ใหม่ทุกครั้ง, Idempotency-Key เดิม)
               ├─ POST /v1/registrations/edits
               └─ เขียนผลรายคนกลับลงคิว
```

การบันทึกเข้าคิวอยู่ใน transaction เดียวกับการแก้ข้อมูล ต่อให้ปิดเบราว์เซอร์ เน็ตหลุด
หรือมีโค้ดเส้นทางอื่นมาแก้ตาราง `runners` ในอนาคต รายการก็ไม่หาย
Edge Function ทำหน้าที่ระบายคิวอย่างเดียว จึงเรียกซ้ำกี่ครั้งก็ปลอดภัย

**ไฟล์ที่เกี่ยวข้อง**

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase_schema_update_v15_add_runner_portal_sync.sql` | ตาราง 3 ตัว + trigger + ฟังก์ชันจองงาน |
| `supabase_schema_update_v16_add_nationality_to_runner_portal_sync.sql` | เพิ่ม `nationality` เข้า trigger (รันหลัง v15) |
| `supabase/functions/_shared/rpSign.ts` | canonical string + ลายเซ็น HMAC |
| `supabase/functions/_shared/rpMapping.ts` | แปลงค่าจากคอลัมน์ของเราเป็นฟิลด์ของ RunnerPortal |
| `supabase/functions/runner-portal-sync/index.ts` | ระบายคิว ตีความคำตอบ |
| `services/runnerPortalService.ts` | ตัวเรียกฝั่งหน้าเว็บ |
| `components/RunnerTable.tsx` | เรียก sync หลัง save + แสดงผลและคำเตือน |

---

## 2. ตัวแปรสภาพแวดล้อม (ตั้งใน Supabase Edge Function secrets)

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `RP_KEY_ID` | `kadn-wallet-bs10` | |
| `RP_SECRET` | *(RunnerPortal ส่งให้แยกต่างหาก)* | **ห้ามใส่ใน git เด็ดขาด** |
| `RP_BASE_URL` | `https://runner-portal-partner-api-382283506828.asia-southeast3.run.app` | มีค่า default อยู่แล้ว |
| `RP_EVENT` | `bangsaen10` | |
| `RP_YEAR` | `2026` | |
| `RP_DRY_RUN` | `true` / `false` | **default = `true`** ต้องตั้ง `false` เองตอน go-live |
| `RP_ENABLED` | `true` / `false` | ปิดการส่งชั่วคราวโดยไม่สูญข้อมูล (รายการยังค้างในคิว) |
| `RP_MAX_BATCH` | `200` | ขนาดชุดต่อคำขอ (RunnerPortal จำกัดที่ 5,000) |

```bash
supabase secrets set RP_KEY_ID=kadn-wallet-bs10 RP_SECRET=... RP_EVENT=bangsaen10 RP_YEAR=2026 RP_DRY_RUN=true
```

---

## 3. ขั้นตอนติดตั้ง

1. รัน `supabase_schema_update_v15_add_runner_portal_sync.sql` แล้วตามด้วย `..._v16_...sql` ใน Supabase SQL Editor
2. ตั้ง secrets ตามตารางข้างบน
3. `supabase functions deploy runner-portal-sync`
4. **ตรวจลายเซ็นก่อน** เปิด `GET https://<project>.supabase.co/functions/v1/runner-portal-sync`
   ต้องได้ `"signing": "verified"` (เป็นการคำนวณตัวอย่างในเอกสาร §2.3/§2.4 ซ้ำ ใช้ secret ตัวอย่าง ไม่ใช่ของจริง)
   ถ้าได้ `FAILED` **อย่าเพิ่งทำต่อ** — ปัญหาการเชื่อมต่อส่วนใหญ่จบที่ขั้นนี้
5. **ยิงจริง 1 ครั้ง** `POST { "action": "probe" }` (เขียนข้อมูลเป็น `dry_run` เสมอ)
   - `403 authority_moved` = ✅ **ถูกต้อง** key ใช้ได้ ลายเซ็นถูก สิทธิ์ถูก แต่ยังไม่เปิดช่วงเวลาให้เขียน
   - `403 forbidden` = ❌ ตั้งค่า key ผิด ต้องแจ้ง RunnerPortal
   - `401` = ลายเซ็น เวลา หรือ secret มีปัญหา (ตรวจนาฬิกาเซิร์ฟเวอร์ด้วย — ลายเซ็นมีอายุ ±300 วินาที)
6. เมื่อ RunnerPortal เปิดช่วงเวลาให้แล้ว ทดสอบด้วย `RP_DRY_RUN=true` ก่อนเสมอ
7. go-live: ตั้ง `RP_DRY_RUN=false`

---

## 4. ฟิลด์ที่ส่ง

| คอลัมน์ของเรา | ฟิลด์ RunnerPortal | การแปลง |
|---|---|---|
| `first_name` | `first_name` | trim |
| `last_name` | `last_name` | trim |
| `gender` | `gender` | `male`→`M`, `female`→`F` |
| `shirt` | `shirt_size` | ดึงเฉพาะไซซ์: `"VIP L = 40"` → `"L"`, `"M (40*27)"` → `"M"` |
| `nationality` | `nationality` | ส่งตามที่มี ไม่มีการแปลง (RunnerPortal ไม่ normalize เป็น ISO code) |
| เลขบัตรที่ admin พิมพ์ | `id_card_number` | ส่งแยกทันที ดูหัวข้อ 6 |

**ส่งเฉพาะฟิลด์ที่เปลี่ยนจริง** ฟิลด์ที่ไม่ได้ส่ง RunnerPortal จะไม่แตะต้อง

**ไม่ส่ง `null` เลย** ระบบนี้ไม่มีกรณีที่ต้องล้างค่า และ `null` มีความหมายว่า "ล้างคอลัมน์นั้น"
ถ้าในอนาคตต้องล้างค่าจริง ๆ ต้องเพิ่มโค้ดโดยเจตนา ไม่ใช่ให้หลุดไปโดยบังเอิญ

### รูปแบบ `shirt` ต่างกันในแต่ละงาน

ข้อมูลบางแสน10 2026 เก็บเป็น `"VIP L = 40"` (ไซซ์ + รอบอก) ส่วนบางแสน21 2025 เก็บเป็น
`"M (40*27)"` ตัวแปลงรองรับทั้งสองแบบ และตัดคำว่า `VIP` ทิ้งเพราะเป็นชื่อรุ่นเสื้อ ไม่ใช่ไซซ์

จากข้อมูลจริง 11,550 คน มี **751 คนที่มีไซซ์เสื้อ** ส่วนอีก 10,790 คนเป็น `N/A` และ 9 คนเป็นค่าว่าง
สองกลุ่มหลังจะไม่ส่งฟิลด์นี้เลย ซึ่งถูกต้องแล้ว

**ค่าที่แปลงไม่ได้จะไม่ถูกส่ง** เช่น `shirt = "N/A"` หรือ `gender` ที่ไม่ใช่ male/female
เพราะ RunnerPortal จะ **ปฏิเสธทั้งรายการ** ถ้าได้ค่าที่อ่านไม่ออก การตัดเฉพาะฟิลด์นั้นทิ้ง
ทำให้ฟิลด์อื่นในการแก้ไขครั้งเดียวกันยังผ่านไปได้ และเหตุผลจะขึ้นให้ admin เห็นเสมอ
(ดู `runner_portal_sync_queue.dropped_fields`)

### ฟิลด์ที่ไม่ส่ง

- `bib` — เป็นกุญแจ ไม่ใช่ค่า ดูหัวข้อ 5
- `age_category`, `race_kit`, `block`, `wave_start`, `note`, `top50` ฯลฯ —
  RunnerPortal ไม่รับเขียน หรือไม่มีฟิลด์คู่กัน
- `registration_status` — RunnerPortal มี (`registered`/`cancelled`/`transferred`/`deferred`/`no_show`)
  แต่ **ระบบเราไม่มีคอลัมน์นี้** ถ้าผู้จัดต้องยกเลิกนักวิ่งผ่านระบบนี้ ต้องเพิ่มคอลัมน์ก่อน
- `email`, `phone`, `date_of_birth`, `first_name_th`, `last_name_th`, `category`,
  `distance_meters`, `emergency_contact_name`, `emergency_contact_phone`, `city`, `province` —
  RunnerPortal รับได้ (ยืนยันจาก `writable_fields` ที่ตอบกลับจริง) **แต่ระบบเราไม่มีข้อมูลนี้เลย**
  ไม่มีคอลัมน์ ไม่มีช่องในฟอร์ม พักไว้ก่อนตามที่ตกลง (3 ก.ย. 2569) — จะเพิ่มได้ต่อเมื่อมีคนตัดสินใจ
  เก็บข้อมูลเหล่านี้ในระบบก่อน
- `wallet_pass_id` — เรามีข้อมูลอยู่แล้ว (`google_wallet_pass_id`) แต่ยังไม่ส่ง เพราะที่มาของค่า
  คือระบบสร้าง pass ไม่ใช่ admin แก้ไข ต้องคิด flow แยกต่างหาก (ดู `walletpassidTH.md`) — พักไว้ก่อน

---

## 5. ถ้า admin แก้เลข BIB

RunnerPortal **ไม่ยอมให้แก้ `bib_number` ผ่าน API** เพราะเป็นกุญแจที่ใช้ระบุตัวคน
และการย้าย BIB จริงต้องแจ้งฝ่ายจับเวลาก่อนปล่อยตัว มิฉะนั้นนักวิ่งคนนั้นจะไม่ถูกจับเวลาเลย

ระบบเราจึง**ไม่ส่งการแก้ไขนั้น** ทั้งชุด — จะส่งด้วย BIB เก่าหรือ BIB ใหม่ก็เขียนข้อมูลผิดคนทั้งคู่
แถวจะถูกบันทึกเป็น `status = 'skipped'` พร้อมเหตุผล และหน้าจอจะขึ้นเตือน admin ให้แจ้ง
เจ้าหน้าที่ RunnerPortal โดยตรง

---

## 6. เลขบัตรประชาชน / พาสปอร์ต

ตาราง `runners` เก็บแค่ `id_card_hash` **ไม่เคยเก็บเลขดิบ** เลขจริงมีอยู่แค่ตอนที่ admin
พิมพ์ในฟอร์มเท่านั้น

การใส่เลขนั้นลง outbox จะเท่ากับกลับไปเก็บเลขบัตร plaintext ในฐานข้อมูล ซึ่งเป็นสิ่งที่
ระบบนี้ตั้งใจไม่ทำ **เลขบัตรจึงถูกส่งแยกทันทีในคำขอของตัวเอง และไม่ถูกเก็บไว้ที่ไหนเลย**

ผลที่ตามมาที่ต้องรู้: ถ้าคำขอนั้นล้มเหลว **retry อัตโนมัติไม่ได้** เพราะไม่มีค่าให้ส่งซ้ำ
หน้าจอจะบอก admin ให้กดบันทึกใหม่อีกครั้ง (ฟิลด์อื่นถูกส่งไปแล้วตามปกติ)
แถวบันทึกที่เหลือไว้ในคิวจะระบุแค่ว่า "เลขบัตรเปลี่ยน" ไม่เก็บว่าเปลี่ยนเป็นอะไร

ถ้าต้องการให้ retry ได้ด้วย ต้องเพิ่มการเข้ารหัสค่าในตาราง ซึ่งเป็นงานแยกและต้องตัดสินใจเรื่อง PDPA ก่อน

---

## 7. การอ่านคำตอบ

| ได้รับ | ระบบทำ | ต้องมีคนทำอะไรไหม |
|---|---|---|
| `200` + `updated` / `unchanged` | `status = 'sent'` | ไม่ต้อง |
| `200` + `not_found` | `status = 'failed'` | ตรวจว่าเลข BIB ถูกไหม |
| `200` + `ambiguous_bib` | `status = 'failed'` | **แจ้ง RunnerPortal** ผิดปกติ |
| `200` + `rejected` | `status = 'failed'` พร้อม `reason` | แก้ที่ต้นทางแล้วบันทึกใหม่ |
| `403 authority_moved` | ตั้ง flag หยุดส่งถาวร ทุกแถวเป็น `halted` | **ไม่ต้องทำอะไร** — จบการเชื่อมต่อตามที่ตกลง ไม่ใช่ error |
| `403 forbidden` | `failed` ไม่ retry | ต้องแก้ค่า key แล้วแจ้ง RunnerPortal |
| `400` / `409` | `failed` ไม่ retry | เป็นบั๊กฝั่งเรา ส่งซ้ำแบบเดิมก็ได้ผลเดิม |
| `429` | รอตาม `Retry-After` แล้วส่งชุดเดิมซ้ำ | ไม่ต้อง |
| `500` / `503` / เน็ตหลุด | ส่งชุดเดิมซ้ำ (บอดี้เดิม key เดิม) ถอยเวลาเพิ่มขึ้นเรื่อย ๆ สูงสุด 8 ครั้ง | ถ้าครบ 8 ครั้งแล้วยังไม่ได้ ต้องมีคนดู |

> **`authority_moved` กับ `forbidden` ต้องไม่สับสนกัน**
> อันแรกแปลว่า "เลิกส่งได้แล้ว ตามที่ตกลงกัน" อันหลังแปลว่า "key ตั้งค่าผิด ต้องมีคนแก้"
> ระบบเก็บสองอย่างนี้คนละที่ และแสดงผลคนละสีโดยตั้งใจ

### Idempotency

ทุกคำขอมี header `Idempotency-Key` ที่ผูกกับ batch หนึ่งชุด
เมื่อ retry ระบบจะส่ง **บอดี้เดิมทุกไบต์และ key เดิม** (เก็บไว้ที่ `runner_portal_sync_batch.request_body`)
RunnerPortal จะตอบรายงานเดิมกลับมาโดยไม่แก้ข้อมูลซ้ำ

ส่วนลายเซ็นตรงกันข้าม — ต้องสร้าง **timestamp, nonce และลายเซ็นใหม่ทุกครั้ง**
เพราะ nonce ใช้ซ้ำไม่ได้ และ timestamp มีอายุ ±300 วินาที

---

## 8. ตรวจสอบสถานะ

หน้า Runner Management จะขึ้น banner เองเมื่อ:
- RunnerPortal ปิดรับแล้ว (`authority_moved`)
- key ถูกปฏิเสธ (`403 forbidden`)
- อยู่ในโหมด `dry_run`
- มีรายการที่ส่งไม่สำเร็จหรือไม่ได้ส่ง

หรือเรียกตรง ๆ:

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/runner-portal-sync" \
  -H "Authorization: Bearer <admin JWT หรือ service role key>" \
  -H "Content-Type: application/json" \
  -d '{"action":"status"}'
```

`action` ที่รองรับ: `drain` · `status` · `send-id-card` · `probe` · `verify`

---

## 9. เวลาจะแจ้งปัญหาไปที่ RunnerPortal

ส่งไปด้วยเสมอ: `request_id` (เก็บไว้ที่ `runner_portal_sync_batch.request_id`) ·
เวลาเป็น UTC · endpoint ที่เรียก · key id

**ห้ามส่ง secret ไปให้เขาเด็ดขาด** ถ้าสงสัยว่า secret รั่ว แจ้งทันที เขาจะยกเลิกให้

---

## 10. เรื่องที่ยังค้างกับ RunnerPortal

1. **IP allowlist** — เอกสารข้อ 11 ขอ "ช่วง IP ของเซิร์ฟเวอร์ที่จะเรียก API"
   แต่ Supabase Edge Functions **ไม่มี egress IP คงที่** ต้องถามเขาว่าบังคับหรือไม่
   ถ้าบังคับ ต้องหา proxy ที่มี static IP มาคั่น
2. **ค่า `shirt_size` ที่เขารับ** — ข้อมูลเรามี `2XS` และ `3XS` ด้วย เอกสารไม่ได้ระบุรายการค่าที่รับ
   ถ้าเขาปฏิเสธ จะเห็นเป็น `rejected` พร้อมเหตุผลรายคน แล้วค่อยตกลงตาราง mapping กัน
   (ทดสอบจริงกับ `2XL` แล้วผ่าน)
3. **วันตัดโอน** (cutover) — เอกสาร `walletpassidTH.md` ระบุว่า 11 ก.ย. จะแก้ได้เฉพาะ
   `wallet_pass_id` และ 13 ก.ย. 00:00 ปิดทั้งหมด ยังไม่ได้ทำส่วนนี้
