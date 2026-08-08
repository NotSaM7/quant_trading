import React from 'react';
import { Box, Typography, Button, Avatar } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import KeyIcon from '@mui/icons-material/Key';
import { useAuth } from '../context/AuthContext';
import AuthModal from './AuthModal';
import { TickerStrip } from './TickerStrip';

interface MainLayoutProps {
    children: React.ReactNode;
    activeTab?: number;
    onTabChange?: (tab: number) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab = 0, onTabChange }) => {
    const { user, isAuthenticated, logout, openAuthModal } = useAuth();

    return (
        <Box
            sx={{
                width: '100%',
                boxSizing: 'border-box',
                flexGrow: 1,
                minHeight: '100vh',
                background: 'transparent',
                position: 'relative',
                zIndex: 1,
            }}
        >
            {/* Top Live Scrolling Ticker Bar */}
            <TickerStrip />

            {/* Top Navigation Header (100% Matching ui_demo/index.html) */}
            <Box
                component="nav"
                sx={{
                    position: 'sticky',
                    top: 0,
                    width: '100%',
                    zIndex: 1100,
                    background: 'rgba(18, 18, 18, 0.85)',
                    backdropFilter: 'blur(24px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: { xs: 'wrap', sm: 'nowrap' },
                    columnGap: { xs: 2, sm: 0 },
                    rowGap: { xs: 1, sm: 0 },
                    minHeight: '64px',
                    height: { xs: 'auto', sm: '64px' },
                    py: { xs: 1, sm: 0 },
                    px: { xs: 2, sm: 4 },
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
                }}
            >
                {/* Brand Logo & Name (Green Circle Avatar) */}
                <Box display="flex" alignItems="center" gap={1.5}>
                    <Box
                        sx={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: '#1DB954',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            boxShadow: '0 0 20px rgba(29, 185, 84, 0.4)',
                            color: '#000'
                        }}
                    >
                        📊
                    </Box>
                    <Typography variant="h6" fontWeight="800" sx={{ color: 'white', letterSpacing: '-0.5px', fontFamily: '"Outfit", sans-serif', display: { xs: 'none', sm: 'block' } }}>
                        QuantBot
                    </Typography>
                </Box>

                {/* Center: Spotify White Pill Tabs (Exact ui_demo/index.html) */}
                <Box display="flex" gap={1}>
                    <Button
                        onClick={() => onTabChange && onTabChange(0)}
                        sx={{
                            px: { xs: 1.5, sm: 2.8 },
                            py: { xs: 0.7, sm: 0.9 },
                            borderRadius: '50px',
                            fontSize: { xs: '12px', sm: '13px' },
                            fontWeight: activeTab === 0 ? 800 : 700,
                            fontFamily: '"Outfit", sans-serif',
                            textTransform: 'none',
                            color: activeTab === 0 ? '#000000' : '#FFFFFF',
                            bgcolor: activeTab === 0 ? '#FFFFFF' : '#2a2a2a',
                            boxShadow: activeTab === 0 ? '0 4px 16px rgba(255,255,255,0.2)' : 'none',
                            transition: 'all 0.2s ease',
                            '&:hover': { bgcolor: activeTab === 0 ? '#FFFFFF' : '#333333' }
                        }}
                    >
                        Portfolio
                    </Button>
                    <Button
                        onClick={() => onTabChange && onTabChange(1)}
                        sx={{
                            px: { xs: 1.5, sm: 2.8 },
                            py: { xs: 0.7, sm: 0.9 },
                            borderRadius: '50px',
                            fontSize: { xs: '12px', sm: '13px' },
                            fontWeight: activeTab === 1 ? 800 : 700,
                            fontFamily: '"Outfit", sans-serif',
                            textTransform: 'none',
                            color: activeTab === 1 ? '#000000' : '#FFFFFF',
                            bgcolor: activeTab === 1 ? '#FFFFFF' : '#2a2a2a',
                            boxShadow: activeTab === 1 ? '0 4px 16px rgba(255,255,255,0.2)' : 'none',
                            transition: 'all 0.2s ease',
                            '&:hover': { bgcolor: activeTab === 1 ? '#FFFFFF' : '#333333' }
                        }}
                    >
                        Analysis
                    </Button>
                    <Button
                        onClick={() => onTabChange && onTabChange(2)}
                        sx={{
                            px: { xs: 1.5, sm: 2.8 },
                            py: { xs: 0.7, sm: 0.9 },
                            borderRadius: '50px',
                            fontSize: { xs: '12px', sm: '13px' },
                            fontWeight: activeTab === 2 ? 800 : 700,
                            fontFamily: '"Outfit", sans-serif',
                            textTransform: 'none',
                            color: activeTab === 2 ? '#000000' : '#FFFFFF',
                            bgcolor: activeTab === 2 ? '#FFFFFF' : '#2a2a2a',
                            boxShadow: activeTab === 2 ? '0 4px 16px rgba(255,255,255,0.2)' : 'none',
                            transition: 'all 0.2s ease',
                            '&:hover': { bgcolor: activeTab === 2 ? '#FFFFFF' : '#333333' }
                        }}
                    >
                        AI Agent 🧠
                    </Button>
                </Box>

                {/* Right Side: Auth User Controls */}
                <Box display="flex" alignItems="center" gap={2}>
                    {isAuthenticated && user ? (
                        <Box display="flex" alignItems="center" gap={1.5}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    bgcolor: 'rgba(0, 0, 0, 0.5)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '50px',
                                    py: '4px',
                                    px: '12px',
                                    fontSize: '13px',
                                    fontWeight: 700
                                }}
                            >
                                <Avatar
                                    sx={{
                                        width: 26,
                                        height: 26,
                                        bgcolor: '#1DB954',
                                        color: '#000',
                                        fontWeight: 800,
                                        fontSize: '13px'
                                    }}
                                >
                                    {user.name.charAt(0).toUpperCase()}
                                </Avatar>
                                <span style={{ color: '#FFFFFF', fontFamily: '"Outfit", sans-serif' }}>{user.name}</span>
                            </Box>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={logout}
                                startIcon={<KeyIcon fontSize="small" />}
                                sx={{
                                    color: '#B3B3B3',
                                    borderColor: 'rgba(255, 255, 255, 0.2)',
                                    borderRadius: 50,
                                    px: { xs: 1.25, sm: 2 },
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    fontFamily: '"Outfit", sans-serif',
                                    transition: 'all 0.2s ease',
                                    '&:hover': { color: 'white', borderColor: 'white', bgcolor: 'rgba(255, 255, 255, 0.08)' }
                                }}
                            >
                                Sign Out
                            </Button>
                        </Box>
                    ) : (
                        <Box display="flex" alignItems="center" gap={1}>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => openAuthModal('login')}
                                startIcon={<PersonIcon fontSize="small" />}
                                sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 50, px: { xs: 1.25, sm: 2 } }}
                            >
                                Sign In
                            </Button>
                            <Button
                                variant="contained"
                                size="small"
                                onClick={() => openAuthModal('register')}
                                sx={{
                                    borderRadius: 50,
                                    px: { xs: 1.25, sm: 2 },
                                    fontWeight: 800,
                                    background: '#1DB954',
                                    color: '#000',
                                    '&:hover': { background: '#1ed760' }
                                }}
                            >
                                Create Account
                            </Button>
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Auth Modal Component */}
            <AuthModal />

            {/* Page Content Container */}
            <Box component="main" sx={{ p: { xs: 2, sm: 3, md: 4 }, minHeight: 'calc(100vh - 92px)', maxWidth: '1400px', mx: 'auto', position: 'relative', zindex: 1 }}>
                {children}
            </Box>
        </Box>
    );
};

export default MainLayout;
