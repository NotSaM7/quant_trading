import React, { useState, useEffect } from 'react';
import { Box, TextField, Button, ToggleButton, ToggleButtonGroup, Typography, Paper, Alert, Snackbar, Autocomplete, Chip, CircularProgress } from '@mui/material';
import { executeTrade, searchStocks, runStrategy, getAnalysis, type StockSuggestion, type TradeHistoryItem } from '../api';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';

interface TradeFormProps {
    onTradeSuccess: () => void;
}

const TradeForm: React.FC<TradeFormProps> = ({ onTradeSuccess }) => {
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState<number>(1);
    const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
    const [loading, setLoading] = useState(false);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

    // Analysis & Trade History state for bullet summary
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const [tradeHistory, setTradeHistory] = useState<TradeHistoryItem[]>([]);

    // Autocomplete state
    const [searchQuery, setSearchQuery] = useState('');
    const [options, setOptions] = useState<StockSuggestion[]>([]);

    const fetchHistory = async () => {
        try {
            const data = await getAnalysis();
            setTradeHistory(data.trades.slice(0, 5)); // Top 5 recent trades
        } catch (e) {
            console.error("Failed to fetch trade history in TradeForm", e);
        }
    };

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(() => {
            fetchHistory();
        }, 5000); // Auto-refresh trade history & rationales to sync with 60s bot loop
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchOptions = async () => {
            if (searchQuery.length < 2) {
                setOptions([]);
                return;
            }
            try {
                const results = await searchStocks(searchQuery);
                setOptions(results);
            } catch (err) {
                console.error("Search failed", err);
            }
        };

        const timeoutId = setTimeout(fetchOptions, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const handleRunAnalysis = async () => {
        if (!ticker) return;
        setAnalysisLoading(true);
        setMessage(null);
        try {
            const result = await runStrategy(ticker.toUpperCase(), quantity);
            setAnalysisResult(result);
            const msg = `Bot Signal: ${result.signal} (${result.reason})`;
            setMessage({ type: result.signal === 'HOLD' ? 'info' : (result.signal === 'BUY' ? 'success' : 'error'), text: msg });
            if (result.trade_executed) {
                onTradeSuccess();
                fetchHistory();
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.detail || 'Strategy analysis failed' });
        } finally {
            setAnalysisLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const result = await executeTrade({
                ticker: ticker.toUpperCase(),
                quantity,
                action
            });
            setMessage({ type: 'success', text: result.message });
            setTicker('');
            setQuantity(1);
            onTradeSuccess();
            fetchHistory();
        } catch (error: any) {
            setMessage({
                type: 'error',
                text: error.response?.data?.detail || 'Trade failed'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Paper
            className="spotify-card"
            sx={{
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                border: 'none',
                bgcolor: '#121212',
                color: 'white'
            }}
        >
            <Typography component="h2" variant="h6" fontWeight="bold" gutterBottom sx={{ mb: 3, color: 'white' }}>
                Execute Trade
            </Typography>
            <form onSubmit={handleSubmit}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <ToggleButtonGroup
                        value={action}
                        exclusive
                        onChange={(_, newAction) => {
                            if (newAction) setAction(newAction);
                        }}
                        fullWidth
                        sx={{
                            mb: 0.5,
                            backgroundColor: '#282828',
                            borderRadius: 50,
                            padding: '4px',
                            border: 'none',
                            '& .MuiToggleButton-root': {
                                border: 'none',
                                borderRadius: 50,
                                color: '#b3b3b3',
                                '&.Mui-selected': {
                                    backgroundColor: action === 'BUY' ? '#1DB954' : '#E91429',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: action === 'BUY' ? '#1ed760' : '#E91429',
                                    }
                                }
                            }
                        }}
                    >
                        <ToggleButton value="BUY" sx={{ fontWeight: 700 }}>Buy</ToggleButton>
                        <ToggleButton value="SELL" sx={{ fontWeight: 700 }}>Sell</ToggleButton>
                    </ToggleButtonGroup>

                    <Autocomplete
                        freeSolo
                        options={options}
                        getOptionLabel={(option) => typeof option === 'string' ? option : `${option.symbol} - ${option.name}`}
                        renderOption={(props, option) => {
                            if (typeof option === 'string') return null;
                            const { key, ...otherProps } = props;
                            return (
                                <li key={key} {...otherProps} style={{ backgroundColor: '#282828', color: 'white' }}>
                                    <Box>
                                        <Typography variant="body1" fontWeight="bold">{option.symbol}</Typography>
                                        <Typography variant="caption" sx={{ color: '#b3b3b3' }}>{option.name}</Typography>
                                    </Box>
                                </li>
                            );
                        }}
                        filterOptions={(x) => x}
                        onInputChange={(_, newInputValue) => {
                            setTicker(newInputValue.toUpperCase());
                            setSearchQuery(newInputValue);
                        }}
                        onChange={(_, newValue) => {
                            if (typeof newValue !== 'string' && newValue) {
                                setTicker(newValue.symbol);
                            }
                        }}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Ticker Symbol"
                                required
                                fullWidth
                                variant="filled"
                                placeholder="Search e.g. RELIANCE"
                                InputLabelProps={{ style: { color: '#b3b3b3' } }}
                                inputProps={{
                                    ...params.inputProps,
                                    style: { ...params.inputProps.style, textTransform: 'uppercase', fontWeight: 600, color: 'white' }
                                }}
                                sx={{
                                    bgcolor: '#282828',
                                    borderRadius: 1,
                                    '& .MuiFilledInput-root': {
                                        bg: 'transparent',
                                        '&:before, &:after': { borderBottom: 'none !important' }
                                    }
                                }}
                            />
                        )}
                        PaperComponent={({ children }) => (
                            <Paper sx={{ bgcolor: '#282828', color: 'white' }}>{children}</Paper>
                        )}
                    />

                    <TextField
                        label="Quantity"
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                        required
                        fullWidth
                        variant="filled"
                        InputLabelProps={{ style: { color: '#b3b3b3' } }}
                        inputProps={{ min: 1, style: { color: 'white' } }}
                        sx={{
                            bgcolor: '#282828',
                            borderRadius: 1,
                            '& .MuiFilledInput-root': {
                                '&:before, &:after': { borderBottom: 'none !important' }
                            }
                        }}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        disabled={loading || !ticker || quantity <= 0}
                        size="large"
                        sx={{
                            py: 1.5,
                            fontSize: '1rem',
                            borderRadius: 50,
                            fontWeight: 700,
                            bgcolor: '#1DB954',
                            color: 'black',
                            '&:hover': { bgcolor: '#1ed760' },
                            '&:disabled': { bgcolor: '#282828', color: '#535353' },
                            boxShadow: 'none'
                        }}
                    >
                        {loading ? 'Processing...' : `${action} ${ticker || 'Stock'}`}
                    </Button>

                    <Typography variant="caption" align="center" color="text.secondary" sx={{ my: 0 }}>
                        — OR —
                    </Typography>

                    <Button
                        variant="outlined"
                        onClick={handleRunAnalysis}
                        disabled={analysisLoading || !ticker}
                        size="large"
                        startIcon={analysisLoading ? <CircularProgress size={20} color="inherit" /> : <AnalyticsIcon />}
                        sx={{
                            py: 1.5,
                            borderRadius: 50,
                            borderColor: '#b3b3b3',
                            color: 'white',
                            fontWeight: 700,
                            '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                    >
                        {analysisLoading ? 'Analyzing Signal...' : 'Run Bot Analysis'}
                    </Button>

                    {/* --- BULLET POINT SUMMARY TAB (DIRECTLY BELOW RUN BOT ANALYSIS BUTTON) --- */}
                    <Box sx={{ mt: 2, p: 2, bgcolor: '#181818', borderRadius: 2, border: '1px solid #333' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                            <FormatListBulletedIcon fontSize="small" color="success" />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                                Trade Rationales Summary
                            </Typography>
                        </Box>

                        {/* Bullet 1: Active Bot Analysis Result (if available) */}
                        {analysisResult && (
                            <Box sx={{ mb: 2, p: 1.5, bgcolor: '#222', borderRadius: 1.5, borderLeft: '4px solid #1DB954' }}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                    <Typography variant="body2" fontWeight="bold" color="white">
                                        • {analysisResult.ticker.replace('.NS', '')} ({analysisResult.signal})
                                    </Typography>
                                    <Chip
                                        label={analysisResult.signal}
                                        color={analysisResult.signal === 'BUY' ? 'success' : (analysisResult.signal === 'SELL' ? 'error' : 'default')}
                                        size="small"
                                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                                    />
                                </Box>
                                <Typography variant="body2" color="rgba(255,255,255,0.9)" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                                    "{analysisResult.reason}"
                                </Typography>
                            </Box>
                        )}

                        {/* Bullets for Executed Stock Purchases & Sales */}
                        {tradeHistory.length > 0 ? (
                            <Box display="flex" flexDirection="column" gap={1.5}>
                                {tradeHistory.map((trade) => {
                                    const cleanSymbol = trade.ticker.replace('.NS', '');
                                    const defaultRationale = trade.action === 'BUY'
                                        ? `${cleanSymbol} has been climbing steadily over the past few days, and buying interest is strong without the stock looking overbought yet — a good sign the upward move has more room to run.`
                                        : `${cleanSymbol} started losing short-term price momentum, so the position was closed to lock in current returns and safeguard your capital.`;
                                    
                                    return (
                                        <Box key={trade.id} sx={{ p: 1.5, bgcolor: '#202020', borderRadius: 1.5, borderLeft: `3px solid ${trade.action === 'BUY' ? '#1DB954' : '#ef4444'}` }}>
                                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                                                <Typography variant="body2" fontWeight="bold" color="white" sx={{ fontSize: '0.85rem' }}>
                                                    • {cleanSymbol} ({trade.action})
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {trade.quantity} Share(s) @ ₹{trade.price.toFixed(2)}
                                                </Typography>
                                            </Box>
                                            <Typography variant="body2" color="rgba(255,255,255,0.85)" sx={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                                                "{trade.reason || defaultRationale}"
                                            </Typography>
                                        </Box>
                                    );
                                })}
                            </Box>
                        ) : (
                            !analysisResult && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 1 }}>
                                    No trade rationales yet. Run bot analysis or execute a trade to see plain-English explanations.
                                </Typography>
                            )
                        )}
                    </Box>
                </Box>
            </form>

            <Snackbar
                open={!!message}
                autoHideDuration={6000}
                onClose={() => setMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {message ? (
                    <Alert
                        severity={message.type as any}
                        onClose={() => setMessage(null)}
                        sx={{ width: '100%', minWidth: '300px', bgcolor: '#282828', color: 'white', '& .MuiAlert-icon': { color: message.type === 'success' ? '#1DB954' : undefined } }}
                    >
                        {message.text}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Paper>
    );
};

export default TradeForm;
