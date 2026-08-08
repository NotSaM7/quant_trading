import React, { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow, CircularProgress, Snackbar, Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TradeForm from './TradeForm';
import Analysis from './Analysis';
import AgentResearch from './AgentResearch';
import { getPortfolio, startAutoTrading, stopAutoTrading, getAutoStatus, triggerAutoScan, bookProfit, type PortfolioSummary } from '../api';
import { useAuth } from '../context/AuthContext';
import { WelcomeOverlay } from './WelcomeOverlay';
import { checkMarketGuard, MarketGuardToast, type MarketGuardStatus } from './MarketGuardToast';

interface DashboardProps {
    tabIndex?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ tabIndex = 0 }) => {
    const { isAuthenticated, openAuthModal, user } = useAuth();
    const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [autoRunning, setAutoRunning] = useState<boolean>(false);
    const [authWarning, setAuthWarning] = useState<string | null>(null);
    const [selectedTicker, setSelectedTicker] = useState<string>('');

    const activeTabIndex = tabIndex;

    // Market Guard Modal state
    const [guardModalOpen, setGuardModalOpen] = useState(false);
    const [guardStatus, setGuardStatus] = useState<MarketGuardStatus | null>(null);

    // Book Profit Confirmation Modal state
    const [confirmBookProfitOpen, setConfirmBookProfitOpen] = useState(false);
    const [bookProfitLoading, setBookProfitLoading] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const handleBookProfitClick = () => {
        const guard = checkMarketGuard();
        if (!guard.allowed) {
            setGuardStatus(guard);
            setGuardModalOpen(true);
            return;
        }
        setConfirmBookProfitOpen(true);
    };

    const handleBookProfitConfirm = async () => {
        setBookProfitLoading(true);
        try {
            const res = await bookProfit();
            setToastMessage(res.message);
            setConfirmBookProfitOpen(false);
            await fetchPortfolio();

            // Only start Auto-Trading Bot if it is NOT running already
            if (!autoRunning && isAuthenticated) {
                try {
                    await startAutoTrading();
                    setAutoRunning(true);
                    await triggerAutoScan();
                } catch (botErr) {
                    console.error("Auto bot start error after book profit:", botErr);
                }
            } else if (res.bot_scan_triggered) {
                // Bot is already active — just trigger an immediate scan pass
                triggerAutoScan().catch(err => console.error("Auto scan error:", err));
            }
        } catch (e: any) {
            console.error("Book profit error:", e);
            setToastMessage(e.response?.data?.detail || e.message || "Failed to book profit");
        } finally {
            setBookProfitLoading(false);
        }
    };

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

        if (!autoRunning) {
            const guard = checkMarketGuard();
            if (!guard.allowed) {
                setGuardStatus(guard);
                setGuardModalOpen(true);
                return;
            }
        }

        try {
            if (autoRunning) {
                await stopAutoTrading();
                setAutoRunning(false);
            } else {
                await startAutoTrading();
                setAutoRunning(true);
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

        // 60-Second Auto Trading Bot Ticker
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
        return <Box display="flex" justifyContent="center" mt={8}><CircularProgress sx={{ color: '#00d4aa' }} /></Box>;
    }

    if (!portfolio) {
        return <Typography color="error" align="center" mt={4}>Failed to load portfolio data</Typography>;
    }

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const handleRowClick = (ticker: string) => {
        setSelectedTicker(ticker);
    };

    return (
        <Box sx={{ pb: 6 }}>
            {/* Welcome Daily Banner */}
            <WelcomeOverlay user={user} isAuthenticated={isAuthenticated} openAuthModal={openAuthModal} />

            {/* Sub-Header Tabs & Page Title (Matching UI Demo) */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3.5, flexWrap: 'wrap', gap: 2, animation: 'slideDown 0.5s ease both' }}>
                <Box>
                    <Typography
                        variant="h1"
                        fontWeight="800"
                        sx={{
                            fontFamily: '"Outfit", sans-serif',
                            fontSize: '36px',
                            letterSpacing: '-1px',
                            background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            lineHeight: 1.1
                        }}
                    >
                        {getGreeting()}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#B3B3B3', mt: 0.5, fontFamily: '"Outfit", sans-serif', fontSize: '13px' }}>
                        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · NSE / BSE
                    </Typography>
                </Box>

                {/* Right Top Controls: Bot Status Pill + Stop Bot Button (Exact Demo UI) */}
                <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap" justifyContent="flex-end" width={{ xs: '100%', sm: 'auto' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: { xs: 1.5, sm: 2 },
                            py: 0.8,
                            borderRadius: '50px',
                            fontSize: '12px',
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            border: '1px solid',
                            bgcolor: autoRunning ? 'rgba(29, 185, 84, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                            borderColor: autoRunning ? 'rgba(29, 185, 84, 0.35)' : 'rgba(255, 255, 255, 0.1)',
                            color: autoRunning ? '#1DB954' : '#B3B3B3',
                            animation: autoRunning ? 'glow-pulse 3s ease-in-out infinite' : 'none'
                        }}
                    >
                        <Box
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: autoRunning ? '#1DB954' : '#7C7C8A',
                                animation: autoRunning ? 'pulse-dot 2s infinite' : 'none'
                            }}
                        />
                        {autoRunning ? 'AUTO-TRADING ACTIVE · 60s' : 'AUTO-TRADING PAUSED'}
                    </Box>
                    <Button
                        variant="contained"
                        onClick={toggleAutoTrade}
                        startIcon={autoRunning ? <StopIcon /> : <PlayArrowIcon />}
                        sx={{
                            px: { xs: 2, sm: 3 },
                            py: 1,
                            borderRadius: '50px',
                            fontWeight: 800,
                            fontSize: '13px',
                            textTransform: 'none',
                            fontFamily: '"Outfit", sans-serif',
                            bgcolor: autoRunning ? 'rgba(239, 68, 68, 0.15)' : '#1DB954',
                            background: autoRunning ? 'rgba(239, 68, 68, 0.15)' : '#1DB954',
                            color: autoRunning ? '#ef4444' : '#000',
                            border: autoRunning ? '1px solid rgba(239,68,68,0.4)' : 'none',
                            boxShadow: autoRunning ? 'none' : '0 0 20px rgba(29,185,84,0.3)',
                            transition: 'all 0.25s ease',
                            '&:hover': {
                                bgcolor: autoRunning ? 'rgba(239, 68, 68, 0.25)' : '#1ed760',
                                background: autoRunning ? 'rgba(239, 68, 68, 0.25)' : '#1ed760',
                                transform: 'translateY(-1px)'
                            }
                        }}
                    >
                        {autoRunning ? 'Stop Bot' : 'Start Bot'}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleBookProfitClick}
                        sx={{
                            px: { xs: 2, sm: 3 },
                            py: 1,
                            borderRadius: '50px',
                            fontWeight: 800,
                            fontSize: '13px',
                            textTransform: 'none',
                            fontFamily: '"Outfit", sans-serif',
                            background: 'linear-gradient(135deg, #1DB954, #1ed760)',
                            color: '#000000',
                            border: 'none',
                            boxShadow: '0 4px 20px rgba(29, 185, 84, 0.4), 0 0 15px rgba(30, 215, 96, 0.25)',
                            transition: 'all 0.25s ease',
                            '&:hover': {
                                background: '#1ed760',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 8px 25px rgba(29, 185, 84, 0.5)'
                            }
                        }}
                    >
                        💰 Book Profit
                    </Button>
                </Box>
            </Box>

            {activeTabIndex === 0 ? (
                // PORTFOLIO VIEW
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5, width: '100%' }}>

                    {/* Stat Cards with Top Gradient Border Accent */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2 }}>
                        {/* Total Value */}
                        <Box className="stat-card-glass blue" sx={{ display: 'flex', alignItems: 'center', gap: 2, animation: 'fadeInUp 0.5s ease both', animationDelay: '0.1s' }}>
                            <Box sx={{ width: 52, height: 52, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(29,78,216,0.1))' }}>
                                💰
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
                                    TOTAL VALUE
                                </Typography>
                                <Typography variant="h5" fontWeight="800" sx={{ color: 'white', fontFamily: '"JetBrains Mono", monospace', fontSize: '26px', letterSpacing: '-0.5px' }}>
                                    {formatCurrency(portfolio.total_value)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#1DB954', fontWeight: 600, fontSize: '11px' }}>
                                    ▲ Live position value
                                </Typography>
                            </Box>
                        </Box>

                        {/* Invested Value (Fixed Acquisition Cost Basis) */}
                        <Box className="stat-card-glass purple" sx={{ display: 'flex', alignItems: 'center', gap: 2, animation: 'fadeInUp 0.5s ease both', animationDelay: '0.2s' }}>
                            <Box sx={{ width: 52, height: 52, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(124,58,237,0.1))' }}>
                                📈
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
                                    INVESTED VALUE
                                </Typography>
                                <Typography variant="h5" fontWeight="800" sx={{ color: 'white', fontFamily: '"JetBrains Mono", monospace', fontSize: '26px', letterSpacing: '-0.5px' }}>
                                    {formatCurrency(portfolio.invested_cost ?? portfolio.positions.reduce((sum, p) => sum + (p.average_price * p.quantity), 0))}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#a855f7', fontWeight: 600, fontSize: '11px' }}>
                                    Fixed purchase cost basis · {portfolio.positions.length} position(s)
                                </Typography>
                            </Box>
                        </Box>

                        {/* Cash Balance */}
                        <Box className="stat-card-glass green" sx={{ display: 'flex', alignItems: 'center', gap: 2, animation: 'fadeInUp 0.5s ease both', animationDelay: '0.3s' }}>
                            <Box sx={{ width: 52, height: 52, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'linear-gradient(135deg, rgba(29,185,84,0.2), rgba(30,215,96,0.1))' }}>
                                💵
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
                                    CASH BALANCE
                                </Typography>
                                <Typography variant="h5" fontWeight="800" sx={{ color: 'white', fontFamily: '"JetBrains Mono", monospace', fontSize: '26px', letterSpacing: '-0.5px' }}>
                                    {formatCurrency(portfolio.cash)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#B3B3B3', fontWeight: 600, fontSize: '11px' }}>
                                    Fully deployed
                                </Typography>
                            </Box>
                        </Box>

                        {/* Today's P/L Card */}
                        <Box className={`stat-card-glass ${(portfolio.todays_pnl || 0) >= 0 ? 'green' : 'red'}`} sx={{ display: 'flex', alignItems: 'center', gap: 2, animation: 'fadeInUp 0.5s ease both', animationDelay: '0.4s' }}>
                            <Box sx={{ width: 52, height: 52, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: (portfolio.todays_pnl || 0) >= 0 ? 'linear-gradient(135deg, rgba(29,185,84,0.2), rgba(30,215,96,0.1))' : 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))' }}>
                                📊
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
                                    TODAY'S P/L
                                </Typography>
                                <Typography variant="h5" fontWeight="800" sx={{ color: (portfolio.todays_pnl || 0) > 0 ? '#1DB954' : (portfolio.todays_pnl || 0) < 0 ? '#E91429' : 'white', fontFamily: '"JetBrains Mono", monospace', fontSize: '26px', letterSpacing: '-0.5px' }}>
                                    {(portfolio.todays_pnl || 0) > 0 ? `+${formatCurrency(portfolio.todays_pnl || 0)}` : formatCurrency(portfolio.todays_pnl || 0)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: (portfolio.todays_pnl || 0) >= 0 ? '#1DB954' : '#E91429', fontWeight: 600, fontSize: '11px' }}>
                                    {(portfolio.todays_pnl || 0) >= 0 ? '▲ Today\'s session gains' : '▼ Today\'s session loss'}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    {/* Main Content Grid: Portfolio Table (Left) + Trade Form (Right) */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 370px' }, gap: 2.5, width: '100%' }}>

                        {/* Left: Your Portfolio Panel (Matching ui_demo/index.html 12px radius) */}
                        <Box
                            sx={{
                                background: '#121212',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: '12px',
                                overflow: 'hidden'
                            }}
                        >
                            <Box
                                sx={{
                                    padding: '20px 24px 16px',
                                    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}
                            >
                                <Typography variant="h6" fontWeight="700" sx={{ color: 'white', fontSize: '16px', display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <span>🗂</span> Your Portfolio
                                </Typography>
                                <Typography variant="caption" sx={{ fontSize: '11px', color: '#B3B3B3', fontWeight: 600 }}>
                                    Live · auto-refreshing
                                </Typography>
                            </Box>

                            <Box sx={{ overflowX: 'auto', width: '100%' }}>
                                <Table size="medium" sx={{ '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } } }}>
                                    <TableHead>
                                        <TableRow sx={{ background: 'rgba(0, 0, 0, 0.4)' }}>
                                            <TableCell sx={{ color: '#B3B3B3', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5, borderBottom: 'none', display: { xs: 'none', sm: 'table-cell' } }}>#</TableCell>
                                            <TableCell sx={{ color: '#B3B3B3', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5, borderBottom: 'none' }}>TICKER</TableCell>
                                            <TableCell align="right" sx={{ color: '#B3B3B3', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5, borderBottom: 'none' }}>QTY</TableCell>
                                            <TableCell align="right" sx={{ color: '#B3B3B3', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5, borderBottom: 'none', display: { xs: 'none', sm: 'table-cell' } }}>AVG BUY PRICE</TableCell>
                                            <TableCell align="right" sx={{ color: '#B3B3B3', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5, borderBottom: 'none' }}>LIVE PRICE</TableCell>
                                            <TableCell align="right" sx={{ color: '#B3B3B3', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5, borderBottom: 'none' }}>TODAY'S P&L</TableCell>
                                            <TableCell align="right" sx={{ color: '#B3B3B3', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5, borderBottom: 'none' }}>TOTAL P&L</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {[...portfolio.positions]
                                            .sort((a, b) => a.ticker.localeCompare(b.ticker))
                                            .map((row, index) => {
                                            const cleanSymbol = row.ticker.replace('.NS', '');
                                            const isTotalProfit = row.pnl >= 0;
                                            const totalPnlPct = row.pnl_pct ?? (row.average_price > 0 ? ((row.current_price - row.average_price) / row.average_price * 100) : 0);
                                            
                                            const todayPnlVal = row.todays_pnl ?? 0;
                                            const isTodayProfit = todayPnlVal >= 0;
                                            const todayPnlPct = row.todays_pnl_pct ?? 0;
                                            
                                            // Brand color palette per stock matching ui_demo/index.html
                                            const brandColors: Record<string, string> = {
                                                'TCS.NS': '#3b82f6',
                                                'TITAN.NS': '#a855f7',
                                                'SUNPHARMA.NS': '#06b6d4',
                                                'WIPRO.NS': '#f59e0b',
                                                'HCLTECH.NS': '#10b981'
                                            };
                                            const badgeColor = brandColors[row.ticker] || '#1DB954';

                                            return (
                                                <TableRow
                                                    key={row.ticker}
                                                    onClick={() => handleRowClick(row.ticker)}
                                                    sx={{
                                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        animation: 'rowFadeIn 0.4s ease both',
                                                        animationDelay: `${Math.min(index * 0.03, 0.4)}s`,
                                                    }}
                                                >
                                                    <TableCell sx={{ color: '#7C7C8A', fontSize: '12px', display: { xs: 'none', sm: 'table-cell' } }}>{index + 1}</TableCell>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                            <Box
                                                                sx={{
                                                                    width: 36,
                                                                    height: 36,
                                                                    borderRadius: '10px',
                                                                    bgcolor: `${badgeColor}22`,
                                                                    color: badgeColor,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '10px',
                                                                    fontWeight: 800
                                                                }}
                                                            >
                                                                {cleanSymbol.slice(0, 3)}
                                                            </Box>
                                                            <Box>
                                                                <Box display="flex" alignItems="center" gap={1}>
                                                                    <Typography variant="body2" fontWeight="700" sx={{ color: 'white', fontSize: '13px', fontFamily: '"Outfit", sans-serif' }}>
                                                                        {cleanSymbol}
                                                                    </Typography>
                                                                    <span className="row-hint">
                                                                        ⚡ CLICK TO TRADE
                                                                    </span>
                                                                </Box>
                                                                <Typography variant="caption" sx={{ color: '#B3B3B3', fontSize: '10px', fontFamily: '"Outfit", sans-serif' }}>
                                                                    NSE Stock
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: '#7C7C8A', fontFamily: '"JetBrains Mono", monospace', fontSize: '12.5px' }}>
                                                        {row.quantity}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: '#7C7C8A', fontFamily: '"JetBrains Mono", monospace', fontSize: '12.5px', display: { xs: 'none', sm: 'table-cell' } }}>
                                                        {formatCurrency(row.average_price)}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        sx={{
                                                            color: isTotalProfit ? '#1DB954' : '#E91429',
                                                            fontFamily: '"JetBrains Mono", monospace',
                                                            fontWeight: 600,
                                                            fontSize: '12.5px'
                                                        }}
                                                    >
                                                        {formatCurrency(row.current_price)}
                                                    </TableCell>

                                                    {/* TODAY'S P&L PER STOCK */}
                                                    <TableCell align="right">
                                                        <Box
                                                            sx={{
                                                                display: 'inline-flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'flex-end',
                                                                px: 1,
                                                                py: 0.4,
                                                                borderRadius: '6px',
                                                                fontSize: '11.5px',
                                                                fontWeight: 700,
                                                                fontFamily: '"JetBrains Mono", monospace',
                                                                bgcolor: isTodayProfit ? 'rgba(29, 185, 84, 0.12)' : 'rgba(233, 20, 41, 0.12)',
                                                                color: isTodayProfit ? '#1DB954' : '#E91429'
                                                            }}
                                                        >
                                                            <span>{isTodayProfit ? '+' : ''}{formatCurrency(todayPnlVal)}</span>
                                                            <span style={{ fontSize: '9.5px', opacity: 0.85 }}>({isTodayProfit ? '+' : ''}{todayPnlPct.toFixed(2)}%)</span>
                                                        </Box>
                                                    </TableCell>

                                                    {/* TOTAL P&L PER STOCK */}
                                                    <TableCell align="right">
                                                        <Box
                                                            sx={{
                                                                display: 'inline-flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'flex-end',
                                                                px: 1,
                                                                py: 0.4,
                                                                borderRadius: '6px',
                                                                fontSize: '11.5px',
                                                                fontWeight: 700,
                                                                fontFamily: '"JetBrains Mono", monospace',
                                                                bgcolor: isTotalProfit ? 'rgba(29, 185, 84, 0.15)' : 'rgba(233, 20, 41, 0.15)',
                                                                color: isTotalProfit ? '#1DB954' : '#E91429'
                                                            }}
                                                        >
                                                            <span>{isTotalProfit ? '+' : ''}{formatCurrency(row.pnl)}</span>
                                                            <span style={{ fontSize: '9.5px', opacity: 0.85 }}>({isTotalProfit ? '+' : ''}{totalPnlPct.toFixed(2)}%)</span>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {portfolio.positions.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} align="center" sx={{ py: 6, color: '#64748b', borderBottom: 'none' }}>
                                                    No holdings yet. Execute a trade or start the bot!
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </Box>
                        </Box>

                        {/* Right: Execute Trade Panel */}
                        <Box>
                            <TradeForm onTradeSuccess={fetchPortfolio} selectedTicker={selectedTicker} />
                        </Box>

                    </Box>
                </Box>
            ) : activeTabIndex === 1 ? (
                // ANALYSIS VIEW
                <Analysis />
            ) : (
                // AI AGENT RESEARCH VIEW
                <AgentResearch />
            )}

            <Snackbar
                open={!!authWarning}
                autoHideDuration={5000}
                onClose={() => setAuthWarning(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="warning" onClose={() => setAuthWarning(null)} sx={{ width: '100%', minWidth: { xs: 'auto', sm: '320px' }, mx: { xs: 2, sm: 0 }, bgcolor: '#0d1117', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {authWarning}
                </Alert>
            </Snackbar>

            <Snackbar
                open={!!toastMessage}
                autoHideDuration={5000}
                onClose={() => setToastMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="success" onClose={() => setToastMessage(null)} sx={{ width: '100%', minWidth: { xs: 'auto', sm: '320px' }, mx: { xs: 2, sm: 0 }, bgcolor: '#121212', color: '#1ed760', border: '1px solid rgba(29, 185, 84, 0.4)', fontFamily: '"Outfit", sans-serif', fontWeight: 600 }}>
                    {toastMessage}
                </Alert>
            </Snackbar>

            {/* Book Profit Confirmation Dialog */}
            <Dialog
                open={confirmBookProfitOpen}
                onClose={() => setConfirmBookProfitOpen(false)}
                PaperProps={{
                    style: {
                        background: '#121212',
                        border: '1px solid rgba(29, 185, 84, 0.4)',
                        borderRadius: '20px',
                        color: 'white',
                        padding: '16px',
                        maxWidth: '460px',
                        width: '90%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(29, 185, 84, 0.2)'
                    }
                }}
            >
                <DialogTitle sx={{ fontWeight: 800, fontSize: '20px', display: 'flex', alignItems: 'center', gap: 1.5, fontFamily: '"Outfit", sans-serif', pb: 1 }}>
                    <span style={{ fontSize: '26px' }}>💰</span> Book Profit & Cash Out?
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: '#B3B3B3', mb: 2, fontSize: '13.5px', lineHeight: 1.6, fontFamily: '"Outfit", sans-serif' }}>
                        This action will sell <strong>100% of all stock positions currently in profit</strong> at live market prices to lock in your capital gains.
                    </Typography>
                    <Box sx={{ background: 'rgba(29, 185, 84, 0.08)', border: '1px solid rgba(29, 185, 84, 0.3)', borderRadius: '12px', p: 2, mb: 1 }}>
                        <Typography variant="caption" sx={{ color: '#1ed760', fontWeight: 800, letterSpacing: '1px', display: 'block', mb: 1, fontFamily: '"Outfit", sans-serif' }}>
                            ✨ AUTOMATED PROCESS:
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '12.5px', color: '#FFFFFF', lineHeight: 1.6, fontFamily: '"Outfit", sans-serif' }}>
                            1. 📈 Liquidates only profitable positions.<br/>
                            2. 💵 Credits principal + profit into cash balance.<br/>
                            3. 🤖 Re-initiates automated bot strategy scan to detect new market entry signals.
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1.5 }}>
                    <Button
                        onClick={() => setConfirmBookProfitOpen(false)}
                        sx={{ color: '#B3B3B3', fontWeight: 700, borderRadius: '10px', textTransform: 'none', fontFamily: '"Outfit", sans-serif', px: 2 }}
                    >
                        No, Cancel
                    </Button>
                    <Button
                        onClick={handleBookProfitConfirm}
                        disabled={bookProfitLoading}
                        variant="contained"
                        sx={{
                            background: 'linear-gradient(135deg, #1DB954, #1ed760)',
                            color: '#000000',
                            fontWeight: 800,
                            borderRadius: '10px',
                            px: 3,
                            py: 1,
                            fontSize: '13px',
                            fontFamily: '"Outfit", sans-serif',
                            textTransform: 'none',
                            boxShadow: '0 4px 20px rgba(29, 185, 84, 0.4)',
                            '&:hover': { background: '#1ed760' }
                        }}
                    >
                        {bookProfitLoading ? 'Processing...' : 'Yes, Book Profit'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Market Guard Toast Modal */}
            <MarketGuardToast
                open={guardModalOpen}
                status={guardStatus}
                onClose={() => setGuardModalOpen(false)}
            />
        </Box>
    );
};

export default Dashboard;
