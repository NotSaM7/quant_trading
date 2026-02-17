import React from 'react';
import { Box } from '@mui/material';

interface MainLayoutProps {
    children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    return (
        <Box
            sx={{
                marginLeft: 'var(--nav-width)', // Offset for fixed sidebar
                flexGrow: 1,
                height: '100vh',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, #1e1e1e 0%, var(--bg-primary) 40%)', // Typical Spotify gradient
                position: 'relative',
            }}
        >
            {/* Top Header Placeholder (Sticky transparent header usually goes here) */}
            <Box
                sx={{
                    position: 'sticky',
                    top: 0,
                    height: '64px',
                    width: '100%',
                    zIndex: 10,
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    px: 3
                }}
            >
                {/* Navigation arrows or user profile would go here */}
            </Box>

            <Box sx={{ p: 4, minHeight: 'calc(100vh - 64px)' }}>
                {children}
            </Box>
        </Box>
    );
};

export default MainLayout;
