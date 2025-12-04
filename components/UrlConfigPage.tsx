import React, { useState, useEffect, useCallback } from 'react';
import { getWalletConfig, updateWalletConfig } from '../services/supabaseService';
import { WalletConfig } from '../types';
import Input from './Input';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import { DEFAULT_CONFIG } from '../defaults'; // Import default for initial state

const UrlConfigPage: React.FC = () => {
    const [config, setConfig] = useState<Partial<WalletConfig>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const lookupUrl = `${window.location.origin}/#/lookup`;

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        const result = await getWalletConfig();
        if (result.data) {
            setConfig(result.data);
        } else if (result.error) {
            setError(result.error);
        } else {
            // If no config exists, use the default values
            setConfig({
                lookup_page_title: DEFAULT_CONFIG.lookup_page_title,
                lookup_page_instructions: DEFAULT_CONFIG.lookup_page_instructions,
            });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        // We need to fetch the full config to not overwrite other settings
        const currentFullConfigResult = await getWalletConfig();
        const fullConfig = currentFullConfigResult.data || { ...DEFAULT_CONFIG, id: 1 };

        const configToSave: WalletConfig = {
            ...fullConfig,
            lookup_page_title: config.lookup_page_title,
            lookup_page_instructions: config.lookup_page_instructions,
        };

        const result = await updateWalletConfig(configToSave);

        if (result.data) {
            setSuccessMessage('Configuration saved successfully!');
            setConfig(result.data);
            setTimeout(() => setSuccessMessage(null), 3000);
        } else {
            setError(result.error || 'Failed to save configuration.');
        }
        setSaving(false);
    };

    const handleCopyToClipboard = () => {
        navigator.clipboard.writeText(lookupUrl).then(() => {
            setSuccessMessage('URL copied to clipboard!');
            setTimeout(() => setSuccessMessage(null), 3000);
        }, (err) => {
            setError('Failed to copy URL.');
            console.error('Could not copy text: ', err);
        });
    };

    if (loading) {
        return <LoadingSpinner message="Loading Lookup Page Configuration..." />;
    }

    return (
        <div className="p-6 bg-gray-800 rounded-lg shadow-md max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-4">Runner Pass Lookup Page Configuration</h2>
            <p className="text-gray-300 mb-6">
                Manage the public page where runners can find their pass. You can customize the displayed text and copy the universal link to share with participants.
            </p>
            {error && <div className="mb-4 p-3 bg-red-900 text-red-200 rounded-md">{error}</div>}
            {successMessage && <div className="mb-4 p-3 bg-green-900 text-green-200 rounded-md">{successMessage}</div>}

            <div className="p-6 bg-gray-700 rounded-lg mb-8">
                <h3 className="text-xl font-bold text-white mb-4">Universal Lookup URL</h3>
                <p className="text-gray-400 mb-3">Share this single URL with all runners. They will be prompted to enter their details to find their pass.</p>
                <div className="flex items-center gap-4 p-3 bg-gray-900 rounded-md">
                    <span className="text-blue-400 flex-grow break-all">{lookupUrl}</span>
                    <Button variant="secondary" onClick={handleCopyToClipboard}>Copy URL</Button>
                </div>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                <div className="p-6 bg-gray-700 rounded-lg">
                    <h3 className="text-xl font-bold text-white mb-4">Page Content Customization</h3>
                    <Input
                        id="lookup_page_title"
                        name="lookup_page_title"
                        label="Page Title"
                        value={config.lookup_page_title || ''}
                        onChange={handleInputChange}
                        placeholder="e.g., Find Your Runner Pass"
                    />
                    <div>
                        <label htmlFor="lookup_page_instructions" className="block text-sm font-medium text-gray-300 mb-1">
                            Instructions
                        </label>
                        <textarea
                            id="lookup_page_instructions"
                            name="lookup_page_instructions"
                            rows={4}
                            value={config.lookup_page_instructions || ''}
                            onChange={handleInputChange}
                            placeholder="e.g., Enter your details below..."
                            className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button type="submit" loading={saving} disabled={saving}>
                        Save Configuration
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default UrlConfigPage;
