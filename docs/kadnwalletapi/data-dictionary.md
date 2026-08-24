# Data dictionary / พจนานุกรมข้อมูล

**RunnerPortal Partner API v1** — every field we can send, what it means, and how
it maps to your side.

ทุกช่องข้อมูลที่เราส่งให้ได้ · ความหมาย · และการจับคู่กับระบบของคุณ

---

## 1. How to read this / วิธีอ่าน

- **Field** — the JSON key inside `record`.
- **PII** — personal data under Thailand's PDPA. Fields marked ✔ carry obligations
  for both parties; see [`security-pdpa.md`](./security-pdpa.md).
- **Granted** — whether this field is in *your* key's allowlist. Fields are granted
  per key, so your production key may differ from your sandbox key. The `fields`
  array in every response tells you exactly what you were shown.

**Nothing outside this table can ever be sent.** The list of shareable fields is
enforced in our database, not just in code — a field absent here cannot be added
by a mistake in an admin screen.

---

## 2. Identity of a record / การระบุตัวรายการ

These are not inside `record`. They identify the item itself.

| Field | Type | Meaning | ความหมาย |
|---|---|---|---|
| `record_id` | string \| null | **Your own** id for this entry — the value you sent us as `source_record_id`. This is your join key. | รหัสรายการ **ของคุณเอง** ใช้จับคู่ข้อมูล |
| `registration_id` | UUID | Our internal id. Stable forever. Useful for support tickets. | รหัสภายในของเรา ไม่เปลี่ยน |
| `change_id` | UUID | Identifies one changed field. **This is what you ack.** | รหัสของ "การแก้ 1 ช่อง" ใช้ตอน ack |

> ⚠️ **`record_id` can be `null`** if we never received a source id for that entry
> (for example, an entry created by our staff at the counter). Handle it — match on
> `registration_id` and treat it as a new record on your side.
>
> ⚠️ **We only ever send you *your own* record id.** We never expose another
> vendor's identifiers, and they never see yours.

---

## 3. Race fields / ข้อมูลการแข่งขัน

| Field | Type | PII | Meaning | ความหมาย |
|---|---|---|---|---|
| `bib_number` | string \| null | | Race number. **String, not integer** — leading zeros and letters occur. | หมายเลข BIB · เป็น **ข้อความ** ไม่ใช่ตัวเลข |
| `category` | string \| null | | What they signed up to run, e.g. `Run 42.195`. | ประเภทที่สมัคร |
| `distance_meters` | integer \| null | | Distance in **metres**, e.g. `42195`. | ระยะทาง หน่วย **เมตร** |
| `registration_status` | string | | One of `registered`, `cancelled`, `transferred`, `deferred`, `no_show`. | สถานะการสมัคร |
| `shirt_size` | string \| null | | Free text as supplied, e.g. `L`, `2XL`. Not a fixed set. | ขนาดเสื้อ · ข้อความอิสระ |

> ⚠️ **`category` here means the RACE category (what they signed up for), not an
> age group.** Our historical results table uses the same word for an age group
> like `Male 35-39`. If you map these two together you will corrupt both.
>
> ⚠️ **`bib_number` must be a string in your schema.** Parsing it as an integer
> loses leading zeros and breaks on any non-numeric bib.

---

## 4. Identity fields / ข้อมูลระบุตัวบุคคล

| Field | Type | PII | Meaning | ความหมาย |
|---|---|---|---|---|
| `first_name` | string \| null | ✔ | Given name, Latin script. | ชื่อ (อังกฤษ) |
| `last_name` | string \| null | ✔ | Family name, Latin script. | นามสกุล (อังกฤษ) |
| `first_name_th` | string \| null | ✔ | Given name, Thai script. | ชื่อ (ไทย) |
| `last_name_th` | string \| null | ✔ | Family name, Thai script. | นามสกุล (ไทย) |
| `gender` | string \| null | ✔ | `M`, `F`, `X` (other) or `U` (unstated). | เพศ |
| `nationality` | string \| null | ✔ | As supplied. Not normalised to ISO codes. | สัญชาติ |

> ⚠️ **A name is not an identifier.** Real people share names — this is why our
> system never auto-links a runner on a name match alone. Do not use name equality
> as a merge key.
>
> ⚠️ **Thai and Latin names are separate fields and either may be null.** Do not
> assume a runner has both, and do not transliterate one into the other.

---

## 5. Sensitive identity fields / ข้อมูลอ่อนไหว

**Off by default.** Granted only when the organizer deliberately enables the
sensitive group for your key.

**ปิดไว้เป็นค่าเริ่มต้น** จะเปิดให้ก็ต่อเมื่อผู้จัดงานอนุมัติเป็นกรณีไป

| Field | Type | PII | Meaning | ความหมาย |
|---|---|---|---|---|
| `date_of_birth` | string \| null | ✔✔ | `YYYY-MM-DD`. Date only — no time, no timezone. | วันเกิด |
| `id_card_number` | string \| null | ✔✔ | National ID **or passport number**. | เลขบัตรประชาชน **หรือ** พาสปอร์ต |

> 🔴 **`id_card_number` is NOT always a 13-digit Thai national ID.** About **37%**
> of our real data is passport numbers, with letters and varying lengths. **Never
> validate it as 13 numeric digits** — that rejects more than a third of real
> runners. Store it as an opaque string.
>
> 🔴 **`date_of_birth` is a calendar date, not a timestamp.** Do not convert it
> through a timezone. Parsing `1990-05-14` as UTC midnight and rendering it in
> Thai local time moves the birthday to the 13th or 15th.

---

## 6. Contact fields / ข้อมูลติดต่อ

| Field | Type | PII | Meaning | ความหมาย |
|---|---|---|---|---|
| `email` | string \| null | ✔ | As supplied. **Not unique** — see warning. | อีเมล |
| `phone` | string \| null | ✔ | As supplied. Not normalised to E.164. | เบอร์โทรศัพท์ |
| `city` | string \| null | ✔ | As supplied. | เมือง |
| `province` | string \| null | ✔ | As supplied. | จังหวัด |
| `emergency_contact_name` | string \| null | ✔ | | ชื่อผู้ติดต่อฉุกเฉิน |
| `emergency_contact_phone` | string \| null | ✔ | | เบอร์ติดต่อฉุกเฉิน |

> 🔴 **Email is not an identity.** In our real data **26% of addresses are shared**
> between people, and one address belongs to **24 different runners** — families
> and running clubs register together on one address. Never use email as a unique
> key or a merge key.

---

## 7. What we will never send / สิ่งที่เราจะไม่ส่งให้เด็ดขาด

| Field | Why not | เหตุผล |
|---|---|---|
| `raw_data` | The verbatim original row: every column including ID card, passport, work-permit number, blood type and phone. Sharing this one field shares everything, silently. It is flagged unshareable in our database and rejected by a trigger. | ข้อมูลดิบทั้งแถว · ส่งช่องเดียวเท่ากับส่งทุกอย่าง |
| internal ids | `import_batch_id` and other vendors' record ids. They tell you nothing and would leak how we are wired to other partners. | รหัสภายใน · ไม่มีประโยชน์ และเปิดเผยการเชื่อมต่อกับคู่ค้ารายอื่น |
| medical / health data | Not collected through this channel at all. | ไม่ส่งผ่านช่องทางนี้ |

---

## 8. Change records / ข้อมูลการแก้ไข

Fields inside each entry in `changes[]`.

| Field | Type | Meaning | ความหมาย |
|---|---|---|---|
| `change_id` | UUID | Ack this exact value. | ใช้ตอน ack |
| `field` | string | Which field changed — a key from the tables above. | ช่องที่ถูกแก้ |
| `old_value` | string \| null | Value before. **Always a string**, even for numbers. | ค่าเดิม (เป็นข้อความเสมอ) |
| `new_value` | string \| null | Value after. Also always a string. | ค่าใหม่ |
| `bib_change_kind` | string \| null | `typo_fix`, `reassignment`, or null for non-bib changes. | ชนิดการเปลี่ยน BIB |
| `is_timing_critical` | boolean | 🔴 `true` = must reach timing before the start gun. | มีผลกับการจับเวลา |
| `reason` | string \| null | Why our staff made the change, in their words. | เหตุผลที่เจ้าหน้าที่บันทึกไว้ |
| `changed_at` | string | ISO-8601 UTC timestamp. | เวลาที่แก้ |

> ⚠️ **`old_value` and `new_value` are always strings**, including for
> `distance_meters`. Cast on your side using `field` to decide the target type.
>
> ⚠️ **`reason` is free text written by a person, and may be in Thai or English.**
> Never parse it — display it to a human. It is the single most useful field when
> someone asks why a bib moved.

---

## 9. Suggested mapping / ตารางจับคู่ที่แนะนำ

Fill in your column names during integration and send it back to us — it becomes
the shared reference when something disagrees.

กรอกชื่อคอลัมน์ฝั่งคุณ แล้วส่งกลับมาให้เรา จะได้ใช้อ้างอิงตรงกันเวลาข้อมูลไม่ตรง

| RunnerPortal | Thairun column | Notes / หมายเหตุ |
|---|---|---|
| `record_id` | | your `source_record_id` — must stay stable |
| `bib_number` | | string |
| `first_name` | | |
| `last_name` | | |
| `first_name_th` | | |
| `last_name_th` | | |
| `gender` | | M / F / X / U |
| `category` | | race category, not age group |
| `distance_meters` | | metres |
| `registration_status` | | |
| `shirt_size` | | |
| `email` | | not unique |
| `phone` | | |
| `date_of_birth` | | date only |
| `id_card_number` | | ID **or** passport |

---

## 10. Writable fields — bib-keyed edits / ฟิลด์ที่แก้ไขได้

Applies to `POST /v1/registrations/edits` only
(ใช้กับ `POST /v1/registrations/edits` เท่านั้น) — see
[`wallet-integration-TH.md`](./wallet-integration-TH.md).

A key may write the **intersection** of this list and its own field allowlist.
The response echoes the result as `writable_fields`, so you never have to guess.

| Field | Writable | Notes |
|---|---|---|
| `first_name` · `last_name` · `first_name_th` · `last_name_th` | ✅ | At least one must survive the edit |
| `gender` | ✅ | `M` / `F` / `X` / `U`, exact |
| `date_of_birth` | ✅ | Unreadable value **rejects the record** |
| `id_card_number` | ✅ | May be corrected, **never erased** once set |
| `category` · `distance_meters` | ✅ | |
| `email` · `phone` | ✅ | |
| `emergency_contact_name` · `emergency_contact_phone` | ✅ | |
| `shirt_size` | ✅ | |
| `registration_status` | ✅ | Matched **exactly**, never guessed |
| **`bib_number`** | ❌ | It is the key. A real bib move is a timing-chip decision made in RunnerPortal |
| `nationality` · `city` · `province` | ❌ | Not editable in the wallet's own screen |
| `raw_data` | ❌ | Verbatim source row, includes health data. Never readable or writable |
| `source_record_id` · `thairun_record_id` · `primeworks_record_id` | ❌ | Our plumbing, not data |

### Omitted / null / unreadable — สามอย่างนี้ต่างกัน

| You send / ท่านส่ง | We do / เราทำ |
|---|---|
| field absent / ไม่ส่งฟิลด์ | leave unchanged / ไม่แตะต้อง |
| `null` | clear the column / ล้างค่า |
| unreadable value / ค่าที่อ่านไม่ออก | **reject that record** / ปฏิเสธเฉพาะรายการนั้น |

⚠️ The third row is where this endpoint differs from the file importer. A file is
written by a person and a half-read row beats a lost one; an API caller is a
program, and silently storing `null` because its value was unreadable would hide
that program's bug in our start list.
