// Translating a runners row edit into the fields RunnerPortal accepts.
//
// Only a handful of our columns have a counterpart there, and two of them need
// real conversion: gender is stored as 'male'/'female' here but must be exactly
// M/F/X/U there, and shirt is stored with its measurements attached
// ("M (40*27)") but must be sent as the size alone.
//
// The governing rule, from wallet-integration-TH.md section 6:
//
//   field absent          -> RunnerPortal leaves the column alone
//   field null            -> RunnerPortal clears the column
//   unreadable value      -> RunnerPortal REJECTS THE WHOLE RECORD
//
// So a value we cannot confidently convert is dropped from the payload, never
// guessed at and never sent as null. Dropping one field still lets the rest of
// that runner's edit through; guessing would either corrupt their start list or
// throw away the good fields alongside the bad one. Every drop is reported so a
// mapping mistake shows up in the admin screen instead of hiding.

/** Columns whose change is worth sending. Must stay in step with the
 *  rp_enqueue_runner_edit() trigger, which decides what gets queued at all. */
export const WATCHED_COLUMNS = ['first_name', 'last_name', 'gender', 'shirt', 'nationality'] as const;
export type WatchedColumn = (typeof WATCHED_COLUMNS)[number];

/** The only values RunnerPortal matches for registration_status. Unused for now
 *  -- we have no equivalent column -- but kept beside the mapping it belongs to
 *  so nobody invents a sixth one later. */
export const RP_REGISTRATION_STATUSES = [
  'registered', 'cancelled', 'transferred', 'deferred', 'no_show',
] as const;

/** Shirt sizes we will forward verbatim. 'N/A' deliberately is not here, and
 *  that is the value 93% of this event's runners carry, so most edits simply
 *  have no size to send. */
const SHIRT_SIZES = new Set([
  '4XS', '3XS', '2XS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL',
]);

const GENDERS: Record<string, string> = {
  male: 'M', m: 'M', 'ชาย': 'M',
  female: 'F', f: 'F', 'หญิง': 'F',
};

export interface FieldChange { old: unknown; new: unknown }
export type RunnerChanges = Record<string, FieldChange>;

export interface DroppedField { field: string; value: string; reason: string }

export interface MappedRecord {
  /** RunnerPortal field name -> value. Only changed, convertible fields. */
  fields: Record<string, string>;
  dropped: DroppedField[];
}

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** 'male' -> 'M'. Anything we do not recognise is dropped rather than sent as
 *  'U', which would overwrite a known gender with "unspecified". */
export function mapGender(value: unknown): string | null {
  const key = text(value).trim().toLowerCase();
  return GENDERS[key] ?? null;
}

/**
 * The size on its own, or null when the column does not hold one.
 *
 * The column carries the size with whatever else the source spreadsheet
 * attached to it, and the shape differs per event:
 *
 *   'VIP L = 40'          -> 'L'     (Bangsaen10 2026: size then chest width)
 *   'VIP 3XS (KID) = 30'  -> '3XS'
 *   'M (40*27)'           -> 'M'     (Bangsaen21 2025: size then measurements)
 *   'N/A' / ''            -> null
 *
 * The leading VIP marks the shirt line, not the size, so it is dropped —
 * RunnerPortal's shirt_size wants the size alone. Anything that does not end up
 * matching a known size is returned as null and therefore never sent, which is
 * the only safe answer: an unreadable value makes them reject the whole record.
 */
export function mapShirtSize(value: unknown): string | null {
  const size = text(value)
    .replace(/^\s*VIP\b/i, '')   // shirt line, not size
    .split(/[(=]/)[0]            // drop measurements, however they are attached
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  return SHIRT_SIZES.has(size) ? size : null;
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
 * against, so unlike gender or shirt_size nothing here can actually be
 * "unreadable" -- any non-empty string is a value they will accept, 'N/A'
 * included, since that is a genuine value some of our runners carry. A blank
 * edit is dropped rather than sent, the same as a blank name: we have no case
 * for clearing this field.
 */
export function mapNationality(value: unknown): string | null {
  const nationality = text(value).trim();
  return nationality.length > 0 ? nationality : null;
}

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

/**
 * Turn one queued edit into the fields to send.
 *
 * `changes` carries only the columns that actually changed, so an untouched
 * column is never in the payload and RunnerPortal leaves it alone.
 */
export function mapRunnerChanges(changes: RunnerChanges): MappedRecord {
  const fields: Record<string, string> = {};
  const dropped: DroppedField[] = [];

  const take = (
    column: string,
    rpField: string,
    convert: (value: unknown) => string | null,
    reason: string,
  ) => {
    const change = changes[column];
    if (!change) return;
    const converted = convert(change.new);
    if (converted === null) {
      dropped.push({ field: column, value: text(change.new), reason });
      return;
    }
    fields[rpField] = converted;
  };

  take('first_name', 'first_name', mapName, 'ชื่อว่าง จึงไม่ส่ง (RunnerPortal ห้ามแก้จนไม่เหลือชื่อ)');
  take('last_name', 'last_name', mapName, 'นามสกุลว่าง จึงไม่ส่ง');
  take('gender', 'gender', mapGender, 'แปลงเป็น M/F ไม่ได้ จึงไม่ส่ง (ไม่เดาค่าให้)');
  take('shirt', 'shirt_size', mapShirtSize, 'อ่านไซซ์เสื้อไม่ออก จึงไม่ส่ง');
  take('nationality', 'nationality', mapNationality, 'สัญชาติว่าง จึงไม่ส่ง');

  return { fields, dropped };
}

/**
 * Merge several queued edits for one bib into a single record.
 *
 * Sending the same bib twice in one payload is a 409 -- RunnerPortal will not
 * let request order decide which value wins -- so consecutive edits to the same
 * runner have to be collapsed here, newest value per field.
 */
export function mergeChanges(ordered: RunnerChanges[]): RunnerChanges {
  const merged: RunnerChanges = {};
  for (const changes of ordered) {
    for (const [column, change] of Object.entries(changes)) merged[column] = change;
  }
  return merged;
}
