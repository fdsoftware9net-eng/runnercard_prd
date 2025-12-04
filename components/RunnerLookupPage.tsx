import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { findRunnerByDetails, getWalletConfig, logUserActivity } from '../services/supabaseService';
import { WalletConfig } from '../types';
import { hashNationalId, hashSearchInput } from '../utils/hashing';
import Input from './Input';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';

const RunnerLookupPage: React.FC = () => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [idCardNumber, setIdCardNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState<Partial<WalletConfig>>({});
    const navigate = useNavigate();

    useEffect(() => {
        const fetchPageConfig = async () => {
            setConfigLoading(true);
            const result = await getWalletConfig();
            if (result.data) {
                setConfig(result.data);
            }
            // If there's an error or no config, it will just use default text.
            setConfigLoading(false);
        };
        fetchPageConfig();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Basic validation: ensure at least one lookup method is filled
        const isNameFilled = firstName.trim() && lastName.trim();
        const isIdFilled = idCardNumber.trim();

        if (!isNameFilled && !isIdFilled) {
            setError('Please enter your First Name and Last Name, or your National ID.');
            return;
        }

        setLoading(true);
        
        // Determine search method and prepare hash for logging
        let searchMethod: 'name' | 'id_card' | undefined;
        let searchInputHash: string | undefined;
        
        if (isIdFilled) {
            searchMethod = 'id_card';
            searchInputHash = await hashNationalId(idCardNumber.trim());
        } else if (isNameFilled) {
            searchMethod = 'name';
            // Hash combination of first name and last name
            const nameCombination = `${firstName.trim()}|${lastName.trim()}`;
            searchInputHash = await hashSearchInput(nameCombination);
        }

        const result = await findRunnerByDetails({
            firstName: isNameFilled ? firstName : undefined,
            lastName: isNameFilled ? lastName : undefined,
            idCardNumber: isIdFilled ? idCardNumber : undefined,
        });
        setLoading(false);

        // Log the lookup activity (non-blocking)
        if (searchMethod && searchInputHash) {
            logUserActivity({
                activity_type: 'lookup',
                search_method: searchMethod,
                search_input_hash: searchInputHash,
                runner_id: result.data?.id || null,
                success: !!result.data,
                error_message: result.error || (!result.data ? 'Runner not found' : null) || null,
            }).catch((err) => {
                // Fail silently to avoid impacting UX
                console.warn('Failed to log lookup activity:', err);
            });
        }

        if (result.data) {
            // On success, navigate to the bib pass page and pass a state to bypass verification
            navigate(`/bibpass/${result.data.access_key}`, { state: { verified: true } });
        } else if (result.error) {
            setError(result.error);
        } else {
            setError('Runner not found. Please check your details and try again.');
        }
    };

    if (configLoading) {
        return <LoadingSpinner message="Loading..." />;
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
            <div className="w-full max-w-lg p-8 space-y-8 bg-gray-800 rounded-lg shadow-lg">
                <div>
                    <h2 className="text-3xl font-extrabold text-center text-white">
                        {config.lookup_page_title || 'Find Your Runner Pass'}
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-400">
                        {config.lookup_page_instructions || 'Enter your details below to find your pass.'}
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
                    {error && <p className="p-3 text-center bg-red-900 text-red-200 rounded-md">{error}</p>}
                    
                    <div className="rounded-md shadow-sm -space-y-px">
                        <Input
                            id="first-name"
                            label="First Name"
                            name="first-name"
                            type="text"
                            autoComplete="given-name"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            disabled={!!idCardNumber.trim()}
                        />
                        <Input
                            id="last-name"
                            label="Last Name"
                            name="last-name"
                            type="text"
                            autoComplete="family-name"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            disabled={!!idCardNumber.trim()}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex-grow border-t border-gray-600"></div>
                        <span className="px-3 text-sm text-gray-400 bg-gray-800">OR</span>
                        <div className="flex-grow border-t border-gray-600"></div>
                    </div>

                     <Input
                        id="id-card-number"
                        label="National ID Number"
                        name="id-card-number"
                        type="text"
                        required
                        value={idCardNumber}
                        onChange={(e) => setIdCardNumber(e.target.value)}
                        disabled={!!(firstName.trim() || lastName.trim())}
                    />

                    <div>
                        <Button
                            type="submit"
                            className="w-full"
                            loading={loading}
                            disabled={loading}
                        >
                            Find My Pass
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RunnerLookupPage;
