-- ============================================
-- v16: watch nationality for RunnerPortal sync
-- ============================================
-- rp_enqueue_runner_edit() (see v15) only queued four columns: first_name,
-- last_name, gender, shirt. RunnerPortal's own key scope (returned in
-- writable_fields on every response) also grants nationality, and we hold a
-- real value for it on all but a handful of runners, so an edit to it should
-- reach them the same way the other four do.
--
-- This only replaces the trigger function -- no new table, no backfill. Rows
-- already sitting in runner_portal_sync_queue are untouched; only edits made
-- after this runs will start carrying nationality.
--
-- Safe to re-run. Run this in Supabase SQL Editor.

create or replace function rp_enqueue_runner_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_changes jsonb := '{}'::jsonb;
  v_bib_changed boolean := old.bib is distinct from new.bib;
begin
  -- Only the columns RunnerPortal can accept. An edit that touches nothing else
  -- -- pass_generated, google_jwt, custom_background_url and so on -- must not
  -- create a queue row, or every wallet pass generation would enqueue a no-op.
  if old.first_name is distinct from new.first_name then
    v_changes := v_changes || jsonb_build_object('first_name', jsonb_build_object('old', old.first_name, 'new', new.first_name));
  end if;

  if old.last_name is distinct from new.last_name then
    v_changes := v_changes || jsonb_build_object('last_name', jsonb_build_object('old', old.last_name, 'new', new.last_name));
  end if;

  if old.gender is distinct from new.gender then
    v_changes := v_changes || jsonb_build_object('gender', jsonb_build_object('old', old.gender, 'new', new.gender));
  end if;

  if old.shirt is distinct from new.shirt then
    v_changes := v_changes || jsonb_build_object('shirt', jsonb_build_object('old', old.shirt, 'new', new.shirt));
  end if;

  if old.nationality is distinct from new.nationality then
    v_changes := v_changes || jsonb_build_object('nationality', jsonb_build_object('old', old.nationality, 'new', new.nationality));
  end if;

  if v_changes = '{}'::jsonb and not v_bib_changed then
    return new;
  end if;

  -- A changed bib cannot be expressed to RunnerPortal at all: bib is the key
  -- they match on, never a value, because a real bib move has to reach the
  -- timing partner before the gun or that runner is never timed. Sending the
  -- edit under either the old or the new number would write someone's data onto
  -- the wrong person, so the row is recorded as skipped for the admin to act on
  -- and nothing is sent.
  if v_bib_changed then
    insert into runner_portal_sync_queue (runner_id, bib, changes, status, reason)
    values (
      new.id,
      coalesce(old.bib, new.bib, ''),
      v_changes || jsonb_build_object('bib', jsonb_build_object('old', old.bib, 'new', new.bib)),
      'skipped',
      'BIB เปลี่ยนจาก ' || coalesce(old.bib, '(ว่าง)') || ' เป็น ' || coalesce(new.bib, '(ว่าง)') ||
      ' — RunnerPortal แก้ BIB ผ่าน API ไม่ได้ ต้องแจ้งเจ้าหน้าที่ RunnerPortal โดยตรง'
    );
    return new;
  end if;

  if new.bib is null or btrim(new.bib) = '' then
    insert into runner_portal_sync_queue (runner_id, bib, changes, status, reason)
    values (new.id, '', v_changes, 'skipped',
            'นักวิ่งรายนี้ไม่มีเลข BIB จึงไม่มีกุญแจสำหรับจับคู่กับ RunnerPortal');
    return new;
  end if;

  insert into runner_portal_sync_queue (runner_id, bib, changes)
  values (new.id, new.bib, v_changes);

  return new;
end;
$function$;

comment on function rp_enqueue_runner_edit() is
  'AFTER UPDATE on runners: queues the changed, RunnerPortal-writable columns for delivery. Runs in the same transaction as the edit so a correction cannot be lost.';
