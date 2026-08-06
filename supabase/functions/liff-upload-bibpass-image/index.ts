// Supabase Edge Function: uploads a generated bib pass PNG to a private Storage
// bucket and returns a short-lived signed URL, so the yourqr.today third-party
// service can fetch it and deliver it into the runner's LINE chat.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}

import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const BUCKET_NAME = 'bibpass-liff-temp';
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const SIGNED_URL_EXPIRY_SECONDS = 900; // 15 minutes

const app = new Hono();

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'OPTIONS'],
}));

app.options('/*', (c) => c.text('', 204));

// Health check. Must be a wildcard: Supabase routes the request to this
// function with the function name still in the path (e.g.
// "/liff-upload-bibpass-image"), so a literal '/health' route never matches.
app.get('*', (c) => c.json({ status: 'ok', message: 'liff-upload-bibpass-image is running.' }));

// Same reason — '/' would never match and every call would 404.
app.post('*', async (c) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in Edge Function environment variables.');
    return c.json({ error: 'Server configuration error: Supabase credentials missing.' }, 500);
  }

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const bib = body['bib'];

    if (!(file instanceof File)) {
      return c.json({ error: 'Invalid payload: missing "file".' }, 400);
    }
    if (typeof bib !== 'string' || !bib.trim()) {
      return c.json({ error: 'Invalid payload: missing "bib".' }, 400);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: `File too large. Max ${MAX_FILE_SIZE_BYTES} bytes.` }, 400);
    }

    // The frontend sends PNG when the card is already small enough, and JPEG
    // when it had to be compressed to fit under LINE's 1 MB image limit.
    const contentType = ALLOWED_CONTENT_TYPES.includes(file.type) ? file.type : 'image/png';
    const ext = contentType === 'image/jpeg' ? 'jpg' : 'png';

    const safeBib = bib.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `liff/${safeBib}_${Date.now()}_${crypto.randomUUID()}.${ext}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: uploadError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .upload(path, fileBytes, { contentType, upsert: false });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return c.json({ error: uploadError.message || 'Failed to upload image.' }, 500);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

    if (signedUrlError || !signedUrlData) {
      console.error('Signed URL error:', signedUrlError);
      return c.json({ error: signedUrlError?.message || 'Failed to create signed URL.' }, 500);
    }

    return c.json({ signedUrl: signedUrlData.signedUrl, path });
  } catch (error) {
    console.error('Error in liff-upload-bibpass-image Edge Function:', error);
    return c.json({ error: (error as Error).message || 'Internal server error.' }, 500);
  }
});

serve(app.fetch);
