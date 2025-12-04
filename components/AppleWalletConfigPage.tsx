

import React, { useState, useEffect, useCallback } from 'react';
import { getWalletConfig, updateWalletConfig } from '../services/supabaseService';
import { WalletConfig, AppleWalletConfig, AppleFieldMapping, Runner } from '../types';
import Input from './Input';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import Select from './Select';
import { v4 as uuidv4 } from 'uuid';
import AppleWalletPassPreview from './AppleWalletPassPreview';

const RUNNER_COLUMNS: (keyof Runner)[] = [
  "first_name", "last_name", "id_card_hash", "bib", "name_on_bib",
  "race_kit", "row_start", "shirt", "gender", "nationality", "age_category",
  "block", "wave_start", "pre_order", "first_half_marathon", "note", "access_key", "qr"
];

const DEFAULT_APPLE_CONFIG: AppleWalletConfig = {
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
  relevantDate: '',
  eventLatitude: undefined,
  eventLongitude: undefined,
  relevantText: '',
  barcodeFormat: 'PKBarcodeFormatQR',
  barcodeValueSource: 'bib', // Default
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

type FieldType = keyof AppleWalletConfig['field_mappings'];

// --- Color Conversion Helpers ---
const rgbToHex = (rgb: string): string => {
  if (!rgb || !rgb.startsWith('rgb(')) return '#000000';
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return '#000000';
  const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
  return `#${toHex(parseInt(match[1], 10))}${toHex(parseInt(match[2], 10))}${toHex(parseInt(match[3], 10))}`;
};

const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 'rgb(0, 0, 0)';
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgb(${r}, ${g}, ${b})`;
};
// --- End Color Conversion Helpers ---

const AppleWalletConfigPage: React.FC = () => {
    const [fullConfig, setFullConfig] = useState<WalletConfig | null>(null);
    const [appleConfig, setAppleConfig] = useState<AppleWalletConfig>(DEFAULT_APPLE_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        const result = await getWalletConfig();
        if (result.data) {
            setFullConfig(result.data);
            const savedAppleConfig: Partial<AppleWalletConfig> = result.data.apple_wallet_config || {};
            
            // Use saved mappings if they exist, otherwise keep defaults
            const finalFieldMappings = savedAppleConfig.field_mappings ? {
                primaryFields: Array.isArray(savedAppleConfig.field_mappings.primaryFields) && savedAppleConfig.field_mappings.primaryFields.length > 0 
                    ? savedAppleConfig.field_mappings.primaryFields 
                    : DEFAULT_APPLE_CONFIG.field_mappings.primaryFields,
                secondaryFields: Array.isArray(savedAppleConfig.field_mappings.secondaryFields) && savedAppleConfig.field_mappings.secondaryFields.length > 0
                    ? savedAppleConfig.field_mappings.secondaryFields 
                    : DEFAULT_APPLE_CONFIG.field_mappings.secondaryFields,
                auxiliaryFields: Array.isArray(savedAppleConfig.field_mappings.auxiliaryFields) && savedAppleConfig.field_mappings.auxiliaryFields.length > 0
                    ? savedAppleConfig.field_mappings.auxiliaryFields 
                    : DEFAULT_APPLE_CONFIG.field_mappings.auxiliaryFields,
                backFields: Array.isArray(savedAppleConfig.field_mappings.backFields) && savedAppleConfig.field_mappings.backFields.length > 0
                    ? savedAppleConfig.field_mappings.backFields 
                    : DEFAULT_APPLE_CONFIG.field_mappings.backFields,
            } : DEFAULT_APPLE_CONFIG.field_mappings;
            
            // Convert ISO date to datetime-local format for input
            let relevantDateLocal = '';
            if (savedAppleConfig.relevantDate) {
                try {
                    const date = new Date(savedAppleConfig.relevantDate);
                    if (!isNaN(date.getTime())) {
                        // Format as datetime-local: YYYY-MM-DDTHH:mm
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        relevantDateLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
                    }
                } catch (e) {
                    console.error('Error parsing relevantDate:', e);
                }
            }
            
            setAppleConfig({ 
                ...DEFAULT_APPLE_CONFIG, 
                ...savedAppleConfig,
                relevantDate: relevantDateLocal || savedAppleConfig.relevantDate || '',
                field_mappings: finalFieldMappings
            });
        } else if (result.error) {
            setError(result.error);
        } else {
             setAppleConfig(DEFAULT_APPLE_CONFIG);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const input = e.target as HTMLInputElement;
        
        // Handle number inputs for latitude/longitude
        if (type === 'number' && (name === 'eventLatitude' || name === 'eventLongitude')) {
            const numValue = value === '' ? undefined : parseFloat(value);
            setAppleConfig(prev => ({ ...prev, [name]: numValue }));
        } else {
            setAppleConfig(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleFieldChange = (fieldType: FieldType, index: number, field: keyof AppleFieldMapping, value: string) => {
        setAppleConfig(prev => {
            const newMappings = { ...prev.field_mappings };
            const updatedFields = [...newMappings[fieldType]];
            updatedFields[index] = { ...updatedFields[index], [field]: value };
            return { ...prev, field_mappings: { ...newMappings, [fieldType]: updatedFields } };
        });
    };

    const addField = (fieldType: FieldType) => {
        const newField: AppleFieldMapping = {
            id: uuidv4(),
            key: 'new_key',
            label: 'New Label',
            valueTemplate: `{${RUNNER_COLUMNS[0]}}`,
        };
        setAppleConfig(prev => {
            const newMappings = { ...prev.field_mappings };
            return { ...prev, field_mappings: { ...newMappings, [fieldType]: [...newMappings[fieldType], newField] } };
        });
    };

    const removeField = (fieldType: FieldType, index: number) => {
        setAppleConfig(prev => {
            const newMappings = { ...prev.field_mappings };
            const updatedFields = newMappings[fieldType].filter((_, i) => i !== index);
            return { ...prev, field_mappings: { ...newMappings, [fieldType]: updatedFields } };
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullConfig) {
            setError("Could not load the main configuration to save against. Please refresh.");
            return;
        }
        setSaving(true);
        setError(null);
        setSuccessMessage(null);
        
        // Convert datetime-local to ISO 8601 format for storage
        let relevantDateISO = '';
        if (appleConfig.relevantDate) {
            try {
                const date = new Date(appleConfig.relevantDate);
                if (!isNaN(date.getTime())) {
                    relevantDateISO = date.toISOString();
                }
            } catch (e) {
                console.error('Error converting relevantDate to ISO:', e);
            }
        }
        
        const configToSave = {
            ...appleConfig,
            relevantDate: relevantDateISO || undefined,
        };
        
        const updatedFullConfig: WalletConfig = {
            ...fullConfig,
            apple_wallet_config: configToSave,
        };
        
        const result = await updateWalletConfig(updatedFullConfig);
        
        if (result.data) {
            setSuccessMessage('Apple Wallet configuration saved successfully!');
            setTimeout(() => setSuccessMessage(null), 3000);
        } else {
            setError(result.error || 'Failed to save configuration.');
        }
        setSaving(false);
    };
    
    const renderFieldMappingSection = (title: string, fieldType: FieldType) => (
        <div className="p-6 bg-gray-700 rounded-lg">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">{title}</h3>
            <div className="space-y-4">
                {(appleConfig.field_mappings?.[fieldType] || []).map((field, index) => (
                    <div key={field.id} className="p-3 bg-gray-800 rounded-md grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <Input id={`${fieldType}_${index}_label`} name="label" label="Label" value={field.label} onChange={e => handleFieldChange(fieldType, index, 'label', e.target.value)} />
                        <Input id={`${fieldType}_${index}_value`} name="valueTemplate" label="Value Template" value={field.valueTemplate} onChange={e => handleFieldChange(fieldType, index, 'valueTemplate', e.target.value)} />
                        <Input id={`${fieldType}_${index}_key`} name="key" label="Key" value={field.key} onChange={e => handleFieldChange(fieldType, index, 'key', e.target.value)} />
                        <Button type="button" variant="danger" size="sm" onClick={() => removeField(fieldType, index)}>Remove</Button>
                    </div>
                ))}
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => addField(fieldType)} className="mt-4">Add Field</Button>
        </div>
    );

    if (loading) {
        return <LoadingSpinner message="Loading Apple Wallet Configuration..." />;
    }

    return (
        <div className="p-6 bg-gray-800 rounded-lg shadow-md max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-4">Apple Wallet Configuration</h2>
            <p className="text-gray-300 mb-6">
                Configure the appearance and data mapping for Apple Wallet passes. Backend implementation for `.pkpass` generation is required separately.
            </p>
            {error && <div className="mb-4 p-3 bg-red-900 text-red-200 rounded-md">{error}</div>}
            {successMessage && <div className="mb-4 p-3 bg-green-900 text-green-200 rounded-md">{successMessage}</div>}
            
            <form onSubmit={handleSave}>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-6">
                    <div className="lg:col-span-3 space-y-8">
                        <div className="p-6 bg-gray-700 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Pass Credentials &amp; Info</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <Input id="passTypeId" name="passTypeId" label="Pass Type ID" value={appleConfig.passTypeId} onChange={handleInputChange} required placeholder="pass.com.example.race" />
                                    <p className="mt-1 text-sm text-gray-400">
                                        From your Apple Developer account, e.g., `pass.com.example.event`.
                                    </p>
                                </div>
                                <div>
                                    <Input id="teamId" name="teamId" label="Team ID" value={appleConfig.teamId} onChange={handleInputChange} required placeholder="A1B2C3D4E5" />
                                    <p className="mt-1 text-sm text-gray-400">
                                        Your 10-character Team ID from Apple Developer account.
                                    </p>
                                </div>
                                <Input id="organizationName" name="organizationName" label="Organization Name" value={appleConfig.organizationName} onChange={handleInputChange} required />
                                <Input id="logoText" name="logoText" label="Logo Text" value={appleConfig.logoText} onChange={handleInputChange} />
                            </div>
                        </div>

                        <div className="p-6 bg-gray-700 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Pass Appearance</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                {/* Background Color */}
                                <div>
                                    <label htmlFor="backgroundColor" className="block text-sm font-medium text-gray-300 mb-1">Background Color</label>
                                    <div className="flex items-center gap-2">
                                        <input type="text" id="backgroundColor" name="backgroundColor" value={appleConfig.backgroundColor} onChange={handleInputChange} required placeholder="rgb(29, 161, 242)" className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500" />
                                        <input type="color" value={rgbToHex(appleConfig.backgroundColor)} onChange={(e) => handleInputChange({ target: { name: 'backgroundColor', value: hexToRgb(e.target.value) } } as React.ChangeEvent<HTMLInputElement>)} className="p-0 w-10 h-10 rounded-md cursor-pointer border-2 border-gray-600" aria-label="Select background color" />
                                    </div>
                                </div>
                                {/* Foreground Color */}
                                <div>
                                    <label htmlFor="foregroundColor" className="block text-sm font-medium text-gray-300 mb-1">Foreground Color (Text)</label>
                                    <div className="flex items-center gap-2">
                                        <input type="text" id="foregroundColor" name="foregroundColor" value={appleConfig.foregroundColor} onChange={handleInputChange} required placeholder="rgb(255, 255, 255)" className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500" />
                                        <input type="color" value={rgbToHex(appleConfig.foregroundColor)} onChange={(e) => handleInputChange({ target: { name: 'foregroundColor', value: hexToRgb(e.target.value) } } as React.ChangeEvent<HTMLInputElement>)} className="p-0 w-10 h-10 rounded-md cursor-pointer border-2 border-gray-600" aria-label="Select foreground color" />
                                    </div>
                                </div>
                                {/* Label Color */}
                                <div>
                                    <label htmlFor="labelColor" className="block text-sm font-medium text-gray-300 mb-1">Label Color</label>
                                    <div className="flex items-center gap-2">
                                        <input type="text" id="labelColor" name="labelColor" value={appleConfig.labelColor} onChange={handleInputChange} required placeholder="rgb(200, 200, 200)" className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500" />
                                        <input type="color" value={rgbToHex(appleConfig.labelColor)} onChange={(e) => handleInputChange({ target: { name: 'labelColor', value: hexToRgb(e.target.value) } } as React.ChangeEvent<HTMLInputElement>)} className="p-0 w-10 h-10 rounded-md cursor-pointer border-2 border-gray-600" aria-label="Select label color" />
                                    </div>
                                </div>
                            </div>
                            
                             {/* Pass Images Section */}
                             <div className="space-y-6 border-t border-gray-600 pt-6">
                                <h4 className="text-lg font-medium text-white">Pass Images</h4>
                                <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                                    <div>
                                        <Input id="iconUri" name="iconUri" label="Icon Image URL" value={appleConfig.iconUri || ''} onChange={handleInputChange} placeholder="https://example.com/icon.png" />
                                        <p className="mt-1 text-sm text-gray-400">Icon of the pass (29x29pt, 2x and 3x recommended).</p>
                                    </div>
                                    <div>
                                        <Input id="logoUri" name="logoUri" label="Logo Image URL" value={appleConfig.logoUri || ''} onChange={handleInputChange} placeholder="https://example.com/logo.png" />
                                        <p className="mt-1 text-sm text-gray-400">Logo displayed at the top left (max 160x50pt).</p>
                                    </div>
                                    <div>
                                        <Input id="stripImageUri" name="stripImageUri" label="Strip (Hero) Image URL" value={appleConfig.stripImageUri || ''} onChange={handleInputChange} placeholder="https://example.com/strip.png" />
                                        <p className="mt-1 text-sm text-gray-400">Background strip image for Event Ticket style (375x98pt for 1x).</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Lock Screen Triggers Section */}
                        <div className="p-6 bg-gray-700 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Lock Screen Triggers</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="relevantDate" className="block text-sm font-medium text-gray-300 mb-1">Relevant Date</label>
                                    <input 
                                        type="datetime-local" 
                                        id="relevantDate" 
                                        name="relevantDate" 
                                        value={appleConfig.relevantDate || ''} 
                                        onChange={handleInputChange} 
                                        className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <p className="mt-1 text-sm text-gray-400">Pass will appear on lock screen near this time.</p>
                                </div>
                                <div>
                                    <Input id="relevantText" name="relevantText" label="Relevant Text" value={appleConfig.relevantText || ''} onChange={handleInputChange} placeholder="e.g., Welcome to the Race!" />
                                    <p className="mt-1 text-sm text-gray-400">Text displayed when pass appears on lock screen.</p>
                                </div>
                                <div>
                                    <Input id="eventLatitude" name="eventLatitude" label="Event Latitude" type="number" step="any" value={appleConfig.eventLatitude !== undefined ? String(appleConfig.eventLatitude) : ''} onChange={handleInputChange} placeholder="e.g., 13.7563" />
                                </div>
                                <div>
                                    <Input id="eventLongitude" name="eventLongitude" label="Event Longitude" type="number" step="any" value={appleConfig.eventLongitude !== undefined ? String(appleConfig.eventLongitude) : ''} onChange={handleInputChange} placeholder="e.g., 100.5018" />
                                </div>
                                <p className="col-span-2 mt-1 text-sm text-gray-400">Pass will appear on lock screen when near this location.</p>
                            </div>
                        </div>
                        
                         {/* Barcode Settings Section */}
                        <div className="p-6 bg-gray-700 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Barcode Settings</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                     <Select
                                        id="barcodeValueSource"
                                        name="barcodeValueSource"
                                        label="QR Code Data Source"
                                        value={appleConfig.barcodeValueSource || 'bib'}
                                        onChange={handleInputChange}
                                    >
                                        {RUNNER_COLUMNS.map(col => <option key={col} value={col}>{col}</option>)}
                                    </Select>
                                    <p className="mt-1 text-sm text-gray-400">Select which runner field to use for the QR code value.</p>
                                </div>
                                <div>
                                    <Select
                                        id="barcodeFormat"
                                        name="barcodeFormat"
                                        label="Barcode Format"
                                        value={appleConfig.barcodeFormat}
                                        onChange={handleInputChange}
                                    >
                                        <option value="PKBarcodeFormatQR">QR Code</option>
                                        <option value="PKBarcodeFormatPDF417">PDF417</option>
                                        <option value="PKBarcodeFormatAztec">Aztec</option>
                                        <option value="PKBarcodeFormatCode128">Code 128</option>
                                    </Select>
                                </div>
                            </div>
                        </div>


                        {renderFieldMappingSection('Primary Fields', 'primaryFields')}
                        {renderFieldMappingSection('Secondary Fields', 'secondaryFields')}
                        {renderFieldMappingSection('Auxiliary Fields', 'auxiliaryFields')}
                        {renderFieldMappingSection('Back Fields', 'backFields')}
                    </div>
                    
                    <div className="lg:col-span-2">
                        <div className="sticky top-24">
                            <h3 className="text-xl font-bold text-white mb-4">Live Pass Preview</h3>
                            <AppleWalletPassPreview config={appleConfig} />
                            <div className="mt-8 flex justify-end">
                                <Button type="submit" loading={saving} disabled={saving}>
                                    Save Configuration
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default AppleWalletConfigPage;