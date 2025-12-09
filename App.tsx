
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from './services/authService';
import { getSupabaseClient } from './services/supabaseService';

// FIX: Changed to named import for BibPassDisplay
import { BibPassDisplay } from './components/BibPassDisplay';
import LoadingSpinner from './components/LoadingSpinner';
import MainLayout from './components/MainLayout';
import AdminDashboard from './components/AdminDashboard';
import WalletConfigPage from './components/WalletConfigPage';
import AppleWalletConfigPage from './components/AppleWalletConfigPage';
import WebPassConfigPage from './components/WebPassConfigPage'; // New Import
// FIX: Import LoginPage component
import LoginPage from './components/LoginPage';
// New imports
import UrlConfigPage from './components/UrlConfigPage';
import RunnerLookupPage from './components/RunnerLookupPage';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import CropBibCard from './pages/share/CropBibCard';
import SharePage from './pages/share';
import BibConfigPage from './pages/bibConfig/BibConfig';


// AuthGuard to protect routes
const AuthGuard: React.FC<{ session: Session | null }> = ({ session }) => {
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />; // Renders child routes
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Supabase client and auth state on component mount
  useEffect(() => {
    let subscription: { unsubscribe: () => void; } | undefined;

    const initializeApp = async () => {
      try {
        // This will initialize the client from environment variables.
        // It will throw an error if the variables are not set, which is caught below.
        getSupabaseClient();
        
        const { session: currentSession, error: sessionError } = await getSession();
        if (sessionError) throw new Error(sessionError);

        setSession(currentSession);
        
        subscription = onAuthStateChange(setSession);
      } catch (err: any) {
        console.error("Application initialization failed:", err.message);
        // Display a user-friendly error message if initialization fails
        setError("Failed to initialize the application. Please check the console for more details. This is likely due to missing environment variables for Supabase.");
      } finally {
        setLoading(false);
      }
    };
    
    initializeApp();

    return () => {
      subscription?.unsubscribe();
    };
  }, []); // Empty dependency array means this runs only once on mount.


  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner message="Initializing Application..." />
      </div>
    );
  }

  if (error) {
     return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <div className="bg-red-900 text-red-100 p-6 rounded-lg shadow-md max-w-lg text-center">
          <h2 className="text-2xl font-bold mb-4">Application Error</h2>
          <p className="mb-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={!session ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/bibpass/:accessKey" element={<BibPassDisplay />} />
        <Route path="/lookup" element={<RunnerLookupPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/share/cropBibCard" element={<CropBibCard />} />

        {/* Protected Admin Routes */}
        <Route element={<AuthGuard session={session} />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/wallet-config" element={<WalletConfigPage />} />
            <Route path="/apple-wallet-config" element={<AppleWalletConfigPage />} />
            <Route path="/web-pass-config" element={<WebPassConfigPage />} />
            <Route path="/url-config" element={<UrlConfigPage />} />
            <Route path="/bib-config" element={<BibConfigPage />} />
          </Route>
        </Route>
        
        {/* Fallback to redirect to login if no route matches and not logged in */}
        <Route path="*" element={<Navigate to={session ? "/" : "/lookup"} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
