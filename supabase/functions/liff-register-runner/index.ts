// Supabase Edge Function: proxies the LIFF runner registration call to the
// yourqr.today third-party service, keeping the request server-side so the
// frontend never talks to that endpoint directly.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}

import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const REGISTER_URL = 'https://yourqr.today/race_smart/www/api/v1/event.runner.register.save';
// Fixed per deployment. Overridable with Edge Function secrets so these can be
// changed without a code edit, but never taken from the client — the browser
// must not be able to choose which event/OA a runner is registered against.
const EVENT_ID = Number(Deno.env.get('YOURQR_EVENT_ID') ?? 28);
const LINEOA_USER_ID = Deno.env.get('LINEOA_USER_ID') ?? 'U9ef10f65f0598061a23f8e66d53e2541';
const REQUEST_TIMEOUT_MS = 12000;

const app = new Hono();

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'OPTIONS'],
}));

app.options('/*', (c) => c.text('', 204));

// Health check. Must be a wildcard: Supabase routes the request to this
// function with the function name still in the path (e.g.
// "/liff-register-runner"), so a literal '/health' route never matches.
app.get('*', (c) => c.json({ status: 'ok', message: 'liff-register-runner is running.' }));

// Same reason — '/' would never match and every call would 404.
app.post('*', async (c) => {
  try {
    const payload = await c.req.json().catch(() => ({}));
    // Only the runner's own LINE userId and bib come from the client — every
    // other value is fixed server-side above.
    const { bib, idCardHash, lineUserId } = payload;

    if (!bib || !lineUserId) {
      return c.json({ error: 'Invalid payload: missing bib or lineUserId.' }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // yourqr.today rejects unauthenticated calls with {"c_data":"No TOKEN, UUID"}.
      // Credentials stay server-side as Edge Function secrets — never in the
      // frontend bundle.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = Deno.env.get('YOURQR_TOKEN');
      const uuid = Deno.env.get('YOURQR_UUID');
      if (token) headers['token'] = token;
      if (uuid) headers['UUID'] = uuid;

      const response = await fetch(REGISTER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event_id: EVENT_ID,
          lineoa_user_id: LINEOA_USER_ID,
          lineuser_user_id: lineUserId,
          c_event_code: bib,
          // c_id_card_hash is intentionally not sent in this version. The
          // frontend still supplies `idCardHash` above, so re-enabling it is a
          // one-line change here when the third party is ready for it.
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
    console.error('Error in liff-register-runner Edge Function:', error);
    if ((error as Error).name === 'AbortError') {
      return c.json({ error: 'Registration request timed out.' }, 504);
    }
    return c.json({ error: (error as Error).message || 'Internal server error.' }, 500);
  }
});

serve(app.fetch);
