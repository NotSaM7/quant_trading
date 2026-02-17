import React, { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow, CircularProgress, Chip } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getAnalysis, type AnalysisMetrics } from '../api';

const Analysis: React.FC = () => {
    const [metrics, setMetrics] = useState<AnalysisMetrics | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [chartData, setChartData] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getAnalysis();
                setMetrics(data);

                // Process data for cumulative PnL chart
                // Trades are sorted by timestamp desc in backend, so we need to reverse for chart
                const sortedTrades = [...data.trades].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                let runningPnL = 0;
                const cData = sortedTrades
                    .filter(t => t.pnl !== undefined && t.pnl !== null) // Only closed trades have PnL
                    .map(t => {
                        runningPnL += t.pnl || 0;
                        return {
                            date: new Date(t.timestamp).toLocaleTimeString(), // Simplified label
                            pnl: runningPnL,
                            tradePnL: t.pnl
                        };
                    });

                setChartData(cData);

            } catch (error) {
                console.error("Failed to fetch analysis", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const formatCurrency = (value: number) => {
        return value.toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        });
    };

    if (loading) return <CircularProgress color="success" />;

    if (!metrics) return <Typography color="error">Failed to load analysis.</Typography>;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Metrics Cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' }}>
                    <Typography variant="caption" color="rgba(255,255,255,0.7)">TOTAL P&L</Typography>
                    <Typography variant="h4" fontWeight="bold">
                        {metrics.total_pnl >= 0 ? '+' : ''}{formatCurrency(metrics.total_pnl)}
                    </Typography>
                </Box>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: '#282828' }}>
                    <Typography variant="caption" color="text.secondary">WIN RATE</Typography>
                    <Typography variant="h4" fontWeight="bold" color="success.main">{metrics.win_rate.toFixed(1)}%</Typography>
                </Box>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: '#282828' }}>
                    <Typography variant="caption" color="text.secondary">PROFIT FACTOR</Typography>
                    <Typography variant="h4" fontWeight="bold">{metrics.profit_factor.toFixed(2)}</Typography>
                </Box>
                <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, background: '#282828' }}>
                    <Typography variant="caption" color="text.secondary">TOTAL TRADES</Typography>
                    <Typography variant="h4" fontWeight="bold">{metrics.total_trades}</Typography>
                </Box>
            </Box>

            {/* Chart */}
            <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, bgcolor: '#181818', height: 400 }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Performance Curve</Typography>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" stroke="#888" />
                        <YAxis stroke="#888" />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#333', borderColor: '#333', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: number | undefined) => formatCurrency(value || 0)}
                        />
                        <Line type="monotone" dataKey="pnl" stroke="#1DB954" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </Box>

            {/* Trade History Table */}
            <Box className="spotify-card" sx={{ p: 3, borderRadius: 2, bgcolor: '#181818' }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Trade History</Typography>
                <Table size="small">
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
                        {metrics.trades.map((trade) => (
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
                        {metrics.trades.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.disabled' }}>No trades recorded</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Box>
        </Box>
    );
};

export default Analysis;
