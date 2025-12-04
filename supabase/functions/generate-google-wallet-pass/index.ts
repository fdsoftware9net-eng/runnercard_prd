import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
const app = new Hono();
// Enable CORS for frontend communication
app.use('/*', cors({
  origin: '*',
  allowHeaders: [
    'Content-Type',
    'Authorization'
  ],
  allowMethods: [
    'POST',
    'GET',
    'OPTIONS'
  ]
}));
// Health check endpoint
app.get('/health', (c)=>{
  return c.json({
    status: 'ok',
    message: 'Google Wallet pass generation function is running.'
  });
});
// OPTIONS preflight handler
app.options('/*', (c)=>{
  return c.text('', 204);
});
// Helper function to replace placeholders like {column_name} with runner data
const fillTemplate = (template, runner)=>{
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (match, key)=>{
    return runner[key] !== undefined && runner[key] !== null ? String(runner[key]) : '';
  });
};
// Change to '*' to handle any path prefix sent by Supabase Gateway
app.post('*', async (c)=>{
  try {
    console.log("Start generating Google Wallet pass (Robust Version)...");
    // --- 1. Initialize Supabase Client ---
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase environment variables are not set.');
      return c.json({
        error: 'Server configuration error: Supabase credentials missing.'
      }, 500);
    }
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // --- 2. Fetch Wallet Configuration (including new field_mappings) ---
    const { data: walletConfig, error: configError } = await supabaseClient.from('wallet_config').select('*').eq('id', 1) // Fetch the config with the fixed ID
    .single();
    if (configError || !walletConfig) {
      console.error('Error fetching wallet configuration:', configError?.message);
      return c.json({
        error: 'Server configuration error: Could not load Google Wallet configuration. Please set it up in the admin dashboard.'
      }, 500);
    }
    const GOOGLE_WALLET_ISSUER_ID = walletConfig.issuer_id;
    if (!GOOGLE_WALLET_ISSUER_ID) {
      return c.json({
        error: 'Server configuration error: Google Wallet Issuer ID is not configured in the database.'
      }, 500);
    }
    // --- 3. Process Request Body (now only expects runnerId) ---
    const { runnerId } = await c.req.json();
    if (!runnerId) {
      return c.json({
        error: 'Invalid payload: missing runnerId.'
      }, 400);
    }
    console.log(`Request for runnerId: ${runnerId}`);
    // --- 4. Fetch the full runner record ---
    const { data: runner, error: runnerError } = await supabaseClient.from('runners').select('*').eq('id', runnerId).single();
    if (runnerError || !runner) {
      console.error(`Error fetching runner with ID ${runnerId}:`, runnerError?.message);
      return c.json({
        error: `Could not find runner with ID ${runnerId}.`
      }, 404);
    }
    // --- 5. Dynamically Construct Wallet Object using DB Config and Mappings ---
    const { field_mappings } = walletConfig;
    if (!field_mappings) {
      return c.json({
        error: 'Server configuration error: Field mappings are not defined in wallet_config.'
      }, 500);
    }
    const classId = `${GOOGLE_WALLET_ISSUER_ID}.${walletConfig.class_suffix}`;
    const objectId = `${GOOGLE_WALLET_ISSUER_ID}.${runner.access_key}`; // Use access_key for a stable, unique object ID
    // Use configured link or fallback
    const officialLink = walletConfig.official_website_uri || 'https://pay.google.com/gp/v/card/';
    // Fix: Type genericObject as 'any' to allow dynamic property assignment.
console.log("==== DEBUG COLOUR SIGN ====");
console.log("walletConfig.colour_sign =", walletConfig.colour_sign);
console.log("runner.colour_sign =", runner.colour_sign);
console.log("walletConfig.hex_background_color =", walletConfig.hex_background_color);

    const genericObject = {
      'id': objectId,
      'classId': classId,
      'genericType': 'GENERIC_TYPE_UNSPECIFIED',
      'hexBackgroundColor':
      runner.colour_sign == 'VIP'
      ? '#70a8a7'
      : walletConfig.hex_background_color,
      
      'logo': {
        'sourceUri': {
          'uri': walletConfig.logo_uri
        }
      },
      'cardTitle': {
        'defaultValue': {
          'language': 'en',
            'value': fillTemplate(walletConfig.card_title, runner)
        }
      },
     
      'linksModuleData': {
        'uris': [
          {
            'uri': officialLink,
            'description': 'Official Website',
            'id': 'officialLink'
          }
        ]
      }
    };
    // Add Location Triggers if configured
    if (walletConfig.eventLatitude && walletConfig.eventLongitude) {
      genericObject.locations = [
        {
          kind: "walletobjects#latLongPoint",
          latitude: parseFloat(walletConfig.eventLatitude),
          longitude: parseFloat(walletConfig.eventLongitude)
        }
      ];
    }
    // Dynamically add fields based on mappings
    if (field_mappings.header?.enabled && field_mappings.header.template) {
      genericObject.header = {
        defaultValue: {
          language: 'en',
          value: fillTemplate(field_mappings.header.template, runner)
        }
      };
    }
    if (field_mappings.subheader?.enabled && field_mappings.subheader.template) {
      genericObject.subheader = {
        defaultValue: {
          language: 'en',
          value: fillTemplate(field_mappings.subheader.template, runner)
        }
      };
    }
    if (field_mappings.barcodeValue?.enabled && field_mappings.barcodeValue.sourceColumn) {
      const barcodeValue = runner[field_mappings.barcodeValue.sourceColumn] || '';
      genericObject.barcode = {
        type: 'QR_CODE',
        value: String(barcodeValue),
        alternateText: `BIB: ${barcodeValue}`
      };
    }
    if (field_mappings.textModules?.length > 0) {
      genericObject.textModulesData = field_mappings.textModules.map((module)=>({
          id: module.id,
          header: module.header,
          body: fillTemplate(module.bodyTemplate, runner)
        }));
    }
    // --- 6. Get Google Service Account Credentials ---
    const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS');
    if (!GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
      console.error("Missing GOOGLE_SERVICE_ACCOUNT_CREDENTIALS secret");
      return c.json({
        error: 'Server configuration error: Google Service Account credentials are not set in Secrets.'
      }, 500);
    }
    let serviceAccount;
    let privateKey;
    try {
      serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
      // Handle case where JSON.parse returns a string (double escaped)
      if (typeof serviceAccount === 'string') {
        serviceAccount = JSON.parse(serviceAccount);
      }
    } catch (e) {
      console.error("JSON Parse Error:", e.message);
      return c.json({
        error: 'Invalid JSON format in GOOGLE_SERVICE_ACCOUNT_CREDENTIALS secret.'
      }, 500);
    }
    try {
      let pemContents = serviceAccount.private_key;
      if (!pemContents) {
        throw new Error("private_key field is missing in the JSON credentials.");
      }
      // Robustly clean and format the private key PEM
      // 1. Remove standard headers/footers
      pemContents = pemContents.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "");
      // 2. Replace literal "\n" characters (common in JSON) with empty string
      pemContents = pemContents.replace(/\\n/g, "");
      // 3. Replace actual newline characters with empty string
      pemContents = pemContents.replace(/\n/g, "");
      // 4. Remove any remaining whitespace
      pemContents = pemContents.replace(/\s/g, "");
      // Decode Base64 to Binary
      const binaryDerString = atob(pemContents);
      const der = new Uint8Array(binaryDerString.length);
      for(let i = 0; i < binaryDerString.length; i++){
        der[i] = binaryDerString.charCodeAt(i);
      }
      // Import Key
      privateKey = await crypto.subtle.importKey("pkcs8", der, {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      }, true, [
        "sign"
      ]);
    } catch (e) {
      console.error("Private Key Import Error:", e.message);
      return c.json({
        error: `Server configuration error: Failed to process Google Private Key. Details: ${e.message}`
      }, 500);
    }
    // --- 7. Create a real, signed JWT ---
    const claims = {
      iss: serviceAccount.client_email,
      aud: 'google',
      origins: [],
      typ: 'savetowallet',
      iat: getNumericDate(0),
      payload: {
        genericObjects: [
          genericObject
        ]
      }
    };
    try {
      const jwt = await create({
        alg: "RS256",
        typ: "JWT"
      }, claims, privateKey);
      const saveToGoogleWalletLink = `https://pay.google.com/gp/v/save/${jwt}`;
      console.log("Google Wallet link generated successfully.");
      return c.json({
        saveToGoogleWalletLink: saveToGoogleWalletLink,
        message: 'Google Wallet pass link generated successfully.'
      }, 200);
    } catch (e) {
      console.error("JWT Signing Error:", e.message);
      return c.json({
        error: `Failed to sign Google Wallet JWT. Details: ${e.message}`
      }, 500);
    }
  } catch (error) {
    console.error('Error in generate-google-wallet-pass Edge Function:', error);
    return c.json({
      error: error.message || 'Internal server error.'
    }, 500);
  }
});
serve(app.fetch);