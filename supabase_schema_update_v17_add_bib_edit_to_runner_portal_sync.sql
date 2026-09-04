-- ============================================
-- v17: bib moves, new registrations, and the 10 applicant-file fields
-- ============================================
-- RunnerPortal reworked POST /v1/registrations/edits ("สัญญา BIB แบบใหม่",
-- 4 Sep 2026). Three things it can now do that v15/v16 could not express:
--
--   1. Move a bib      -- send bib_old + bib_new instead of bib_number.
--   2. Create an entry  -- send bib_old "" + bib_new + a name. This is how a
--      spare runner (a name we hold with no bib, kept back for race-day
--      sign-ups) reaches their start list once staff assign a bib here.
--   3. Write 10 more columns that live in their applicant file rather than the
--      registration proper: race_kit, row, row_no, shirt_type, shirt,
--      age_category, block, wave_start, pre_order, qr.
--
-- This replaces rp_enqueue_runner_edit() again and adds one column, `op`, so the
-- Edge Function knows which of the three shapes to build without re-deriving it
-- from the bib values. No new table, no backfill: rows already in
-- runner_portal_sync_queue keep op = 'edit' and are untouched.
--
-- 🔴 The one rule RunnerPortal asked us to guarantee (their §01): an empty
-- bib_old means "create", never "unknown". This trigger only ever emits op =
-- 'create' when OLD.bib was genuinely empty on the row -- it reads the real
-- previous value, not a serialised payload -- so a null/undefined slipping
-- through on our side cannot turn an edit into an accidental new runner.
--
-- Safe to re-run. Run AFTER v15 and v16, in Supabase SQL Editor.

-- --------------------------------------------------------------------------
-- op: which of the three request shapes this row becomes
-- --------------------------------------------------------------------------
alter table runner_portal_sync_queue
  add column if not exists op text not null default 'edit';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'runner_portal_sync_queue_op_check'
  ) then
    alter table runner_portal_sync_queue
      add constraint runner_portal_sync_queue_op_check
      check (op in ('edit', 'create', 'move'));
  end if;
end $$;

comment on column runner_portal_sync_queue.op is
  'edit = correction keyed by bib_number (v15 behaviour); move = bib_old/bib_new pair; create = bib_old "" + bib_new + snapshot, for a spare runner just given a bib. Set by rp_enqueue_runner_edit.';

-- --------------------------------------------------------------------------
-- The trigger
-- --------------------------------------------------------------------------
create or replace function rp_enqueue_runner_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  -- Columns RunnerPortal accepts. The first block is the registration proper
  -- (writable_fields); the rest are the applicant-file columns
  -- (writable_raw_fields). An edit that touches only pass_generated,
  -- google_jwt, custom_background_url and the like must not land here, or every
  -- wallet pass generation would enqueue a no-op.
  v_changes      jsonb := '{}'::jsonb;
  v_snapshot     jsonb := '{}'::jsonb;
  v_raw          jsonb;
  v_key          text;
  v_val          jsonb;
  v_bib_old      text := btrim(coalesce(old.bib, ''));
  v_bib_new      text := btrim(coalesce(new.bib, ''));
  v_bib_changed  boolean := v_bib_old is distinct from v_bib_new;
begin
  -- ---- what changed, field by field -----------------------------------
  if old.first_name is distinct from new.first_name then
    v_changes := v_changes || jsonb_build_object('first_name', jsonb_build_object('old', old.first_name, 'new', new.first_name));
  end if;
  if old.last_name is distinct from new.last_name then
    v_changes := v_changes || jsonb_build_object('last_name', jsonb_build_object('old', old.last_name, 'new', new.last_name));
  end if;
  if old.gender is distinct from new.gender then
    v_changes := v_changes || jsonb_build_object('gender', jsonb_build_object('old', old.gender, 'new', new.gender));
  end if;
  if old.nationality is distinct from new.nationality then
    v_changes := v_changes || jsonb_build_object('nationality', jsonb_build_object('old', old.nationality, 'new', new.nationality));
  end if;
  if old.shirt is distinct from new.shirt then
    v_changes := v_changes || jsonb_build_object('shirt', jsonb_build_object('old', old.shirt, 'new', new.shirt));
  end if;
  if old.shirt_type is distinct from new.shirt_type then
    v_changes := v_changes || jsonb_build_object('shirt_type', jsonb_build_object('old', old.shirt_type, 'new', new.shirt_type));
  end if;
  if old.race_kit is distinct from new.race_kit then
    v_changes := v_changes || jsonb_build_object('race_kit', jsonb_build_object('old', old.race_kit, 'new', new.race_kit));
  end if;
  if old."row" is distinct from new."row" then
    v_changes := v_changes || jsonb_build_object('row', jsonb_build_object('old', old."row", 'new', new."row"));
  end if;
  if old.row_no is distinct from new.row_no then
    v_changes := v_changes || jsonb_build_object('row_no', jsonb_build_object('old', old.row_no, 'new', new.row_no));
  end if;
  if old.age_category is distinct from new.age_category then
    v_changes := v_changes || jsonb_build_object('age_category', jsonb_build_object('old', old.age_category, 'new', new.age_category));
  end if;
  if old.block is distinct from new.block then
    v_changes := v_changes || jsonb_build_object('block', jsonb_build_object('old', old.block, 'new', new.block));
  end if;
  if old.wave_start is distinct from new.wave_start then
    v_changes := v_changes || jsonb_build_object('wave_start', jsonb_build_object('old', old.wave_start, 'new', new.wave_start));
  end if;
  if old.pre_order is distinct from new.pre_order then
    v_changes := v_changes || jsonb_build_object('pre_order', jsonb_build_object('old', old.pre_order, 'new', new.pre_order));
  end if;
  if old.qr is distinct from new.qr then
    v_changes := v_changes || jsonb_build_object('qr', jsonb_build_object('old', old.qr, 'new', new.qr));
  end if;

  -- Nothing RunnerPortal cares about moved.
  if v_changes = '{}'::jsonb and not v_bib_changed then
    return new;
  end if;

  -- ---- create: a spare runner just got a bib -------------------------
  -- bib_old was genuinely empty on this row. Send the whole current state, not
  -- just the diff, because RunnerPortal holds nothing for this person yet. A
  -- missing name is left for the Edge Function to reject as name_required
  -- rather than guessed at here.
  if v_bib_old = '' and v_bib_new <> '' then
    v_raw := jsonb_build_object(
      'first_name',   to_jsonb(new.first_name),
      'last_name',    to_jsonb(new.last_name),
      'gender',       to_jsonb(new.gender),
      'nationality',  to_jsonb(new.nationality),
      'shirt',        to_jsonb(new.shirt),
      'shirt_type',   to_jsonb(new.shirt_type),
      'race_kit',     to_jsonb(new.race_kit),
      'row',          to_jsonb(new."row"),
      'row_no',       to_jsonb(new.row_no),
      'age_category', to_jsonb(new.age_category),
      'block',        to_jsonb(new.block),
      'wave_start',   to_jsonb(new.wave_start),
      'pre_order',    to_jsonb(new.pre_order),
      'qr',           to_jsonb(new.qr)
    );
    for v_key, v_val in select * from jsonb_each(v_raw) loop
      if v_val is not null
         and jsonb_typeof(v_val) = 'string'
         and btrim(v_val #>> '{}') <> '' then
        v_snapshot := v_snapshot || jsonb_build_object(
          v_key, jsonb_build_object('old', null, 'new', v_val)
        );
      end if;
    end loop;

    insert into runner_portal_sync_queue (runner_id, bib, changes, op)
    values (
      new.id,
      v_bib_new,
      v_snapshot || jsonb_build_object('bib', jsonb_build_object('old', '', 'new', v_bib_new)),
      'create'
    );
    return new;
  end if;

  -- ---- bib cleared: cannot be expressed ------------------------------
  -- RunnerPortal has no way to blank a bib through this endpoint
  -- (bib_new_required). If the intent was to retire the entry, that is a
  -- person's call in RunnerPortal.
  if v_bib_old <> '' and v_bib_new = '' then
    insert into runner_portal_sync_queue (runner_id, bib, changes, op, status, reason)
    values (
      new.id,
      v_bib_old,
      v_changes || jsonb_build_object('bib', jsonb_build_object('old', old.bib, 'new', new.bib)),
      'edit',
      'skipped',
      'ลบเลข BIB ออกผ่าน API ไม่ได้ (ต้องมี bib_new) — ถ้าตั้งใจปลดรายการนี้ ให้แจ้งเจ้าหน้าที่ RunnerPortal โดยตรง'
    );
    return new;
  end if;

  -- ---- no bib at all: no key to match on ---------------------------
  if v_bib_old = '' and v_bib_new = '' then
    insert into runner_portal_sync_queue (runner_id, bib, changes, op, status, reason)
    values (new.id, '', v_changes, 'edit', 'skipped',
            'นักวิ่งรายนี้ไม่มีเลข BIB จึงไม่มีกุญแจสำหรับจับคู่กับ RunnerPortal');
    return new;
  end if;

  -- ---- bib moved: bib_old / bib_new pair ---------------------------
  -- Sent in one transaction with any other field change on the same row.
  -- We do not tell RunnerPortal whether this is a typo fix or a real
  -- reassignment -- that is not ours to judge -- we send what the user edited.
  if v_bib_changed then
    insert into runner_portal_sync_queue (runner_id, bib, changes, op)
    values (
      new.id,
      v_bib_new,
      v_changes || jsonb_build_object('bib', jsonb_build_object('old', old.bib, 'new', new.bib)),
      'move'
    );
    return new;
  end if;

  -- ---- plain edit: bib present and unchanged ----------------------
  insert into runner_portal_sync_queue (runner_id, bib, changes, op)
  values (new.id, v_bib_new, v_changes, 'edit');

  return new;
end;
$function$;

comment on function rp_enqueue_runner_edit() is
  'AFTER UPDATE on runners: queues the changed RunnerPortal-writable columns for delivery, tagging each row op = edit | move | create. Runs in the same transaction as the edit so a correction cannot be lost.';

drop trigger if exists trg_rp_enqueue_runner_edit on runners;

create trigger trg_rp_enqueue_runner_edit
  after update on runners
  for each row
  execute function rp_enqueue_runner_edit();
