// Supabase Edge Function: stores the background image a runner uploaded from
// their own device on the bib pass page, and points their runners row at it.
//
// POST   (multipart: file, accessKey) -> uploads, returns the public URL
// DELETE (json: { accessKey })        -> clears it, back to the event artwork
//
// Runs with the service-role key so the 'runner-backgrounds' bucket needs no
// RLS policies at all: the anon key every visitor of the public bib pass page
// holds cannot write there by any other path.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}

import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const BUCKET_NAME = 'runner-backgrounds';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — matches the bucket's own limit
const ALLOWED_MIME_TYPE = 'image/jpeg';

const app = new Hono();

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'DELETE', 'OPTIONS'],
}));

app.options('/*', (c) => c.text('', 204));

// Health check. Must be a wildcard: Supabase routes the request to this
// function with the function name still in the path (e.g.
// "/upload-runner-background"), so a literal '/health' route never matches.
app.get('*', (c) => c.json({ status: 'ok', message: 'upload-runner-background is running.' }));

const getServiceClient = () => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in Edge Function environment variables.');
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
};

// The access key is the only thing the public bib pass page can prove it has,
// so it is what identifies the runner here — same trust model as the page's
// existing anon-key writes.
const findRunnerByAccessKey = async (
  supabaseClient: ReturnType<typeof createClient>,
  accessKey: string,
) => {
  const { data, error } = await supabaseClient
    .from('runners')
    .select('id, custom_background_url')
    .eq('access_key', accessKey)
    .maybeSingle();

  if (error) {
    console.error('Runner lookup error:', error);
    throw new Error('Failed to look up runner.');
  }

  return data as { id: string; custom_background_url: string | null } | null;
};

// Turns a stored public URL back into the object path we can hand to
// storage.remove(). Returns null for anything that isn't one of our own URLs,
// so a hand-edited value can never make us delete something unrelated.
const objectPathFromPublicUrl = (url: string | null): string | null => {
  if (!url) return null;
  const marker = `/object/public/${BUCKET_NAME}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
};

const removeObject = async (
  supabaseClient: ReturnType<typeof createClient>,
  url: string | null,
) => {
  const path = objectPathFromPublicUrl(url);
  if (!path) return;

  const { error } = await supabaseClient.storage.from(BUCKET_NAME).remove([path]);
  // A failed cleanup leaves an orphan file but must not fail the request the
  // runner is actually waiting on — their row already points somewhere valid.
  if (error) console.error('Failed to remove previous background:', path, error);
};

// Same reason as the GET route — '/' would never match and every call would 404.
app.post('*', async (c) => {
  const supabaseClient = getServiceClient();
  if (!supabaseClient) {
    return c.json({ error: 'Server configuration error: Supabase credentials missing.' }, 500);
  }

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const accessKey = body['accessKey'];

    if (!(file instanceof File)) {
      return c.json({ error: 'Invalid payload: missing "file".' }, 400);
    }
    if (typeof accessKey !== 'string' || !accessKey.trim()) {
      return c.json({ error: 'Invalid payload: missing "accessKey".' }, 400);
    }
    if (file.type !== ALLOWED_MIME_TYPE) {
      return c.json({ error: `Unsupported file type. Only ${ALLOWED_MIME_TYPE} is accepted.` }, 400);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: `File too large. Max ${MAX_FILE_SIZE_BYTES} bytes.` }, 400);
    }

    const runner = await findRunnerByAccessKey(supabaseClient, accessKey.trim());
    if (!runner) {
      return c.json({ error: 'Runner not found.' }, 404);
    }

    // Keyed by access key, not bib: the access key is already the per-runner
    // secret in the page URL, which keeps the path unguessable in a public
    // bucket. A fresh UUID per upload so a CDN never serves the previous image.
    const safeAccessKey = accessKey.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `${safeAccessKey}/${crypto.randomUUID()}.jpg`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .upload(path, fileBytes, { contentType: ALLOWED_MIME_TYPE, upsert: false });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return c.json({ error: uploadError.message || 'Failed to upload image.' }, 500);
    }

    const { data: publicUrlData } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(path);
    const publicUrl = publicUrlData?.publicUrl;

    if (!publicUrl) {
      await supabaseClient.storage.from(BUCKET_NAME).remove([path]);
      return c.json({ error: 'Failed to resolve public URL for the uploaded image.' }, 500);
    }

    const { error: updateError } = await supabaseClient
      .from('runners')
      .update({ custom_background_url: publicUrl })
      .eq('id', runner.id);

    if (updateError) {
      // Roll the file back so we never leave an upload nothing points at.
      await supabaseClient.storage.from(BUCKET_NAME).remove([path]);
      console.error('Runner update error:', updateError);
      return c.json({ error: updateError.message || 'Failed to save the background.' }, 500);
    }

    // Only once the row points at the new file is the old one safe to drop.
    await removeObject(supabaseClient, runner.custom_background_url);

    return c.json({ publicUrl, path });
  } catch (error) {
    console.error('Error in upload-runner-background Edge Function:', error);
    return c.json({ error: (error as Error).message || 'Internal server error.' }, 500);
  }
});

app.delete('*', async (c) => {
  const supabaseClient = getServiceClient();
  if (!supabaseClient) {
    return c.json({ error: 'Server configuration error: Supabase credentials missing.' }, 500);
  }

  try {
    const { accessKey } = await c.req.json();

    if (typeof accessKey !== 'string' || !accessKey.trim()) {
      return c.json({ error: 'Invalid payload: missing "accessKey".' }, 400);
    }

    const runner = await findRunnerByAccessKey(supabaseClient, accessKey.trim());
    if (!runner) {
      return c.json({ error: 'Runner not found.' }, 404);
    }

    const { error: updateError } = await supabaseClient
      .from('runners')
      .update({ custom_background_url: null })
      .eq('id', runner.id);

    if (updateError) {
      console.error('Runner update error:', updateError);
      return c.json({ error: updateError.message || 'Failed to clear the background.' }, 500);
    }

    await removeObject(supabaseClient, runner.custom_background_url);

    return c.json({ ok: true });
  } catch (error) {
    console.error('Error in upload-runner-background Edge Function:', error);
    return c.json({ error: (error as Error).message || 'Internal server error.' }, 500);
  }
});

serve(app.fetch);
