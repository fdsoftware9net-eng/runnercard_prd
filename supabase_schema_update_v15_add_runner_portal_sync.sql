-- ============================================
-- v15: push runner edits to RunnerPortal (Bangsaen10 2026)
-- ============================================
-- When the organizer corrects a runner in this system, RunnerPortal has to hear
-- about it, otherwise their start list goes stale and the expo counter works
-- from the wrong data. This adds the outbox that makes that reliable.
--
-- Why a trigger and not a call from the save handler: the enqueue then happens
-- inside the same transaction as the edit itself. A closed browser tab, a
-- dropped connection, or some future code path that updates runners another way
-- can no longer lose a correction — if the row changed, the queue row exists.
-- The runner-portal-sync Edge Function only drains this queue, so it is safe to
-- invoke as often as we like and never sends anything twice.
--
-- Three tables:
--   runner_portal_sync_queue  one row per runner edit awaiting delivery
--   runner_portal_sync_batch  one row per HTTP request, holding the exact bytes
--                             signed and sent so a retry replays them verbatim
--   runner_portal_sync_state  the integration's own status (cutover, throttle)
--
-- All three carry runner names, so all three get RLS enabled with no policies
-- at all — see the end of this file. That combination is what makes them
-- reachable only with the service-role key, i.e. only from the Edge Function;
-- the admin screen reads them through that function and never directly.
--
-- Safe to re-run. Run this in Supabase SQL Editor.

-- --------------------------------------------------------------------------
-- Batches: one per request to POST /v1/registrations/edits
-- --------------------------------------------------------------------------
create table if not exists runner_portal_sync_batch (
  id                uuid primary key default gen_random_uuid(),

  -- Sent as the Idempotency-Key header. Stable for the life of the batch: a
  -- retry after a timeout replays the original report instead of applying the
  -- edits a second time.
  idempotency_key   uuid not null unique default gen_random_uuid(),

  -- The exact JSON string that was signed and sent. Kept verbatim because
  -- RunnerPortal answers 409 to the same Idempotency-Key with a different body,
  -- and because re-serialising an object is not guaranteed to reproduce the
  -- same bytes. A retry must send this string, not rebuild it.
  request_body      text not null,

  dry_run           boolean not null default true,
  record_count      integer not null default 0,

  status            text not null default 'pending'
                    check (status in ('pending', 'in_flight', 'succeeded', 'failed')),
  attempts          integer not null default 0,

  http_status       integer,
  response          jsonb,
  request_id        text,
  error             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index if not exists idx_rp_sync_batch_unfinished
  on runner_portal_sync_batch (created_at)
  where status in ('pending', 'in_flight');

comment on table runner_portal_sync_batch is
  'One row per POST /v1/registrations/edits request. request_body holds the exact bytes signed, so a retry reuses both the body and the Idempotency-Key.';

-- --------------------------------------------------------------------------
-- Queue: one row per runner edit
-- --------------------------------------------------------------------------
create table if not exists runner_portal_sync_queue (
  id                uuid primary key default gen_random_uuid(),
  runner_id         uuid not null references runners(id) on delete cascade,

  -- Captured at enqueue time rather than joined later: bib is the key
  -- RunnerPortal matches on, and we must send the one that was true when the
  -- edit happened even if the row is renumbered afterwards.
  bib               text not null,

  -- { "first_name": { "old": "...", "new": "..." }, ... } for changed columns
  -- only. Absent columns are never sent, which is what tells RunnerPortal to
  -- leave them alone.
  changes           jsonb not null,

  status            text not null default 'pending'
                    check (status in ('pending', 'in_flight', 'sent', 'failed', 'skipped', 'halted')),
  attempts          integer not null default 0,
  next_attempt_at   timestamptz not null default now(),

  batch_id          uuid references runner_portal_sync_batch(id) on delete set null,

  -- Filled in from the per-record result RunnerPortal returns.
  outcome           text,     -- updated | unchanged | not_found | ambiguous_bib | rejected
  reason            text,     -- why it was rejected, or why we never sent it
  changed_fields    text[],
  ignored_fields    text[],   -- fields our key may not write: a mapping mistake
  overrides_cleared text[],   -- hand corrections by a RunnerPortal admin we replaced
  dropped_fields    jsonb,    -- fields we could not convert, so did not send

  last_http_status  integer,
  last_error        text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sent_at           timestamptz
);

create index if not exists idx_rp_sync_queue_due
  on runner_portal_sync_queue (next_attempt_at)
  where status = 'pending';

create index if not exists idx_rp_sync_queue_runner
  on runner_portal_sync_queue (runner_id, created_at desc);

create index if not exists idx_rp_sync_queue_attention
  on runner_portal_sync_queue (created_at desc)
  where status in ('failed', 'skipped');

comment on table runner_portal_sync_queue is
  'Outbox of runner edits awaiting delivery to RunnerPortal. Written by the rp_enqueue_runner_edit trigger, drained by the runner-portal-sync Edge Function.';
comment on column runner_portal_sync_queue.status is
  'pending = due to send; in_flight = claimed by a drain; sent = delivered; failed = needs a person; skipped = deliberately not sent (e.g. bib changed); halted = cutover passed before we could send it.';

-- --------------------------------------------------------------------------
-- State: one row, id = 1
-- --------------------------------------------------------------------------
create table if not exists runner_portal_sync_state (
  id                     smallint primary key default 1 check (id = 1),

  -- Set once RunnerPortal answers 403 authority_moved. That is the integration
  -- ending as agreed, not a fault: from then on the organizer edits in
  -- RunnerPortal and we must stop sending. Nothing clears this automatically.
  authority_moved        boolean not null default false,
  authority_moved_at     timestamptz,

  -- A 403 forbidden instead means the key is misconfigured and a person has to
  -- fix it. Recorded separately precisely so the two are never confused.
  last_forbidden_at      timestamptz,
  last_forbidden_detail  text,

  -- Honours Retry-After from a 429. Drains before this time do nothing.
  retry_after_until      timestamptz,

  last_drain_at          timestamptz,
  last_success_at        timestamptz,
  updated_at             timestamptz not null default now()
);

insert into runner_portal_sync_state (id) values (1) on conflict (id) do nothing;

comment on table runner_portal_sync_state is
  'Single-row status of the RunnerPortal integration. authority_moved = the agreed cutover has passed; stop sending, do not retry, do not page anyone.';

-- --------------------------------------------------------------------------
-- The trigger that fills the queue
-- --------------------------------------------------------------------------
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

drop trigger if exists trg_rp_enqueue_runner_edit on runners;

create trigger trg_rp_enqueue_runner_edit
  after update on runners
  for each row
  execute function rp_enqueue_runner_edit();

-- --------------------------------------------------------------------------
-- Claiming work, atomically
-- --------------------------------------------------------------------------
-- Two drains can overlap — the admin saves twice quickly, or a scheduled drain
-- lands on top of one triggered by a save. SKIP LOCKED means the second one
-- takes different rows rather than sending the same edit twice.
create or replace function rp_claim_sync_rows(p_limit integer default 200)
returns setof runner_portal_sync_queue
language plpgsql
security definer
set search_path = public
as $function$
begin
  return query
  with due as (
    select q.id
    from runner_portal_sync_queue q
    where q.status = 'pending'
      and q.next_attempt_at <= now()
    order by q.created_at
    limit greatest(1, least(p_limit, 5000))   -- RunnerPortal caps a batch at 5,000
    for update skip locked
  )
  update runner_portal_sync_queue q
  set status = 'in_flight',
      attempts = q.attempts + 1,
      updated_at = now()
  from due
  where q.id = due.id
  returning q.*;
end;
$function$;

comment on function rp_claim_sync_rows(integer) is
  'Atomically claims up to p_limit due queue rows for one drain. SKIP LOCKED keeps concurrent drains from sending the same edit twice.';

-- Release rows a drain claimed but never managed to send (function timed out,
-- instance recycled). Called at the start of the next drain.
create or replace function rp_release_stale_claims(p_older_than interval default '5 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_count integer;
begin
  update runner_portal_sync_queue
  set status = 'pending',
      batch_id = null,
      updated_at = now()
  where status = 'in_flight'
    and batch_id is null
    and updated_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

comment on function rp_release_stale_claims(interval) is
  'Returns rows to pending that were claimed but never attached to a batch. Rows that DO have a batch are left alone: that batch is retried instead, with its original Idempotency-Key.';

-- --------------------------------------------------------------------------
-- Locking the three tables down
-- --------------------------------------------------------------------------
-- Supabase grants anon and authenticated access to new tables in the public
-- schema by default, and the anon key is embedded in the public bib pass page.
-- Without this, the queue would hand a runner's name to anyone who asked —
-- which is what the Table Editor flags as UNRESTRICTED.
--
-- Enabled with NO policies on purpose. A policy would describe who may read
-- what, and the answer here is nobody: the only legitimate caller is the
-- runner-portal-sync Edge Function, which uses the service-role key and
-- bypasses RLS entirely. The enqueue trigger is SECURITY DEFINER, so it is
-- unaffected too.
--
-- If a future screen needs to read these directly, add a policy here
-- deliberately rather than turning RLS back off.
alter table runner_portal_sync_queue enable row level security;
alter table runner_portal_sync_batch enable row level security;
alter table runner_portal_sync_state enable row level security;
