import React, { useState, useCallback } from 'react';
import FileUpload from './FileUpload';
import RunnerTable from './RunnerTable';

const AdminDashboard: React.FC = () => {
    const [refreshRunnersTrigger, setRefreshRunnersTrigger] = useState(0);
    const [appMessage, setAppMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleUploadSuccess = useCallback((message: string) => {
        setAppMessage({ type: 'success', text: message });
        setRefreshRunnersTrigger(prev => prev + 1);
        setTimeout(() => setAppMessage(null), 5000);
    }, []);

    const handleUploadError = useCallback((message: string) => {
        setAppMessage({ type: 'error', text: message });
        setTimeout(() => setAppMessage(null), 5000);
    }, []);

    return (
        <>
            {appMessage && (
                <div className={`fixed top-20 left-1/2 -translate-x-1/2 p-4 rounded-md shadow-lg z-20 transition-all duration-300 ease-in-out ${
                    appMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'
                } text-white text-center`}>
                    {appMessage.text}
                </div>
            )}
            <FileUpload onUploadSuccess={handleUploadSuccess} onUploadError={handleUploadError} />
            <RunnerTable refreshDataTrigger={refreshRunnersTrigger} />
        </>
    );
};

export default AdminDashboard;
