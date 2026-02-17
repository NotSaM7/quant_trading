import React, { useState, useEffect } from 'react';
import { Box, TextField, Button, ToggleButton, ToggleButtonGroup, Typography, Paper, Alert, Snackbar, Autocomplete } from '@mui/material';
import { executeTrade, searchStocks, type StockSuggestion } from '../api';

interface TradeFormProps {
    onTradeSuccess: () => void;
}

const TradeForm: React.FC<TradeFormProps> = ({ onTradeSuccess }) => {
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState<number>(1);
    const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

    // Autocomplete state
    const [searchQuery, setSearchQuery] = useState('');
    const [options, setOptions] = useState<StockSuggestion[]>([]);

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

        const timeoutId = setTimeout(fetchOptions, 300); // Debounce
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <ToggleButtonGroup
                        value={action}
                        exclusive
                        onChange={(_, newAction) => {
                            if (newAction) setAction(newAction);
                        }}
                        fullWidth
                        sx={{
                            mb: 1,
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
                                placeholder="Search e.g. TATA"
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
                        onClick={async () => {
                            if (!ticker) return;
                            setLoading(true);
                            setMessage(null);
                            try {
                                const { runStrategy } = await import('../api');
                                const result = await runStrategy(ticker.toUpperCase(), quantity);
                                const msg = `Bot Signal: ${result.signal} (${result.reason})`;
                                setMessage({ type: result.signal === 'HOLD' ? 'info' : (result.signal === 'BUY' ? 'success' : 'error'), text: msg });
                                if (result.trade_executed) {
                                    onTradeSuccess();
                                }
                            } catch (error: any) {
                                setMessage({ type: 'error', text: error.response?.data?.detail || 'Strategy failed' });
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading || !ticker}
                        size="large"
                        sx={{
                            py: 1.5,
                            borderRadius: 50,
                            borderColor: '#b3b3b3',
                            color: 'white',
                            fontWeight: 700,
                            '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                    >
                        Run Bot Analysis
                    </Button>
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
