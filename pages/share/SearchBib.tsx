import React, { useState } from 'react'
import Input from '../../components/Input'
import Button from '../../components/Button'
import { findRunnerByDetails } from '@/services/supabaseService';
import { useNavigate } from 'react-router-dom';

function SearchBibPage() {

    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Guard: Prevent double submission (especially on mobile devices)
        if (loading) {
            return;
        }

        setLoading(true);

        try {
            const bibValue = BibNumber.trim().toUpperCase();
            const bibNumber = parseInt(bibValue, 10);
            
            if (isNaN(bibNumber)) {
                setError('Please enter a valid bib number.');
                setLoading(false);
                return;
            }

            const result = await findRunnerByDetails({
                bib: bibNumber,
            });

            if (result.data) {
                console.log(result.data);
                // Navigate to cropBibCard with runner data in state
                navigate('/share/cropBibCard', { 
                    state: { runner: result.data } 
                });
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
            setLoading(false);
        }
    };

    const [BibNumber, setBibNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
            <div className="w-full max-w-lg p-8 space-y-8 bg-gray-800 rounded-lg shadow-lg">
                <div>
                    <h2 className="text-3xl font-extrabold text-center text-white">
                        Find Your Runner Bib
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-400">
                        Enter your details below to find your pass.
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
                    {error && <p className="p-3 text-center bg-red-900 text-red-200 rounded-md">{error}</p>}

                    <div className="rounded-md shadow-sm -space-y-px">
                        <Input
                            id="bib-number"
                            label="Bib Number / หมายเลขบิบ"
                            name="bib-number"
                            type="text"
                            autoComplete="given-name"
                            required
                            value={BibNumber}
                            onChange={(e) => setBibNumber(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div>
                        <Button
                            type="submit"
                            className="w-full"
                            loading={loading}
                            disabled={loading}
                        >
                            Find My Bib
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
    )
}

export default SearchBibPage