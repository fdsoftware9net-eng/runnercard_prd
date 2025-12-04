declare namespace Deno {
    const env: {
        get(key: string): string | undefined;
    };
    const serve: (handler: (req: Request) => Response | Promise<Response>) => Promise<void>;
}

import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
import JSZip from "https://esm.sh/jszip@3.10.1";
import forge from "https://esm.sh/node-forge@1.3.1";

const app = new Hono();

app.use('/*', cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
}));

app.get('/health', (c) => c.json({ status: 'ok', message: 'Apple Wallet generator is ready.' }));
app.options('/*', (c) => c.text('', 204));

const fillTemplate = (template: string, runner: any) => {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return runner[key] !== undefined && runner[key] !== null ? String(runner[key]) : '';
    });
};

const createHash = (data: string | Uint8Array | ArrayBuffer) => {
    const md = forge.md.sha1.create();

    if (data instanceof ArrayBuffer) {
        data = new Uint8Array(data);
    }

    if (data instanceof Uint8Array) {
        const buffer = forge.util.createBuffer(data.buffer);
        md.update(buffer.getBytes());
    } else {
        md.update(data as string, 'utf8');
    }
    return md.digest().toHex();
};

const fetchImage = async (url: string): Promise<ArrayBuffer | null> => {
    if (!url || typeof url !== 'string') return null;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;

    try {
        new URL(trimmedUrl);
        const separator = trimmedUrl.includes('?') ? '&' : '?';
        const cacheBustedUrl = `${trimmedUrl}${separator}v=${new Date().getTime()}`;

        console.log(`Fetching image: ${cacheBustedUrl}`);
        const res = await fetch(cacheBustedUrl);
        if (res.ok) return await res.arrayBuffer();
        console.warn(`Failed to fetch image ${trimmedUrl}: ${res.status}`);
    } catch (e) {
        console.error(`Exception fetching image '${trimmedUrl}':`, e);
    }
    return null;
};

// ✅ ฟังก์ชัน cleanPem ที่มี debug logging
const cleanPem = (str: string, certName: string = 'Certificate') => {
    console.log(`🧹 Cleaning ${certName}...`);
    
    if (!str) {
        console.error(`❌ ${certName} is empty or undefined`);
        throw new Error(`${certName} is empty`);
    }
    
    console.log(`📏 Original length: ${str.length} chars`);
    
    // 1. ลบ whitespace ข้างหน้าและข้างหลัง
    let s = str.trim();
    
    // 2. แปลง \\n เป็น newline จริง
    const hadBackslashN = s.includes('\\n');
    s = s.replace(/\\n/g, '\n');
    if (hadBackslashN) {
        console.log('✅ Converted \\n to actual newlines');
    }
    
    // 3. ลบ quotes ที่ล้อมรอบ
    const hadQuotes = s.startsWith('"') || s.startsWith("'");
    s = s.replace(/^["']|["']$/g, '');
    if (hadQuotes) {
        console.log('✅ Removed surrounding quotes');
    }
    
    // 4. ลบ escaped quotes
    s = s.replace(/\\"/g, '"');
    s = s.replace(/\\'/g, "'");
    
    // 5. ค้นหา header และ footer
    const headerRegex = /-----BEGIN [A-Z\s]+-----/;
    const footerRegex = /-----END [A-Z\s]+-----/;
    
    const headerMatch = s.match(headerRegex);
    const footerMatch = s.match(footerRegex);
    
    if (!headerMatch) {
        console.error(`❌ ${certName}: Missing BEGIN header`);
        console.log('📄 First 200 chars:', s.substring(0, 200));
        throw new Error(`${certName}: Invalid PEM format - Missing BEGIN header`);
    }
    
    if (!footerMatch) {
        console.error(`❌ ${certName}: Missing END footer`);
        console.log('📄 Last 200 chars:', s.substring(s.length - 200));
        throw new Error(`${certName}: Invalid PEM format - Missing END footer`);
    }
    
    const header = headerMatch[0];
    const footer = footerMatch[0];
    const start = s.indexOf(header) + header.length;
    const end = s.indexOf(footer);
    
    console.log(`📋 Header: "${header}"`);
    console.log(`📋 Footer: "${footer}"`);
    
    if (end < start) {
        console.error(`❌ ${certName}: Footer appears before header`);
        throw new Error(`${certName}: Invalid PEM format - Malformed structure`);
    }
    
    // 6. ดึง base64 body และลบทุก whitespace
    const body = s.substring(start, end)
        .replace(/\s+/g, '')
        .trim();
    
    console.log(`📏 Body length: ${body.length} chars`);
    
    if (body.length === 0) {
        console.error(`❌ ${certName}: Body is empty`);
        throw new Error(`${certName}: PEM body is empty`);
    }
    
    // 7. ตรวจสอบว่า base64 ถูกต้อง
    if (!/^[A-Za-z0-9+/=]+$/.test(body)) {
        const invalidChars = body.match(/[^A-Za-z0-9+/=]/g);
        console.error(`❌ ${certName}: Invalid base64 characters found:`, invalidChars?.slice(0, 10));
        console.log('📄 Body preview (first 100 chars):', body.substring(0, 100));
        throw new Error(`${certName}: Body contains invalid base64 characters`);
    }
    
    // 8. แบ่ง base64 เป็นบรรทัดละ 64 ตัวอักษร
    const chunkedBody = body.match(/.{1,64}/g)?.join('\n') || body;
    
    // 9. สร้าง PEM ที่ถูกต้อง
    const cleanedPem = `${header}\n${chunkedBody}\n${footer}`;
    
    console.log(`✅ ${certName} cleaned successfully`);
    console.log(`📏 Final length: ${cleanedPem.length} chars (${chunkedBody.split('\n').length} lines in body)`);
    
    return cleanedPem;
};

// ✅ ฟังก์ชัน parseCertFallback ที่มี debug logging
const parseCertFallback = (pem: string, certName: string = 'Certificate') => {
    console.log(`🔍 Parsing ${certName}...`);
    
    const pki = forge.pki;
    
    try {
        // พยายาม parse แบบปกติ
        const cert = pki.certificateFromPem(pem);
        console.log(`✅ ${certName} parsed successfully (standard method)`);
        
        // แสดงข้อมูลพื้นฐาน
        const subject = cert.subject.attributes
            .map((attr: any) => `${attr.shortName}=${attr.value}`)
            .join(', ');
        console.log(`📋 Subject: ${subject}`);
        
        return cert;
    } catch (e) {
        const error = e as Error;
        console.warn(`⚠️ ${certName}: Standard PEM parse failed:`, error.message);
        console.log("🔄 Trying ASN.1 fallback...");
        
        try {
            // ดึง base64 จาก PEM
            const base64 = pem
                .replace(/-----BEGIN [A-Z\s]+-----/, '')
                .replace(/-----END [A-Z\s]+-----/, '')
                .replace(/\s/g, '');
            
            if (!base64) {
                throw new Error('Empty base64 content after stripping headers');
            }
            
            console.log(`📏 Base64 length for fallback: ${base64.length} chars`);
            
            // แปลง base64 เป็น DER
            const der = forge.util.decode64(base64);
            console.log(`📏 DER length: ${der.length} bytes`);
            
            // แปลง DER เป็น ASN.1
            const asn1 = forge.asn1.fromDer(der);
            console.log('✅ ASN.1 structure created');
            
            // แปลง ASN.1 เป็น Certificate object
            const cert = pki.certificateFromAsn1(asn1);
            
            console.log(`✅ ${certName} parsed successfully (ASN.1 fallback)`);
            
            // แสดงข้อมูลพื้นฐาน
            const subject = cert.subject.attributes
                .map((attr: any) => `${attr.shortName}=${attr.value}`)
                .join(', ');
            console.log(`📋 Subject: ${subject}`);
            
            return cert;
        } catch (innerError) {
            const inner = innerError as Error;
            console.error(`❌ ${certName}: ASN.1 Fallback parse failed:`, inner.message);
            console.error('Stack:', inner.stack);
            throw new Error(
                `${certName}: Failed to parse. ` +
                `Original error: ${error.message}. ` +
                `Fallback error: ${inner.message}`
            );
        }
    }
};

// ฟังก์ชันสร้างรูปภาพในหลายขนาด
const createMultiResolutionImages = async (
    zip: any,
    manifest: Record<string, string>,
    baseBuffer: ArrayBuffer | null,
    baseName: string
) => {
    if (!baseBuffer) return;

    // เพิ่มรูปขนาดปกติ
    zip.file(`${baseName}.png`, baseBuffer);
    manifest[`${baseName}.png`] = createHash(baseBuffer);

    // สำหรับ icon ต้องมี @2x และ @3x ด้วย
    if (baseName === 'icon') {
        zip.file(`${baseName}@2x.png`, baseBuffer);
        manifest[`${baseName}@2x.png`] = createHash(baseBuffer);

        zip.file(`${baseName}@3x.png`, baseBuffer);
        manifest[`${baseName}@3x.png`] = createHash(baseBuffer);
    }
};

const handleRequest = async (c: any) => {
    try {
        console.log(`Start generating pass (${c.req.method})...`);

        // 1. Load Environment Variables
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        const wwdrPemRaw = Deno.env.get('PASS_WWDR2') || '';
        const signerCertPemRaw = Deno.env.get('PASS_SIGNER_CERT') || '';
        const signerKeyPemRaw = Deno.env.get('PASS_SIGNER_KEY') || '';

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return c.json({ error: 'Server configuration error: Missing Supabase credentials.' }, 500);
        }
        if (!wwdrPemRaw || !signerCertPemRaw || !signerKeyPemRaw) {
            return c.json({
                error: 'Server configuration error: Missing Apple Wallet Certificates.',
                hint: 'Required: PASS_WWDR (G4), PASS_SIGNER_CERT, PASS_SIGNER_KEY'
            }, 500);
        }

        // 2. Initialize Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 3. Get Request Data
        let runnerId;
        if (c.req.method === 'GET') {
            runnerId = c.req.query('runnerId');
        } else {
            try {
                const body = await c.req.json();
                runnerId = body.runnerId;
            } catch (e) {
                console.warn("Failed to parse JSON body, falling back to query param");
                runnerId = c.req.query('runnerId');
            }
        }

        if (!runnerId) return c.json({ error: 'Missing runnerId' }, 400);
        console.log(`Request for runnerId: ${runnerId}`);

        // 4. Fetch Data from DB
        const { data: walletConfig, error: walletError } = await supabase.from('wallet_config').select('*').single();
        const { data: runner, error: runnerError } = await supabase.from('runners').select('*').eq('id', runnerId).single();

        if (walletError || !walletConfig) return c.json({ error: 'Wallet config not found' }, 404);
        if (runnerError || !runner) return c.json({ error: 'Runner not found' }, 404);

        const appleConfig = walletConfig.apple_wallet_config;
        if (!appleConfig) return c.json({ error: 'Apple Wallet not configured' }, 500);

        // Validate required fields according to Apple Wallet specifications
        if (!appleConfig.passTypeId || !appleConfig.teamId) {
            return c.json({
                error: 'Missing required configuration',
                details: 'passTypeIdentifier and teamIdentifier are required for Apple Wallet passes',
                missing: {
                    passTypeId: !appleConfig.passTypeId,
                    teamId: !appleConfig.teamId
                }
            }, 500);
        }

        // Validate passTypeId format (should be reverse domain format: pass.com.example.app)
        if (!/^pass\.([a-z0-9-]+\.)+[a-z]{2,}$/i.test(appleConfig.passTypeId)) {
            console.warn(`⚠️ Warning: passTypeId format may be incorrect: ${appleConfig.passTypeId}`);
        }

        // Validate teamId format (should be 10 alphanumeric characters)
        if (!/^[A-Z0-9]{10}$/i.test(appleConfig.teamId)) {
            console.warn(`⚠️ Warning: teamId format may be incorrect: ${appleConfig.teamId}`);
        }

        const barcodeKey = appleConfig.barcodeValueSource || 'bib';
        const barcodeValue = runner[barcodeKey] !== undefined && runner[barcodeKey] !== null ? String(runner[barcodeKey]) : runner.bib;

        const fieldMappings = appleConfig.field_mappings || {};

        // Ensure field_mappings has all required arrays
        const safeFieldMappings = {
            primaryFields: Array.isArray(fieldMappings.primaryFields) ? fieldMappings.primaryFields : [],
            secondaryFields: Array.isArray(fieldMappings.secondaryFields) ? fieldMappings.secondaryFields : [],
            auxiliaryFields: Array.isArray(fieldMappings.auxiliaryFields) ? fieldMappings.auxiliaryFields : [],
            backFields: Array.isArray(fieldMappings.backFields) ? fieldMappings.backFields : [],
        };

        const getFields = (fields: any[]) => {
            if (!Array.isArray(fields)) return [];
            return fields.map((f: any) => ({
                key: f.key || 'unknown',
                label: f.label || '',
                value: fillTemplate(f.valueTemplate || '', runner)
            })).filter(f => f.value !== ''); // Filter out empty values
        };

        // 5. Construct pass.json according to Apple Wallet specifications
        // Validate required fields
        if (!appleConfig.passTypeId || !appleConfig.teamId || !appleConfig.organizationName) {
            return c.json({
                error: 'Missing required fields in Apple Wallet config',
                required: ['passTypeId', 'teamId', 'organizationName']
            }, 500);
        }

        const primaryFields = getFields(safeFieldMappings.primaryFields);
        if (primaryFields.length === 0) {
            return c.json({
                error: 'At least one primary field is required for eventTicket pass',
            }, 500);
        }

        const passJson: any = {
            formatVersion: 1, // Required: Must be number, not string
            passTypeIdentifier: appleConfig.passTypeId, // Required
            serialNumber: runner.access_key || String(runner.id), // Required: Must be unique
            teamIdentifier: appleConfig.teamId, // Required
            organizationName: appleConfig.organizationName, // Required
            description: appleConfig.description || 'Event Pass', // Required
            foregroundColor: appleConfig.foregroundColor || 'rgb(255, 255, 255)',
            backgroundColor: appleConfig.backgroundColor || 'rgb(0, 0, 0)',
            labelColor: appleConfig.labelColor || 'rgb(255, 255, 255)',
            eventTicket: {
                primaryFields: primaryFields, // Required: At least one
                secondaryFields: getFields(safeFieldMappings.secondaryFields), // Optional
                auxiliaryFields: getFields(safeFieldMappings.auxiliaryFields), // Optional
                backFields: getFields(safeFieldMappings.backFields), // Optional
            },
            // ✅ แก้ไข: ใช้ barcodes (array) แทน barcode (object)
            barcodes: [{
                message: String(barcodeValue),
                format: appleConfig.barcodeFormat || "PKBarcodeFormatQR",
                messageEncoding: "utf-8", // เปลี่ยนเป็น utf-8 เพื่อรองรับภาษาไทย
                altText: String(barcodeValue) // ข้อความที่แสดงใต้ barcode
            }],

            // ✅ เพิ่ม: Backward compatibility สำหรับ iOS เก่า
            barcode: {
                message: String(barcodeValue),
                format: appleConfig.barcodeFormat || "PKBarcodeFormatQR",
                messageEncoding: "utf-8"
            }
        };

        // Optional: logoText - only add if provided (replaces logo.png text)
        if (appleConfig.logoText) {
            passJson.logoText = appleConfig.logoText;
        }

        // ✅ Validate and format relevantDate as ISO 8601
        if (appleConfig.relevantDate) {
            try {
                const date = new Date(appleConfig.relevantDate);
                if (!isNaN(date.getTime())) {
                    // Format as ISO 8601: "2024-05-28T12:00:00Z"
                    passJson.relevantDate = date.toISOString();
                    console.log(`✅ relevantDate: ${passJson.relevantDate}`);
                } else {
                    console.warn(`⚠️ Invalid relevantDate: ${appleConfig.relevantDate}`);
                }
            } catch (e) {
                console.error(`❌ Error parsing relevantDate: ${e}`);
            }
        }

        if (appleConfig.eventLatitude && appleConfig.eventLongitude) {
            passJson.locations = [{
                latitude: parseFloat(appleConfig.eventLatitude),
                longitude: parseFloat(appleConfig.eventLongitude),
                relevantText: appleConfig.relevantText || undefined
            }];
        }

        // 6. Prepare Images
        // According to Apple Wallet specs:
        // - icon.png is REQUIRED (29x29pt @1x, @2x, @3x)
        // - logo.png is optional (max 160x50pt @1x, @2x, @3x)
        // - strip.png is optional for eventTicket (375x98pt @1x, @2x, @3x)

        console.log("Fetching images...");
        const logoUrl = appleConfig.logoUri;
        const iconUrl = appleConfig.iconUri;
        const stripUrl = appleConfig.stripImageUri;

        const logoBuffer = await fetchImage(logoUrl);
        const iconBuffer = await fetchImage(iconUrl);
        const stripBuffer = await fetchImage(stripUrl);

        // Validate that icon.png exists (required by Apple Wallet)
        if (!iconBuffer) {
            return c.json({
                error: 'Missing required image',
                details: 'icon.png is required for Apple Wallet passes. Please configure iconUri in your Apple Wallet settings.',
                hint: 'Icon must be 29x29pt at @1x resolution (29x29px, 58x58px @2x, 87x87px @3x)'
            }, 500);
        }

        // 7. Create Zip with manifest
        const zip = new JSZip();
        const manifest: Record<string, string> = {};

        // Add pass.json (always required)
        const passJsonString = JSON.stringify(passJson, null, 2); // Pretty print for debugging
        zip.file("pass.json", passJsonString);
        manifest["pass.json"] = createHash(passJsonString);

        // Add images with multiple resolutions
        // Icon is required - we've already validated it exists
        await createMultiResolutionImages(zip, manifest, iconBuffer, 'icon');

        // Logo is optional but recommended
        if (logoBuffer) {
            await createMultiResolutionImages(zip, manifest, logoBuffer, 'logo');
        } else {
            console.log('ℹ️ Logo image not provided - using logoText instead');
        }

        // Strip is optional for eventTicket
        if (stripBuffer) {
            zip.file("strip.png", stripBuffer);
            manifest["strip.png"] = createHash(stripBuffer);

            // Add @2x and @3x versions if needed (using same image for now)
            zip.file("strip@2x.png", stripBuffer);
            manifest["strip@2x.png"] = createHash(stripBuffer);

            zip.file("strip@3x.png", stripBuffer);
            manifest["strip@3x.png"] = createHash(stripBuffer);
        }

        // 8. Create Manifest
        // manifest.json must contain SHA1 hash of ALL files in the pass (except manifest.json and signature itself)
        // Files must be sorted alphabetically in manifest
        const sortedManifest: Record<string, string> = {};
        Object.keys(manifest).sort().forEach(key => {
            sortedManifest[key] = manifest[key];
        });

        const manifestString = JSON.stringify(sortedManifest);
        zip.file("manifest.json", manifestString);

        console.log(`📋 Manifest contains ${Object.keys(sortedManifest).length} files`);

        // แทนที่ส่วน "9. Sign Manifest" ในโค้ดเดิม

        // 9. Sign Manifest
        try {
            const pki = forge.pki;
            let certificate, privateKey, wwdrCert;

            // ✅ เพิ่ม: Debug certificate loading
            console.log('🔍 === CERTIFICATE LOADING DEBUG ===');
            console.log(`📏 WWDR Raw Length: ${wwdrPemRaw.length} chars`);
            console.log(`📏 Signer Cert Raw Length: ${signerCertPemRaw.length} chars`);
            console.log(`📏 Signer Key Raw Length: ${signerKeyPemRaw.length} chars`);

            // Preview first 100 chars of each (ตรวจสอบว่ามี BEGIN header ไหม)
            console.log(`📄 WWDR Preview: ${wwdrPemRaw.substring(0, 100)}...`);
            console.log(`📄 Signer Cert Preview: ${signerCertPemRaw.substring(0, 100)}...`);
            console.log(`📄 Signer Key Preview: ${signerKeyPemRaw.substring(0, 100)}...`);

            // ตรวจสอบว่ามี header/footer ครบไหม
            const checkPemFormat = (pem: string, name: string) => {
                const hasBegin = pem.includes('-----BEGIN');
                const hasEnd = pem.includes('-----END');
                console.log(`🔍 ${name}:`, {
                    hasBegin,
                    hasEnd,
                    hasNewlines: pem.includes('\n'),
                    hasBackslashN: pem.includes('\\n'),
                    hasQuotes: pem.includes('"')
                });
            };

            checkPemFormat(wwdrPemRaw, 'WWDR');
            checkPemFormat(signerCertPemRaw, 'Signer Cert');
            checkPemFormat(signerKeyPemRaw, 'Signer Key');

            console.log('🔍 === PARSING CERTIFICATES ===');

            // ✅ Parse Signer Certificate
            try {
                console.log('🔄 Parsing Signer Certificate...');
                const cleanedSignerCert = cleanPem(signerCertPemRaw);
                console.log(`✅ Cleaned Signer Cert (first 100 chars): ${cleanedSignerCert.substring(0, 100)}...`);

                certificate = parseCertFallback(cleanedSignerCert);

                const signerCN = certificate.subject.attributes
                    .find((attr: any) => attr.shortName === 'CN')?.value || '';
                console.log(`✅ Signer Certificate parsed: CN="${signerCN}"`);

            } catch (e) {
                console.error('❌ FAILED to parse Signer Certificate');
                console.error('Error:', (e as Error).message);
                console.error('Stack:', (e as Error).stack);
                throw new Error(`Failed to parse Signer Cert: ${(e as Error).message}`);
            }

            // ✅ Parse Private Key
            try {
                console.log('🔄 Parsing Private Key...');
                const cleanedKey = cleanPem(signerKeyPemRaw);
                console.log(`✅ Cleaned Private Key (first 100 chars): ${cleanedKey.substring(0, 100)}...`);

                privateKey = pki.privateKeyFromPem(cleanedKey);
                console.log('✅ Private Key parsed successfully');

            } catch (e) {
                console.error('❌ FAILED to parse Private Key');
                console.error('Error:', (e as Error).message);
                console.error('Stack:', (e as Error).stack);
                throw new Error(`Failed to parse Private Key: ${(e as Error).message}`);
            }

            // ✅ Parse WWDR Certificate
            try {
                console.log('🔄 Parsing WWDR Certificate...');
                const cleanedWwdr = cleanPem(wwdrPemRaw);
                console.log(`✅ Cleaned WWDR (first 100 chars): ${cleanedWwdr.substring(0, 100)}...`);

                wwdrCert = parseCertFallback(cleanedWwdr);

                // ดึงข้อมูล Subject ทั้งหมด
                const wwdrSubjectStr = wwdrCert.subject.attributes
                    .map((attr: any) => `${attr.shortName}=${attr.value}`)
                    .join(', ');

                console.log(`📜 WWDR Certificate Subject: ${wwdrSubjectStr}`);

                // ตรวจสอบ CN (Common Name)
                const wwdrCN = wwdrCert.subject.attributes
                    .find((attr: any) => attr.shortName === 'CN')?.value || '';

                if (!wwdrCN.includes('Worldwide Developer Relations')) {
                    throw new Error(
                        `❌ Invalid WWDR Certificate. CN must contain "Worldwide Developer Relations". ` +
                        `Found: ${wwdrCN}`
                    );
                }

                // ตรวจสอบ G4
                const wwdrOU = wwdrCert.subject.attributes
                    .find((attr: any) => attr.shortName === 'OU')?.value || '';

                console.log(`📋 WWDR OU: ${wwdrOU || 'Not found in OU field'}`);

                const hasG4 = wwdrOU.includes('G4') || wwdrCN.includes('G4');

                if (!hasG4) {
                    throw new Error(
                        `❌ WWDR Certificate is NOT G4 (OU: ${wwdrOU}, CN: ${wwdrCN}). ` +
                        `Apple Wallet REQUIRES G4 certificate. ` +
                        `Download "Worldwide Developer Relations - G4 (Expiring 12/10/2030)" from: ` +
                        `https://www.apple.com/certificateauthority/`
                    );
                }

                // ตรวจสอบ Expiration Date
                const notAfter = wwdrCert.validity.notAfter;
                const expiryYear = notAfter.getFullYear();

                console.log(`📅 WWDR Certificate Expires: ${notAfter.toISOString()}`);

                if (expiryYear !== 2030) {
                    console.warn(`⚠️ Warning: WWDR expiry year is ${expiryYear}, expected 2030 for G4`);
                }

                // ตรวจสอบว่าเป็น RSA
                const publicKey = wwdrCert.publicKey;
                if (!(publicKey as any).n) {
                    throw new Error(
                        `❌ WWDR Certificate uses wrong algorithm (ECC/ECDSA). ` +
                        `Must be RSA. You may have downloaded G6 instead of G4.`
                    );
                }

                console.log(`✅ Algorithm: RSA-${(publicKey as any).n.bitLength()} bit`);

                // ตรวจสอบ Certificate Chain Trust
                const signerAuthKeyId = certificate.extensions?.find(
                    (ext: any) => ext.name === 'authorityKeyIdentifier'
                )?.value;

                const wwdrSubjectKeyId = wwdrCert.extensions?.find(
                    (ext: any) => ext.name === 'subjectKeyIdentifier'
                )?.value;

                console.log('🔗 Signer Authority Key ID:', signerAuthKeyId ? 'Present' : 'Missing');
                console.log('🔗 WWDR Subject Key ID:', wwdrSubjectKeyId ? 'Present' : 'Missing');

                console.log('✅ WWDR G4 Certificate validated successfully');

            } catch (e) {
                console.error('❌ FAILED to parse WWDR Certificate');
                console.error('Error:', (e as Error).message);
                console.error('Stack:', (e as Error).stack);

                const msg = (e as Error).message;
                if (msg.includes('❌')) {
                    throw e; // Re-throw our custom validation errors
                }
                throw new Error(`Failed to parse/validate WWDR Cert: ${msg}`);
            }

            console.log('🔍 === ALL CERTIFICATES PARSED SUCCESSFULLY ===');

            // Sign manifest.json according to Apple Wallet PKCS#7 specification
            console.log('🔏 Creating PKCS#7 signature...');
            const p7 = forge.pkcs7.createSignedData();
            p7.content = forge.util.createBuffer(manifestString, 'utf8');

            // Add certificates in correct order
            p7.addCertificate(certificate); // Signer certificate first
            p7.addCertificate(wwdrCert);    // WWDR certificate second

            // Add signer with required authenticated attributes
            p7.addSigner({
                key: privateKey,
                certificate: certificate,
                digestAlgorithm: forge.pki.oids.sha1,
                authenticatedAttributes: [{
                    type: forge.pki.oids.contentType,
                    value: forge.pki.oids.data
                }, {
                    type: forge.pki.oids.messageDigest,
                }, {
                    type: forge.pki.oids.signingTime,
                }]
            });

            // Sign with detached signature
            p7.sign({ detached: true });

            // Convert to DER format
            const asn1 = p7.toAsn1();
            const der = forge.asn1.toDer(asn1);

            let derBytes: string;

            try {
                const bytesResult = der.getBytes();
                console.log(`🔍 der.getBytes() returned type: ${typeof bytesResult}`);

                if (typeof bytesResult === 'string') {
                    derBytes = bytesResult;
                } else {
                    console.warn('⚠️ der.getBytes() did not return string, attempting conversion...');
                    derBytes = String(bytesResult);
                }
            } catch (err) {
                console.error('❌ Error getting bytes from der:', err);
                throw new Error(`Failed to extract DER bytes: ${(err as Error).message}`);
            }

            if (!derBytes || typeof derBytes.charCodeAt !== 'function') {
                throw new Error(`Invalid DER bytes type: ${typeof derBytes}, has charCodeAt: ${typeof derBytes?.charCodeAt}`);
            }

            // Convert to Uint8Array
            const signatureBuffer = new Uint8Array(derBytes.length);
            for (let i = 0; i < derBytes.length; i++) {
                const charCode = derBytes.charCodeAt(i);
                signatureBuffer[i] = charCode & 0xFF;
            }

            // Add signature file to zip
            zip.file("signature", signatureBuffer);

            console.log(`✅ Signature created: ${signatureBuffer.length} bytes`);
            console.log('✅ Pass signed successfully');

        } catch (err) {
            console.error("❌ === SIGNING ERROR ===");
            console.error("Error message:", (err as Error).message);
            console.error("Error stack:", (err as Error).stack);
            return c.json({ error: `Pass Signing Failed: ${(err as Error).message}` }, 500);
        }

        // 10. Generate Zip Content
        // Important: ZIP must be created with proper compression and structure
        // manifest.json must be added before signature
        const content = await zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
            compressionOptions: { level: 6 } // Standard compression level
        });

        console.log(`✅ PKPass file generated successfully (${content.length} bytes)`);

        // ✅ Generate safe filename (no spaces, URL-safe)
        const safeFilename = `pass_${runnerId}_${Date.now()}.pkpass`;

        return new Response(content, {
            headers: {
                "Content-Type": "application/vnd.apple.pkpass",
                "Content-Disposition": `attachment; filename="${safeFilename}"`,
                "Content-Length": content.length.toString()
            }
        });

    } catch (error) {
        console.error("Critical Error:", error);
        return c.json({ error: (error as Error).message }, 500);
    }
};

app.all('*', handleRequest);

serve(app.fetch);