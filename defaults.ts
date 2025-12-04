import { WalletConfig, FieldMappingsConfig, TextModuleMapping, AppleWalletConfig, WebPassConfig, Runner } from './types';
import { v4 as uuidv4 } from 'uuid';

export const RUNNER_COLUMNS: (keyof Runner)[] = [
    "first_name", "last_name", "id_card_hash", "bib", "name_on_bib",
    "race_kit", "row", "row_no", "shirt", "shirt_type", "gender", "nationality", "age_category",
    "block", "wave_start", "pre_order", "first_half_marathon", "note", "top_50_no", "top50", "colour_sign", "qr", "access_key"
];

export const DEFAULT_FIELD_MAPPINGS: FieldMappingsConfig = {
    header: { enabled: true, template: '{first_name} {last_name}' },
    subheader: { enabled: true, template: 'Kit: {race_kit} / Wave: {wave_start}' },
    barcodeValue: { enabled: true, sourceColumn: 'bib' },
    textModules: [
        { id: 'tm_bib', header: 'BIB Number', bodyTemplate: '{bib}' },
        { id: 'tm_name', header: 'Racer Name', bodyTemplate: '{name_on_bib}' },
        { id: 'tm_block', header: 'Block', bodyTemplate: '{block}' },
    ]
};

export const DEFAULT_APPLE_CONFIG: AppleWalletConfig = {
    passTypeId: '',
    teamId: '',
    organizationName: 'Race Pass Inc.',
    description: 'Race Bib Pass',
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(29, 161, 242)',
    labelColor: 'rgb(200, 200, 200)',
    logoText: 'Race Pass',
    iconUri: '',
    logoUri: '',
    stripImageUri: '',
    barcodeFormat: 'PKBarcodeFormatQR',
    barcodeValueSource: 'bib', // Default to BIB
    field_mappings: {
        primaryFields: [{ id: uuidv4(), key: 'bib', label: 'BIB', valueTemplate: '{bib}' }],
        secondaryFields: [{ id: uuidv4(), key: 'name', label: 'Racer', valueTemplate: '{name_on_bib}' }],
        auxiliaryFields: [
            { id: uuidv4(), key: 'wave', label: 'Wave Start', valueTemplate: '{wave_start}' },
            { id: uuidv4(), key: 'block', label: 'Block', valueTemplate: '{block}' },
        ],
        backFields: [{ id: uuidv4(), key: 'website', label: 'Official Website', valueTemplate: 'https://your-race-website.com' }],
    },
};

export const DEFAULT_WEB_PASS_CONFIG: WebPassConfig = {
    id: 'default',
    name: 'Default Template',
    eventName: 'BANGSAEN 21',
    eventLogoUrl: '',
    backgroundImageUrl: '',
    backgroundColor: '#ffffff',
    fontFamily: 'LINESeedSansTH',
    fields: [
        {
            id: 'default_name',
            key: 'first_name',
            label: 'Runner Name',
            valueTemplate: '{first_name} {last_name}',
            x: 50,
            y: 30,
            fontSize: 24,
            color: '#000000',
            fontWeight: 'bold',
            textAlign: 'center'
        },
        {
            id: 'default_bib',
            key: 'bib',
            label: 'BIB',
            x: 50,
            y: 50,
            fontSize: 48,
            color: '#000000',
            fontWeight: '800',
            textAlign: 'center'
        }
    ]
};

export const DEFAULT_CONFIG: Omit<WalletConfig, 'id' | 'created_at'> = {
    issuer_id: '',
    class_suffix: 'race-pass-class-v1',
    hex_background_color: '#4285f4',
    logo_uri: 'https://storage.googleapis.com/wallet-lab-tools-codelab-artifacts-public/pass_google_logo.jpg',
    card_title: 'Race Bib Pass',
    hero_image_uri: 'https://storage.googleapis.com/wallet-lab-tools-codelab-artifacts-public/google-io-hero-demo-only.jpg',
    official_website_uri: 'https://pay.google.com/gp/v/card/',
    eventLatitude: undefined,
    eventLongitude: undefined,
    field_mappings: DEFAULT_FIELD_MAPPINGS,
    apple_wallet_config: DEFAULT_APPLE_CONFIG,
    web_pass_config: DEFAULT_WEB_PASS_CONFIG,
    web_pass_templates: [DEFAULT_WEB_PASS_CONFIG],
    template_assignment_rules: [],
    lookup_page_title: 'Find Your Runner Card',
    lookup_page_instructions: 'Enter your details below to find your pass. You can use your first and last name, or your National ID number.',
};
