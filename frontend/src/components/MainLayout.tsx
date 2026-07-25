import React, { useState } from 'react';
import { Box, Typography, IconButton, Drawer, Button, Avatar, Chip } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import AuthModal from './AuthModal';

interface MainLayoutProps {
    children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user, isAuthenticated, logout, openAuthModal } = useAuth();

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    return (
        <Box
            sx={{
                marginLeft: { xs: 0, md: 'var(--nav-width)' },
                width: { xs: '100%', md: 'calc(100% - var(--nav-width))' },
                boxSizing: 'border-box',
                flexGrow: 1,
                minHeight: '100vh',
                height: '100vh',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, #1e1e1e 0%, var(--bg-primary) 40%)',
                position: 'relative',
            }}
        >
            {/* Top Navigation Header */}
            <Box
                sx={{
                    position: 'sticky',
                    top: 0,
                    height: '64px',
                    width: '100%',
                    zIndex: 1100,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: { xs: 2, sm: 3 },
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                }}
            >
                {/* Mobile Menu Button & Title */}
                <Box display="flex" alignItems="center" gap={1}>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        edge="start"
                        onClick={handleDrawerToggle}
                        sx={{ display: { md: 'none' }, color: 'white' }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" fontWeight="bold" sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
                        <span>📊</span> QuantBot
                    </Typography>
                </Box>

                {/* Right Side: Auth User Controls */}
                <Box display="flex" alignItems="center" gap={2}>
                    {isAuthenticated && user ? (
                        <Box display="flex" alignItems="center" gap={1.5}>
                            <Chip
                                avatar={<Avatar sx={{ bgcolor: '#1DB954', color: 'black', fontWeight: 'bold' }}>{user.name.charAt(0).toUpperCase()}</Avatar>}
                                label={user.name}
                                variant="outlined"
                                sx={{ color: 'white', borderColor: '#333', bgcolor: '#181818', fontWeight: 600 }}
                            />
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={logout}
                                startIcon={<LogoutIcon fontSize="small" />}
                                sx={{ color: '#b3b3b3', borderColor: '#444', borderRadius: 20, '&:hover': { color: 'white', borderColor: '#666' } }}
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
                                sx={{ color: 'white', borderColor: '#444', borderRadius: 20, px: 2 }}
                            >
                                Sign In
                            </Button>
                            <Button
                                variant="contained"
                                color="success"
                                size="small"
                                onClick={() => openAuthModal('register')}
                                sx={{ borderRadius: 20, px: 2, fontWeight: 'bold' }}
                            >
                                Create Account
                            </Button>
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Mobile Navigation Drawer */}
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={handleDrawerToggle}
                ModalProps={{ keepMounted: true }}
                sx={{
                    display: { xs: 'block', md: 'none' },
                    '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240, bgcolor: 'black' },
                }}
            >
                <Sidebar />
            </Drawer>

            {/* Auth Modal Component */}
            <AuthModal />

            {/* Page Content Container */}
            <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, minHeight: 'calc(100vh - 64px)' }}>
                {children}
            </Box>
        </Box>
    );
};

export default MainLayout;
