// Translating a runners row edit into the fields RunnerPortal accepts.
//
// Two kinds of target field, from "สัญญา BIB แบบใหม่" (4 Sep 2026):
//
//   writable_fields      the registration proper. first_name, last_name,
//                        gender (M/F/X/U), nationality. A value we cannot
//                        convert is dropped, never guessed and never sent null.
//
//   writable_raw_fields  ten columns that live in RunnerPortal's applicant
//                        file. We pass the stored string through verbatim
//                        (trim only). "N/A" / "" / "-" is not a value here: on
//                        an edit it is sent as null to clear their column, on a
//                        create it is simply omitted.
//
// The governing rule, unchanged:
//
//   field absent   -> RunnerPortal leaves the column alone
//   field null     -> RunnerPortal clears the column
//   unreadable     -> RunnerPortal REJECTS THE WHOLE RECORD
//
// So a value we cannot confidently convert is dropped from the payload.
// Dropping one field still lets the rest of that runner's edit through;
// guessing would either corrupt their start list or throw away the good fields
// with the bad one. Every drop is reported so a mapping mistake shows up in the
// admin screen instead of hiding.
//
// bib is never a plain field. Depending on `op` it is either the match key
// (op 'edit', sent as bib_number by the caller) or a bib_old/bib_new pair
// (op 'move' and op 'create'). A create carries bib_old "" — and that is the
// ONLY way "" ever reaches RunnerPortal, because an empty bib_old means "make a
// new runner", not "unknown".

/** Which of the three request shapes a queued row becomes. Mirrors the `op`
 *  column set by rp_enqueue_runner_edit() (see v17 migration). */
export type SyncOp = 'edit' | 'create' | 'move';

/** Columns whose change is worth sending. Must stay in step with the
 *  rp_enqueue_runner_edit() trigger, which decides what gets queued at all. */
export const WATCHED_COLUMNS = [
  'first_name', 'last_name', 'gender', 'nationality',
  'race_kit', 'row', 'row_no', 'shirt_type', 'shirt',
  'age_category', 'block', 'wave_start', 'pre_order', 'qr',
] as const;
export type WatchedColumn = (typeof WATCHED_COLUMNS)[number];

/** our column -> RunnerPortal applicant-file field. Passed through as a trimmed
 *  string. pre_order is not here: its value needs converting, see mapPreOrder. */
export const RAW_FIELD_MAP: Array<{ column: string; rpField: string }> = [
  { column: 'race_kit',     rpField: 'ticket_type' },
  { column: 'row',          rpField: 'ROW' },
  { column: 'row_no',       rpField: 'row_no' },
  { column: 'shirt_type',   rpField: 'shirt' },        // the normal shirt, everyone
  { column: 'shirt',        rpField: 'VIP T-Shirt' },  // the VIP shirt, a few
  { column: 'age_category', rpField: 'age_category' },
  { column: 'block',        rpField: 'Block' },
  { column: 'wave_start',   rpField: 'Start time' },
  { column: 'qr',           rpField: 'QR' },
];

/** The only values RunnerPortal matches for registration_status. Unused for now
 *  -- we have no equivalent column -- but kept beside the mapping it belongs to
 *  so nobody invents a sixth one later. */
export const RP_REGISTRATION_STATUSES = [
  'registered', 'cancelled', 'transferred', 'deferred', 'no_show',
] as const;

const GENDERS: Record<string, string> = {
  male: 'M', m: 'M', 'ชาย': 'M',
  female: 'F', f: 'F', 'หญิง': 'F',
};

export interface FieldChange { old: unknown; new: unknown }
export type RunnerChanges = Record<string, FieldChange>;

export interface DroppedField { field: string; value: string; reason: string }

export interface MappedRecord {
  /** RunnerPortal field name -> value. A raw field may be null (clear it);
   *  a writable_field is only ever a string, or absent. */
  fields: Record<string, string | null>;
  dropped: DroppedField[];
  /** Present for op 'move' and op 'create'. bib_old is "" for a create. */
  bibPair?: { bib_old: string; bib_new: string };
  /** Set when the whole record cannot be sent at all -- a malformed bib token,
   *  or a create with no name. The caller settles the row as failed with this
   *  reason and sends nothing for it. */
  fatal?: string;
}

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** "" / "N/A" / "n/a" / "-" -- the sentinels this dataset uses for "no value".
 *  Not a value RunnerPortal should store in a raw field. */
const isBlankRaw = (value: string): boolean => /^(?:n\/?a|-)?$/i.test(value.trim());

/** A real name, i.e. not blank and not the "N/A" placeholder the importer fills
 *  in. Used only to decide whether a create has enough to go on. */
const isRealName = (value: string | null | undefined): boolean =>
  !!value && value.trim() !== '' && !/^n\/?a$/i.test(value.trim());

/** bib_number / bib_old / bib_new: no internal whitespace, no comma list, at
 *  most 32 characters. Returns the trimmed token, or null if it breaks a rule.
 *  "" returns null too -- an empty bib_old is handled by the caller, not here. */
export function checkBibToken(value: unknown): string | null {
  const token = text(value).trim();
  if (token === '') return null;
  if (token.length > 32) return null;
  if (/\s/.test(token)) return null;
  if (token.includes(',')) return null;
  return token;
}

/** 'male' -> 'M'. Anything we do not recognise is dropped rather than sent as
 *  'U', which would overwrite a known gender with "unspecified". */
export function mapGender(value: unknown): string | null {
  const key = text(value).trim().toLowerCase();
  return GENDERS[key] ?? null;
}

/** A name we would be sending, or null if the edit emptied it. RunnerPortal
 *  refuses an edit that leaves a runner with no name at all, and we have no
 *  reason to clear one, so blank means "do not send this field". */
export function mapName(value: unknown): string | null {
  const name = text(value).trim();
  return name.length > 0 ? name : null;
}

/**
 * Nationality, passed through as-is.
 *
 * RunnerPortal's own data dictionary says this field is free text: "As
 * supplied. Not normalised to ISO codes." There is no enum to validate
 * against, so nothing here can be "unreadable" -- any non-empty string is a
 * value they accept, 'N/A' included. A blank edit is dropped rather than sent,
 * the same as a blank name: we have no case for clearing this field.
 */
export function mapNationality(value: unknown): string | null {
  const nationality = text(value).trim();
  return nationality.length > 0 ? nationality : null;
}

/**
 * pre_order -> the RunnerPortal "Pre-order" field.
 *
 * Their column holds exactly two states: the text "pre-order", or empty. It has
 * no value that means "no". Our column stores "[YES]" / "[NO]" and, on many
 * rows, "N/A" (the importer's default) or nothing at all. So: strip brackets
 * and spaces, and only an explicit YES becomes "pre-order". Everything else --
 * NO, N/A, blank, anything unexpected -- becomes null, i.e. "no pre-order".
 * Sending "NO" through literally would make RaceSmart's counter (`!= null`)
 * hand pre-ordered goods to someone who never ordered.
 */
export function mapPreOrder(value: unknown): 'pre-order' | null {
  const norm = text(value).replace(/[\[\]\s]/g, '').toUpperCase();
  return norm === 'YES' ? 'pre-order' : null;
}

/**
 * Turn one queued edit into the fields to send.
 *
 * `changes` carries only the columns that actually changed (for op 'edit' and
 * 'move'), or a full snapshot of the non-empty columns (for op 'create'). An
 * untouched column is never in the payload and RunnerPortal leaves it alone.
 */
export function mapRunnerChanges(changes: RunnerChanges, op: SyncOp = 'edit'): MappedRecord {
  const fields: Record<string, string | null> = {};
  const dropped: DroppedField[] = [];
  const isCreate = op === 'create';

  // ---- writable_fields: a string, or dropped. Never null. --------------
  const takeName = (column: 'first_name' | 'last_name', reason: string) => {
    const change = changes[column];
    if (!change) return;
    const converted = mapName(change.new);
    if (converted === null) {
      dropped.push({ field: column, value: text(change.new), reason });
      return;
    }
    fields[column] = converted;
  };
  takeName('first_name', 'ชื่อว่าง จึงไม่ส่ง (RunnerPortal ห้ามแก้จนไม่เหลือชื่อ)');
  takeName('last_name', 'นามสกุลว่าง จึงไม่ส่ง');

  if (changes.gender) {
    const g = mapGender(changes.gender.new);
    if (g === null) {
      dropped.push({ field: 'gender', value: text(changes.gender.new), reason: 'แปลงเป็น M/F ไม่ได้ จึงไม่ส่ง (ไม่เดาค่าให้)' });
    } else {
      fields.gender = g;
    }
  }

  if (changes.nationality) {
    const n = mapNationality(changes.nationality.new);
    if (n === null) {
      dropped.push({ field: 'nationality', value: text(changes.nationality.new), reason: 'สัญชาติว่าง จึงไม่ส่ง' });
    } else {
      fields.nationality = n;
    }
  }

  // ---- writable_raw_fields: trimmed string; blank clears (or omits) ----
  for (const { column, rpField } of RAW_FIELD_MAP) {
    const change = changes[column];
    if (!change) continue;
    const raw = text(change.new).trim();
    if (isBlankRaw(raw)) {
      if (!isCreate) fields[rpField] = null; // clear their column
      continue; // create: nothing to set
    }
    fields[rpField] = raw;
  }

  // pre_order needs value conversion, so it is not in RAW_FIELD_MAP.
  if (changes.pre_order) {
    const p = mapPreOrder(changes.pre_order.new);
    if (p === null) {
      if (!isCreate) fields['Pre-order'] = null;
    } else {
      fields['Pre-order'] = p;
    }
  }

  // ---- bib_old / bib_new for move and create --------------------------
  let bibPair: { bib_old: string; bib_new: string } | undefined;
  let fatal: string | undefined;

  if (op === 'move' || op === 'create') {
    const bibChange = changes.bib;
    const rawOld = text(bibChange?.old).trim();
    const rawNew = text(bibChange?.new).trim();
    const newToken = checkBibToken(rawNew);

    if (newToken === null) {
      fatal = `bib_new อ่านไม่ได้หรือรูปแบบผิด: "${rawNew}" (ห้ามมีช่องว่าง ห้ามจุลภาค ยาวไม่เกิน 32 ตัว)`;
    } else if (op === 'move') {
      const oldToken = checkBibToken(rawOld);
      if (oldToken === null) {
        fatal = `bib_old อ่านไม่ได้หรือรูปแบบผิด: "${rawOld}"`;
      } else if (oldToken === newToken) {
        // A move to the same number is just an edit; express it as one.
        bibPair = undefined;
      } else {
        bibPair = { bib_old: oldToken, bib_new: newToken };
      }
    } else {
      // create
      bibPair = { bib_old: '', bib_new: newToken };
      if (!isRealName(fields.first_name) && !isRealName(fields.last_name)) {
        fatal = 'name_required: การสร้างรายการใหม่ต้องมีชื่ออย่างน้อย 1 ช่อง (first_name หรือ last_name) ที่ไม่ใช่ค่าว่าง/N/A';
      }
    }
  }

  return { fields, dropped, bibPair, fatal };
}

/**
 * Merge several queued edits for one bib into a single record.
 *
 * Sending the same bib twice in one payload is a 409 -- RunnerPortal will not
 * let request order decide which value wins -- so consecutive edits to the same
 * runner have to be collapsed here, newest value per field. The pseudo-field
 * "bib" (the bib_old/bib_new pair) merges the same way: the latest pair wins.
 */
export function mergeChanges(ordered: RunnerChanges[]): RunnerChanges {
  const merged: RunnerChanges = {};
  for (const changes of ordered) {
    for (const [column, change] of Object.entries(changes)) merged[column] = change;
  }
  return merged;
}

/** The strongest op in a group of rows merged for one bib: a create outranks a
 *  move, a move outranks an edit. */
export function strongestOp(ops: SyncOp[]): SyncOp {
  if (ops.includes('create')) return 'create';
  if (ops.includes('move')) return 'move';
  return 'edit';
}

// ---------------------------------------------------------------------------
// ID card number -- unchanged from v15. Sent on its own path, never queued.
// ---------------------------------------------------------------------------

/**
 * A national ID or passport number the admin just typed, or null if it does not
 * read as either.
 *
 * We never hold this value -- the runners table only keeps its SHA-256 -- so
 * this runs on the raw string during the save that changed it, and on nothing
 * else. RunnerPortal will correct an existing ID but never erase one, so a
 * value we are unsure of is dropped rather than risking a rejected record.
 */
export function mapIdCardNumber(value: unknown): string | null {
  const raw = text(value).replace(/[\s-]/g, '');
  if (/^\d{13}$/.test(raw)) return isValidThaiNationalId(raw) ? raw : null;
  if (/^[A-Za-z0-9]{6,20}$/.test(raw)) return raw.toUpperCase();
  return null;
}

/** Thai national ID check digit: the first 12 digits weighted 13..2, mod 11. */
export function isValidThaiNationalId(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}
