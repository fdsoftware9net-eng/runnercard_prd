-- ============================================
-- Create a Storage bucket for runner-uploaded bib pass backgrounds
-- ============================================
-- Holds the image a runner picks from their own device on the bib pass page to
-- replace the stock card artwork. One live file per runner, stored at
-- '{access_key}/{uuid}.jpg'; the previous file is deleted when a new one is
-- uploaded, and the runner can clear it back to the event artwork entirely.
--
-- Safe to re-run: creates the bucket if missing, and brings an existing bucket
-- up to date with the current settings.
--
-- Run this in Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('runner-backgrounds', 'runner-backgrounds', true, 5242880, array['image/jpeg'])
on conflict (id) do update
set file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public             = excluded.public;

-- JPEG only: the frontend always re-encodes the runner's pick to a JPEG at the
-- card's own aspect ratio before uploading, so the card layout can't be thrown
-- off by an odd-shaped source image and the file stays small enough for the
-- generated pass to clear LINE's 1 MB image limit.
--
-- Public reads, but no storage.objects RLS policies are added intentionally:
-- writes and deletes happen exclusively via the upload-runner-background Edge
-- Function using the service-role key, which bypasses RLS. So the anon key —
-- which every visitor of the public bib pass page holds — cannot write to or
-- delete from this bucket at all. Reads are public because the generated pass
-- image, Wallet passes and html2canvas all need to fetch the background without
-- a session, and object paths are unguessable (access_key + random UUID).
