import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const app = new Hono();

// Enable CORS
app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS']
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', message: 'Service is running' }));

// Helper function to replace placeholders
const fillTemplate = (template: string, runner: any) => {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = runner[key];
    if (value === undefined || value === null || value === '') return '';
    return String(value);
  });
};

// Main Handler
app.post('*', async (c) => {
  try {
    console.log("Start generating Google Wallet pass...");

    // --- 1. Initialize Supabase ---
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return c.json({ error: 'Server configuration error: Supabase credentials missing.' }, 500);
    }
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- 2. Process Request Body (Read ONCE) ---
    // อ่าน Body แค่ครั้งเดียวตรงนี้ แล้วดึงค่าที่ต้องการออกมา
    const body = await c.req.json().catch(() => ({})); 
    const { runnerId, updatePass } = body;

    if (!runnerId) {
      return c.json({ error: 'Invalid payload: missing runnerId.' }, 400);
    }
    console.log(`Request for runnerId: ${runnerId}, updatePass: ${updatePass || 'null (New Pass)'}`);

    // --- 3. Fetch Wallet Configuration ---
    const { data: walletConfig, error: configError } = await supabaseClient
      .from('wallet_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (configError || !walletConfig) {
      return c.json({ error: 'Server configuration error: Could not load Google Wallet configuration.' }, 500);
    }

    const GOOGLE_WALLET_ISSUER_ID = walletConfig.issuer_id;
    if (!GOOGLE_WALLET_ISSUER_ID) {
      return c.json({ error: 'Server configuration error: Issuer ID missing.' }, 500);
    }

    // --- 4. Fetch Runner Data ---
    // เปลี่ยนชื่อ Table ตามที่คุณใช้งานจริง (runners หรือ runners_test)
    const { data: runner, error: runnerError } = await supabaseClient
      .from('runners') // หรือ 'runners_test'
      .select('*')
      .eq('id', runnerId)
      .single();

    if (runnerError || !runner) {
      return c.json({ error: `Could not find runner with ID ${runnerId}.` }, 404);
    }

    // --- 5. Construct Wallet Object ---
    const { field_mappings } = walletConfig;
    if (!field_mappings) {
      return c.json({ error: 'Server configuration error: Field mappings missing.' }, 500);
    }

    const classId = `${GOOGLE_WALLET_ISSUER_ID}.${walletConfig.class_suffix}`;
    const objectId = `${GOOGLE_WALLET_ISSUER_ID}.${runner.access_key}`;
    const officialLink = walletConfig.official_website_uri || 'https://pay.google.com/gp/v/card/';

    // Determine Design (Color/Image)
    let backgroundColor = walletConfig.hex_background_color;
    let heroImageUri = walletConfig.hero_image_uri;

    if (runner.colour_sign == 'VIP') {
      backgroundColor = '#70a8a7';
      heroImageUri = 'https://owcjaxcgeikzogxnoufb.supabase.co/storage/v1/object/public/pass_assets/BS21%202025_strip-02.png';
    } else if (runner.colour_sign == '1 วัน') {
      backgroundColor = '#8c8e90';
      heroImageUri = 'https://owcjaxcgeikzogxnoufb.supabase.co/storage/v1/object/public/pass_assets/BS21%202025_strip-03.png';
    }

    // Build Base Object
    const genericObject: any = {
      'id': objectId,
      'classId': classId,
      'genericType': 'GENERIC_TYPE_UNSPECIFIED',
      'hexBackgroundColor': backgroundColor,
      'logo': { 'sourceUri': { 'uri': walletConfig.logo_uri } },
      'cardTitle': {
        'defaultValue': {
          'language': 'en',
          'value': fillTemplate(walletConfig.card_title, runner)
        }
      },
      'linksModuleData': {
        'uris': [{
          'uri': officialLink,
          'description': 'Official Website',
          'id': 'officialLink'
        }]
      },
      'textModulesData': []
    };

    if (heroImageUri) {
      genericObject.heroImage = { sourceUri: { uri: heroImageUri } };
    }

    if (walletConfig.eventLatitude && walletConfig.eventLongitude) {
      genericObject.locations = [{
        kind: "walletobjects#latLongPoint",
        latitude: parseFloat(walletConfig.eventLatitude),
        longitude: parseFloat(walletConfig.eventLongitude)
      }];
    }

    // Map Standard Fields
    if (field_mappings.header?.enabled) {
      genericObject.header = { defaultValue: { language: 'en', value: fillTemplate(field_mappings.header.template, runner) } };
    }
    if (field_mappings.subheader?.enabled) {
      genericObject.subheader = { defaultValue: { language: 'en', value: fillTemplate(field_mappings.subheader.template, runner) } };
    }
    if (field_mappings.barcodeValue?.enabled && field_mappings.barcodeValue.sourceColumn) {
      genericObject.barcode = {
        type: 'QR_CODE',
        value: String(runner[field_mappings.barcodeValue.sourceColumn] || '')
      };
    }

    // Map Text Modules & Layout
    const informationRows = (field_mappings as any).informationRows || [];
    let cardTemplateOverrideConfig: any = null;
    const usedTextModuleIds = new Set<string>();

    // Text Modules (Bottom section)
    if (field_mappings.textModules?.length > 0) {
      genericObject.textModulesData = field_mappings.textModules.map((module: any) => ({
        id: module.id,
        header: module.header,
        body: fillTemplate(module.bodyTemplate, runner)
      }));
    }

    // Info Rows (Card Layout)
    if (informationRows.length > 0) {
      const rowTemplateInfos: any[] = [];
      const additionalTextModules: any[] = [];

      informationRows.forEach((row: any, rowIndex: number) => {
        const rowTemplate: any = {};
        let hasLeft = false, hasMiddle = false, hasRight = false;

        const processItem = (pos: string, itemData: any) => {
          if (itemData?.label) {
            const id = `info_row_${rowIndex}_${pos}`;
            const label = fillTemplate(itemData.label, runner);
            const value = itemData.value ? fillTemplate(itemData.value, runner) : '';
            
            if (label && label.trim()) {
              // Logic: ถ้า Value ว่าง ให้ Label เป็น Body
              const hasValue = value && value.trim();
              additionalTextModules.push({
                id: id,
                header: hasValue ? label : '',
                body: hasValue ? value : label
              });
              usedTextModuleIds.add(id);
              return id;
            }
          }
          return null;
        };

        const leftId = processItem('left', row.left);
        if (leftId) {
            rowTemplate.startItem = { firstValue: { fields: [{ fieldPath: `object.textModulesData['${leftId}']` }] } };
            hasLeft = true;
        }
        const middleId = processItem('middle', row.middle);
        if (middleId) {
            rowTemplate.middleItem = { firstValue: { fields: [{ fieldPath: `object.textModulesData['${middleId}']` }] } };
            hasMiddle = true;
        }
        const rightId = processItem('right', row.right);
        if (rightId) {
            rowTemplate.endItem = { firstValue: { fields: [{ fieldPath: `object.textModulesData['${rightId}']` }] } };
            hasRight = true;
        }

        if (hasLeft && hasMiddle && hasRight) rowTemplateInfos.push({ threeItems: rowTemplate });
        else if (hasLeft && hasRight) rowTemplateInfos.push({ twoItems: rowTemplate });
      });

      if (additionalTextModules.length > 0) {
        genericObject.textModulesData = [...genericObject.textModulesData, ...additionalTextModules];
      }
      if (rowTemplateInfos.length > 0) {
        cardTemplateOverrideConfig = { cardRowTemplateInfos: rowTemplateInfos };
      }
    }

    // --- 6. Google Auth & Private Key Preparation ---
    const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS');
    if (!GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
      return c.json({ error: 'Server configuration error: Google Creds missing.' }, 500);
    }

    let serviceAccount, privateKey;
    try {
      let parsed = JSON.parse(GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
      serviceAccount = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;

      let pem = serviceAccount.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/g, "")
        .replace(/-----END PRIVATE KEY-----/g, "")
        .replace(/\\n/g, "")
        .replace(/\n/g, "")
        .replace(/\s/g, "");

      const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
      privateKey = await crypto.subtle.importKey(
        "pkcs8", binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        true, ["sign"]
      );
    } catch (e) {
      console.error("Auth setup error:", e);
      return c.json({ error: 'Auth setup failed' }, 500);
    }

    // --- 7. Get Access Token (Global) ---
    // จำเป็นต้องใช้ Token ทั้งการ Update Class และ Object
    let accessToken = null;
    try {
        const now = Math.floor(Date.now() / 1000);
        const jwt = await create({ alg: "RS256", typ: "JWT" }, {
          iss: serviceAccount.client_email,
          scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now
        }, privateKey);

        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
          })
        });

        if (res.ok) {
            const data = await res.json();
            accessToken = data.access_token;
        } else {
            console.error("Failed to get Google Access Token:", await res.text());
        }
    } catch (e) {
        console.error("Token generation error:", e);
    }

    // --- 8. REST API Operations (Update Class & Object) ---

    // A. Update Class (Layout) - ทำเสมอเพื่อให้มั่นใจว่า Template ล่าสุด
    if (cardTemplateOverrideConfig && accessToken) {
        const classPayload = {
            id: classId,
            classTemplateInfo: { cardTemplateOverride: cardTemplateOverrideConfig }
        };
        const classApiUrl = `https://walletobjects.googleapis.com/walletobjects/v1/genericClass/${encodeURIComponent(classId)}`;
        
        // ใช้ PUT เพื่อ Create หรือ Update
        await fetch(classApiUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(classPayload)
        });
        console.log("Class updated successfully.");
    }

    // B. Update Object (Data) - ทำเมื่อมี request เข้ามา (PATCH)
    if (updatePass && accessToken) {
        console.log("Processing Patch Request...");
        // ใช้ genericObject ที่สร้างไว้ข้างบน ซึ่งมีข้อมูล Runner ล่าสุดแล้ว
        // สำคัญ: ต้องใช้ URL ของ Object
        const objectApiUrl = `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`;
        
        const patchRes = await fetch(objectApiUrl, {
            method: 'PATCH', // หรือ PUT
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(genericObject) // ส่ง Object ก้อนเดียว (ไม่ใช่ Array)
        });

        if (patchRes.ok) {
            console.log("Object PATCH successfully.");
        } else {
            console.error("Object PATCH failed:", await patchRes.text());
        }
    }

    // --- 9. Generate Save Link (JWT) ---
    const payload: any = {
      genericObjects: [ genericObject ]
    };

    // Attach Class definition only if needed (usually for first creation)
    if (cardTemplateOverrideConfig) {
      payload.genericClasses = [{
        id: classId,
        classTemplateInfo: { cardTemplateOverride: cardTemplateOverrideConfig }
      }];
    }

    const claims = {
      iss: serviceAccount.client_email,
      aud: 'google',
      origins: [],
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: payload
    };

    const jwt = await create({ alg: "RS256", typ: "JWT" }, claims, privateKey);
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

    return c.json({
      saveToGoogleWalletLink: saveUrl,
      objectId: objectId,
      message: updatePass ? 'Pass updated' : 'Pass created'
    }, 200);

  } catch (error: any) {
    console.error('Internal Error:', error);
    return c.json({ error: error.message || 'Internal server error.' }, 500);
  }
});

serve(app.fetch);