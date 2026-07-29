import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Table, TableBody, TableCell, TableHead, TableRow,
    CircularProgress, Button, Select, MenuItem, FormControl, Paper
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { getAnalysis, getPortfolio, runBacktest, type AnalysisMetrics, type BacktestResult, type PortfolioSummary } from '../api';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import InfoIcon from '@mui/icons-material/Info';

const POPULAR_TICKERS = [
    { symbol: "RELIANCE.NS", name: "Reliance Industries" },
    { symbol: "TCS.NS", name: "Tata Consultancy Services" },
    { symbol: "INFY.NS", name: "Infosys Ltd" },
    { symbol: "HDFCBANK.NS", name: "HDFC Bank" },
    { symbol: "ICICIBANK.NS", name: "ICICI Bank" },
    { symbol: "SBIN.NS", name: "State Bank of India" },
    { symbol: "BHARTIARTL.NS", name: "Bharti Airtel" }
];

const Analysis: React.FC = () => {
    const [metrics, setMetrics] = useState<AnalysisMetrics | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    // Backtest states
    const [backtestTicker, setBacktestTicker] = useState<string>("RELIANCE.NS");
    const [backtestMonths, setBacktestMonths] = useState<number>(12);
    const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
    const [backtestLoading, setBacktestLoading] = useState<boolean>(false);
    const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);

    const fetchAnalysisData = async () => {
        try {
            const [data, port] = await Promise.all([getAnalysis(), getPortfolio()]);
            setMetrics(data);
            setPortfolio(port);
        } catch (error) {
            console.error("Failed to fetch analysis", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRunBacktest = async () => {
        setBacktestLoading(true);
        try {
            const res = await runBacktest(backtestTicker, backtestMonths);
            setBacktestResult(res);
        } catch (e) {
            console.error("Backtest failed", e);
        } finally {
            setBacktestLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalysisData();
        handleRunBacktest();
        const interval = setInterval(fetchAnalysisData, 5000);
        return () => clearInterval(interval);
    }, []);

    const formatCurrency = (value: number | undefined | null) => {
        if (value === undefined || value === null || isNaN(Number(value))) return "₹0.00";
        return Number(value).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        });
    };

    const formatDateTime = (timestampStr: string) => {
        if (!timestampStr) return 'N/A';
        const date = new Date(timestampStr);
        if (isNaN(date.getTime())) return timestampStr;
        return date.toLocaleString('en-IN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    };

    const activeMetrics = metrics || {
        total_pnl: 0,
        win_rate: 0,
        total_trades: 0,
        profit_factor: 0,
        trades: []
    };

    if (loading) return <Box display="flex" justifyContent="center" py={8}><CircularProgress sx={{ color: '#00d4aa' }} /></Box>;

    // Find Best & Worst Trades
    const closedTrades = activeMetrics.trades.filter(t => t.pnl !== null && t.pnl !== undefined);
    let bestTrade = closedTrades.length > 0 ? closedTrades.reduce((prev, curr) => (curr.pnl || 0) > (prev.pnl || 0) ? curr : prev) : null;
    let worstTrade = closedTrades.length > 0 ? closedTrades.reduce((prev, curr) => (curr.pnl || 0) < (prev.pnl || 0) ? curr : prev) : null;

    // Cumulative P&L points for chart
    const cumulativePnlData = closedTrades
        .slice()
        .reverse()
        .map((t, idx, arr) => {
            const cumPnl = arr.slice(0, idx + 1).reduce((acc, x) => acc + (x.pnl || 0), 0);
            return {
                label: `${t.ticker.replace('.NS', '')}`,
                tradePnl: t.pnl || 0,
                cumPnl: cumPnl
            };
        });

    // Unrealized P&L from open positions
    const unrealizedPnl = portfolio
        ? portfolio.positions.reduce((sum, p) => sum + (p.pnl || 0), 0)
        : 0;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>

            {/* Top Bar / Heading */}
            <Box>
                <Typography
                    variant="h4"
                    fontWeight="800"
                    sx={{
                        fontFamily: '"Outfit", sans-serif',
                        letterSpacing: '-1px',
                        background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}
                >
                    Analysis & Performance
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, fontFamily: '"Outfit", sans-serif' }}>
                    Performance overview · Real-time execution metrics, P&L curve, and 6–12 month historical backtesting.
                </Typography>
            </Box>

            {/* 5 Analysis Stat Cards (Matching Demo UI) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
                <Box className="stat-card-glass green">
                    <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', display: 'block', mb: 0.5 }}>
                        TOTAL TRADES
                    </Typography>
                    <Typography variant="h5" fontWeight="800" sx={{ color: 'white', fontFamily: '"JetBrains Mono", monospace' }}>
                        {activeMetrics.total_trades || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '11px' }}>Since inception</Typography>
                </Box>

                <Box className="stat-card-glass blue">
                    <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', display: 'block', mb: 0.5 }}>
                        WIN RATE
                    </Typography>
                    <Typography variant="h5" fontWeight="800" sx={{ color: '#00d4aa', fontFamily: '"JetBrains Mono", monospace' }}>
                        {(activeMetrics.win_rate || 0).toFixed(1)}%
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '11px' }}>Winning execution ratio</Typography>
                </Box>

                <Box className="stat-card-glass green">
                    <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', display: 'block', mb: 0.5 }}>
                        BEST TRADE
                    </Typography>
                    <Typography variant="h5" fontWeight="800" sx={{ color: '#22c55e', fontFamily: '"JetBrains Mono", monospace' }}>
                        {bestTrade ? `+${formatCurrency(bestTrade.pnl)}` : '₹0.00'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '11px' }}>
                        {bestTrade ? bestTrade.ticker.replace('.NS', '') : 'N/A'}
                    </Typography>
                </Box>

                <Box className="stat-card-glass purple">
                    <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', display: 'block', mb: 0.5 }}>
                        WORST TRADE
                    </Typography>
                    <Typography variant="h5" fontWeight="800" sx={{ color: '#ef4444', fontFamily: '"JetBrains Mono", monospace' }}>
                        {worstTrade ? formatCurrency(worstTrade.pnl) : '₹0.00'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '11px' }}>
                        {worstTrade ? worstTrade.ticker.replace('.NS', '') : 'N/A'}
                    </Typography>
                </Box>

                <Box className="stat-card-glass blue">
                    <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', display: 'block', mb: 0.5 }}>
                        REALIZED P&L
                    </Typography>
                    <Typography variant="h5" fontWeight="800" sx={{ color: activeMetrics.total_pnl >= 0 ? '#22c55e' : '#ef4444', fontFamily: '"JetBrains Mono", monospace' }}>
                        {activeMetrics.total_pnl >= 0 ? '+' : ''}{formatCurrency(activeMetrics.total_pnl)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: activeMetrics.total_pnl >= 0 ? '#22c55e' : '#ef4444', fontSize: '11px', fontWeight: 600 }}>
                        {activeMetrics.total_pnl >= 0 ? '▲ Closed trade profit' : '▼ Closed trade loss'}
                    </Typography>
                </Box>

                <Box className="stat-card-glass purple">
                    <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', display: 'block', mb: 0.5 }}>
                        UNREALIZED P&L
                    </Typography>
                    <Typography variant="h5" fontWeight="800" sx={{ color: unrealizedPnl >= 0 ? '#a855f7' : '#ef4444', fontFamily: '"JetBrains Mono", monospace' }}>
                        {unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(unrealizedPnl)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
                        {portfolio ? `${portfolio.positions.length} open position(s)` : 'Open positions'}
                    </Typography>
                </Box>
            </Box>

            {/* --- Cumulative P&L & Per-Trade Charts (Matching Demo UI) --- */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5 }}>

                {/* Cumulative P&L Line Chart */}
                <Box sx={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', p: 3 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6" fontWeight="700" color="white" sx={{ fontSize: '15px' }}>
                            📈 Cumulative P&L
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#B3B3B3', fontSize: '11px', fontWeight: 600 }}>
                            Realized growth curve
                        </Typography>
                    </Box>
                    <Box sx={{ height: 220, width: '100%' }}>
                        {cumulativePnlData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={cumulativePnlData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="label" stroke="#B3B3B3" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                    <YAxis stroke="#B3B3B3" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#181818', borderColor: 'rgba(29,185,84,0.3)', borderRadius: 8, color: '#fff', fontSize: '12px', fontFamily: 'JetBrains Mono' }}
                                        formatter={(val: any) => [formatCurrency(val), 'Cumulative P&L']}
                                    />
                                    <Line type="monotone" dataKey="cumPnl" stroke="#1DB954" strokeWidth={2.5} dot={{ fill: '#1DB954', r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                                <Typography variant="caption" color="#B3B3B3">No closed trades yet to generate P&L curve</Typography>
                            </Box>
                        )}
                    </Box>
                </Box>

                {/* Per Trade Bar View */}
                <Box sx={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', p: 3 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6" fontWeight="700" color="white" sx={{ fontSize: '15px' }}>
                            📊 P&L Per Trade
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#B3B3B3', fontSize: '11px', fontWeight: 600 }}>
                            Individual trade outcomes
                        </Typography>
                    </Box>
                    <Box sx={{ height: 220, width: '100%' }}>
                        {cumulativePnlData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={cumulativePnlData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="label" stroke="#B3B3B3" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                    <YAxis stroke="#B3B3B3" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#181818', borderColor: 'rgba(29,185,84,0.3)', borderRadius: 8, color: '#fff', fontSize: '12px', fontFamily: 'JetBrains Mono' }}
                                        formatter={(val: any) => [formatCurrency(val), 'Trade P&L']}
                                    />
                                    <Bar dataKey="tradePnl" radius={[4, 4, 0, 0]}>
                                        {cumulativePnlData.map((entry, idx) => (
                                            <Cell key={`cell-${idx}`} fill={entry.tradePnl >= 0 ? '#1DB954' : '#E91429'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                                <Typography variant="caption" color="#B3B3B3">No closed trades yet</Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* --- SECTION 1: 6–12 MONTH HISTORICAL BACKTEST ENGINE --- */}
            <Box sx={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: '20px', p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <ShowChartIcon sx={{ color: '#00d4aa' }} />
                        <Typography variant="h6" fontWeight="700" color="white" sx={{ fontSize: '16px' }}>
                            Historical Backtest Module (6–12 Months)
                        </Typography>
                    </Box>

                    {/* Backtest Controls */}
                    <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                            <Select
                                value={backtestTicker}
                                onChange={(e) => setBacktestTicker(e.target.value as string)}
                                sx={{ color: 'white', bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', fontSize: '13px' }}
                            >
                                {POPULAR_TICKERS.map(t => (
                                    <MenuItem key={t.symbol} value={t.symbol}>{t.symbol} ({t.name})</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <Select
                                value={backtestMonths}
                                onChange={(e) => setBacktestMonths(Number(e.target.value))}
                                sx={{ color: 'white', bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', fontSize: '13px' }}
                            >
                                <MenuItem value={6}>6 Months</MenuItem>
                                <MenuItem value={12}>12 Months</MenuItem>
                            </Select>
                        </FormControl>

                        <Button
                            variant="contained"
                            onClick={handleRunBacktest}
                            disabled={backtestLoading}
                            sx={{
                                borderRadius: 50,
                                px: 3,
                                py: 0.8,
                                fontWeight: 800,
                                fontSize: '13px',
                                background: '#1DB954',
                                color: '#000',
                                textTransform: 'none',
                                '&:hover': { background: '#1ed760' }
                            }}
                        >
                            {backtestLoading ? <CircularProgress size={20} color="inherit" /> : "Run Simulation"}
                        </Button>
                    </Box>
                </Box>

                {backtestResult && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {/* Backtest Key Stats */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2 }}>
                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, borderLeft: '4px solid #00d4aa' }}>
                                <Typography variant="caption" color="#64748b" fontWeight="bold">TOTAL RETURN</Typography>
                                <Typography variant="h6" fontWeight="800" sx={{ fontFamily: 'JetBrains Mono', color: backtestResult.total_return_pct >= 0 ? "#22c55e" : "#ef4444" }}>
                                    {backtestResult.total_return_pct >= 0 ? '+' : ''}{backtestResult.total_return_pct}%
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, borderLeft: '4px solid #ef4444' }}>
                                <Typography variant="caption" color="#64748b" fontWeight="bold">MAX DRAWDOWN</Typography>
                                <Typography variant="h6" fontWeight="800" sx={{ fontFamily: 'JetBrains Mono', color: '#ef4444' }}>
                                    -{backtestResult.max_drawdown_pct}%
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, borderLeft: '4px solid #3b82f6' }}>
                                <Typography variant="caption" color="#64748b" fontWeight="bold">SHARPE RATIO</Typography>
                                <Typography variant="h6" fontWeight="800" sx={{ fontFamily: 'JetBrains Mono', color: 'white' }}>
                                    {backtestResult.sharpe_ratio}
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, borderLeft: '4px solid #a855f7' }}>
                                <Typography variant="caption" color="#64748b" fontWeight="bold">WIN RATE</Typography>
                                <Typography variant="h6" fontWeight="800" sx={{ fontFamily: 'JetBrains Mono', color: '#00d4aa' }}>
                                    {backtestResult.win_rate}%
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, borderLeft: '4px solid #f59e0b' }}>
                                <Typography variant="caption" color="#64748b" fontWeight="bold">TOTAL TRADES</Typography>
                                <Typography variant="h6" fontWeight="800" sx={{ fontFamily: 'JetBrains Mono', color: 'white' }}>
                                    {backtestResult.total_trades}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Backtest Equity Curve Chart */}
                        <Box sx={{ height: 300, mt: 1 }}>
                            <Typography variant="body2" color="#64748b" sx={{ mb: 1.5, fontWeight: 600 }}>
                                Simulated Equity Curve ({backtestResult.ticker} over {backtestResult.months} Months)
                            </Typography>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={backtestResult.equity_curve}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                    <YAxis stroke="#64748b" domain={['auto', 'auto']} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0d1117', borderColor: 'rgba(0,212,170,0.3)', borderRadius: 8, color: '#fff', fontSize: '12px', fontFamily: 'JetBrains Mono' }}
                                        formatter={(val: any) => [formatCurrency(val), 'Value']}
                                    />
                                    <Line type="monotone" dataKey="equity" name="Portfolio Equity (₹)" stroke="#1DB954" strokeWidth={2.5} dot={false} />
                                    <Line type="monotone" dataKey="close" name="Stock Price (₹)" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>
                    </Box>
                )}
            </Box>

            {/* --- SECTION 2: QUANTITATIVE MODEL ARCHITECTURE --- */}
            <Box sx={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', p: 3 }}>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <InfoIcon sx={{ color: '#1DB954' }} />
                    <Typography variant="h6" fontWeight="700" color="white" sx={{ fontSize: '16px' }}>
                        Model Architecture &amp; Analytical Disclosures
                    </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 2 }}>
                    <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <SpeedIcon fontSize="small" sx={{ color: '#00d4aa' }} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                1. Volatility Overlay (14-period ATR)
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="#94a3b8" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                            Positions are sized dynamically based on 14-day Average True Range (ATR) volatility. Maximum capital risk per trade is capped at 2.0% of total equity.
                        </Typography>
                    </Paper>

                    <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <SecurityIcon fontSize="small" sx={{ color: '#ef4444' }} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                2. Trailing Stop Loss (2× ATR14)
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="#94a3b8" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                            An automated trailing stop tracks 2× ATR14 below peak price. When triggered, position is closed automatically to lock in gains or cap downside.
                        </Typography>
                    </Paper>

                    <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <ShowChartIcon fontSize="small" sx={{ color: '#3b82f6' }} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                3. Dual Momentum Confirmation Filter
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="#94a3b8" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                            BUY signals require an SMA5 &gt; SMA20 crossover <strong>and</strong> RSI14 &gt; 50 momentum confirmation filter to eliminate false breakouts.
                        </Typography>
                    </Paper>
                </Box>
            </Box>

            {/* --- SECTION 3: LIVE TRADE HISTORY --- */}
            <Box sx={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', p: 3, width: '100%', overflow: 'hidden' }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" fontWeight="700" color="white" sx={{ fontSize: '16px' }}>
                        🗃 Trade History
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        All executed trades
                    </Typography>
                </Box>

                <Box sx={{ overflowX: 'auto', width: '100%' }}>
                    <Table size="small" sx={{ minWidth: 500 }}>
                        <TableHead>
                            <TableRow sx={{ background: 'rgba(0,0,0,0.2)' }}>
                                <TableCell sx={{ color: '#64748b', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5 }}>DATE &amp; TIME</TableCell>
                                <TableCell sx={{ color: '#64748b', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5 }}>TICKER</TableCell>
                                <TableCell sx={{ color: '#64748b', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5 }}>ACTION</TableCell>
                                <TableCell align="right" sx={{ color: '#64748b', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5 }}>QTY</TableCell>
                                <TableCell align="right" sx={{ color: '#64748b', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5 }}>PRICE</TableCell>
                                <TableCell align="right" sx={{ color: '#64748b', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5 }}>STRATEGY</TableCell>
                                <TableCell align="right" sx={{ color: '#64748b', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', py: 1.5 }}>P&amp;L</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {activeMetrics.trades.map((trade) => {
                                const stratColor = trade.strategy === 'ROTATION' ? '#a855f7' : (trade.strategy === 'STOP_LOSS' || trade.strategy === 'TRAILING_STOP' ? '#f59e0b' : '#00d4aa');
                                return (
                                    <TableRow key={trade.id} sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', '&:hover': { bgcolor: 'rgba(0,212,170,0.04)' } }}>
                                        <TableCell sx={{ color: '#94a3b8', fontFamily: '"JetBrains Mono", monospace', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                                            {formatDateTime(trade.timestamp)}
                                        </TableCell>
                                        <TableCell sx={{ color: 'white', fontWeight: 700, fontFamily: '"Outfit", sans-serif', fontSize: '13px' }}>
                                            {trade.ticker}
                                        </TableCell>
                                        <TableCell>
                                            <Box
                                                sx={{
                                                    display: 'inline-flex',
                                                    px: 1,
                                                    py: 0.3,
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    fontFamily: '"JetBrains Mono", monospace',
                                                    bgcolor: trade.action === 'BUY' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                    color: trade.action === 'BUY' ? '#3b82f6' : '#ef4444'
                                                }}
                                            >
                                                {trade.action}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: '#94a3b8', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
                                            {trade.quantity}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: '#94a3b8', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
                                            {formatCurrency(trade.price)}
                                        </TableCell>
                                        <TableCell align="right">
                                            <span style={{ fontSize: '10px', fontWeight: 700, color: stratColor, backgroundColor: `${stratColor}18`, padding: '2px 7px', borderRadius: '5px', letterSpacing: '0.3px' }}>
                                                {trade.strategy || 'SMA+RSI'}
                                            </span>
                                        </TableCell>
                                        <TableCell align="right">
                                            {trade.pnl != null ? (
                                                <Box
                                                    sx={{
                                                        display: 'inline-flex',
                                                        px: 1,
                                                        py: 0.3,
                                                        borderRadius: '6px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 700,
                                                        fontFamily: '"JetBrains Mono", monospace',
                                                        bgcolor: trade.pnl >= 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                        color: trade.pnl >= 0 ? '#22c55e' : '#ef4444'
                                                    }}
                                                >
                                                    {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                                                </Box>
                                            ) : (
                                                <span style={{ color: '#64748b', fontSize: '11px' }}>Open</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {activeMetrics.trades.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: '#64748b', borderBottom: 'none' }}>
                                        No trades recorded yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Box>
            </Box>
        </Box>
    );
};

export default Analysis;
