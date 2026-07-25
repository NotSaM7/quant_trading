import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Table, TableBody, TableCell, TableHead, TableRow,
    CircularProgress, Chip, Button, Select, MenuItem, FormControl, Paper
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getAnalysis, runBacktest, type AnalysisMetrics, type BacktestResult } from '../api';
import SecurityIcon from '@mui/icons-material/Security';
import ShowChartIcon from '@mui/icons-material/ShowChart';
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

    const fetchAnalysisData = async () => {
        try {
            const data = await getAnalysis();
            setMetrics(data);
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

    const activeMetrics = metrics || {
        total_pnl: 0,
        win_rate: 0,
        total_trades: 0,
        profit_factor: 0,
        trades: []
    };

    if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress color="success" /></Box>;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

            {/* Top Bar / Heading */}
            <Box>
                <Typography variant="h5" fontWeight="bold">Quant Performance & Strategic Analytics</Typography>
                <Typography variant="body2" color="text.secondary">
                    Real-time execution metrics, ATR volatility position sizing, automated stop-loss protection, and 6–12 month historical backtests.
                </Typography>
            </Box>

            {/* Live Metrics Cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' }}>
                    <Typography variant="caption" color="rgba(255,255,255,0.7)" fontWeight="bold">TOTAL P&L</Typography>
                    <Typography variant="h4" fontWeight="bold">
                        {activeMetrics.total_pnl >= 0 ? '+' : ''}{formatCurrency(activeMetrics.total_pnl)}
                    </Typography>
                </Box>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: '#282828' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">WIN RATE</Typography>
                    <Typography variant="h4" fontWeight="bold" color="success.main">{(activeMetrics.win_rate || 0).toFixed(1)}%</Typography>
                </Box>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: '#282828' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">PROFIT FACTOR</Typography>
                    <Typography variant="h4" fontWeight="bold">{(activeMetrics.profit_factor || 0).toFixed(2)}</Typography>
                </Box>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: '#282828' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">TOTAL TRADES</Typography>
                    <Typography variant="h4" fontWeight="bold">{activeMetrics.total_trades || 0}</Typography>
                </Box>
            </Box>

            {/* --- SECTION 1: 6–12 MONTH HISTORICAL BACKTEST ENGINE --- */}
            <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, bgcolor: '#181818' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <ShowChartIcon color="success" />
                        <Typography variant="h6" fontWeight="bold">Historical Backtest Module (6–12 Months)</Typography>
                    </Box>

                    {/* Backtest Controls */}
                    <Box display="flex" alignItems="center" gap={2}>
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                            <Select
                                value={backtestTicker}
                                onChange={(e) => setBacktestTicker(e.target.value as string)}
                                sx={{ color: 'white', bgcolor: '#282828', borderRadius: 1 }}
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
                                sx={{ color: 'white', bgcolor: '#282828', borderRadius: 1 }}
                            >
                                <MenuItem value={6}>6 Months</MenuItem>
                                <MenuItem value={12}>12 Months</MenuItem>
                            </Select>
                        </FormControl>

                        <Button
                            variant="contained"
                            color="success"
                            onClick={handleRunBacktest}
                            disabled={backtestLoading}
                            sx={{ borderRadius: 20, px: 3 }}
                        >
                            {backtestLoading ? <CircularProgress size={20} color="inherit" /> : "Run Simulation"}
                        </Button>
                    </Box>
                </Box>

                {backtestResult && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {/* Backtest Key Stats */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2 }}>
                            <Box sx={{ p: 2, bgcolor: '#222', borderRadius: 2, borderLeft: '4px solid #1DB954' }}>
                                <Typography variant="caption" color="text.secondary">TOTAL RETURN</Typography>
                                <Typography variant="h6" fontWeight="bold" color={backtestResult.total_return_pct >= 0 ? "success.main" : "error.main"}>
                                    {backtestResult.total_return_pct >= 0 ? '+' : ''}{backtestResult.total_return_pct}%
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: '#222', borderRadius: 2, borderLeft: '4px solid #ef4444' }}>
                                <Typography variant="caption" color="text.secondary">MAX DRAWDOWN</Typography>
                                <Typography variant="h6" fontWeight="bold" color="error.main">
                                    -{backtestResult.max_drawdown_pct}%
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: '#222', borderRadius: 2, borderLeft: '4px solid #3b82f6' }}>
                                <Typography variant="caption" color="text.secondary">SHARPE RATIO</Typography>
                                <Typography variant="h6" fontWeight="bold">
                                    {backtestResult.sharpe_ratio}
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: '#222', borderRadius: 2, borderLeft: '4px solid #a855f7' }}>
                                <Typography variant="caption" color="text.secondary">WIN RATE</Typography>
                                <Typography variant="h6" fontWeight="bold">
                                    {backtestResult.win_rate}%
                                </Typography>
                            </Box>

                            <Box sx={{ p: 2, bgcolor: '#222', borderRadius: 2, borderLeft: '4px solid #f59e0b' }}>
                                <Typography variant="caption" color="text.secondary">TOTAL TRADES</Typography>
                                <Typography variant="h6" fontWeight="bold">
                                    {backtestResult.total_trades}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Backtest Equity Curve Chart */}
                        <Box sx={{ height: 320, mt: 1 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                Simulated Equity Curve ({backtestResult.ticker} over {backtestResult.months} Months)
                            </Typography>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={backtestResult.equity_curve}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2b2b2b" />
                                    <XAxis dataKey="date" stroke="#666" tick={{ fontSize: 11 }} />
                                    <YAxis stroke="#666" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }}
                                        formatter={(val: any) => [formatCurrency(val), 'Value']}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="equity" name="Portfolio Equity (₹)" stroke="#1DB954" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="close" name="Stock Price (₹)" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>
                    </Box>
                )}
            </Box>

            {/* --- SECTION 2: QUANTITATIVE MODEL DISCLOSURES & ANALYTICAL MATURITY --- */}
            <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, bgcolor: '#141414', border: '1px solid #333' }}>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <InfoIcon color="primary" />
                    <Typography variant="h6" fontWeight="bold">Model Architecture & Analytical Disclosures</Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2 }}>
                    {/* Item 1: ATR Position Sizing */}
                    <Paper sx={{ p: 2, bgcolor: '#1e1e1e', borderRadius: 2, height: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <SpeedIcon fontSize="small" sx={{ color: '#1DB954' }} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                1. Volatility Overlay (14-period ATR)
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            Positions are sized dynamically based on 14-day Average True Range (ATR) volatility rather than naive equal weighting. Maximum capital risk per trade is capped at 2.0% of total portfolio equity.
                        </Typography>
                    </Paper>

                    {/* Item 2: Stop Loss Rules */}
                    <Paper sx={{ p: 2, bgcolor: '#1e1e1e', borderRadius: 2, height: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <SecurityIcon fontSize="small" sx={{ color: '#ef4444' }} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                2. Risk Control: 3.0% Max Loss Per Position
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            An automated risk trigger monitors open positions during every execution cycle. If a position incurs a drawdown of ≥ 3.0% from entry, an emergency <code>STOP_LOSS</code> sell order is executed immediately.
                        </Typography>
                    </Paper>

                    {/* Item 3: Confirmation Filter */}
                    <Paper sx={{ p: 2, bgcolor: '#1e1e1e', borderRadius: 2, height: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <ShowChartIcon fontSize="small" sx={{ color: '#3b82f6' }} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                3. Dual Momentum Confirmation Filter
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            To prevent false breakouts in low-volume or sideways markets, a BUY signal requires both an SMA5 &gt; SMA20 bullish crossover <strong>and</strong> an RSI14 &gt; 50 momentum confirmation filter.
                        </Typography>
                    </Paper>

                    {/* Item 4: Historical Limitation Disclosure */}
                    <Paper sx={{ p: 2, bgcolor: '#1e1e1e', borderRadius: 2, height: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <InfoIcon fontSize="small" sx={{ color: '#f59e0b' }} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                4. Reporting Limitations & Assumptions
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            Live dashboard metrics reflect execution from active runtime sessions. For statistical rigor, use the 6–12 Month Historical Backtest module above. Backtest simulations assume zero execution slippage and flat transaction fees.
                        </Typography>
                    </Paper>
                </Box>
            </Box>

            {/* --- SECTION 3: LIVE TRADE HISTORY --- */}
            <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, bgcolor: '#181818', width: '100%', overflow: 'hidden' }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Recent Trade History</Typography>
                <Box sx={{ overflowX: 'auto', width: '100%' }}>
                    <Table size="small" sx={{ minWidth: 500 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: '#b3b3b3' }}>TIME</TableCell>
                                <TableCell sx={{ color: '#b3b3b3' }}>TICKER</TableCell>
                                <TableCell sx={{ color: '#b3b3b3' }}>ACTION</TableCell>
                                <TableCell align="right" sx={{ color: '#b3b3b3' }}>QTY</TableCell>
                                <TableCell align="right" sx={{ color: '#b3b3b3' }}>PRICE</TableCell>
                                <TableCell align="right" sx={{ color: '#b3b3b3' }}>P&L</TableCell>
                                <TableCell align="right" sx={{ color: '#b3b3b3' }}>STRATEGY</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {activeMetrics.trades.map((trade) => (
                                <TableRow key={trade.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                                    <TableCell sx={{ color: 'text.secondary' }}>
                                        {new Date(trade.timestamp).toLocaleString()}
                                    </TableCell>
                                    <TableCell sx={{ color: 'white', fontWeight: 600 }}>{trade.ticker}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={trade.action}
                                            color={trade.action === "BUY" ? "success" : "error"}
                                            size="small"
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{trade.quantity}</TableCell>
                                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatCurrency(trade.price)}</TableCell>
                                    <TableCell align="right" sx={{
                                        color: trade.pnl ? (trade.pnl >= 0 ? 'success.main' : 'error.main') : 'text.disabled',
                                        fontWeight: 600
                                    }}>
                                        {trade.pnl != null ? formatCurrency(trade.pnl) : '-'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>{trade.strategy}</TableCell>
                                </TableRow>
                            ))}
                            {activeMetrics.trades.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.disabled' }}>No trades recorded</TableCell>
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
