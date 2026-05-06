
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getWalletConfig, updateWalletConfig, uploadPassAsset } from '../../services/supabaseService';
import { WalletConfig, WebPassConfig, Runner, PassField, TemplateAssignmentRule } from '../../types';
import Input from '../../components/Input';
import Button from '../../components/Button';
import LoadingSpinner from '../../components/LoadingSpinner';
import BibPassTemplate from '../../components/BibPassTemplate';
import Select from '../../components/Select';
import { DEFAULT_CONFIG, RUNNER_COLUMNS } from '../../defaults';
import { v4 as uuidv4 } from 'uuid';

const MOTIVATIONAL_MESSAGES = [
    'เป็นกำลังใจให้เราด้วยนะกั้บ',
    'ฮาล์ฟแรกเราต้องรอด',
    'ระวังโดนฮาล์ฟแรกแซงนะค้าบบบ',
    'ถึงจะวิ่งๆ พักๆ แต่ถ้ารักแล้วไม่เลิกนะ',
    'เพซก็อยากคุม แต่ไก่ทอดหาดใหญ่ก็อยากกิน',
];

const WEB_PREVIEW_RUNNER: Runner = {
    first_name: 'SOMCHAI',
    last_name: 'JAIDEE',
    id_card_hash: '1234567890123',
    bib: '1024',
    name_on_bib: 'SOMCHAI J.',
    race_kit: 'Full Marathon Kit',
    colour_sign: 'VIP',
    row: 'VIP',
    row_no: '1',
    shirt: 'L (42")',
    gender: 'Male',
    nationality: 'THAI',
    age_category: '30-39',
    block: 'B',
    wave_start: '03:30 AM',
    pre_order: 'Finisher Tee',
    first_half_marathon: 'Bangsaen42',
    first_half: 'Yes',
    note: 'VIP',
    top50: 'TOP 50',
    top_50_no: '[ลงแข่ง]',
    qr: 'https://example.com/qr',
    pass_generated: false,
    google_jwt: null,
    apple_pass_url: null,
    access_key: 'preview-access-key',
    motivational_message: MOTIVATIONAL_MESSAGES[0],
};

// Helper component for Image Upload
const ImageUploadInput: React.FC<{
    label: string;
    url: string;
    onUrlChange: (url: string) => void
}> = ({ label, url, onUrlChange }) => {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setUploading(true);
            const file = e.target.files[0];
            const result = await uploadPassAsset(file);
            if (result.data) {
                onUrlChange(result.data);
            } else {
                alert(`Upload failed: ${result.error}`);
            }
            setUploading(false);
            e.target.value = '';
        }
    };

    return (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
            <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        className="block w-full px-3 py-2 border rounded-md shadow-sm bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="https://..."
                    />
                    <label className={`flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {uploading ? 'Uploading...' : 'Upload'}
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={uploading} />
                    </label>
                </div>
                {url && <img src={url} alt="Preview" className="h-12 w-auto object-contain rounded bg-gray-600 p-1 self-start" />}
            </div>
        </div>
    );
};

const BibConfig2Page: React.FC = () => {
    const [fullConfig, setFullConfig] = useState<WalletConfig | null>(null);
    const [webConfig, setWebConfig] = useState<WebPassConfig>({
        id: '',
        name: '',
        eventName: '',
        eventLogoUrl: '',
        backgroundImageUrl: '',
        backgroundColor: '#ffffff',
        fontFamily: 'LINESeedSansTH',
        fields: []
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Dragging State
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [templates, setTemplates] = useState<WebPassConfig[]>([]);
    const [rules, setRules] = useState<TemplateAssignmentRule[]>([]);
    const [currentTemplateId, setCurrentTemplateId] = useState<string>('');
    const [showGrid, setShowGrid] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(500);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        const result = await getWalletConfig();
        if (result.data) {
            setFullConfig(result.data);

            let loadedTemplates = result.data.web_bib_templates_2 || [];

            if (loadedTemplates.length === 0) {
                loadedTemplates = [{
                    ...DEFAULT_CONFIG.web_pass_config!,
                    id: uuidv4(),
                    name: 'Default Card 2 Template'
                }];
            }

            setTemplates(loadedTemplates);
            setRules(result.data.template_assignment_rules_bib_2 || []);

            const initialTemplate = loadedTemplates[0];
            setCurrentTemplateId(initialTemplate.id);
            setWebConfig(initialTemplate);

        } else if (result.error) {
            setError(result.error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    useEffect(() => {
        const updateContainerWidth = () => {
            if (previewRef.current) {
                const width = previewRef.current.offsetWidth;
                setContainerWidth(width);
            }
        };

        updateContainerWidth();
        window.addEventListener('resize', updateContainerWidth);
        return () => window.removeEventListener('resize', updateContainerWidth);
    }, []);

    // Template Management
    const handleTemplateChange = (newId: string) => {
        const updatedTemplates = templates.map(t => t.id === currentTemplateId ? webConfig : t);
        setTemplates(updatedTemplates);

        const nextTemplate = updatedTemplates.find(t => t.id === newId);
        if (nextTemplate) {
            setCurrentTemplateId(newId);
            setWebConfig(nextTemplate);
            setSelectedFieldId(null);
        }
    };

    const handleCreateTemplate = () => {
        const updatedTemplates = templates.map(t => t.id === currentTemplateId ? webConfig : t);

        const newTemplate: WebPassConfig = {
            ...webConfig,
            id: uuidv4(),
            name: `${webConfig.name} (Copy)`,
        };

        const newTemplates = [...updatedTemplates, newTemplate];
        setTemplates(newTemplates);
        setCurrentTemplateId(newTemplate.id);
        setWebConfig(newTemplate);
    };

    const handleDeleteTemplate = () => {
        if (templates.length <= 1) return;

        const newTemplates = templates.filter(t => t.id !== currentTemplateId);
        setTemplates(newTemplates);

        const nextTemplate = newTemplates[0];
        setCurrentTemplateId(nextTemplate.id);
        setWebConfig(nextTemplate);
    };

    const handleRenameTemplate = (newName: string) => {
        setWebConfig(prev => ({ ...prev, name: newName }));
        setTemplates(prev => prev.map(t => t.id === currentTemplateId ? { ...t, name: newName } : t));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullConfig) return;

        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        const finalTemplates = templates.map(t => t.id === currentTemplateId ? webConfig : t);
        setTemplates(finalTemplates);

        const updatedConfig: WalletConfig = {
            ...fullConfig,
            web_bib_templates_2: finalTemplates,
            template_assignment_rules_bib_2: rules,
        };

        const result = await updateWalletConfig(updatedConfig);

        if (result.data) {
            setSuccessMessage('Runner Card 2 layout saved successfully!');
            setTimeout(() => setSuccessMessage(null), 3000);
        } else {
            setError(result.error || 'Failed to save configuration.');
        }
        setSaving(false);
    };

    // Field Management
    const addField = () => {
        const newField: PassField = {
            id: uuidv4(),
            key: 'first_name',
            label: 'New Field',
            x: 50,
            y: 50,
            fontSize: 16,
            color: '#000000',
            fontWeight: 'normal',
            textAlign: 'center',
            fontFamily: 'LINESeedSansTH'
        };
        setWebConfig(prev => ({ ...prev, fields: [...prev.fields, newField] }));
        setSelectedFieldId(newField.id);
    };

    const updateField = (id: string, updates: Partial<PassField>) => {
        setWebConfig(prev => {
            const updatedFields = prev.fields.map(f => {
                if (f.id === id) {
                    return { ...f, ...updates };
                }
                return f;
            });
            return { ...prev, fields: updatedFields };
        });
    };

    const removeField = (id: string) => {
        setWebConfig(prev => ({
            ...prev,
            fields: prev.fields.filter(f => f.id !== id)
        }));
        if (selectedFieldId === id) setSelectedFieldId(null);
    };

    // Rule Management
    const addRule = () => {
        const newRule: TemplateAssignmentRule = {
            id: uuidv4(),
            template_id: templates[0]?.id || '',
            column: 'block',
            operator: 'equals',
            value: ''
        };
        setRules(prev => [...prev, newRule]);
    };

    const updateRule = (id: string, updates: Partial<TemplateAssignmentRule>) => {
        setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const removeRule = (id: string) => {
        setRules(prev => prev.filter(r => r.id !== id));
    };

    // Drag Logic
    const handleMouseDown = (e: React.MouseEvent, fieldId: string) => {
        e.stopPropagation();
        setSelectedFieldId(fieldId);
        setIsDragging(true);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !selectedFieldId || !previewRef.current) return;

        const rect = previewRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const clampedX = Math.max(0, Math.min(100, x));
        const clampedY = Math.max(0, Math.min(100, y));

        updateField(selectedFieldId, { x: clampedX, y: clampedY });
    }, [isDragging, selectedFieldId]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    if (loading) return <LoadingSpinner message="Loading Configuration..." />;

    const selectedField = webConfig.fields.find(f => f.id === selectedFieldId);

    return (
        <div className="p-6 bg-gray-800 rounded-lg shadow-md max-w-7xl mx-auto min-h-screen flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">Runner Card 2 Designer</h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Design the 2nd Runner Card — shown only to runners with <span className="text-yellow-400 font-medium">1st Half = Yes</span>.
                        Use the <span className="text-green-400 font-medium">motivational_message</span> field key to display a random motivational message.
                    </p>
                </div>
                <div className="flex items-center space-x-4">
                    {successMessage && <span className="text-green-400 font-medium animate-fade-in">{successMessage}</span>}
                    <Button type="button" onClick={handleSave} loading={saving} disabled={saving}>
                        Save All Changes
                    </Button>
                </div>
            </div>

            {/* Motivational Messages Reference */}
            <div className="bg-gray-700 p-4 rounded-lg mb-6 border border-yellow-600">
                <h3 className="text-sm font-bold text-yellow-400 mb-2">Random Motivational Messages (auto-selected per runner)</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                    {MOTIVATIONAL_MESSAGES.map((msg, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className="text-yellow-500 font-mono">{i + 1}.</span>
                            <span>{msg}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Template Management Bar */}
            <div className="bg-gray-700 p-4 rounded-lg mb-6 flex flex-wrap items-center gap-4 border border-gray-600">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-400 mb-1">Select Template</label>
                    <select
                        value={currentTemplateId}
                        onChange={(e) => handleTemplateChange(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    >
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-400 mb-1">Template Name</label>
                    <input
                        type="text"
                        value={webConfig.name || ''}
                        onChange={(e) => handleRenameTemplate(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex items-end gap-2">
                    <button
                        onClick={handleCreateTemplate}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2"
                    >
                        <span>+ Duplicate</span>
                    </button>
                    <button
                        onClick={handleDeleteTemplate}
                        disabled={templates.length <= 1}
                        className={`px-4 py-2 rounded flex items-center gap-2 ${templates.length <= 1 ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                    >
                        <span>Delete</span>
                    </button>
                </div>
            </div>

            {/* Template Assignment Rules */}
            <div className="bg-gray-700 p-6 rounded-lg mb-6 border border-gray-600">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-white">Auto-Assignment Rules</h3>
                        <p className="text-gray-400 text-sm">Automatically assign Card 2 templates to runners based on their data.</p>
                    </div>
                    <button
                        type="button"
                        onClick={addRule}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                    >
                        + Add Rule
                    </button>
                </div>

                <div className="space-y-3">
                    {rules.map(rule => (
                        <div key={rule.id} className="flex flex-wrap items-center gap-3 bg-gray-800 p-3 rounded border border-gray-600">
                            <span className="text-gray-300 text-sm font-medium">If</span>
                            <select
                                value={rule.column}
                                onChange={(e) => updateRule(rule.id, { column: e.target.value as keyof Runner })}
                                className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm"
                            >
                                {RUNNER_COLUMNS.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>

                            <span className="text-gray-300 text-sm">equals</span>

                            <input
                                type="text"
                                value={rule.value}
                                onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                placeholder="Value (e.g. VIP)"
                                className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm flex-1 min-w-[100px]"
                            />

                            <span className="text-gray-300 text-sm font-medium">then use</span>

                            <select
                                value={rule.template_id}
                                onChange={(e) => updateRule(rule.id, { template_id: e.target.value })}
                                className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm flex-1 min-w-[150px]"
                            >
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>

                            <button
                                onClick={() => removeRule(rule.id)}
                                className="text-red-400 hover:text-red-300 px-2"
                                title="Remove Rule"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    {rules.length === 0 && <p className="text-gray-500 text-sm italic">No rules defined. The first template will be used for all runners with 1st Half = Yes.</p>}
                </div>
            </div>

            {error && <div className="mb-4 p-3 bg-red-900 text-red-200 rounded-md">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6 items-start">
                {/* Left Column: Controls */}
                <div className="lg:col-span-4 space-y-6">

                    {/* Background Settings */}
                    <div className="p-6 bg-gray-700 rounded-lg shadow-sm border border-gray-600">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Background</h3>
                        <ImageUploadInput
                            label="Background Image"
                            url={webConfig.backgroundImageUrl || ''}
                            onUrlChange={(url) => setWebConfig(prev => ({ ...prev, backgroundImageUrl: url }))}
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Background Color</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={webConfig.backgroundColor || '#ffffff'}
                                    onChange={(e) => setWebConfig(prev => ({ ...prev, backgroundColor: e.target.value }))}
                                    className="h-10 w-full border-0 p-0 rounded cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Font Settings */}
                    <div className="p-6 bg-gray-700 rounded-lg shadow-sm border border-gray-600">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Font</h3>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Font Family</label>
                            <Select
                                id="fontFamily"
                                name="fontFamily"
                                value={webConfig.fontFamily || 'LINESeedSansTH'}
                                onChange={(e) => setWebConfig(prev => ({ ...prev, fontFamily: e.target.value as 'LINESeedSansTH' | 'Uniform' | 'Uniform Condensed' | 'Uniform Extra Condensed' | 'sans-serif' }))}
                            >
                                <option value="LINESeedSansTH">LINESeedSansTH</option>
                                <option value="Uniform">Uniform</option>
                                <option value="Uniform Condensed">Uniform Condensed</option>
                                <option value="Uniform Extra Condensed">Uniform Extra Condensed</option>
                                <option value="sans-serif">Sans-serif</option>
                            </Select>
                        </div>
                    </div>

                    {/* Field List */}
                    <div className="p-6 bg-gray-700 rounded-lg shadow-sm border border-gray-600">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
                            <h3 className="text-xl font-bold text-white">Fields</h3>
                            <button
                                type="button"
                                onClick={addField}
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                            >
                                + Add Field
                            </button>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {webConfig.fields.map(field => (
                                <div
                                    key={field.id}
                                    onClick={() => setSelectedFieldId(field.id)}
                                    className={`p-2 rounded cursor-pointer ${selectedFieldId === field.id ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-600'}`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="text-white text-sm truncate">{field.label || field.key}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                                            className="text-red-400 hover:text-red-300 px-2"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        Position: X={field.x.toFixed(1)}%, Y={field.y.toFixed(1)}%
                                    </div>
                                </div>
                            ))}
                            {webConfig.fields.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No fields added yet.</p>}
                        </div>
                    </div>

                    {/* Selected Field Editor */}
                    {selectedField && (
                        <div className="p-6 bg-gray-700 rounded-lg shadow-sm border border-gray-600 animate-fade-in">
                            <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">Edit Field</h3>
                            <div className="space-y-4">
                                <Input
                                    id="fieldLabel"
                                    name="label"
                                    label="Label (Editor Only)"
                                    value={selectedField.label}
                                    onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                                />

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Data Source Mode</label>
                                    <div className="flex gap-2 mb-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                updateField(selectedField.id, { dataSources: undefined, separator: undefined });
                                            }}
                                            className={`px-3 py-1 rounded text-sm ${
                                                !selectedField.dataSources || selectedField.dataSources.length === 0
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                                            }`}
                                        >
                                            Single
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const currentKey = selectedField.key;
                                                if (currentKey !== 'qr_code' && currentKey !== 'custom_text' && currentKey !== 'profile_picture') {
                                                    updateField(selectedField.id, {
                                                        dataSources: [currentKey],
                                                        separator: ' '
                                                    });
                                                } else {
                                                    updateField(selectedField.id, {
                                                        dataSources: [],
                                                        separator: ' '
                                                    });
                                                }
                                            }}
                                            className={`px-3 py-1 rounded text-sm ${
                                                selectedField.dataSources && selectedField.dataSources.length > 0
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                                            }`}
                                        >
                                            Multiple
                                        </button>
                                    </div>
                                </div>

                                {(!selectedField.dataSources || selectedField.dataSources.length === 0) ? (
                                    <Select
                                        id="fieldKey"
                                        name="key"
                                        label="Data Source"
                                        value={selectedField.key}
                                        onChange={(e) => updateField(selectedField.id, { key: e.target.value as any })}
                                    >
                                        <option value="custom_text">Custom Text</option>
                                        <option value="qr_code">QR Code</option>
                                        <option value="profile_picture">Profile Picture</option>
                                        <optgroup label="Runner Data">
                                            {RUNNER_COLUMNS.map(col => <option key={col} value={col}>{col}</option>)}
                                        </optgroup>
                                    </Select>
                                ) : (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Data Sources</label>
                                        <div className="space-y-2 mb-3">
                                            {selectedField.dataSources.map((source, index) => (
                                                <div key={index} className="flex gap-2 items-center">
                                                    <Select
                                                        id={`dataSources-${index}`}
                                                        value={source}
                                                        onChange={(e) => {
                                                            const newSources = [...selectedField.dataSources!];
                                                            newSources[index] = e.target.value as any;
                                                            updateField(selectedField.id, { dataSources: newSources });
                                                        }}
                                                        className="flex-1 bg-gray-800 border border-gray-600 text-white rounded px-2 py-1 text-sm"
                                                    >
                                                        <option value="custom_text">Custom Text</option>
                                                        {RUNNER_COLUMNS.map(col => <option key={col} value={col}>{col}</option>)}
                                                    </Select>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newSources = selectedField.dataSources!.filter((_, i) => i !== index);
                                                            updateField(selectedField.id, {
                                                                dataSources: newSources.length > 0 ? newSources : undefined
                                                            });
                                                        }}
                                                        className="text-red-400 hover:text-red-300 px-2 text-lg"
                                                        title="Remove"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newSources = [...(selectedField.dataSources || []), 'first_name'];
                                                updateField(selectedField.id, { dataSources: newSources as (keyof Runner | 'custom_text')[] });
                                            }}
                                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm mb-3"
                                        >
                                            + Add Data Source
                                        </button>
                                        <Input
                                            id="separator"
                                            name="separator"
                                            label="Separator (e.g., ' ', ' - ', ', ')"
                                            value={selectedField.separator !== undefined ? selectedField.separator : ' '}
                                            onChange={(e) => updateField(selectedField.id, { separator: e.target.value })}
                                            placeholder=" "
                                        />
                                    </div>
                                )}

                                {(selectedField.key === 'custom_text' ||
                                  (selectedField.dataSources && selectedField.dataSources.includes('custom_text'))) && (
                                    <Input
                                        id="customText"
                                        name="customText"
                                        label="Custom Text Content"
                                        value={selectedField.customText || ''}
                                        onChange={(e) => updateField(selectedField.id, { customText: e.target.value })}
                                    />
                                )}

                                {(selectedField.key !== 'qr_code' && selectedField.key !== 'profile_picture') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Input
                                                id="fontSize"
                                                name="fontSize"
                                                label="Font Size (px)"
                                                type="number"
                                                value={selectedField.fontSize}
                                                onChange={(e) => updateField(selectedField.id, { fontSize: Number(e.target.value) })}
                                            />
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-1">Color</label>
                                                <input
                                                    type="color"
                                                    value={selectedField.color}
                                                    onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                                                    className="h-10 w-full border-0 p-0 rounded cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Select
                                                id="fontWeight"
                                                name="fontWeight"
                                                label="Font Weight"
                                                value={selectedField.fontWeight}
                                                onChange={(e) => updateField(selectedField.id, { fontWeight: e.target.value as any })}
                                            >
                                                <option value="100">Thin(100)</option>
                                                <option value="200">Extra Light(200)</option>
                                                <option value="300">Normal(300)</option>
                                                <option value="400">Light(400)</option>
                                                <option value="500">Medium(500)</option>
                                                <option value="600">Semi Bold(600)</option>
                                                <option value="700">Bold(700)</option>
                                                <option value="800">Extra Bold(800)</option>
                                            </Select>
                                            <Select
                                                id="textAlign"
                                                name="textAlign"
                                                label="Alignment"
                                                value={selectedField.textAlign}
                                                onChange={(e) => updateField(selectedField.id, { textAlign: e.target.value as any })}
                                            >
                                                <option value="left">Left</option>
                                                <option value="center">Center</option>
                                                <option value="right">Right</option>
                                            </Select>
                                        </div>
                                        <div>
                                            <Select
                                                id="fontFamily"
                                                name="fontFamily"
                                                label="Font Family"
                                                value={selectedField.fontFamily || 'LINESeedSansTH'}
                                                onChange={(e) => updateField(selectedField.id, { fontFamily: e.target.value as any })}
                                            >
                                                <option value="LINESeedSansTH">LINESeedSansTH</option>
                                                <option value="Uniform">Uniform</option>
                                                <option value="Uniform Condensed">Uniform Condensed</option>
                                                <option value="Uniform Extra Condensed">Uniform Extra Condensed</option>
                                                <option value="sans-serif">Sans-serif</option>
                                            </Select>
                                        </div>
                                    </>
                                )}

                                {selectedField.key === 'profile_picture' && (
                                    <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input
                                            id="profileWidth"
                                            name="profileWidth"
                                            label="Width (px)"
                                            type="number"
                                            value={selectedField.profileWidth || 100}
                                            onChange={(e) => updateField(selectedField.id, { profileWidth: Number(e.target.value) })}
                                        />
                                        <Input
                                            id="profileHeight"
                                            name="profileHeight"
                                            label="Height (px)"
                                            type="number"
                                            value={selectedField.profileHeight || 100}
                                            onChange={(e) => updateField(selectedField.id, { profileHeight: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Shape</label>
                                        <div className="flex gap-4">
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="radio"
                                                    id="profileShape-circle"
                                                    name={`profileShape-${selectedField.id}`}
                                                    checked={!selectedField.profileShape || selectedField.profileShape === 'circle'}
                                                    onChange={() => updateField(selectedField.id, { profileShape: 'circle' })}
                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                />
                                                <label htmlFor="profileShape-circle" className="text-sm text-gray-300 select-none cursor-pointer">Circle</label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="radio"
                                                    id="profileShape-square"
                                                    name={`profileShape-${selectedField.id}`}
                                                    checked={selectedField.profileShape === 'square'}
                                                    onChange={() => updateField(selectedField.id, { profileShape: 'square' })}
                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                />
                                                <label htmlFor="profileShape-square" className="text-sm text-gray-300 select-none cursor-pointer">Square</label>
                                            </div>
                                        </div>
                                    </div>
                                    </>
                                )}

                                {selectedField.key === 'qr_code' && (
                                    <Input
                                        id="qrSize"
                                        name="fontSize"
                                        label="Size Scale (approx px/4)"
                                        type="number"
                                        value={selectedField.fontSize}
                                        onChange={(e) => updateField(selectedField.id, { fontSize: Number(e.target.value) })}
                                    />
                                )}

                                <div className="pt-2 border-t border-gray-600 space-y-2">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">Position X (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.1"
                                                value={selectedField.x}
                                                onChange={(e) => updateField(selectedField.id, { x: Number(e.target.value) })}
                                                className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">Position Y (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.1"
                                                value={selectedField.y}
                                                onChange={(e) => updateField(selectedField.id, { y: Number(e.target.value) })}
                                                className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-gray-600 space-y-2">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Fit Type</label>
                                        <div className="flex gap-4 flex-wrap">
                                            {(['none', 'scale', 'wrap', 'fixed'] as const).map(ft => (
                                                <div key={ft} className="flex items-center space-x-2">
                                                    <input
                                                        type="radio"
                                                        id={`toFitType-${ft}`}
                                                        name={`toFitType-${selectedField.id}`}
                                                        checked={ft === 'none' ? !selectedField.toFitType : selectedField.toFitType === ft}
                                                        onChange={() => updateField(selectedField.id, { toFitType: ft === 'none' ? undefined : ft })}
                                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                    />
                                                    <label htmlFor={`toFitType-${ft}`} className="text-sm text-gray-300 select-none cursor-pointer capitalize">
                                                        {ft === 'none' ? 'None' : ft === 'fixed' ? 'Fixed Width' : ft.charAt(0).toUpperCase() + ft.slice(1)}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {selectedField.toFitType && (
                                        <div className="space-y-4">
                                            <Input
                                                id="toFitWidth"
                                                name="toFitWidth"
                                                label={selectedField.toFitType === 'fixed' ? 'Fixed Width (px)' : 'Desired Width (px)'}
                                                type="number"
                                                value={selectedField.toFitWidth ?? ''}
                                                onChange={(e) => updateField(selectedField.id, { toFitWidth: e.target.value ? Number(e.target.value) : undefined })}
                                                placeholder="e.g., 420 or 50"
                                            />
                                            {selectedField.toFitType === 'scale' && (
                                                <Input
                                                    id="minSize"
                                                    name="minSize"
                                                    label="Minimum Font Size (px)"
                                                    type="number"
                                                    value={selectedField.minSize ?? ''}
                                                    onChange={(e) => updateField(selectedField.id, { minSize: e.target.value ? Number(e.target.value) : undefined })}
                                                    placeholder="e.g., 10 (default)"
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Preview */}
                <div className="lg:col-span-8">
                    <div className="sticky top-24">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-white">Live Preview</h3>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="showGrid"
                                    checked={showGrid}
                                    onChange={(e) => setShowGrid(e.target.checked)}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <label htmlFor="showGrid" className="text-sm text-gray-300 select-none cursor-pointer">
                                    Show Grid
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end mb-2">
                            <span className="text-xs text-gray-400">Drag fields to position them</span>
                        </div>

                        <div className="border-4 border-gray-700 rounded-lg overflow-hidden bg-gray-900 shadow-2xl relative">
                            <div
                                ref={previewRef}
                                className="relative mx-auto"
                                style={{ width: '100%', maxWidth: '500px' }}
                            >
                                <div className="relative">
                                    <BibPassTemplate
                                        runner={WEB_PREVIEW_RUNNER}
                                        config={webConfig}
                                        qrCodeUrl="https://via.placeholder.com/150?text=QR"
                                    />

                                    {showGrid && (
                                        <div
                                            className="absolute inset-0 pointer-events-none z-40"
                                            style={{
                                                backgroundImage: `
                                                    linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
                                                    linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
                                                `,
                                                backgroundSize: '5% 5%'
                                            }}
                                        />
                                    )}

                                    {webConfig.fields.map(field => {
                                        let overlayWidth = field.width ? `${field.width}%` : 'auto';
                                        let overlayHeight = 'auto';

                                        if (field.key === 'qr_code') {
                                            overlayWidth = `${field.fontSize * 4}px`;
                                            overlayHeight = `${field.fontSize * 4}px`;
                                        } else if (field.key === 'profile_picture') {
                                            overlayWidth = `${field.profileWidth || 100}px`;
                                            overlayHeight = `${field.profileHeight || 100}px`;
                                        }

                                        return (
                                            <div
                                                key={`overlay-${field.id}`}
                                                onMouseDown={(e) => handleMouseDown(e, field.id)}
                                                className={`absolute cursor-move border-2 ${selectedFieldId === field.id ? 'border-blue-500 bg-blue-500/20' : 'border-transparent hover:border-white/50'}`}
                                                style={{
                                                    left: `${field.x}%`,
                                                    top: `${field.y}%`,
                                                    width: overlayWidth,
                                                    height: overlayHeight,
                                                    minWidth: '20px',
                                                    minHeight: '20px',
                                                    transform: 'translate(-50%, -50%)',
                                                    zIndex: 50,
                                                    borderRadius: field.profileShape === 'circle' ? '50%' : '0'
                                                }}
                                                title={field.label}
                                            >
                                                {selectedFieldId === field.id && field.key === 'profile_picture' && (
                                                    <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-500 whitespace-nowrap z-50">
                                                        {overlayWidth} × {overlayHeight}
                                                    </div>
                                                )}
                                                {selectedFieldId === field.id && field.key === 'qr_code' && (
                                                    <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50">
                                                        {field.fontSize * 4} × {field.fontSize * 4}px
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {webConfig.fields
                                        .filter(field => field.toFitType && field.toFitWidth !== undefined && field.toFitWidth !== null)
                                        .map(field => {
                                            const isFixed = field.toFitType === 'fixed';
                                            const widthValue = isFixed
                                                ? `${field.toFitWidth!}px`
                                                : `${containerWidth > 0 ? (field.toFitWidth! / containerWidth) * 100 : 0}%`;

                                            const transformValue = isFixed
                                                ? (field.textAlign === 'center'
                                                    ? 'translate(-50%, -50%)'
                                                    : field.textAlign === 'right'
                                                      ? 'translate(-100%, -50%)'
                                                      : 'translate(0, -50%)')
                                                : (field.textAlign === 'center' ? 'translate(-50%, -50%)' : 'translate(0, -50%)');

                                            return (
                                                <div
                                                    key={`scale-indicator-${field.id}`}
                                                    className="absolute pointer-events-none border-2 border-red-500 border-dashed bg-red-500/10"
                                                    style={{
                                                        left: `${field.x}%`,
                                                        top: `${field.y}%`,
                                                        width: widthValue,
                                                        height: '50px',
                                                        transform: transformValue,
                                                        zIndex: 45,
                                                        boxSizing: 'border-box'
                                                    }}
                                                    title={`Desired Width: ${field.toFitWidth}px`}
                                                />
                                            );
                                        })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BibConfig2Page;
