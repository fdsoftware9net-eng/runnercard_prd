
import React from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import Button from './Button';
import { signOut } from '../services/authService';

const MainLayout: React.FC = () => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        const { error } = await signOut();
        if (error) {
            alert(`Logout failed: ${error}`);
        } else {
            navigate('/login'); // Redirect to login after logout
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            <header className="bg-gray-800 shadow-lg p-4 sticky top-0 z-10">
                <nav className="container mx-auto flex justify-between items-center">
                    <Link to="/" className="text-2xl font-bold text-blue-400 hover:text-blue-300 transition-colors">
                        Runner Passes Admin
                    </Link>
                    <div className="flex items-center space-x-4">
                        <Link to="/url-config">
                            <Button variant="secondary" size="sm">Lookup Page</Button>
                        </Link>
                        <Link to="/bib-config">
                            <Button variant="secondary" size="sm">Bib Config</Button>
                        </Link>
                        <Link to="/web-pass-config">
                            <Button variant="secondary" size="sm">Web Pass</Button>
                        </Link>
                        <Link to="/apple-wallet-config">
                            <Button variant="secondary" size="sm">Apple Wallet</Button>
                        </Link>
                        <Link to="/wallet-config">
                            <Button variant="secondary" size="sm">Google Wallet</Button>
                        </Link>
                        <Link to="/analytics">
                            <Button variant="secondary" size="sm">Analytics</Button>
                        </Link>
                        <Link to="/">
                            <Button variant="secondary" size="sm">Dashboard</Button>
                        </Link>
                        <Button variant="danger" size="sm" onClick={handleLogout}>
                            Logout
                        </Button>
                    </div>
                </nav>
            </header>
            
            <main className="container mx-auto p-4 md:p-8">
                <Outlet /> {/* Child routes will be rendered here */}
            </main>

            <footer className="bg-gray-800 p-4 text-center text-gray-400 mt-8">
                <p>&copy; {new Date().getFullYear()} Race Pass Management. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default MainLayout;
