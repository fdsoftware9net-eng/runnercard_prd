

import React from 'react';
import { AppleWalletConfig, Runner } from '../types';
import QRCode from 'qrcode';

const PREVIEW_RUNNER: Runner = {
    first_name: 'JOHN',
    last_name: 'APPLESEED',
    id_card_hash: 'xxxx',
    bib: 'BIB-5678',
    name_on_bib: 'J. APPLESEED',
    race_kit: 'Premium',
    row_start: 'B2',
    shirt: 'L',
    gender: 'Male',
    nationality: 'CAN',
    age_category: '40-49',
    block: 'B',
    wave_start: '2',
    pre_order: 'None',
    first_half_marathon: 'No',
    note: 'Early bird registration',
    pass_generated: false,
    google_jwt: null,
    apple_pass_url: null,
    access_key: 'preview-apple-key'
};

const fillTemplate = (template: string | undefined, runner: Runner): string => {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key: keyof Runner) => {
        return runner[key] !== undefined && runner[key] !== null ? String(runner[key]) : '';
    });
};

interface AppleWalletPassPreviewProps {
    config: Partial<AppleWalletConfig>;
}

const AppleWalletPassPreview: React.FC<AppleWalletPassPreviewProps> = ({ config }) => {
    const {
        backgroundColor = 'rgb(29, 161, 242)',
        foregroundColor = 'rgb(255, 255, 255)',
        labelColor = 'rgb(200, 200, 200)',
        logoText = 'Race Pass',
        iconUri,
        logoUri,
        stripImageUri,
        field_mappings,
        barcodeValueSource = 'bib'
    } = config;
    
    const [qrCodeUrl, setQrCodeUrl] = React.useState('');
    
    // Determine barcode value based on selection, default to BIB
    const rawBarcodeValue = PREVIEW_RUNNER[barcodeValueSource as keyof Runner] || PREVIEW_RUNNER.bib;
    const barcodeValue = String(rawBarcodeValue);

    React.useEffect(() => {
        QRCode.toDataURL(barcodeValue, { width: 120, margin: 1 })
            .then(url => setQrCodeUrl(url))
            .catch(err => console.error(err));
    }, [barcodeValue]);

    return (
        <div className="w-full max-w-sm mx-auto font-sans rounded-xl shadow-lg overflow-hidden" style={{ backgroundColor }}>
            {/* Header: Icon, Logo and Logo Text */}
            <div className="p-4 flex items-center gap-3">
                {/* Icon (small, typically 29x29pt) */}
                {iconUri ? (
                    <img src={iconUri} alt="Icon" className="w-7 h-7 object-contain rounded-md flex-shrink-0" onError={(e) => e.currentTarget.style.display = 'none'} />
                ) : null}
                {/* Logo (larger, max 160x50pt) */}
                {logoUri ? (
                    <img src={logoUri} alt="Logo" className="h-10 object-contain rounded-md flex-shrink-0" style={{ maxWidth: '160px' }} onError={(e) => e.currentTarget.style.display = 'none'} />
                ) : !iconUri ? (
                    // Fallback icon only if neither icon nor logo is provided
                    <div className="w-8 h-8 border-2 rounded-full flex items-center justify-center flex-shrink-0" style={{ borderColor: foregroundColor, color: foregroundColor }}>
                        <span className="text-xs font-bold -mt-px">i</span>
                    </div>
                ) : null}
                <p className="font-semibold truncate flex-1" style={{ color: foregroundColor }}>{logoText}</p>
            </div>

            {/* Strip Image (Hero) */}
            {stripImageUri && (
                <div className="w-full h-28 bg-gray-300">
                    <img src={stripImageUri} alt="Strip" className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
            )}

            <div className="p-4">
                {/* Primary & Secondary Fields */}
                <div className="flex justify-between items-start">
                    <div>
                        {(field_mappings?.primaryFields || []).map(field => (
                            <div key={field.id || field.key || Math.random()}>
                                <p className="uppercase text-sm" style={{ color: labelColor }}>{field.label || ''}</p>
                                <p className="font-bold text-2xl" style={{ color: foregroundColor }}>{fillTemplate(field.valueTemplate, PREVIEW_RUNNER)}</p>
                            </div>
                        ))}
                    </div>
                     <div className="text-right">
                        {(field_mappings?.secondaryFields || []).map(field => (
                            <div key={field.id || field.key || Math.random()}>
                                <p className="uppercase text-sm" style={{ color: labelColor }}>{field.label || ''}</p>
                                <p className="font-semibold text-lg" style={{ color: foregroundColor }}>{fillTemplate(field.valueTemplate, PREVIEW_RUNNER)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Auxiliary Fields */}
                {(field_mappings?.auxiliaryFields || []).length > 0 && (
                    <div className="mt-6 flex justify-between items-end">
                        {(field_mappings?.auxiliaryFields || []).map(field => (
                            <div key={field.id || field.key || Math.random()} className="text-left">
                                <p className="uppercase text-sm" style={{ color: labelColor }}>{field.label || ''}</p>
                                <p className="font-semibold text-lg" style={{ color: foregroundColor }}>{fillTemplate(field.valueTemplate, PREVIEW_RUNNER)}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* QR Code Section */}
            {qrCodeUrl && (
                <div className="px-4 pb-4">
                    <div className="bg-white p-4 mx-auto w-40 h-40 flex items-center justify-center rounded-lg shadow-sm">
                        <img src={qrCodeUrl} alt="QR Code" className="w-full h-full object-contain" />
                    </div>
                    {/* Optional: Display the value below for debugging in preview */}
                    <p className="text-center text-xs mt-2" style={{ color: labelColor }}>Value: {barcodeValue}</p>
                </div>
            )}
            
            {/* Back Fields Indicator (Apple Wallet shows these when you flip the pass) */}
            {(field_mappings?.backFields || []).length > 0 && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: labelColor, opacity: 0.3 }}>
                    <p className="text-xs text-center mt-2" style={{ color: labelColor }}>
                        {(field_mappings?.backFields || []).length} back field{(field_mappings?.backFields || []).length !== 1 ? 's' : ''} configured
                    </p>
                </div>
            )}
        </div>
    );
};

export default AppleWalletPassPreview;