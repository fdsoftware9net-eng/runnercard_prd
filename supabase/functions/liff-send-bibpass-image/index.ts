// Supabase Edge Function: proxies the LIFF "send bib pass image into LINE chat"
// call to the yourqr.today third-party service. Called once per card image.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}

import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SEND_IMAGE_URL = 'https://yourqr.today/race_smart/www/api/v1/line.user.chat.image';
const REQUEST_TIMEOUT_MS = 12000;
// Fixed per deployment. Overridable with Edge Function secrets so these can be
// changed without a code edit, but never taken from the client — the browser
// must not be able to choose which company/location/OA sends the message.
const COMPANY_ID = Number(Deno.env.get('YOURQR_COMPANY_ID') ?? 2003);
const LOCATION_ID = Number(Deno.env.get('YOURQR_LOCATION_ID') ?? 2004);
const LINEOA_USER_ID = Deno.env.get('LINEOA_USER_ID') ?? 'U9ef10f65f0598061a23f8e66d53e2541';

const app = new Hono();

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'OPTIONS'],
}));

app.options('/*', (c) => c.text('', 204));

// Health check. Must be a wildcard: Supabase routes the request to this
// function with the function name still in the path (e.g.
// "/liff-send-bibpass-image"), so a literal '/health' route never matches.
app.get('*', (c) => c.json({ status: 'ok', message: 'liff-send-bibpass-image is running.' }));

// Same reason — '/' would never match and every call would 404.
app.post('*', async (c) => {
  try {
    const payload = await c.req.json().catch(() => ({}));
    // Only the runner's own LINE userId and the image URL come from the client —
    // every other value is fixed server-side above.
    const { lineUserId, imageUrl } = payload;

    if (!lineUserId || !imageUrl) {
      return c.json({ error: 'Invalid payload: missing lineUserId or imageUrl.' }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // This endpoint is public now — no token/UUID headers required.
      const response = await fetch(SEND_IMAGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: COMPANY_ID,
          location_id: LOCATION_ID,
          lineoa_user_id: LINEOA_USER_ID,
          lineuser_user_id: lineUserId,
          c_url: imageUrl,
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }

      return c.json(data as Record<string, unknown>, response.status as any);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('Error in liff-send-bibpass-image Edge Function:', error);
    if ((error as Error).name === 'AbortError') {
      return c.json({ error: 'Send-image request timed out.' }, 504);
    }
    return c.json({ error: (error as Error).message || 'Internal server error.' }, 500);
  }
});

serve(app.fetch);
