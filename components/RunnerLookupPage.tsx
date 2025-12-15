import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { findRunnerByDetails, getWalletConfig, logUserActivity } from '../services/supabaseService';
import { WalletConfig } from '../types';
import { hashNationalId, hashSearchInput } from '../utils/hashing';
import Input from './Input';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2';

const RunnerLookupPage: React.FC = () => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [idCardNumber, setIdCardNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState<Partial<WalletConfig>>({});
    const navigate = useNavigate();
    const isSubmittingRef = useRef(false); // Guard to prevent double submission

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
        
        // Guard: Prevent double submission (especially on mobile devices)
        if (isSubmittingRef.current || loading) {
            return;
        }

        setError(null);

        // Basic validation: ensure at least one lookup method is filled
        const isNameFilled = firstName.trim() && lastName.trim();
        const isIdFilled = idCardNumber.trim();

        if (!isNameFilled && !isIdFilled) {
            setError('Please enter your First Name and Last Name, or your National ID.');
            return;
        }

        // Set guard flag immediately to prevent double submission
        isSubmittingRef.current = true;
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

        try {
            const result = await findRunnerByDetails({
                firstName: isNameFilled ? firstName : undefined,
                lastName: isNameFilled ? lastName : undefined,
                idCardNumber: isIdFilled ? idCardNumber : undefined,
            });

            // Log the lookup activity (non-blocking but awaited for mobile reliability)
            if (searchMethod && searchInputHash) {
                await logUserActivity({
                    activity_type: 'lookup',
                    search_method: searchMethod,
                    search_input_hash: searchInputHash,
                    runner_id: result.data?.id || null,
                    success: !!result.data,
                    error_message: result.error || (!result.data ? 'Runner not found' : null) || null,
                });
            }

            if (result.data) {
                const isThai = result.data.nationality === 'Thai';
                if (result.data.colour_sign === "DEFER") {
                    const message = isThai
                        ? 'คุณได้เลือกสมัครแบบ <strong>ไม่วิ่ง (Defer)</strong> รักษาสิทธิ์นักวิ่งเก่าไว้<br/>เสื้อที่ระลึกและสินค้าที่ระลึก (ถ้ามี) จะถูกส่งให้ทางไปรษณีย์หลังงานภายใน 1 สัปดาห์'
                        : 'You have chosen <strong>"Non-Running" (Defer)</strong>. The event t-shirt and any souvenirs (if applicable) will be sent by mail within one week after the event.';

                    Swal.fire({
                        title: 'Defer Runner',
                        html: `<p style="font-size: 1.2rem; font-weight: 300;">${message}</p>`,
                        background: '#cbcad3',
                        color: '#1f2937',
                        confirmButtonColor: '#1f2937',

                    });
                } else if (result.data.colour_sign === "REFUND") {
                    const message = isThai
                        ? 'สถานะการสมัคร : ยกเลิกแบบรับเงินคืนบางส่วน (refund)'
                        : 'registration status: cancelled with a partial refund (completed)';
                    Swal.fire({
                        title: 'Refund Runner',
                        html: `<p style="font-size: 1.2rem; font-weight: 300;">${message}</p>`,
                        background: '#cbcad3',
                        color: '#1f2937',
                        confirmButtonColor: '#1f2937',
                    });
                } else {
                    // On success, navigate to the bib pass page and pass a state to bypass verification
                    navigate(`/bibpass/${result.data.access_key}`);
                }
            } else if (result.error) {
                setError(result.error);
            } else {
                setError('Runner not found. Please check your details and try again.');
            }
        } catch (err: any) {
            console.error('Error in handleSubmit:', err);
            setError('An error occurred. Please try again.');
        } finally {
            // Reset guard and loading state
            isSubmittingRef.current = false;
            setLoading(false);
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
                        {config.lookup_page_title || 'Find Your Runner Card'}
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
                            label="First Name / ชื่อ"
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
                            label="Last Name / นามสกุล"
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
                        <span className="px-3 text-sm text-gray-400 bg-gray-800">OR (หรือ)</span>
                        <div className="flex-grow border-t border-gray-600"></div>
                    </div>

                    <Input
                        id="id-card-number"
                        label="National ID Number / รหัสประจำตัวประชาชน"
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
                            Find My Card
                        </Button>
                    </div>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-700">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                        <span className="font-medium">Make your run more fun by</span>
                        <a
                            href="https://racesmart.run"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 font-bold text-white hover:text-blue-400 transition-colors duration-200 group"
                        >
                            <span>RaceSmart.run</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RunnerLookupPage;
