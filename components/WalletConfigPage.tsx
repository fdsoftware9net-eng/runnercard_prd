
import React, { useState, useEffect, useCallback } from 'react';
import { getWalletConfig, updateWalletConfig } from '../services/supabaseService';
import { WalletConfig, FieldMappingsConfig, TextModuleMapping, Runner } from '../types';
import Input from './Input';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import WalletPassPreview from './WalletPassPreview';
import Select from './Select';
import { v4 as uuidv4 } from 'uuid';

const GOOGLE_WALLET_EDGE_FUNCTION_URL = '/functions/v1/generate-google-wallet-pass';

import { DEFAULT_CONFIG, DEFAULT_FIELD_MAPPINGS, RUNNER_COLUMNS } from '../defaults';


const WalletConfigPage: React.FC = () => {
    const [config, setConfig] = useState<Omit<WalletConfig, 'id' | 'created_at'>>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        const result = await getWalletConfig();
        if (result.data) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, created_at, ...formData } = result.data;
            formData.field_mappings = { ...DEFAULT_FIELD_MAPPINGS, ...(formData.field_mappings || {}) };
            setConfig(formData);
        } else if (result.error) {
            setError(result.error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    // Helper for Google Field Mapping
    const handleMappingChange = <K extends keyof FieldMappingsConfig>(
        field: K,
        value: FieldMappingsConfig[K]
    ) => {
        setConfig(prev => ({
            ...prev,
            field_mappings: {
                ...prev.field_mappings,
                [field]: value
            }
        }));
    };

    const addTextModule = () => {
        const newModule: TextModuleMapping = {
            id: uuidv4(),
            header: 'New Field',
            bodyTemplate: `{${RUNNER_COLUMNS[0]}}`
        };
        handleMappingChange('textModules', [...config.field_mappings.textModules, newModule]);
    };

    const updateTextModule = (index: number, updatedModule: TextModuleMapping) => {
        const newModules = [...config.field_mappings.textModules];
        newModules[index] = updatedModule;
        handleMappingChange('textModules', newModules);
    };

    const removeTextModule = (index: number) => {
        const newModules = config.field_mappings.textModules.filter((_, i) => i !== index);
        handleMappingChange('textModules', newModules);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        const result = await updateWalletConfig({ id: 1, ...config });

        console.log('result', result);

        if (result.data) {
            setSuccessMessage('Configuration saved successfully!');
            setTimeout(() => setSuccessMessage(null), 3000);
        } else {
            setError(result.error || 'Failed to save configuration.');
        }
        setSaving(false);
    };


    if (loading) {
        return <LoadingSpinner message="Loading Configuration..." />;
    }

    return (
        <div className="p-6 bg-gray-800 rounded-lg shadow-md max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-4">Google Wallet Configuration</h2>
            <p className="text-gray-300 mb-6">
                Configure the appearance and data mapping of the Google Wallet runner pass.
            </p>
            {error && <div className="mb-4 p-3 bg-red-900 text-red-200 rounded-md">{error}</div>}
            {successMessage && <div className="mb-4 p-3 bg-green-900 text-green-200 rounded-md">{successMessage}</div>}

            <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3 space-y-8">
                    <div className="p-6 bg-gray-700 rounded-lg">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Pass Appearance</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Input id="issuer_id" name="issuer_id" label="Google Wallet Issuer ID" value={config.issuer_id} onChange={handleInputChange} required placeholder="e.g., 3388000000022221111" />
                            </div>
                            <Input id="class_suffix" name="class_suffix" label="Class ID Suffix" value={config.class_suffix} onChange={handleInputChange} required placeholder="e.g., race-pass-2024" />
                            <Input id="card_title" name="card_title" label="Card Title" value={config.card_title} onChange={handleInputChange} required />
                            <div>
                                <label htmlFor="hex_background_color" className="block text-sm font-medium text-gray-300 mb-1">
                                    Background Color (Hex)
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="hex_background_color"
                                        name="hex_background_color"
                                        type="text"
                                        value={config.hex_background_color}
                                        onChange={handleInputChange}
                                        required
                                        placeholder="#4285f4"
                                        className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <input
                                        type="color"
                                        value={config.hex_background_color}
                                        onChange={handleInputChange}
                                        name="hex_background_color"
                                        className="p-0 w-10 h-10 rounded-md cursor-pointer border-2 border-gray-600"
                                        aria-label="Select background color"
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-2"><Input id="logo_uri" name="logo_uri" label="Logo Image URL" value={config.logo_uri} onChange={handleInputChange} required type="url" placeholder="https://your-cdn.com/logo.png" /></div>
                            <div className="md:col-span-2"><Input id="hero_image_uri" name="hero_image_uri" label="Hero Image URL" value={config.hero_image_uri} onChange={handleInputChange} required type="url" placeholder="https://your-cdn.com/hero.jpg" /></div>
                        </div>
                    </div>

                    <div className="p-6 bg-gray-700 rounded-lg">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Location &amp; Official Links</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <Input id="official_website_uri" name="official_website_uri" label="Official Website URL" value={config.official_website_uri || ''} onChange={handleInputChange} placeholder="https://your-race-event.com" />
                            </div>
                            <div>
                                <Input id="eventLatitude" name="eventLatitude" label="Event Latitude" type="number" step="any" value={config.eventLatitude ?? ''} onChange={handleInputChange} placeholder="e.g., 13.7563" />
                            </div>
                            <div>
                                <Input id="eventLongitude" name="eventLongitude" label="Event Longitude" type="number" step="any" value={config.eventLongitude ?? ''} onChange={handleInputChange} placeholder="e.g., 100.5018" />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-gray-700 rounded-lg">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Pass Field Mapping</h3>
                        <div className="flex items-center gap-4 mb-4">
                            <input type="checkbox" id="header_enabled" checked={config.field_mappings.header.enabled} onChange={e => handleMappingChange('header', { ...config.field_mappings.header, enabled: e.target.checked })} className="h-5 w-5 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
                            <label htmlFor="header_enabled" className="text-lg font-medium text-gray-200">Header Field</label>
                        </div>
                        <Input id="header_template" name="header_template" label="Header Template" value={config.field_mappings.header.template} onChange={e => handleMappingChange('header', { ...config.field_mappings.header, template: e.target.value })} disabled={!config.field_mappings.header.enabled} placeholder="e.g., {first_name} {last_name}" />

                        <div className="flex items-center gap-4 mt-6 mb-4">
                            <input type="checkbox" id="subheader_enabled" checked={config.field_mappings.subheader.enabled} onChange={e => handleMappingChange('subheader', { ...config.field_mappings.subheader, enabled: e.target.checked })} className="h-5 w-5 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
                            <label htmlFor="subheader_enabled" className="text-lg font-medium text-gray-200">Subheader Field</label>
                        </div>
                        <Input id="subheader_template" name="subheader_template" label="Subheader Template" value={config.field_mappings.subheader.template} onChange={e => handleMappingChange('subheader', { ...config.field_mappings.subheader, template: e.target.value })} disabled={!config.field_mappings.subheader.enabled} placeholder="e.g., Wave: {wave_start}" />

                        <div className="flex items-center gap-4 mt-6 mb-4">
                            <input type="checkbox" id="barcode_enabled" checked={config.field_mappings.barcodeValue.enabled} onChange={e => handleMappingChange('barcodeValue', { ...config.field_mappings.barcodeValue, enabled: e.target.checked })} className="h-5 w-5 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
                            <label htmlFor="barcode_enabled" className="text-lg font-medium text-gray-200">Barcode</label>
                        </div>
                        <Select id="barcode_source" name="barcode_source" label="Barcode Value Source" value={config.field_mappings.barcodeValue.sourceColumn} onChange={e => handleMappingChange('barcodeValue', { ...config.field_mappings.barcodeValue, sourceColumn: e.target.value as keyof Runner })} disabled={!config.field_mappings.barcodeValue.enabled}>
                            {RUNNER_COLUMNS.map(col => <option key={col} value={col}>{col}</option>)}
                        </Select>
                    </div>

                    <div className="p-6 bg-gray-700 rounded-lg">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Text Modules Configuration</h3>
                        <div className="space-y-4">
                            {config.field_mappings.textModules.map((mod, index) => (
                                <div key={mod.id} className="p-3 bg-gray-800 rounded-md grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                    <div className="md:col-span-2"> <Input id={`tm_header_${index}`} name="header" label="Header" value={mod.header} onChange={e => updateTextModule(index, { ...mod, header: e.target.value })} /> </div>
                                    <div className="md:col-span-2"> <Input id={`tm_body_${index}`} name="bodyTemplate" label="Body Template" value={mod.bodyTemplate} onChange={e => updateTextModule(index, { ...mod, bodyTemplate: e.target.value })} placeholder="e.g., {bib}" /> </div>
                                    <Button type="button" variant="danger" size="sm" onClick={() => removeTextModule(index)}>Remove</Button>
                                </div>
                            ))}
                        </div>
                        <Button type="button" variant="secondary" size="sm" onClick={addTextModule} className="mt-4">Add Text Module</Button>
                    </div>

                    <div className="p-6 bg-gray-700 rounded-lg">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Information Rows</h3>
                        <p className="text-gray-400 text-sm mb-4">
                            Configure how information is displayed on the card face. Each row can have up to three columns (Left, Middle, Right).
                        </p>
                        
                        <div className="space-y-4">
                            {(config.field_mappings.informationRows || []).map((row, rowIndex) => (
                                <div key={rowIndex} className="p-4 bg-gray-800 rounded-md">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-lg font-semibold text-gray-200">Row {rowIndex + 2}</h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Left Item */}
                                        <div className="space-y-2">
                                            <Input
                                                id={`row_${rowIndex}_left_label`}
                                                name="left_label"
                                                label="Left Label"
                                                value={row.left?.label || ''}
                                                onChange={(e) => {
                                                    const rows = [...(config.field_mappings.informationRows || [])];
                                                    rows[rowIndex] = {
                                                        ...rows[rowIndex],
                                                        left: {
                                                            ...rows[rowIndex].left,
                                                            label: e.target.value,
                                                            value: rows[rowIndex].left?.value || ''
                                                        }
                                                    };
                                                    handleMappingChange('informationRows', rows);
                                                }}
                                                placeholder="e.g., POINTS"
                                            />
                                            <Input
                                                id={`row_${rowIndex}_left_value`}
                                                name="left_value"
                                                label="Left Value"
                                                value={row.left?.value || ''}
                                                onChange={(e) => {
                                                    const rows = [...(config.field_mappings.informationRows || [])];
                                                    rows[rowIndex] = {
                                                        ...rows[rowIndex],
                                                        left: {
                                                            ...rows[rowIndex].left,
                                                            label: rows[rowIndex].left?.label || '',
                                                            value: e.target.value
                                                        }
                                                    };
                                                    handleMappingChange('informationRows', rows);
                                                }}
                                                placeholder="e.g., {points} or 1112"
                                            />
                                        </div>

                                        {/* Middle Item */}
                                        <div className="space-y-2">
                                            <Input
                                                id={`row_${rowIndex}_middle_label`}
                                                name="middle_label"
                                                label="Middle Label"
                                                value={row.middle?.label || ''}
                                                onChange={(e) => {
                                                    const rows = [...(config.field_mappings.informationRows || [])];
                                                    rows[rowIndex] = {
                                                        ...rows[rowIndex],
                                                        middle: {
                                                            ...rows[rowIndex].middle,
                                                            label: e.target.value,
                                                            value: rows[rowIndex].middle?.value || ''
                                                        }
                                                    };
                                                    handleMappingChange('informationRows', rows);
                                                }}
                                                placeholder="e.g., STATUS"
                                            />
                                            <Input
                                                id={`row_${rowIndex}_middle_value`}
                                                name="middle_value"
                                                label="Middle Value"
                                                value={row.middle?.value || ''}
                                                onChange={(e) => {
                                                    const rows = [...(config.field_mappings.informationRows || [])];
                                                    rows[rowIndex] = {
                                                        ...rows[rowIndex],
                                                        middle: {
                                                            ...rows[rowIndex].middle,
                                                            label: rows[rowIndex].middle?.label || '',
                                                            value: e.target.value
                                                        }
                                                    };
                                                    handleMappingChange('informationRows', rows);
                                                }}
                                                placeholder="e.g., {status} or Active"
                                            />
                                        </div>

                                        {/* Right Item */}
                                        <div className="space-y-2">
                                            <Input
                                                id={`row_${rowIndex}_right_label`}
                                                name="right_label"
                                                label="Right Label"
                                                value={row.right?.label || ''}
                                                onChange={(e) => {
                                                    const rows = [...(config.field_mappings.informationRows || [])];
                                                    rows[rowIndex] = {
                                                        ...rows[rowIndex],
                                                        right: {
                                                            ...rows[rowIndex].right,
                                                            label: e.target.value,
                                                            value: rows[rowIndex].right?.value || ''
                                                        }
                                                    };
                                                    handleMappingChange('informationRows', rows);
                                                }}
                                                placeholder="e.g., CONTACTS"
                                            />
                                            <Input
                                                id={`row_${rowIndex}_right_value`}
                                                name="right_value"
                                                label="Right Value"
                                                value={row.right?.value || ''}
                                                onChange={(e) => {
                                                    const rows = [...(config.field_mappings.informationRows || [])];
                                                    rows[rowIndex] = {
                                                        ...rows[rowIndex],
                                                        right: {
                                                            ...rows[rowIndex].right,
                                                            label: rows[rowIndex].right?.label || '',
                                                            value: e.target.value
                                                        }
                                                    };
                                                    handleMappingChange('informationRows', rows);
                                                }}
                                                placeholder="e.g., {contacts} or 79"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-2 mt-4">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    const rows = [...(config.field_mappings.informationRows || [])];
                                    rows.push({
                                        left: { label: '', value: '' },
                                        middle: { label: '', value: '' },
                                        right: { label: '', value: '' }
                                    });
                                    handleMappingChange('informationRows', rows);
                                }}
                            >
                                <span className="mr-2">+</span>
                                Add row
                            </Button>
                            {(config.field_mappings.informationRows || []).length > 0 && (
                                <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    onClick={() => {
                                        const rows = [...(config.field_mappings.informationRows || [])];
                                        rows.pop();
                                        handleMappingChange('informationRows', rows);
                                    }}
                                >
                                    <span className="mr-2">-</span>
                                    Remove last row
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Google Preview */}
                <div className="lg:col-span-2">
                    <div className="sticky top-24">
                        <h3 className="text-xl font-bold text-white mb-4">Live Pass Preview</h3>
                        <WalletPassPreview config={config} />
                        <div className="mt-8 flex justify-end">
                            <Button type="submit" loading={saving} disabled={saving}>
                                Save Configuration
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default WalletConfigPage;
