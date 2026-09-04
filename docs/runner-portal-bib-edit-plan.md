# แผนงาน: รองรับ "สัญญา BIB แบบใหม่" ของ RunnerPortal

งาน `bangsaen10` ปี `2026` · endpoint เดิม `POST /v1/registrations/edits` · จับคู่ด้วย `bib`
อ้างอิง: เอกสาร "สัญญา BIB แบบใหม่" (Runner Portal, ปรับปรุง 4 ก.ย. 2569) + [`kadnwalletapi/api-reference.md`](./kadnwalletapi/api-reference.md) §9

---

## 0. สรุป scope ที่จะทำ

| ของใหม่ | ทำ | หมายเหตุ |
|---|---|---|
| เปลี่ยนเลข BIB (`bib_old` + `bib_new`) | ✅ | ผู้ใช้แก้ช่อง Bib Number ในหน้า Edit Runner |
| สร้างรายการใหม่ (`bib_old:""` + `bib_new` + ชื่อ) | ✅ | spare runner (มีชื่อ ไม่มี BIB) → ผู้ใช้ใส่ BIB → push ไปสร้างฝั่ง RP |
| 10 ช่องใหม่จากไฟล์ผู้สมัคร | ✅ ครบ 10 | race_kit, row, row_no, shirt_type, shirt, age_category, block, wave_start, pre_order, qr |
| ต้องมี scope `registrations:bib` บน key `kadn-wallet-bs10` | RP เปิดให้ (D0) | ตอนนี้ยังปิด |

**ไม่ทำ:** แยกแยะ typo vs reassignment ฝั่งจับเวลา — เราส่งตามที่ผู้ใช้แก้ ตามที่ตกลง (ข้อ 6)

---

## 1. ตาราง mapping สุดท้าย

### ฟิลด์ปกติ (writable_fields)
| คอลัมน์เรา | ฟิลด์ RP | การแปลง |
|---|---|---|
| `first_name` | `first_name` | trim · ว่าง = ไม่ส่ง |
| `last_name` | `last_name` | trim · ว่าง = ไม่ส่ง |
| `gender` | `gender` | `male`→`M`, `female`→`F` · อื่น = ไม่ส่ง |
| `nationality` | `nationality` | trim · ว่าง = ไม่ส่ง |
| `bib` | `bib_old` / `bib_new` | ดูข้อ 2 · ห้ามช่องว่างข้างใน ห้ามจุลภาค ยาว ≤ 32 |

### 10 ช่องใหม่ (writable_raw_fields) — ส่งเป็น string เสมอ
| คอลัมน์เรา | ช่อง RP | การแปลง |
|---|---|---|
| `race_kit` | `ticket_type` | trim |
| `row` | `ROW` | trim |
| `row_no` | `row_no` | trim |
| `shirt_type` | `shirt` | trim (เสื้อปกติ ทุกคนได้) |
| `shirt` | `VIP T-Shirt` | trim, **ส่งดิบตามที่เก็บ** ไม่ตัดเหลือไซซ์ (เสื้อ VIP เฉพาะบางคน) |
| `age_category` | `age_category` | trim |
| `block` | `Block` | trim |
| `wave_start` | `Start time` | trim |
| `pre_order` | `Pre-order` | normalize (ตัด `[]`, ช่องว่าง, uppercase) → `YES` ⇒ `"pre-order"` · อื่นทั้งหมด ⇒ `null` |
| `qr` | `QR` | trim |

**กติกาค่าว่างของ raw fields:** ค่าที่ trim แล้วเป็น `""` หรือ `N/A` / `n/a` / `-`
→ ตอน **แก้ไข** ส่ง `null` (ล้างค่าฝั่งเขา) · ตอน **สร้างใหม่** ไม่ส่งช่องนั้น

### เลิกทำ
- **ลบ mapping `shirt` → `shirt_size` ทิ้ง** — สัญญาใหม่บอกชัดว่า `shirt_size` เป็นคนละช่อง
  (ช่องที่ RaceSmart อ่าน) และ DB เราไม่มีคอลัมน์ `shirt_size` เราส่งได้แค่ `shirt` + `shirt_type`

---

## 2. ตรรกะ trigger `rp_enqueue_runner_edit()` (migration v17)

`v_bib_old = btrim(old.bib)` · `v_bib_new = btrim(new.bib)` · `v_changes` = คอลัมน์ที่ watch แล้วเปลี่ยน

| เงื่อนไข | `op` | `bib` (คีย์คิว) | `status` | ส่งอะไร |
|---|---|---|---|---|
| ไม่มีอะไรเปลี่ยน และ BIB ไม่ขยับ | — | — | — | ไม่ enqueue |
| `v_bib_old = ''` และ `v_bib_new = ''` (มี field อื่นเปลี่ยน) | — | `''` | `skipped` | ไม่มี BIB = ไม่มีคีย์จับคู่ |
| `v_bib_old = ''` และ `v_bib_new <> ''` | `create` | `v_bib_new` | `pending` | `bib_old:""`, `bib_new`, + **snapshot ทุกช่องที่มีค่าใน `new`** |
| `v_bib_old <> ''` และ `v_bib_new = ''` | — | `v_bib_old` | `skipped` | ล้าง BIB ผ่าน API ไม่ได้ (`bib_new_required`) — ให้คนตรวจ |
| `v_bib_old <> ''` และ `v_bib_new <> ''` และต่างกัน | `move` | `v_bib_new` | `pending` | `bib_old`, `bib_new`, + `v_changes` |
| BIB เท่าเดิม (ไม่ว่าง) และมี field เปลี่ยน | `edit` | `v_bib_new` | `pending` | `bib_number`, + `v_changes` (เหมือนเดิมทุกประการ) |

การเปลี่ยนแปลงจาก v15/v16:
- **เพิ่มคอลัมน์ที่ watch**: `shirt_type, race_kit, row, row_no, age_category, block, wave_start, pre_order, qr` (เดิมมี `first_name, last_name, gender, shirt, nationality`)
- **BIB เปลี่ยน → ไม่ `skipped` อีกต่อไป** แต่ enqueue เป็น `move`
- **เพิ่ม case `create`** สำหรับ spare runner
- **เพิ่มคอลัมน์ `op`** ใน `runner_portal_sync_queue`: `text not null default 'edit' check (op in ('edit','create','move'))`
- กันพลาดข้อ 01 ของ RP: trigger ตัดสิน `create` จาก `old.bib` จริงในแถว ไม่ใช่จากค่าที่ serialize มา — `bib_old:""` จะถูกส่งก็ต่อเมื่อแถวนั้น**ไม่มี BIB มาก่อนจริง ๆ** เท่านั้น

`changes` ตอน `create` = ทุกคอลัมน์ mapped ที่ `new.<col>` ไม่ว่าง เก็บเป็น `{old:null, new:<value>}`
(ไม่ใช่แค่ diff) เพื่อให้ฝั่ง RP ได้ข้อมูลครบตอนสร้าง

---

## 3. งานแยกตามไฟล์

### 3.1 `supabase_schema_update_v17_add_bib_edit_to_runner_portal_sync.sql` (ใหม่)
- `alter table runner_portal_sync_queue add column if not exists op text not null default 'edit' check (...)`
- `create or replace function rp_enqueue_runner_edit()` ตามตรรกะข้อ 2
- ปลอดภัยรันซ้ำ · รันหลัง v15/v16 · rows เดิมในคิวไม่ถูกแตะ

### 3.2 `supabase/functions/_shared/rpMapping.ts`
- `WATCHED_COLUMNS` → 14 คอลัมน์
- เพิ่มตาราง `RAW_FIELD_MAP` (คอลัมน์เรา → ชื่อช่อง RP) + ฟังก์ชัน `mapRawText()` (trim, `N/A`→null)
- เพิ่ม `mapPreOrder()`
- ลบ `mapShirtSize()` + การเรียก `take('shirt','shirt_size',...)`
- `mapRunnerChanges(changes, op)` — รับ `op` เพิ่ม:
  - คืน `{ fields, dropped, bibPair? }` โดย `bibPair = { bib_old, bib_new }` เมื่อ `op ∈ {create, move}`
  - `create`: `bib_old = ''`; ต้องมีชื่ออย่างน้อย 1 ช่อง มิฉะนั้น mark ทั้ง record เป็น drop เหตุผล `name_required`
  - ตรวจรูปแบบ `bib_old`/`bib_new` (≤32, ไม่มีช่องว่าง/จุลภาค) — ผิด = drop record
  - raw fields: ตอน `create` ข้ามค่าว่าง/`N/A`; ตอน `edit`/`move` ค่าว่าง/`N/A` = ส่ง `null`
- `mergeChanges()` — เพิ่มพารามิเตอร์/ผลลัพธ์ให้บอก op ที่แรงที่สุดของกลุ่ม (`create > move > edit`)

### 3.3 `supabase/functions/runner-portal-sync/index.ts`
- `QueueRow` + `rp_claim_sync_rows` result: อ่านคอลัมน์ `op`
- `buildBatch()`:
  - group ตาม `bib` (คือ `bib_new` สำหรับ create/move) · merge changes · หา op ของกลุ่ม
  - สร้าง record:
    - `edit` → `{ bib_number, ...fields }` (เดิม)
    - `move` → `{ bib_old, bib_new, ...fields }`
    - `create` → `{ bib_old: "", bib_new, ...fields }` (ถ้าไม่มีชื่อ → settle rows เป็น `failed` reason `name_required`, ไม่ส่ง)
  - **ตรวจ collision ข้าม record ในชุดเดียว**: รวบรวมทุก `bib_number`/`bib_old`/`bib_new` ถ้าเลขซ้ำข้าม record → เก็บ record แรกไว้ในชุดนี้ ปล่อย record ที่ชนกลับเป็น `pending` (คืน claim) ให้ drain รอบหน้าส่งแยก + ใส่ note `duplicate_bib_in_payload ป้องกันไว้ก่อน`
- `applyResults()`:
  - รองรับ `outcome: "created"` → `status='sent'`, `summary.created++`
  - `updated` ที่มี bib move → `summary.bib_changed++` (อ่านจาก `changed` มี `bib_number` หรือจาก counter `bib_changed` ระดับ body)
  - อ่าน counter ระดับ body: `created`, `bib_changed`, `bib_conflicts` ใส่ลง summary
  - reason ใหม่ใน `describeOutcome()`: `bib_old_not_found`, `ambiguous_bib_old`, `bib_new_conflict`, `bib_values_empty`, `bib_new_required`, `bib_contract_conflict`, `scope_required:registrations:bib`, `name_required`, `raw_value_not_scalar:*`
  - `writable_raw_fields`: ถ้าส่ง raw field ไปแล้วชื่อไม่อยู่ในลิสต์นี้ → เก็บ note "อาจ mapping ผิด/ยังไม่ได้สิทธิ์"
- `sendBatch()`:
  - ข้อความ `403 forbidden` เพิ่มคำว่า `registrations:bib`
  - `409` + `duplicate_bib_in_payload` → note ชัดเจน (ไม่ retry, เป็นบั๊กฝั่งเรา — ควรไม่เกิดเพราะ pre-check)
- **เพิ่ม `action: "test-edit"`** (admin-auth, บังคับ `dry_run:true` เสมอ): รับ `{ records: [...] }` ยิง 1 คำขอ คืน response ดิบ — ใช้ทำ D1–D7 โดยไม่แตะคิว

### 3.4 `services/runnerPortalService.ts` + types
- `RunnerPortalOutcome` เพิ่ม `'created'`
- `RunnerPortalDrainSummary` เพิ่ม `created`, `bib_changed`, `bib_conflicts`
- `describeDrainSummary()` เพิ่มบรรทัด: `สร้างใหม่ N` · `ย้าย BIB N` · `BIB ปลายทางชนกัน N`
- เพิ่ม `testEditRunnerPortal(records)` เรียก `action:"test-edit"` (ใช้ตอนทดสอบ D1–D7)

### 3.5 `components/RunnerTable.tsx`
- `syncEditToRunnerPortal()`: **ลบคำเตือน** "การเปลี่ยนเลข BIB ไม่ได้ถูกส่ง..." — ตอนนี้ส่งได้แล้ว
  - ถ้า `bibChanged` → note กลาง ๆ: "ส่งการเปลี่ยน BIB ไป RunnerPortal แล้ว"
- แสดง `created` / `bib_changed` ผ่าน `describeDrainSummary()`
- banner `authority_moved` / `403 forbidden` / `dry_run` คงเดิม

### 3.6 เอกสาร
- อัปเดต [`RUNNER_PORTAL_SYNC.md`](./RUNNER_PORTAL_SYNC.md) §4 (ตารางฟิลด์) + §5 (BIB) ให้ตรงของใหม่
- [`runner-portal-fields-request.md`](./runner-portal-fields-request.md) → ใช้เป็นฐานตอบยืนยัน 7 ข้อกลับ RP

---

## 4. ลำดับ deploy + ทดสอบ (ตาม D0–D10 ของ RP)

| # | ใคร | ทำอะไร | ผ่านเมื่อ |
|---|---|---|---|
| — | เรา | merge โค้ด 3.2–3.5 (ยังไม่กระทบ เพราะ scope ปิด + `RP_DRY_RUN=true`) | build ผ่าน |
| — | เรา | รัน `..._v17_...sql` ใน Supabase SQL Editor | ไม่ error |
| — | เรา | `supabase functions deploy runner-portal-sync` | — |
| — | เรา | เปิด `GET .../runner-portal-sync` | `"signing":"verified"` |
| — | เรา | ตอบยืนยัน 7 ข้อ + แจ้งเลข BIB เจ้าหน้าที่ + วันเริ่ม D1 กลับ RP | — |
| D0 | RP | เปิด `registrations:bib` + 10 ช่องบน key | — |
| D1 | เรา | `test-edit` แก้ 1 รายการด้วย `bib_number` เดิม | `writable_raw_fields` ครบ 10 ชื่อ |
| D2 | เรา | `test-edit` `bib_old = bib_new` = `30930` + `shirt_type` | `updated:1 · created:0 · bib_changed:0` |
| D3 | เรา | `test-edit` `bib_number: 30930` + ทั้ง 10 ช่อง | `changed` ครบ 10 · `ignored` ว่าง |
| D4 | 2 ฝ่าย | `test-edit` `shirt_type:"TEST-ปกติ"` + `shirt:"TEST-VIP"` (bib `30930`) | `changed` มีทั้ง `shirt` และ `VIP T-Shirt` |
| D5 | เรา | `test-edit` `bib_old: 30930` · `bib_new` = เลขว่างที่ RP แจ้ง | `bib_changed:1` |
| D6 | เรา | `test-edit` `bib_new` = BIB คนอื่น | `bib_new_conflict · bib_conflicts:1` |
| D7 | เรา | `test-edit` `bib_old:""` · `bib_new` = เลขว่าง · ชื่อ-สกุล | `created:1` |
| D8 | เรา | แก้ BIB จนท.จริงในหน้า UI (dry_run ปิดเฉพาะรายการนี้) | `updated:1` ในคิว |
| D9 | RP | ตรวจใน DB เขา | เห็นค่าครบ 10 ช่อง |
| D10 | 2 ฝ่าย | ตั้ง `RP_DRY_RUN=false` แล้วปล่อย drain ชุดจริง | `rejected:0 · ignored` ว่างทุกรายการ |

หน้าต่างปิด **13 ก.ย. 2569 00:00 (+07)** · ตั้งเป้าเขียวทั้งเส้นภายใน **8 ก.ย.**

---

## 5. ยืนยันกลับ RunnerPortal (หัวข้อ 8 ของสัญญา)

1. ✅ ยืนยันตาราง 10 ช่อง (ข้อ 1) — `shirt_type→shirt`, `shirt→VIP T-Shirt`
2. ✅ ยืนยันแปลง `pre_order`: `[YES]`→`"pre-order"`, อื่นทั้งหมด→`null`
3. ✅ ยืนยันตารางค่าว่าง/null (ข้อ 4) — ไม่ส่งฟิลด์ = ไม่แตะ, `""`/`null` = ล้าง
4. ✅ จะไม่ส่งรายการ placeholder ที่ยังไม่มี BIB จริง — trigger ส่งเฉพาะแถวที่ `new.bib` ไม่ว่าง
5. ✅ โค้ดกัน `bib_old` ว่างโดยไม่ตั้งใจ — trigger ตัดสิน `create` จาก `old.bib` จริงในแถว
6. ✅ เลข BIB เจ้าหน้าที่สำหรับทดสอบ: **`30930`**
7. ⛳ ต้องแจ้ง: วันเริ่ม D1 (ก่อน 8 ก.ย.)

---

## 6. ความเสี่ยง

| เรื่อง | ผล | ลด |
|---|---|---|
| ไม่มี DB ทดสอบแยก — trigger ยิงกับข้อมูลจริง 11,500 | แก้ผิด = เขียนของจริง | คง `RP_DRY_RUN=true` จนถึง D8 · คิวบันทึกทุกอย่างให้ตรวจ |
| กติกา `N/A → null` ของ raw fields | เผลอล้างข้อมูลฝั่งเขา | D3 ตรวจ `changed`/`ignored` ก่อน D8 · ทบทวนก่อนปิด dry_run |
| `shirt` เดิมไป `shirt_size` ตอนนี้ไป `VIP T-Shirt` | ความหมายเปลี่ยน · ข้อมูล dry-run เก่าฝั่งเขาไม่ตรง | ยืนยันใน D4 |
| BIB ชนกันในชุดเดียว (5,000/คำขอ) | ทั้งชุดโดนปฏิเสธ 409 | batch default = 200 · pre-check + เลื่อนส่งแยก |
| Timeline 4 วัน รวม migration prod + deploy + ทดสอบ | ไม่ทันหน้าต่าง | migration+deploy ~1 วัน · ที่เหลือขึ้นกับคิวว่างของ RP |
| Supabase Edge Functions ไม่มี egress IP คงที่ (ข้อค้างเดิม) | ถ้า RP บังคับ IP allowlist จะเรียกไม่ได้ | ถาม RP ว่าบังคับไหม (ข้อค้างใน RUNNER_PORTAL_SYNC.md §10) |
