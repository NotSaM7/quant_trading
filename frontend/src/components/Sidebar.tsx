import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Divider } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import AddBoxIcon from '@mui/icons-material/AddBox';
import FavoriteIcon from '@mui/icons-material/Favorite';

const Sidebar = () => {
    return (
        <Box
            sx={{
                width: 'var(--nav-width)', /* 240px */
                bgcolor: 'black',
                color: 'text.secondary',
                height: '100vh',
                position: 'fixed',
                left: 0,
                top: 0,
                display: 'flex',
                flexDirection: 'column',
                p: 3,
                overflowY: 'auto',
            }}
        >
            {/* Brand / Logo */}
            <Box sx={{ mb: 4, px: 2 }}>
                <Typography variant="h5" sx={{ color: 'common.white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '32px' }}>📊</span> QuantBot
                </Typography>
            </Box>

            {/* Main Navigation */}
            <List>
                <ListItem disablePadding>
                    <ListItemButton sx={{ borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: 'white' } }}>
                        <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                            <HomeIcon fontSize="medium" />
                        </ListItemIcon>
                        <ListItemText primary="Home" primaryTypographyProps={{ fontWeight: 600 }} />
                    </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                    <ListItemButton sx={{ borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: 'white' } }}>
                        <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                            <SearchIcon fontSize="medium" />
                        </ListItemIcon>
                        <ListItemText primary="Search" primaryTypographyProps={{ fontWeight: 600 }} />
                    </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                    <ListItemButton sx={{ borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: 'white' } }}>
                        <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                            <LibraryMusicIcon fontSize="medium" />
                        </ListItemIcon>
                        <ListItemText primary="Your Library" primaryTypographyProps={{ fontWeight: 600 }} />
                    </ListItemButton>
                </ListItem>
            </List>

            <Box sx={{ my: 2 }} />

            {/* Secondary Actions */}
            <List>
                <ListItem disablePadding>
                    <ListItemButton sx={{ borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: 'white' } }}>
                        <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                            <AddBoxIcon fontSize="medium" />
                        </ListItemIcon>
                        <ListItemText primary="Create Strategy" primaryTypographyProps={{ fontWeight: 600 }} />
                    </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                    <ListItemButton sx={{ borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: 'white' } }}>
                        <ListItemIcon sx={{ color: '#ec4899', minWidth: 40 }}>
                            <FavoriteIcon fontSize="medium" />
                        </ListItemIcon>
                        <ListItemText primary="Liked Assets" primaryTypographyProps={{ fontWeight: 600 }} />
                    </ListItemButton>
                </ListItem>
            </List>

            <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

            {/* Playlists / Watchlists Scrollable Area */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <Typography variant="body2" sx={{ py: 1, px: 2, '&:hover': { color: 'white', cursor: 'pointer' } }}>
                    Tech Giants Watchlist
                </Typography>
                <Typography variant="body2" sx={{ py: 1, px: 2, '&:hover': { color: 'white', cursor: 'pointer' } }}>
                    High Volatility
                </Typography>
                <Typography variant="body2" sx={{ py: 1, px: 2, '&:hover': { color: 'white', cursor: 'pointer' } }}>
                    Dividend Kings
                </Typography>
                <Typography variant="body2" sx={{ py: 1, px: 2, '&:hover': { color: 'white', cursor: 'pointer' } }}>
                    Crypto Movers
                </Typography>
            </Box>
        </Box>
    );
};

export default Sidebar;
