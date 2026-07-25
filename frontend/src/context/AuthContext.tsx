import React, { createContext, useContext, useState, useEffect } from 'react';
import { type UserResponse, type TokenResponse, loginUser, registerUser, getMe, type UserCreate, type UserLogin } from '../api';

interface AuthContextType {
    user: UserResponse | null;
    token: string | null;
    isAuthenticated: boolean;
    authModalOpen: boolean;
    authMode: 'login' | 'register';
    login: (credentials: UserLogin) => Promise<void>;
    register: (data: UserCreate) => Promise<void>;
    logout: () => void;
    openAuthModal: (mode?: 'login' | 'register') => void;
    closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserResponse | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('quant_token'));
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

    useEffect(() => {
        const fetchUser = async () => {
            if (token) {
                try {
                    const me = await getMe();
                    setUser(me);
                } catch (e) {
                    console.error("Token verification failed, logging out", e);
                    logout();
                }
            }
        };
        fetchUser();
    }, [token]);

    const handleAuthSuccess = (res: TokenResponse) => {
        localStorage.setItem('quant_token', res.access_token);
        setToken(res.access_token);
        setUser(res.user);
        setAuthModalOpen(false);
    };

    const login = async (credentials: UserLogin) => {
        const res = await loginUser(credentials);
        handleAuthSuccess(res);
    };

    const register = async (data: UserCreate) => {
        const res = await registerUser(data);
        handleAuthSuccess(res);
    };

    const logout = () => {
        localStorage.removeItem('quant_token');
        setToken(null);
        setUser(null);
    };

    const openAuthModal = (mode: 'login' | 'register' = 'login') => {
        setAuthMode(mode);
        setAuthModalOpen(true);
    };

    const closeAuthModal = () => {
        setAuthModalOpen(false);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAuthenticated: !!user,
                authModalOpen,
                authMode,
                login,
                register,
                logout,
                openAuthModal,
                closeAuthModal,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
