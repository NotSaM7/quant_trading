import React, { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow, CircularProgress, Snackbar, Alert } from '@mui/material';
import TradeForm from './TradeForm';
import { getPortfolio, type PortfolioSummary } from '../api';

import Analysis from './Analysis';
import { startAutoTrading, stopAutoTrading, getAutoStatus, triggerAutoScan } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button, Chip, Tabs, Tab } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';

const Dashboard: React.FC = () => {
    const { isAuthenticated, openAuthModal } = useAuth();
    const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [autoRunning, setAutoRunning] = useState<boolean>(false);
    const [tabIndex, setTabIndex] = useState<number>(0);
    const [authWarning, setAuthWarning] = useState<string | null>(null);

    const fetchPortfolio = async () => {
        try {
            const data = await getPortfolio();
            setPortfolio(data);
        } catch (error) {
            console.error("Failed to fetch portfolio", error);
        } finally {
            setLoading(false);
        }
    };

    const checkAutoStatus = async () => {
        try {
            const status = await getAutoStatus();
            setAutoRunning(status.is_running);
        } catch (e) {
            console.error(e);
        }
    };

    const toggleAutoTrade = async () => {
        if (!isAuthenticated) {
            setAuthWarning("Please sign in / sign up first as a user to start the Auto-Trading Bot.");
            openAuthModal('login');
            return;
        }

        try {
            if (autoRunning) {
                await stopAutoTrading();
                setAutoRunning(false);
            } else {
                await startAutoTrading();
                setAutoRunning(true);
                // Trigger first 60-second scan immediately on start
                try {
                    await triggerAutoScan();
                    fetchPortfolio();
                } catch (err) {
                    console.error("Initial auto scan error", err);
                }
            }
            await checkAutoStatus();
        } catch (e) {
            console.error("Failed to toggle auto trade", e);
        }
    };

    useEffect(() => {
        fetchPortfolio();
        checkAutoStatus();

        // 60-Second Auto Trading Bot Ticker (Runs continuously ONLY when user is authenticated and bot is active)
        const autoInterval = setInterval(async () => {
            if (autoRunning && isAuthenticated) {
                try {
                    await triggerAutoScan();
                    fetchPortfolio();
                } catch (e) {
                    console.error("60s Auto scan ticker error", e);
                }
            }
        }, 60000);

        // 5-Second UI Refresh Ticker
        const uiInterval = setInterval(() => {
            fetchPortfolio();
            checkAutoStatus();
        }, 5000);

        return () => {
            clearInterval(autoInterval);
            clearInterval(uiInterval);
        };
    }, [autoRunning, isAuthenticated]);

    const formatCurrency = (value: number | undefined | null) => {
        if (value === undefined || value === null || isNaN(Number(value))) return "₹0.00";
        return Number(value).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        });
    };

    if (loading) {
        return <Box display="flex" justifyContent="center" mt={4}><CircularProgress color="success" /></Box>;
    }

    if (!portfolio) {
        return <Typography color="error" align="center" mt={4}>Failed to load portfolio data</Typography>;
    }

    // Greeting based on time
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    return (
        <Box sx={{ pb: 6 }}>
            {/* Header / Top Bar */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">{getGreeting()}</Typography>
                    <Box sx={{ mt: 1, display: 'flex', gap: 2, alignItems: 'center' }}>
                        <Chip
                            label={autoRunning ? "Auto-Trading ACTIVE (60s Cycle)" : "Auto-Trading PAUSED"}
                            color={autoRunning ? "success" : "default"}
                            variant="outlined"
                            size="small"
                        />
                        <Button
                            variant="contained"
                            color={autoRunning ? "error" : "success"}
                            startIcon={autoRunning ? <StopIcon /> : <PlayArrowIcon />}
                            onClick={toggleAutoTrade}
                            size="small"
                            sx={{ borderRadius: 20 }}
                        >
                            {autoRunning ? "Stop Bot" : "Start Bot"}
                        </Button>
                    </Box>
                </Box>

                <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} textColor="inherit" indicatorColor="primary">
                    <Tab label="Portfolio" />
                    <Tab label="Analysis" />
                </Tabs>
            </Box>

            {tabIndex === 0 ? (
                // PORTFOLIO VIEW
                <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', lg: 'row' }, width: '100%' }}>
                    {/* Left Side: Trade Form */}
                    <Box sx={{ flex: { xs: '1 1 100%', lg: '1 1 350px' }, width: '100%' }}>
                        <TradeForm onTradeSuccess={fetchPortfolio} />
                    </Box>

                    {/* Right Side: content */}
                    <Box sx={{ flex: { xs: '1 1 100%', lg: '2 1 500px' }, display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>

                        {/* Summary Cards */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
                            {/* Total Value */}
                            <Box className="spotify-card" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ width: 64, height: 64, bgcolor: 'linear-gradient(135deg, #450af5, #c4efd9)', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' }}>
                                    <span style={{ fontSize: '24px' }}>💰</span>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight="bold">TOTAL VALUE</Typography>
                                    <Typography variant="h6" fontWeight="bold">{formatCurrency(portfolio.total_value)}</Typography>
                                </Box>
                            </Box>
                            {/* Equity */}
                            <Box className="spotify-card" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ width: 64, height: 64, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #7e22ce, #a855f7)' }}>
                                    <span style={{ fontSize: '24px' }}>📈</span>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight="bold">EQUITY</Typography>
                                    <Typography variant="h6" fontWeight="bold">{formatCurrency(portfolio.equity)}</Typography>
                                </Box>
                            </Box>
                            {/* Cash */}
                            <Box className="spotify-card" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ width: 64, height: 64, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #047857, #10b981)' }}>
                                    <span style={{ fontSize: '24px' }}>💵</span>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight="bold">CASH BALANCE</Typography>
                                    <Typography variant="h6" fontWeight="bold">{formatCurrency(portfolio.cash)}</Typography>
                                </Box>
                            </Box>
                        </Box>

                        {/* Positions Table */}
                        <Box className="spotify-card" sx={{ flexGrow: 1, width: '100%', overflow: 'hidden' }}>
                            <Typography variant="h5" fontWeight="bold" sx={{ mb: 2 }}>Your Portfolio</Typography>
                            <Box sx={{ overflowX: 'auto', width: '100%' }}>
                                <Table size="medium" sx={{ minWidth: 500 }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ borderBottom: '1px solid #333', color: '#b3b3b3', fontSize: '0.875rem' }}>#</TableCell>
                                        <TableCell sx={{ borderBottom: '1px solid #333', color: '#b3b3b3', fontSize: '0.875rem' }}>TITLE (TICKER)</TableCell>
                                        <TableCell align="right" sx={{ borderBottom: '1px solid #333', color: '#b3b3b3', fontSize: '0.875rem' }}>QUANTITY</TableCell>
                                        <TableCell align="right" sx={{ borderBottom: '1px solid #333', color: '#b3b3b3', fontSize: '0.875rem' }}>PRICE</TableCell>
                                        <TableCell align="right" sx={{ borderBottom: '1px solid #333', color: '#b3b3b3', fontSize: '0.875rem' }}>P&L</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {portfolio.positions.map((row, index) => (
                                        <TableRow key={row.ticker} hover sx={{ '& td': { borderBottom: 'none' }, '&:hover': { bgcolor: 'rgba(255,255,255,0.1) !important' } }}>
                                            <TableCell sx={{ color: 'text.secondary' }}>{index + 1}</TableCell>
                                            <TableCell component="th" scope="row" sx={{ fontWeight: 600, color: 'white' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <Box sx={{ width: 40, height: 40, bgcolor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b3b3b3', fontSize: '10px' }}>stock</Box>
                                                    <Box display="flex" flexDirection="column">
                                                        <span>{row.ticker}</span>
                                                        <span style={{ fontSize: '12px', color: '#b3b3b3', fontWeight: 400 }}>Stock</span>
                                                    </Box>
                                                </Box>
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'text.secondary' }}>{row.quantity}</TableCell>
                                            <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatCurrency(row.current_price)}</TableCell>
                                            <TableCell align="right" sx={{
                                                color: row.pnl >= 0 ? 'success.main' : 'error.main',
                                                fontWeight: 600
                                            }}>
                                                {row.pnl >= 0 ? '+' : ''}{formatCurrency(row.pnl)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {portfolio.positions.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary', borderBottom: 'none' }}>
                                                No holdings yet. Start trading!
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            ) : (
                // ANALYSIS VIEW
                <Analysis />
            )}

            <Snackbar
                open={!!authWarning}
                autoHideDuration={5000}
                onClose={() => setAuthWarning(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="warning" onClose={() => setAuthWarning(null)} sx={{ width: '100%', minWidth: '320px', bgcolor: '#282828', color: 'white' }}>
                    {authWarning}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Dashboard;
