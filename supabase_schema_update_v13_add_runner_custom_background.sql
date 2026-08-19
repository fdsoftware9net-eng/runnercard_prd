-- ============================================
-- v13: let a runner replace their own bib pass background
-- ============================================
-- Stores the public URL of the image the runner uploaded from their own device
-- on the bib pass page. NULL (the default) means "use the event template's
-- backgroundImageUrl", i.e. the stock artwork.
--
-- The file itself lives in the 'runner-backgrounds' Storage bucket — see
-- supabase_storage_bucket_runner_backgrounds.sql. This column only points at it.
--
-- Safe to re-run. Run this in Supabase SQL Editor.

alter table runners
  add column if not exists custom_background_url text;

comment on column runners.custom_background_url is
  'Public URL of the runner-uploaded bib pass background (bucket: runner-backgrounds). NULL = use the event template artwork. Written only by the upload-runner-background Edge Function.';
