-- ============================================
-- v16: VIP flag on runners
-- ============================================
-- 'YES' = VIP runner, 'NO' (the default) = not VIP. Stored as TEXT rather than
-- boolean so it round-trips through the CSV import and the pass-field
-- conditions the same way first_half already does.
--
-- Read by the conditional-display rules on bib pass templates — see
-- utils/passFieldCondition.ts. A field whose condition is `vip equals YES`
-- is only drawn for runners whose column reads YES.
--
-- Safe to re-run. Run this in Supabase SQL Editor.

alter table runners
  add column if not exists vip text;

-- Stated separately rather than inline on ADD COLUMN so re-running this on a
-- database where the column already exists still sets the default.
alter table runners
  alter column vip set default 'NO';

-- Existing rows predate the column, so they carry NULL rather than the default.
-- Fill them in, and treat a blank string as "not VIP" too, so every runner ends
-- up with an explicit YES or NO.
update runners
  set vip = 'NO'
  where vip is null or btrim(vip) = '';

comment on column runners.vip is
  'VIP flag: ''YES'' = VIP runner, ''NO'' (default) = not VIP. Used by bib pass field display conditions.';
