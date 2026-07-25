import React, { useState } from 'react';
import { Box, Typography, IconButton, Drawer } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Sidebar from './Sidebar';

interface MainLayoutProps {
    children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const [mobileOpen, setMobileOpen] = useState(false);

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
                    justify: 'space-between',
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

            {/* Page Content Container */}
            <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, minHeight: 'calc(100vh - 64px)' }}>
                {children}
            </Box>
        </Box>
    );
};

export default MainLayout;
