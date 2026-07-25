import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, TextField, Button,
    Typography, Box, Alert, CircularProgress, Tabs, Tab
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import { useAuth } from '../context/AuthContext';

const AuthModal: React.FC = () => {
    const { authModalOpen, authMode, closeAuthModal, login, register } = useAuth();
    const [tab, setTab] = useState<'login' | 'register'>(authMode);

    // Form states
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        setTab(authMode);
        setError(null);
    }, [authMode, authModalOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (tab === 'login') {
                await login({ email, password });
            } else {
                if (!name.trim()) {
                    setError("Please enter your name");
                    setLoading(false);
                    return;
                }
                await register({ name, email, password });
            }
            closeAuthModal();
        } catch (err: any) {
            const msg = err.response?.data?.detail || "Authentication failed. Please check your credentials.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog
            open={authModalOpen}
            onClose={closeAuthModal}
            PaperProps={{
                sx: {
                    bgcolor: '#181818',
                    color: 'white',
                    borderRadius: 3,
                    p: 2,
                    maxWidth: 420,
                    width: '100%',
                    border: '1px solid #333'
                }
            }}
        >
            <DialogTitle textAlign="center" sx={{ pb: 1 }}>
                <Typography variant="h5" fontWeight="bold" display="flex" alignItems="center" justifyContent="center" gap={1}>
                    <span>📊</span> QuantBot Account
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                    Access isolated portfolio management & trading analytics
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Tabs
                    value={tab}
                    onChange={(_, val) => { setTab(val); setError(null); }}
                    variant="fullWidth"
                    textColor="inherit"
                    indicatorColor="primary"
                    sx={{ mb: 3, borderBottom: '1px solid #333' }}
                >
                    <Tab label="Sign In" value="login" icon={<LockOutlinedIcon fontSize="small" />} iconPosition="start" />
                    <Tab label="Create Account" value="register" icon={<PersonAddOutlinedIcon fontSize="small" />} iconPosition="start" />
                </Tabs>

                {error && <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{error}</Alert>}

                <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
                    {tab === 'register' && (
                        <TextField
                            label="Full Name"
                            variant="outlined"
                            fullWidth
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            sx={{ '& .MuiInputBase-root': { bgcolor: '#282828', borderRadius: 1 } }}
                        />
                    )}

                    <TextField
                        label="Email Address"
                        type="email"
                        variant="outlined"
                        fullWidth
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        sx={{ '& .MuiInputBase-root': { bgcolor: '#282828', borderRadius: 1 } }}
                    />

                    <TextField
                        label="Password"
                        type="password"
                        variant="outlined"
                        fullWidth
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={{ '& .MuiInputBase-root': { bgcolor: '#282828', borderRadius: 1 } }}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        color="success"
                        disabled={loading}
                        sx={{
                            mt: 1,
                            py: 1.5,
                            borderRadius: 20,
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            textTransform: 'none'
                        }}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : (tab === 'login' ? 'Sign In' : 'Create Account')}
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default AuthModal;
