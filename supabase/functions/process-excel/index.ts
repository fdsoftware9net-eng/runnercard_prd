

// The `/// <reference lib="deno.ns" />` directive was causing a TypeScript error locally.
// Deno globals (like Deno.env and Deno.serve) are implicitly available at runtime in Supabase Edge Functions.
// To satisfy TypeScript's static analysis without relying on the reference, we explicitly declare the used Deno globals.
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  const serve: (handler: (req: Request) => Response | Promise<Response>) => Promise<void>;
}
// -----------------------------------------------------
// IMPORTS
// -----------------------------------------------------
// Import Hono for routing and middleware
import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
// Import Supabase Client
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
// Import Deno's standard HTTP server for explicit handler serving
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ExcelJS has been removed due to Deno runtime compatibility issues.
// This function will now process CSV files.

const app = new Hono();

// Enable CORS for all routes (Crucial for frontend communication)
app.use('/*', cors({
  origin: '*',
  allowHeaders: [
    'authorization',
    'x-client-info',
    'apikey',
    'content-type'
  ],
  allowMethods: [
    'POST',
    'GET',
    'OPTIONS'
  ]
}));

const CHUNK_SIZE = 500; // Define batch size for bulk insertion

// -----------------------------------------------------
// 1. Initial Setup: Supabase Client & Hashing
// -----------------------------------------------------

// Get environment variables
const SUPABASE_URL_ENV = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY_ENV = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

let supabaseClient: SupabaseClient | null = null;
let supabaseClientInitError: string | null = null;

try {
  if (!SUPABASE_URL_ENV) {
    throw new Error('SUPABASE_URL is not set in Edge Function environment variables.');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY_ENV) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in Edge Function environment variables.');
  }
  supabaseClient = createClient(SUPABASE_URL_ENV, SUPABASE_SERVICE_ROLE_KEY_ENV);
} catch (error) {
  supabaseClientInitError = (error as Error).message;
  console.error('Failed to initialize Supabase client in Edge Function:', supabaseClientInitError);
}

/**
 * Hashing National ID using SHA-256 for security and privacy.
 */
async function hashNationalId(nationalId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nationalId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// -----------------------------------------------------
// 2. Health Check Endpoint
// -----------------------------------------------------
// Route to verify the function is running without issues (e.g., /functions/v1/process-excel/health)
app.get('/health', (c) => {
  let status = 'ok';
  let message = 'Process-excel function is running and ready.';
  const issues = [];

  if (supabaseClientInitError) {
    status = 'error';
    message = 'Supabase client failed to initialize.';
    issues.push(supabaseClientInitError);
  } else if (!supabaseClient) {
    status = 'error';
    message = 'Supabase client is not available after initialization attempt.';
    issues.push('Supabase client could not be created, possibly due to missing environment variables.');
  }

  return c.json({
    status,
    message,
    issues: issues.length > 0 ? issues : undefined,
    dependencies: {
      supabaseUrlSet: !!SUPABASE_URL_ENV,
      supabaseServiceRoleKeySet: !!SUPABASE_SERVICE_ROLE_KEY_ENV,
      supabaseClientInitialized: !!supabaseClient,
    },
  });
});

// Added for debugging OPTIONS requests
app.options('/*', (c) => {
  console.log('OPTIONS / received - CORS preflight');
  return c.text('', 204); // Return a 204 No Content for preflight requests
});

// -----------------------------------------------------
// 3. Logic: Endpoint for receiving and processing CSV files
// -----------------------------------------------------
// This route now handles POST requests to the root path of the function
// e.g., https://[project_ref].supabase.co/functions/v1/process-excel
app.post('/', async (c) => { // Changed route from '/upload' to '/'
  console.log('POST / received - processing CSV mode');

  // Check Supabase client status before proceeding
  if (supabaseClientInitError) {
    console.error('Request received but Supabase client failed to initialize:', supabaseClientInitError);
    return c.json({
      error: 'Service unavailable due to Supabase client initialization error.',
      details: supabaseClientInitError,
    }, 503); // 503 Service Unavailable
  }
  if (!supabaseClient) {
    console.error('Request received but Supabase client is null.');
    return c.json({
      error: 'Service unavailable. Supabase client is not ready.',
    }, 503);
  }

  try {
    const body = await c.req.parseBody();

    // The field name 'csvFile' MUST match the one used in the React frontend
    const csvFile = body['csvFile'];

    if (!csvFile || !(csvFile instanceof File)) {
      return c.json({
        error: "Missing or invalid CSV file. Field name must be 'csvFile'."
      }, 400);
    }

    const arrayBuffer = await csvFile.arrayBuffer();
    const csvString = new TextDecoder('utf-8').decode(arrayBuffer);

    const lines = csvString.split('\n').filter(line => line.trim() !== '');
    if (lines.length <= 1) { // Only header or empty
      return c.json({
        message: "File processed, but no data found in the CSV."
      }, 400);
    }

    const runnerData = [];
    // Skip header line (index 0)
    for (let i = 1; i < lines.length; i++) {
      const rowValues = lines[i].split(',').map(value => value.trim()); // Simple comma splitting

      // --- MAPPING COLUMNS TO DB SCHEMA ---
      // Adjust column indices based on your CSV structure
      // Assuming a fixed order like: first_name, last_name, id_card_hash, bib, ...
      const firstName = rowValues[0] || 'N/A';
      const lastName = rowValues[1] || 'N/A';
      const idCardNumber = rowValues[2];
      const bib = rowValues[3];
      const nameOnBib = rowValues[4] || 'N/A';
      const raceKit = rowValues[5] || 'Not Specified';
      const rowStart = rowValues[6] || null;
      const shirt = rowValues[7] || null;
      const gender = rowValues[8] || null;
      const nationality = rowValues[9] || null;
      const ageCategory = rowValues[10] || null;
      const block = rowValues[11] || null;
      const waveStart = rowValues[12] || null;
      const preOrder = rowValues[13] || null;
      const firstHalfMarathon = rowValues[14] || ''; // Store as free text, or empty string if blank
      const note = rowValues[15] || null;

      // Only process rows with both BIB and a valid ID Card Number
      if (bib && idCardNumber && idCardNumber.length > 0) {
        runnerData.push({
          // Verification Fields
          bib: bib,
          id_card_hash: await hashNationalId(idCardNumber),
          // Runner Details
          first_name: firstName,
          last_name: lastName,
          name_on_bib: nameOnBib,
          race_kit: raceKit,
          row_start: rowStart,
          shirt: shirt,
          gender: gender,
          nationality: nationality,
          age_category: ageCategory,
          block: block,
          wave_start: waveStart,
          pre_order: preOrder,
          first_half_marathon: firstHalfMarathon, // Now stores free text
          note: note,
          // Status Fields (Default values)
          pass_generated: false,
          access_key: crypto.randomUUID(),
          google_jwt: null,
          apple_pass_url: null
        });
      }
    }

    // Handle case where no valid data was found after parsing
    if (runnerData.length === 0) {
      return c.json({
        message: "File processed, but no valid runner data found. Check that BIB and ID Card Number fields are present."
      }, 200);
    }

    // 4. Batch Insert (Chunking Logic)
    let recordsInserted = 0;
    const totalRecords = runnerData.length;
    for (let i = 0; i < totalRecords; i += CHUNK_SIZE) {
      const chunk = runnerData.slice(i, i + CHUNK_SIZE);
      // Insert the batch of records into the 'runners' table
      const { error } = await supabaseClient.from('runners').insert(chunk);
      if (error) {
        console.error(`Error in batch starting at index ${i}:`, error.message);
        // Return a detailed 500 error response
        return c.json({
          error: `Database insertion failed at batch ${i / CHUNK_SIZE + 1}.`,
          details: error.message,
          insertedCount: recordsInserted
        }, 500);
      }
      recordsInserted += chunk.length;
    }

    // 5. Success Response
    return c.json({
      status: 'success',
      message: `Successfully processed and inserted ${recordsInserted} runner records.`,
      totalRecords: totalRecords,
      insertedCount: recordsInserted
    }, 200);

  } catch (error) {
    // Catch all unexpected runtime errors (e.g., file corruption, memory issue)
    console.error("Critical error during process-excel execution:", error);
    return c.json({
      error: "Internal server error. Check function logs for details.",
      details: (error as Error).message
    }, 500);
  }
});

// Use Deno's standard serve to serve the Hono app's fetch handler.
// This is often more reliable in Supabase Edge Functions than Deno.serve directly.
serve(app.fetch);