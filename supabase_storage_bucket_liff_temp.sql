-- ============================================
-- Create a private Storage bucket for short-lived LIFF bib-pass images
-- ============================================
-- Used only by the liff-upload-bibpass-image Edge Function to temporarily
-- host the generated bib pass image so the third-party service (yourqr.today)
-- can fetch it via a signed URL before delivering it into the runner's LINE chat.
--
-- Safe to re-run: creates the bucket if missing, and brings an existing bucket
-- up to date with the current settings.
--
-- Run this in Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bibpass-liff-temp', 'bibpass-liff-temp', false, 8388608, array['image/png'])
on conflict (id) do update
set file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public             = excluded.public;

-- PNG only: the bib pass is rendered on a transparent background, so the
-- frontend keeps it as PNG and shrinks its dimensions (never converting to a
-- format without an alpha channel) to stay under LINE's 1 MB image limit.
--
-- No storage.objects RLS policies are added intentionally: all reads/writes to
-- this bucket happen exclusively via the liff-upload-bibpass-image Edge Function
-- using the service-role key, which bypasses RLS entirely. This keeps the bucket
-- fully inaccessible to anon/public clients — the only access path is a
-- short-lived signed URL generated server-side per upload.
