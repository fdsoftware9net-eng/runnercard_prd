import React from 'react';
import { WalletConfig, Runner, TextModuleMapping } from '../types';
import QRCode from 'qrcode';


// A sample runner object for preview purposes
const PREVIEW_RUNNER: Runner = {
    first_name: 'JANE',
    last_name: 'DOE',
    id_card_hash: 'xxxx',
    bib: 'BIB-1234',
    name_on_bib: 'JANE D.',
    race_kit: 'Standard',
    row_start: 'A1',
    shirt: 'M',
    gender: 'Female',
    nationality: 'USA',
    age_category: '30-39',
    block: 'A',
    wave_start: '1',
    pre_order: 'Gel Pack',
    first_half_marathon: 'Yes',
    note: 'VIP Runner',
    pass_generated: false,
    google_jwt: null,
    apple_pass_url: null,
    access_key: 'preview-key'
};


interface WalletPassPreviewProps {
  // Config can be partial while user is typing
  config: Partial<Omit<WalletConfig, 'id' | 'created_at'>>;
}

// Helper function to replace placeholders like {column_name} with runner data
const fillTemplate = (template: string | undefined, runner: Runner): string => {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key: keyof Runner) => {
        return runner[key] !== undefined && runner[key] !== null ? String(runner[key]) : '';
    });
};


const WalletPassPreview: React.FC<WalletPassPreviewProps> = ({ config }) => {
  const {
    hex_background_color = '#4285f4',
    logo_uri,
    card_title = 'Race Bib Pass',
    hero_image_uri,
    field_mappings,
  } = config;
  
  const [qrCodeUrl, setQrCodeUrl] = React.useState('');

  const headerText = field_mappings?.header.enabled ? fillTemplate(field_mappings.header.template, PREVIEW_RUNNER) : '';
  const subheaderText = field_mappings?.subheader.enabled ? fillTemplate(field_mappings.subheader.template, PREVIEW_RUNNER) : '';
  const barcodeValue = field_mappings?.barcodeValue.enabled && field_mappings.barcodeValue.sourceColumn
    ? String(PREVIEW_RUNNER[field_mappings.barcodeValue.sourceColumn] || 'PREVIEW-BIB')
    : 'PREVIEW-BIB';
  
  React.useEffect(() => {
    QRCode.toDataURL(barcodeValue, { width: 200, margin: 1 })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error(err));
  }, [barcodeValue]);


  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = 'https://via.placeholder.com/300x100/1f2937/FFFFFF?text=Invalid+Image+URL';
    e.currentTarget.onerror = null; // Prevent infinite loop if placeholder fails
  };

  return (
    <div className="rounded-2xl shadow-lg overflow-hidden text-white w-full max-w-sm mx-auto transition-colors duration-300" style={{ backgroundColor: hex_background_color }}>
      {/* Header with Logo and Card Title */}
      <div className="p-4 flex items-center gap-4">
        {logo_uri ? (
          <img
            src={logo_uri}
            alt="Logo"
            key={logo_uri} // Force re-render on URL change
            className="w-10 h-10 rounded-full object-cover bg-white"
            onError={handleImageError}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center text-xs text-center">No Logo</div>
        )}
        <h3 className="font-semibold truncate">{card_title}</h3>
      </div>

      {/* Hero Image */}
      <div className="w-full h-32 bg-gray-700">
        {hero_image_uri ? (
          <img
            src={hero_image_uri}
            alt="Hero"
            key={hero_image_uri} // Force re-render on URL change
            className="w-full h-full object-cover"
            onError={handleImageError}
          />
        ) : (
           <div className="w-full h-full flex items-center justify-center text-gray-400">Hero Image</div>
        )}
      </div>

      {/* Main Content */}
      <div className="p-4 text-center">
        {headerText && <p className="font-bold text-xl truncate">{headerText}</p>}
        {subheaderText && <p className="text-sm text-gray-200 truncate">{subheaderText}</p>}
      </div>

       {/* Barcode */}
       {field_mappings?.barcodeValue.enabled && qrCodeUrl && (
         <div className="bg-white p-4 mx-4 rounded-lg flex flex-col items-center">
            <img src={qrCodeUrl} alt="QR Code" className="max-w-full h-auto" />
            <p className="text-black font-mono text-sm mt-2">{barcodeValue}</p>
         </div>
       )}
      
       {/* Details section (Text Modules) */}
       {field_mappings?.textModules && field_mappings.textModules.length > 0 && (
         <div className="px-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-white/20 pt-4 mt-4">
            {field_mappings.textModules.map((module: TextModuleMapping) => (
                <div key={module.id}>
                    <p className="text-gray-300 uppercase text-xs truncate">{module.header}</p>
                    <p className="font-semibold truncate">{fillTemplate(module.bodyTemplate, PREVIEW_RUNNER)}</p>
                </div>
            ))}
        </div>
       )}
    </div>
  );
};

export default WalletPassPreview;