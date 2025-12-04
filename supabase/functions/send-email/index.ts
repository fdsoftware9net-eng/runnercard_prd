// This file is the new Supabase Edge Function for sending emails securely.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  const serve: (handler: (req: Request) => Response | Promise<Response>) => Promise<void>;
}

import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const app = new Hono();

// Enable CORS for frontend communication
app.use('/*', cors({
  origin: '*', // In production, replace '*' with your frontend's exact domain for better security
  allowHeaders: [
    'Content-Type',
    'Authorization', // If you were using any auth headers for the function itself
  ],
  allowMethods: ['POST', 'OPTIONS'],
}));

// Get Resend API Key from Supabase Edge Function environment variables
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', message: 'Send-email function is running.' });
});

// OPTIONS preflight handler
app.options('/*', (c) => {
  return c.text('', 204);
});

app.post('/', async (c) => {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in Edge Function environment variables.');
    return c.json({ error: 'Server configuration error: Resend API Key missing.' }, 500);
  }

  try {
    const emailPayload = await c.req.json();

    // Basic validation of the payload structure
    if (!emailPayload || !emailPayload.to || !emailPayload.from || !emailPayload.subject || !emailPayload.html) {
      return c.json({ error: 'Invalid email payload: missing to, from, subject, or html.' }, 400);
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json();
      console.error('Resend API error:', resendResponse.status, errorData);
      return c.json({ 
        error: errorData.message || `Failed to send email via Resend API. Status: ${resendResponse.status}`,
        details: errorData,
      }, resendResponse.status);
    }

    const data = await resendResponse.json();
    return c.json(data, resendResponse.status);

  } catch (error) {
    console.error('Error in send-email Edge Function:', error);
    return c.json({ error: (error as Error).message || 'Internal server error.' }, 500);
  }
});

serve(app.fetch);