

export interface Runner {
  id?: string; // Supabase row ID
  created_at?: string;
  first_name: string;
  last_name: string;
  id_card_hash: string | null; // Used for verification, optional (can be null)
  bib: string;
  name_on_bib?: string; // Optional, kept for backward compatibility
  race_kit: string;
  row?: string;
  row_no?: string;
  row_start?: string; // Deprecated, kept for backward compatibility
  shirt: string;
  shirt_type?: string;
  gender: string;
  nationality: string;
  age_category: string;
  block: string;
  wave_start: string;
  pre_order: string;
  first_half_marathon: string; // Changed to string (text in DB)
  note: string;
  top_50_no?: string; // TOP 50 Number
  top50?: string; // TOP 50 information
  colour_sign?: string; // Color sign information
  qr?: string; // QR code URL
  pass_generated: boolean; // Indicates if a pass has been generated/sent
  google_jwt: string | null; // Re-added to match DB schema
  apple_pass_url: string | null; // Re-added to match DB schema
  access_key: string; // UUID for personalized bib pass links
  web_pass_template_id?: string; // ID of the WebPassConfig template to use
  google_wallet_pass_id?: string | null; // Google Wallet pass object ID
}


export interface ApiResponse<T> {
  data?: T;
  error?: string;
  totalCount?: number; // Added for server-side pagination
}

export interface ResendEmailPayload {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}

export interface ResendEmailResponse {
  id: string;
  created_at: string;
}

export interface BibPassData {
  runner: Runner;
  qrCodeUrl: string;
  customImageUrl?: string;
}

// --- User Activity Log Interfaces ---

export type ActivityType = 'lookup' | 'save_image' | 'add_google_wallet' | 'add_apple_wallet' | 'view_pass';
export type SearchMethod = 'name' | 'id_card';

export interface ActivityLogMetadata {
  // For save_image
  image_format?: string;
  image_dimensions?: { width: number; height: number };
  file_name?: string;
  
  // For wallet actions
  wallet_type?: 'google' | 'apple';
  pass_url?: string;
  
  // Additional metadata
  [key: string]: unknown;
}

export interface UserActivityLog {
  id?: string;
  created_at?: string;
  activity_type: ActivityType;
  runner_id?: string | null;
  search_method?: SearchMethod | null;
  search_input_hash?: string | null;
  success: boolean;
  ip_address?: string | null;
  user_agent?: string | null;
  error_message?: string | null;
  metadata?: ActivityLogMetadata;
}

export interface CreateActivityLogParams {
  activity_type: ActivityType;
  runner_id?: string | null;
  search_method?: SearchMethod | null;
  search_input_hash?: string | null;
  success: boolean;
  ip_address?: string | null;
  user_agent?: string | null;
  error_message?: string | null;
  metadata?: ActivityLogMetadata;
}

// --- Analytics Interfaces ---

export interface ActivityStatistics {
  total_lookups: number;
  successful_lookups: number;
  failed_lookups: number;
  lookup_success_rate: number;
  total_downloads: number;
  successful_downloads: number;
  failed_downloads: number;
  download_success_rate: number;
}

export interface DailyStatistics {
  date: string;
  lookups: number;
  downloads: number;
}


// --- Interfaces for Google Wallet Field Mapping ---

export interface TemplateMapping {
  enabled: boolean;
  template: string; // e.g., "{first_name} {last_name}"
}

export interface SourceColumnMapping {
  enabled: boolean;
  sourceColumn: keyof Runner | ''; // e.g., "bib"
}

export interface TextModuleMapping {
  id: string; // For React keys, e.g., "tm_bib"
  header: string; // Static text, e.g., "BIB Number"
  bodyTemplate: string; // Template string, e.g., "{bib}"
}

export interface FieldMappingsConfig {
  header: TemplateMapping;
  subheader: TemplateMapping;
  barcodeValue: SourceColumnMapping;
  textModules: TextModuleMapping[];
  informationRows?: {
    left?: { enabled?: boolean; label: string; value: string };
    middle?: { enabled?: boolean; label: string; value: string };
    right?: { enabled?: boolean; label: string; value: string };
  }[];
}

// --- Interfaces for Apple Wallet Field Mapping ---

export interface AppleFieldMapping {
  id: string; // For React keys
  key: string; // The key used in the pass.json (e.g., "bib_number")
  label: string; // The label displayed on the pass (e.g., "BIB")
  valueTemplate: string; // The template for the value (e.g., "{bib}")
}

export interface AppleFieldMappingsConfig {
  headerFields?: AppleFieldMapping[]; // Optional: For generic pass type
  primaryFields: AppleFieldMapping[];
  secondaryFields: AppleFieldMapping[];
  auxiliaryFields: AppleFieldMapping[];
  backFields: AppleFieldMapping[];

    // ✅ เพิ่ม: Google Wallet style config (จะถูกแปลงเป็น Apple Wallet fields อัตโนมัติ)
    header?: { enabled: boolean; template: string }; // Google Wallet style header
    subheader?: { enabled: boolean; template: string }; // Google Wallet style subheader
    informationRows?: {
        left?: { enabled?: boolean; label: string; value: string };
        middle?: { enabled?: boolean; label: string; value: string };
        right?: { enabled?: boolean; label: string; value: string };
    }[];
}

export interface AppleWalletConfig {
  passTypeId: string;
  teamId: string;
  organizationName: string;
  description: string;
  foregroundColor: string; // "rgb(255, 255, 255)"
  backgroundColor: string; // "rgb(29, 161, 242)"
  labelColor: string; // "rgb(200, 200, 200)"
  logoText: string;
  // New image fields
  iconUri?: string;
  logoUri?: string;
  stripImageUri?: string;

  // Triggers
  relevantDate?: string; // ISO 8601 Date string - When pass should appear on lock screen
  expirationDate?: string; // ISO 8601 Date string - When pass expires (prevents pass from being marked as expired)
  eventLatitude?: number;
  eventLongitude?: number;
  relevantText?: string; // Text displayed on lock screen near location

  // Barcode Settings
  barcodeFormat: "PKBarcodeFormatQR" | "PKBarcodeFormatPDF417" | "PKBarcodeFormatAztec" | "PKBarcodeFormatCode128";
  barcodeValueSource?: keyof Runner; // New: Source column for barcode value

  field_mappings: AppleFieldMappingsConfig;
}

// --- New: Web Pass Config (The HTML Card) ---

export interface PassField {
  id: string;
  key: keyof Runner | 'custom_text' | 'qr_code' | 'profile_picture';
  label: string; // Display name in editor
  valueTemplate?: string; // For composite values like "{first_name} {last_name}"
  customText?: string; // For static text
  profilePicture?: string; // For profile picture
  profileWidth?: number; // For profile picture width
  profileHeight?: number; // For profile picture height
  profileShape?: 'circle' | 'square'; // Profile picture shape: circle or square
  // New: Support for multiple data sources
  dataSources?: (keyof Runner | 'custom_text' | 'profile_picture')[]; // Array of data source keys
  separator?: string; // Separator string between data sources (default: ' ')
  x: number; // Percentage (0-100)
  y: number; // Percentage (0-100)
  fontSize: number; // px (relative to base size)
  color: string;
  fontWeight: 'normal' | 'bold' | '800';
  textAlign: 'left' | 'center' | 'right';
  fontFamily?: 'LINESeedSansTH' | 'Uniform' | 'Uniform Condensed' | 'Uniform Extra Condensed' | 'sans-serif'; // Font family for this field
  width?: number; // Percentage (0-100), useful for centering
  toFitType?: 'scale' | 'wrap' | 'fixed'; // How to fit the field to container: 'scale' (adjust font size), 'wrap' (wrap text), or 'fixed' (fixed width 300px, right-aligned)
  toFitWidth?: number; // Desired width in pixels when toFitType is set (e.g., 420 or 50)
  minSize?: number; // Minimum font size in pixels when toFitType is 'scale' (default: 10)
}

export interface TemplateAssignmentRule {
  id: string;
  template_id: string;
  column: keyof Runner;
  operator: 'equals' | 'contains'; // Simple operators for now
  value: string;
}

export interface WebPassConfig {
  id: string; // Template ID
  name: string; // Template Name
  // Global Settings
  eventName: string;
  eventLogoUrl: string;
  backgroundImageUrl?: string;
  backgroundColor?: string;
  fontFamily?: 'LINESeedSansTH' | 'Uniform' | 'Uniform Condensed' | 'Uniform Extra Condensed' | 'sans-serif'; // Font family selection

  // Dynamic Fields
  fields: PassField[];
}


// --- Main WalletConfig Interface ---

export interface WalletConfig {
  id: number; // Using a fixed ID for the single config row
  created_at?: string;

  // Google Wallet Specific Config
  issuer_id: string;
  class_suffix: string;
  hex_background_color: string;
  logo_uri: string;
  card_title: string;
  hero_image_uri: string;

  // Google Links & Locations
  official_website_uri?: string;
  eventLatitude?: number;
  eventLongitude?: number;

  field_mappings: FieldMappingsConfig;

  // New: Apple Wallet Specific Config (stored in a separate JSONB column)
  apple_wallet_config: AppleWalletConfig;

  // New: Web Pass Config (stored in JSONB)
  web_pass_config?: WebPassConfig; // Deprecated: Use web_pass_templates instead
  web_pass_templates?: WebPassConfig[]; // List of available templates
  template_assignment_rules?: TemplateAssignmentRule[]; // Rules for auto-assigning templates

  // New: Runner Lookup Page Config
  lookup_page_title?: string;
  lookup_page_instructions?: string;

  // New: Bib Pass Config (stored in JSONB)
  web_bib_templates?: WebPassConfig[]; // List of available templates
  template_assignment_rules_bib?: TemplateAssignmentRule[]; // Rules for auto-assigning templates
}

declare global {
  // Type definitions for Vite's import.meta.env
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  // Re-added: Type definition for the window object to support dev environment config
  interface Window {
    __APP_ENV__: {
      SUPABASE_URL: string;
      SUPABASE_ANON_KEY: string;
    };
  }
}
